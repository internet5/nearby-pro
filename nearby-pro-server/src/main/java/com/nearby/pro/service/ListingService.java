package com.nearby.pro.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.nearby.pro.common.ApiException;
import com.nearby.pro.common.JsonUtil;
import com.nearby.pro.dto.ItemGroup;
import com.nearby.pro.dto.ListingDetail;
import com.nearby.pro.dto.ListingSaveReq;
import com.nearby.pro.dto.MineItem;
import com.nearby.pro.dto.NearbyItem;
import com.nearby.pro.dto.NearbyRow;
import com.nearby.pro.dto.ReportReq;
import com.nearby.pro.dto.TagDef;
import com.nearby.pro.entity.Category;
import com.nearby.pro.entity.Listing;
import com.nearby.pro.entity.Report;
import com.nearby.pro.entity.User;
import com.nearby.pro.mapper.CategoryMapper;
import com.nearby.pro.mapper.ListingMapper;
import com.nearby.pro.mapper.ReportMapper;
import com.nearby.pro.mapper.UserMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
public class ListingService {

    private static final int MAX_ACTIVE_COUNT = 3;
    private static final int VALID_DAYS = 30;
    private static final List<String> REPORT_REASONS = List.of("fake", "spam", "illegal", "other");

    private final ListingMapper listingMapper;
    private final CategoryMapper categoryMapper;
    private final UserMapper userMapper;
    private final ReportMapper reportMapper;
    private final WxService wxService;
    private final StringRedisTemplate redis;

    // ---- 发布 / 更新 ----

    /** 发布技能：校验内容 -> 内容安全 -> 上架名额 -> 落库（30 天有效期） */
    public Long create(long userId, ListingSaveReq req) {
        User user = requireUser(userId);
        Category category = requireCategory(req.getCategoryId());
        normalizeAndValidate(category, req);
        wxService.checkContent(user.getOpenid(), secCheckText(req));
        if (listingMapper.countActiveByUser(userId) >= MAX_ACTIVE_COUNT) {
            throw new ApiException("同时最多上架 " + MAX_ACTIVE_COUNT + " 条");
        }
        Listing listing = new Listing();
        listing.setUserId(userId);
        applyContent(listing, req);
        listing.setStatus(Listing.STATUS_ACTIVE);
        listing.setExpireAt(OffsetDateTime.now().plusDays(VALID_DAYS));
        listing.setViewCount(0);
        listingMapper.insert(listing);
        return listing.getId();
    }

    /** 更新发布：仅作者；只覆盖内容字段，不重置有效期、不清浏览数 */
    public void update(long userId, long id, ListingSaveReq req) {
        User user = requireUser(userId);
        Listing listing = requireOwned(userId, id);
        Category category = requireCategory(req.getCategoryId());
        normalizeAndValidate(category, req);
        wxService.checkContent(user.getOpenid(), secCheckText(req));
        applyContent(listing, req);
        listingMapper.updateById(listing);
    }

    /** 下架：仅作者，状态改为 2（可重新上架） */
    public void offline(long userId, long id) {
        Listing listing = requireOwned(userId, id);
        if (listing.getStatus() != Listing.STATUS_ACTIVE) {
            throw new ApiException("该发布不在上架中");
        }
        listing.setStatus(Listing.STATUS_OFFLINE);
        listingMapper.updateById(listing);
    }

    /** 重新上架：状态 2/3 -> 1，刷新 30 天有效期；受上架名额约束 */
    public void relist(long userId, long id) {
        Listing listing = requireOwned(userId, id);
        if (listing.getStatus() == Listing.STATUS_ACTIVE) {
            throw new ApiException("该发布已在上架中");
        }
        if (listing.getStatus() == Listing.STATUS_BANNED) {
            throw new ApiException("该发布已被封禁，无法上架");
        }
        if (listingMapper.countActiveByUser(userId) >= MAX_ACTIVE_COUNT) {
            throw new ApiException("上架中的已满 " + MAX_ACTIVE_COUNT + " 条，先下架一条");
        }
        listing.setStatus(Listing.STATUS_ACTIVE);
        listing.setExpireAt(OffsetDateTime.now().plusDays(VALID_DAYS));
        listingMapper.updateById(listing);
    }

    /** 删除：仅作者，物理删除；先清关联举报，避免外键约束删除失败 */
    public void delete(long userId, long id) {
        requireOwned(userId, id);
        reportMapper.delete(new LambdaQueryWrapper<Report>().eq(Report::getListingId, id));
        listingMapper.deleteById(id);
    }

    // ---- 查询 ----

    /** 每个分类在配额模式下的最大返回条数：6 个分类 × 40 = 最多 240 条，控制带宽与渲染量 */
    private static final int QUOTA_PER_CATEGORY = 40;

    /**
     * 附近发布：radius 默认 3000 米，最大 10000。
     * 不带筛选参数（地图页主拉取）→ 配额模式：半径内每分类各取最近 40 条，保证切分类时前端有数据可筛。
     * 带任一筛选参数 → 精确模式：筛选项参与的半径内按距离升序最多 200 条。
     */
    public List<NearbyItem> nearby(double latitude, double longitude, Integer radius,
                                   Integer categoryId, String tag, String itemName, String keyword) {
        double effectiveRadius = radius == null || radius <= 0 ? 3000 : Math.min(radius, 10000);
        boolean filtered = categoryId != null && categoryId != 0
                || !trimToEmpty(tag).isEmpty()
                || !trimToEmpty(itemName).isEmpty()
                || !trimToEmpty(keyword).isEmpty();
        List<NearbyRow> rows = filtered
                ? listingMapper.selectNearby(latitude, longitude, effectiveRadius,
                        categoryId == null ? 0 : categoryId,
                        trimToEmpty(tag), trimToEmpty(itemName), trimToEmpty(keyword))
                : listingMapper.selectNearbyQuota(latitude, longitude, effectiveRadius, QUOTA_PER_CATEGORY);
        return rows.stream().map(row -> {
            NearbyItem item = new NearbyItem();
            item.setId(row.getId());
            item.setUserId(row.getUserId());
            item.setNickname(row.getNickname());
            item.setAvatarUrl(row.getAvatarUrl());
            item.setCategoryId(row.getCategoryId());
            item.setCategoryCode(row.getCategoryCode());
            item.setCategoryName(row.getCategoryName());
            item.setTags(JsonUtil.parseList(row.getTags(), String.class));
            item.setItems(JsonUtil.parseList(row.getItems(), ItemGroup.class));
            item.setTitle(row.getTitle());
            item.setLatitude(row.getLatitude());
            item.setLongitude(row.getLongitude());
            item.setAddress(row.getAddress());
            item.setDistance(row.getDistance() == null ? null : (int) Math.round(row.getDistance()));
            item.setExpireTime(row.getExpireTime());
            return item;
        }).toList();
    }

    /** 发布详情：游客可看上架中的；非作者访问有效发布时浏览数 +1 */
    public ListingDetail detail(long id, Long viewerId, Double viewerLat, Double viewerLng) {
        Listing listing = listingMapper.selectById(id);
        if (listing == null) {
            throw new ApiException("发布不存在或已删除");
        }
        boolean owner = viewerId != null && viewerId == listing.getUserId().longValue();
        boolean active = listing.getStatus() == Listing.STATUS_ACTIVE
                && listing.getExpireAt().isAfter(OffsetDateTime.now());
        if (!owner && !active) {
            throw new ApiException(switch (listing.getStatus()) {
                case Listing.STATUS_OFFLINE -> "该发布已下架";
                case Listing.STATUS_EXPIRED -> "该发布已过期";
                case Listing.STATUS_BANNED -> "该发布不可查看";
                default -> "该发布已过期";
            });
        }
        if (!owner && active) {
            listingMapper.incrementViewCount(id);
            // 返回自增后的浏览数，与数据库保持一致
            listing.setViewCount(listing.getViewCount() + 1);
        }
        Category category = categoryMapper.selectById(listing.getCategoryId());
        User ownerUser = userMapper.selectById(listing.getUserId());
        ListingDetail detail = new ListingDetail();
        detail.setId(listing.getId());
        detail.setUserId(listing.getUserId());
        detail.setNickname(ownerUser == null ? "" : ownerUser.getNickname());
        detail.setAvatarUrl(ownerUser == null ? "" : ownerUser.getAvatarUrl());
        detail.setCategoryId(listing.getCategoryId());
        detail.setCategoryCode(category == null ? "other" : category.getCode());
        detail.setCategoryName(category == null ? "" : category.getName());
        detail.setTags(JsonUtil.parseList(listing.getTags(), String.class));
        detail.setItems(JsonUtil.parseList(listing.getItems(), ItemGroup.class));
        detail.setPhotoUrls(JsonUtil.parseList(listing.getPhotoUrls(), String.class));
        detail.setTitle(listing.getTitle());
        detail.setDescription(listing.getDescription());
        detail.setContactType(listing.getContactType());
        detail.setContactValue(listing.getContactValue());
        detail.setLatitude(listing.getLatitude());
        detail.setLongitude(listing.getLongitude());
        detail.setAddress(listing.getAddress());
        detail.setCity(listing.getCity());
        if (viewerLat != null && viewerLng != null) {
            detail.setDistance(distanceMeters(viewerLat, viewerLng, listing.getLatitude(), listing.getLongitude()));
        }
        detail.setStatus(listing.getStatus());
        detail.setExpireTime(listing.getExpireAt());
        detail.setViewCount(listing.getViewCount());
        detail.setCreateTime(listing.getCreatedAt());
        detail.setIsOwner(owner);
        return detail;
    }

    /** 我的发布：按创建时间倒序取最新 3 条（业务规则同时最多上架 3 条，3 条足够覆盖） */
    public List<MineItem> mine(long userId) {
        List<Listing> list = listingMapper.selectList(new LambdaQueryWrapper<Listing>()
                .eq(Listing::getUserId, userId)
                .orderByDesc(Listing::getCreatedAt)
                .last("LIMIT 3"));
        Map<Integer, Category> categories = categoryMapper.selectList(null).stream()
                .collect(Collectors.toMap(Category::getId, Function.identity()));
        return list.stream().map(listing -> {
            MineItem item = new MineItem();
            item.setId(listing.getId());
            item.setCategoryId(listing.getCategoryId());
            Category category = categories.get(listing.getCategoryId());
            item.setCategoryCode(category == null ? "other" : category.getCode());
            item.setCategoryName(category == null ? "" : category.getName());
            item.setTags(JsonUtil.parseList(listing.getTags(), String.class));
            item.setItems(JsonUtil.parseList(listing.getItems(), ItemGroup.class));
            item.setTitle(listing.getTitle());
            item.setAddress(listing.getAddress());
            // 坐标带上：前端地图需要把自己的发布也标出来（可能在 nearby 半径外）
            item.setLatitude(listing.getLatitude());
            item.setLongitude(listing.getLongitude());
            item.setStatus(listing.getStatus());
            item.setViewCount(listing.getViewCount());
            item.setExpireTime(listing.getExpireAt());
            item.setCreateTime(listing.getCreatedAt());
            return item;
        }).toList();
    }

    // ---- 举报 ----

    /** 举报：不能举报自己；同一用户对同一条 24 小时一次（Redis 限频，不可用时退化为查库） */
    public void report(long userId, long listingId, ReportReq req) {
        Listing listing = listingMapper.selectById(listingId);
        if (listing == null) {
            throw new ApiException("发布不存在或已删除");
        }
        if (listing.getUserId() == userId) {
            throw new ApiException("不能举报自己的发布");
        }
        if (!REPORT_REASONS.contains(req.getReason())) {
            throw new ApiException("举报原因不合法");
        }
        String key = "report:" + userId + ":" + listingId;
        try {
            Boolean first = redis.opsForValue().setIfAbsent(key, "1", Duration.ofHours(24));
            if (Boolean.FALSE.equals(first)) {
                throw new ApiException("24 小时内已举报过该发布");
            }
        } catch (ApiException e) {
            throw e;
        } catch (Exception e) {
            log.warn("Redis 举报限频失败，退化为查库：{}", e.getMessage());
            Long count = reportMapper.selectCount(new LambdaQueryWrapper<Report>()
                    .eq(Report::getReporterId, userId)
                    .eq(Report::getListingId, listingId)
                    .gt(Report::getCreatedAt, OffsetDateTime.now().minusHours(24)));
            if (count != null && count > 0) {
                throw new ApiException("24 小时内已举报过该发布");
            }
        }
        Report report = new Report();
        report.setListingId(listingId);
        report.setReporterId(userId);
        report.setReason(req.getReason());
        report.setDetail(trimToEmpty(req.getDetail()));
        reportMapper.insert(report);
    }

    // ---- 私有方法 ----

    /** 校验并把请求规整：tags 去重、items 按分组校验归属（与前端发布页规则一致） */
    private void normalizeAndValidate(Category category, ListingSaveReq req) {
        List<String> tags = distinct(req.getTags());
        if (tags.isEmpty()) {
            throw new ApiException("请至少选一个工种");
        }
        if (tags.size() > 3) {
            throw new ApiException("工种最多选 3 个");
        }
        Map<String, List<String>> allowedItems = JsonUtil.parseList(category.getTags(), TagDef.class).stream()
                .collect(Collectors.toMap(TagDef::getName, TagDef::getItems, (a, b) -> a, LinkedHashMap::new));
        for (String tag : tags) {
            if (!allowedItems.containsKey(tag)) {
                throw new ApiException("工种「" + tag + "」不属于该分类");
            }
        }
        List<ItemGroup> groups = new ArrayList<>();
        int total = 0;
        for (ItemGroup group : req.getItems()) {
            if (group == null || group.getNames() == null || group.getNames().isEmpty()) {
                continue;
            }
            if (!tags.contains(group.getTag())) {
                throw new ApiException("项目分组与所选工种不一致");
            }
            List<String> allowed = allowedItems.getOrDefault(group.getTag(), List.of());
            List<String> names = distinct(group.getNames());
            for (String name : names) {
                if (!allowed.contains(name)) {
                    throw new ApiException("项目「" + name + "」不在「" + group.getTag() + "」的可选项里");
                }
            }
            ItemGroup normalized = new ItemGroup();
            normalized.setTag(group.getTag());
            normalized.setNames(names);
            groups.add(normalized);
            total += names.size();
        }
        // 所选工种里只要有任一工种提供具体项目，就要求至少勾一项（与发布页一致）
        boolean anyTagHasItems = tags.stream().anyMatch(tag -> !allowedItems.get(tag).isEmpty());
        if (anyTagHasItems && total == 0) {
            throw new ApiException("请勾选你会做的具体项目");
        }
        if (req.getPhotoUrls() != null && req.getPhotoUrls().size() > 3) {
            throw new ApiException("图片最多 3 张");
        }
        if (!"wechat".equals(req.getContactType()) && !"phone".equals(req.getContactType())) {
            throw new ApiException("联系方式类型不合法");
        }
        if (req.getTitle() == null || req.getTitle().trim().length() < 2) {
            throw new ApiException("技能名称至少两个字");
        }
        req.setTags(tags);
        req.setItems(groups);
    }

    /** create 与 update 共用的内容字段复制；有效期/状态/浏览数不在这里动 */
    private void applyContent(Listing listing, ListingSaveReq req) {
        listing.setCategoryId(req.getCategoryId());
        listing.setTitle(req.getTitle().trim());
        listing.setDescription(trimToEmpty(req.getDescription()));
        listing.setTags(JsonUtil.toJson(req.getTags()));
        listing.setItems(JsonUtil.toJson(req.getItems()));
        listing.setPhotoUrls(JsonUtil.toJson(req.getPhotoUrls() == null ? List.of() : req.getPhotoUrls()));
        listing.setContactType(req.getContactType());
        listing.setContactValue(req.getContactValue().trim());
        listing.setLatitude(req.getLatitude());
        listing.setLongitude(req.getLongitude());
        listing.setAddress(trimToEmpty(req.getAddress()));
        listing.setCity(trimToEmpty(req.getCity()));
    }

    private String secCheckText(ListingSaveReq req) {
        return req.getTitle() + "\n" + trimToEmpty(req.getDescription()) + "\n" + req.getContactValue();
    }

    private User requireUser(long userId) {
        User user = userMapper.selectById(userId);
        if (user == null) {
            throw new ApiException("账号不存在，请重新登录");
        }
        return user;
    }

    private Category requireCategory(int categoryId) {
        Category category = categoryMapper.selectById(categoryId);
        if (category == null || !Boolean.TRUE.equals(category.getEnabled())) {
            throw new ApiException("分类不存在或已停用");
        }
        return category;
    }

    private Listing requireOwned(long userId, long id) {
        Listing listing = listingMapper.selectById(id);
        if (listing == null) {
            throw new ApiException("发布不存在或已删除");
        }
        if (listing.getUserId() != userId) {
            throw new ApiException("只能操作自己的发布");
        }
        return listing;
    }

    private List<String> distinct(List<String> values) {
        if (values == null) {
            return List.of();
        }
        Set<String> set = new LinkedHashSet<>();
        values.forEach(value -> {
            String trimmed = value == null ? "" : value.trim();
            if (!trimmed.isEmpty()) {
                set.add(trimmed);
            }
        });
        return new ArrayList<>(set);
    }

    private String trimToEmpty(String value) {
        return value == null ? "" : value.trim();
    }

    /** Haversine 球面距离，米 */
    private int distanceMeters(double lat1, double lng1, double lat2, double lng2) {
        double radLat1 = Math.toRadians(lat1);
        double radLat2 = Math.toRadians(lat2);
        double dLat = Math.toRadians(lat2 - lat1);
        double dLng = Math.toRadians(lng2 - lng1);
        double a = Math.sin(dLat / 2) * Math.sin(dLat / 2)
                + Math.cos(radLat1) * Math.cos(radLat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
        return (int) Math.round(6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
    }
}

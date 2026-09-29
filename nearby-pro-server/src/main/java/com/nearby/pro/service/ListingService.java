package com.nearby.pro.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.nearby.pro.common.ApiException;
import com.nearby.pro.common.JsonUtil;
import com.nearby.pro.dto.ListingDetail;
import com.nearby.pro.dto.ListingSaveReq;
import com.nearby.pro.dto.MineItem;
import com.nearby.pro.dto.NearbyItem;
import com.nearby.pro.dto.NearbyRow;
import com.nearby.pro.dto.ReportReq;
import com.nearby.pro.dto.TagDef;
import com.nearby.pro.entity.Category;
import com.nearby.pro.entity.Favorite;
import com.nearby.pro.entity.Listing;
import com.nearby.pro.entity.Report;
import com.nearby.pro.entity.User;
import com.nearby.pro.mapper.CategoryMapper;
import com.nearby.pro.mapper.FavoriteMapper;
import com.nearby.pro.mapper.ListingMapper;
import com.nearby.pro.mapper.ReportMapper;
import com.nearby.pro.mapper.UserMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
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
    // 发布不再自动过期：expire_at 仅作占位满足数据库 NOT NULL，设为远未来
    private static final OffsetDateTime FAR_FUTURE = OffsetDateTime.of(2099, 1, 1, 0, 0, 0, 0, ZoneOffset.UTC);
    private static final List<String> REPORT_REASONS = List.of("fake", "spam", "illegal", "other");

    private final ListingMapper listingMapper;
    private final CategoryMapper categoryMapper;
    private final UserMapper userMapper;
    private final ReportMapper reportMapper;
    private final FavoriteMapper favoriteMapper;
    private final WxService wxService;
    private final StringRedisTemplate redis;

    // ---- 发布 / 更新 ----

    /** 发布技能：校验内容 -> 内容安全 -> 上架名额 -> 落库 */
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
        listing.setExpireAt(FAR_FUTURE);
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

    /** 重新上架：状态 2/3 -> 1；受上架名额约束 */
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
        listing.setExpireAt(FAR_FUTURE);
        listingMapper.updateById(listing);
    }

    /** 删除：仅作者，物理删除；先清关联举报与收藏，避免残留指向已删除发布的记录 */
    public void delete(long userId, long id) {
        requireOwned(userId, id);
        reportMapper.delete(new LambdaQueryWrapper<Report>().eq(Report::getListingId, id));
        favoriteMapper.delete(new LambdaQueryWrapper<Favorite>().eq(Favorite::getListingId, id));
        listingMapper.deleteById(id);
    }

    // ---- 查询 ----

    /** 每个分类在配额模式下的最大返回条数：10 个分类 × 30 = 最多 300 条，控制带宽与渲染量 */
    private static final int QUOTA_PER_CATEGORY = 30;

    /**
     * 附近发布：不按半径裁剪，只按数量限制（每类最多 QUOTA_PER_CATEGORY，总量最多 300 条）。
     * 不带筛选参数（地图页「全部分类」主拉取）→ 配额模式：每分类各取最近 QUOTA_PER_CATEGORY 条。
     * 带任一筛选参数（切一级分类重新请求）→ 精确模式：筛选项参与后按距离升序最多 300 条。
     */
    public List<NearbyItem> nearby(double latitude, double longitude,
                                   Integer categoryId, String tag, String keyword) {
        boolean filtered = categoryId != null && categoryId != 0
                || !trimToEmpty(tag).isEmpty()
                || !trimToEmpty(keyword).isEmpty();
        List<NearbyRow> rows = filtered
                ? listingMapper.selectNearby(latitude, longitude,
                        categoryId == null ? 0 : categoryId,
                        trimToEmpty(tag), trimToEmpty(keyword))
                : listingMapper.selectNearbyQuota(latitude, longitude, QUOTA_PER_CATEGORY);
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
            item.setTitle(row.getTitle());
            item.setLatitude(row.getLatitude());
            item.setLongitude(row.getLongitude());
            item.setAddress(row.getAddress());
            item.setDistance(row.getDistance() == null ? null : (int) Math.round(row.getDistance()));
            item.setExpireTime(row.getExpireTime());
            return item;
        }).toList();
    }

    /** 附近接口限流：每 IP 每 60 秒最多 6 次；Redis 不可用时放行（同举报限频的降级策略） */
    public void rateLimitNearby(String clientIp) {
        String key = "ratelimit:nearby:" + trimToEmpty(clientIp);
        try {
            Long count = redis.opsForValue().increment(key);
            if (count != null && count == 1) {
                // 仅首次设置过期，避免后续请求不断续期
                redis.expire(key, Duration.ofSeconds(60));
            }
            if (count != null && count > 12) {
                throw new ApiException("请求过于频繁，请稍后再试");
            }
        } catch (ApiException e) {
            throw e;
        } catch (Exception e) {
            log.warn("Redis nearby 限流失败，放行：{}", e.getMessage());
        }
    }

    /** 发布详情：游客可看上架中的；非作者访问有效发布时浏览数 +1 */
    public ListingDetail detail(long id, Long viewerId, Double viewerLat, Double viewerLng) {
        Listing listing = listingMapper.selectById(id);
        if (listing == null) {
            throw new ApiException("发布不存在或已删除");
        }
        boolean owner = viewerId != null && viewerId == listing.getUserId().longValue();
        boolean active = listing.getStatus() == Listing.STATUS_ACTIVE;
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
        detail.setPhotoUrls(JsonUtil.parseList(listing.getPhotoUrls(), String.class));
        detail.setTitle(listing.getTitle());
        detail.setDescription(listing.getDescription());
        detail.setAutoReply(trimToEmpty(listing.getAutoReply()));
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
        // 登录用户回填收藏态，详情页星标按钮用
        if (viewerId != null) {
            Long favored = favoriteMapper.selectCount(new LambdaQueryWrapper<Favorite>()
                    .eq(Favorite::getUserId, viewerId)
                    .eq(Favorite::getListingId, id));
            detail.setIsFavorited(favored != null && favored > 0);
        }
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
            item.setTitle(listing.getTitle());
            // 分享卡片封面用第一张图
            item.setPhotoUrls(JsonUtil.parseList(listing.getPhotoUrls(), String.class));
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

    /** 校验并把请求规整：tags 去重且属于该分类预设标签（与前端发布页规则一致；items 三级字典已废弃不校验） */
    private void normalizeAndValidate(Category category, ListingSaveReq req) {
        List<String> tags = distinct(req.getTags());
        if (tags.size() > 3) {
            throw new ApiException("标签最多选 3 个");
        }
        Set<String> allowedTags = JsonUtil.parseList(category.getTags(), TagDef.class).stream()
                .map(TagDef::getName)
                .collect(Collectors.toSet());
        for (String tag : tags) {
            if (!allowedTags.contains(tag)) {
                throw new ApiException("标签「" + tag + "」不属于该分类");
            }
        }
        if (req.getPhotoUrls() != null && req.getPhotoUrls().size() > 3) {
            throw new ApiException("图片最多 3 张");
        }
        if (req.getTitle() == null || req.getTitle().trim().length() < 2) {
            throw new ApiException("技能名称至少两个字");
        }
        if (req.getTitle().trim().length() > 8) {
            throw new ApiException("技能名称最多 8 个字");
        }
        // 联系方式已不再收集：老客户端传合法值照存，其余一律规整为 wechat/空串
        if (!"wechat".equals(req.getContactType()) && !"phone".equals(req.getContactType())) {
            req.setContactType("wechat");
        }
        req.setTags(tags);
    }

    /** create 与 update 共用的内容字段复制；有效期/状态/浏览数不在这里动 */
    private void applyContent(Listing listing, ListingSaveReq req) {
        listing.setCategoryId(req.getCategoryId());
        listing.setTitle(req.getTitle().trim());
        listing.setDescription(trimToEmpty(req.getDescription()));
        listing.setTags(JsonUtil.toJson(req.getTags()));
        listing.setItems(JsonUtil.toJson(List.of()));
        listing.setPhotoUrls(JsonUtil.toJson(req.getPhotoUrls() == null ? List.of() : req.getPhotoUrls()));
        listing.setAutoReply(trimToEmpty(req.getAutoReply()));
        listing.setContactType(req.getContactType());
        listing.setContactValue(trimToEmpty(req.getContactValue()));
        listing.setLatitude(req.getLatitude());
        listing.setLongitude(req.getLongitude());
        listing.setAddress(trimToEmpty(req.getAddress()));
        listing.setCity(trimToEmpty(req.getCity()));
    }

    private String secCheckText(ListingSaveReq req) {
        return req.getTitle() + "\n" + trimToEmpty(req.getDescription()) + "\n" + trimToEmpty(req.getAutoReply());
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

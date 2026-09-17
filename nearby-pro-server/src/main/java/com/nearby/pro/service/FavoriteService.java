package com.nearby.pro.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.nearby.pro.common.ApiException;
import com.nearby.pro.common.JsonUtil;
import com.nearby.pro.dto.FavoriteItem;
import com.nearby.pro.dto.ItemGroup;
import com.nearby.pro.entity.Category;
import com.nearby.pro.entity.Favorite;
import com.nearby.pro.entity.Listing;
import com.nearby.pro.mapper.CategoryMapper;
import com.nearby.pro.mapper.FavoriteMapper;
import com.nearby.pro.mapper.ListingMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.function.Function;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class FavoriteService {

    /** 收藏列表最多返回条数：收藏量不大，一次拉全，不做分页 */
    private static final int MAX_LIST = 100;

    private final FavoriteMapper favoriteMapper;
    private final ListingMapper listingMapper;
    private final CategoryMapper categoryMapper;

    /** 收藏：仅上架中的发布可收藏；已收藏时幂等返回 */
    public void add(long userId, long listingId) {
        Listing listing = listingMapper.selectById(listingId);
        if (listing == null) {
            throw new ApiException("发布不存在或已删除");
        }
        if (listing.getStatus() != Listing.STATUS_ACTIVE
                || !listing.getExpireAt().isAfter(OffsetDateTime.now())) {
            throw new ApiException("该发布已下架，无法收藏");
        }
        Long exists = favoriteMapper.selectCount(new LambdaQueryWrapper<Favorite>()
                .eq(Favorite::getUserId, userId)
                .eq(Favorite::getListingId, listingId));
        if (exists != null && exists > 0) {
            return;
        }
        Favorite favorite = new Favorite();
        favorite.setUserId(userId);
        favorite.setListingId(listingId);
        favoriteMapper.insert(favorite);
    }

    /** 取消收藏：不存在时静默成功 */
    public void remove(long userId, long listingId) {
        favoriteMapper.delete(new LambdaQueryWrapper<Favorite>()
                .eq(Favorite::getUserId, userId)
                .eq(Favorite::getListingId, listingId));
    }

    /** 我的收藏：按收藏时间倒序最多 100 条，只保留仍在上架中的（过期/下架的收藏自然消失） */
    public List<FavoriteItem> list(long userId) {
        List<Favorite> favorites = favoriteMapper.selectList(new LambdaQueryWrapper<Favorite>()
                .eq(Favorite::getUserId, userId)
                .orderByDesc(Favorite::getCreatedAt)
                .last("LIMIT " + MAX_LIST));
        if (favorites.isEmpty()) {
            return List.of();
        }
        List<Long> listingIds = favorites.stream().map(Favorite::getListingId).toList();
        Map<Long, Listing> listings = listingMapper.selectByIds(listingIds).stream()
                .collect(Collectors.toMap(Listing::getId, Function.identity()));
        Map<Integer, Category> categories = categoryMapper.selectList(null).stream()
                .collect(Collectors.toMap(Category::getId, Function.identity()));
        OffsetDateTime now = OffsetDateTime.now();
        return favorites.stream()
                .map(Favorite::getListingId)
                .map(listings::get)
                .filter(Objects::nonNull)
                .filter(listing -> listing.getStatus() == Listing.STATUS_ACTIVE
                        && listing.getExpireAt().isAfter(now))
                .map(listing -> {
                    FavoriteItem item = new FavoriteItem();
                    item.setId(listing.getId());
                    item.setCategoryId(listing.getCategoryId());
                    Category category = categories.get(listing.getCategoryId());
                    item.setCategoryCode(category == null ? "other" : category.getCode());
                    item.setCategoryName(category == null ? "" : category.getName());
                    item.setTags(JsonUtil.parseList(listing.getTags(), String.class));
                    item.setItems(JsonUtil.parseList(listing.getItems(), ItemGroup.class));
                    item.setTitle(listing.getTitle());
                    item.setAddress(listing.getAddress());
                    item.setLatitude(listing.getLatitude());
                    item.setLongitude(listing.getLongitude());
                    return item;
                })
                .toList();
    }
}

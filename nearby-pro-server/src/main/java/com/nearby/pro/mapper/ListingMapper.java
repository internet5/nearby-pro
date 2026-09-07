package com.nearby.pro.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.nearby.pro.dto.NearbyRow;
import com.nearby.pro.entity.Listing;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

import java.util.List;

public interface ListingMapper extends BaseMapper<Listing> {

    /**
     * 附近发布主查询：PostGIS 球面距离 + 过滤。
     * tag 用 jsonb 包含判断；itemName 遍历分组结构里所有 names；keyword 对标题模糊。
     * 空串参数表示不过滤。按距离升序最多 200 条。
     */
    @Select("""
            SELECT l.id, l.user_id, u.nickname, u.avatar_url,
                   l.category_id, c.code AS category_code, c.name AS category_name,
                   l.tags, l.items, l.title, l.latitude, l.longitude, l.address, l.expire_at,
                   ST_Distance(l.geom, ST_SetSRID(ST_MakePoint(#{longitude}, #{latitude}), 4326)::geography) AS distance
            FROM listings l
            JOIN categories c ON c.id = l.category_id
            JOIN users u ON u.id = l.user_id
            WHERE l.status = 1
              AND l.expire_at > now()
              AND (#{categoryId} = 0 OR l.category_id = #{categoryId})
              AND (#{tag} = '' OR l.tags @> to_jsonb(#{tag}::text))
              AND (#{itemName} = '' OR EXISTS (
                    SELECT 1 FROM jsonb_array_elements(l.items) g,
                                 jsonb_array_elements_text(g -> 'names') n
                    WHERE n = #{itemName}))
              AND (#{keyword} = '' OR l.title LIKE '%' || #{keyword} || '%')
              AND ST_DWithin(l.geom,
                    ST_SetSRID(ST_MakePoint(#{longitude}, #{latitude}), 4326)::geography,
                    #{radius})
            ORDER BY distance
            LIMIT 200
            """)
    List<NearbyRow> selectNearby(@Param("latitude") double latitude,
                                 @Param("longitude") double longitude,
                                 @Param("radius") double radius,
                                 @Param("categoryId") int categoryId,
                                 @Param("tag") String tag,
                                 @Param("itemName") String itemName,
                                 @Param("keyword") String keyword);

    /**
     * 附近发布（配额模式）：半径内每个分类各取最近 perCategory 条，总量可控且各分类都有数据。
     * 供地图页主拉取使用（不带任何筛选参数），筛选由前端完成。
     */
    @Select("""
            SELECT id, user_id, nickname, avatar_url,
                   category_id, category_code, category_name,
                   tags, items, title, latitude, longitude, address, expire_at, distance
            FROM (
                SELECT l.id, l.user_id, u.nickname, u.avatar_url,
                       l.category_id, c.code AS category_code, c.name AS category_name,
                       l.tags, l.items, l.title, l.latitude, l.longitude, l.address, l.expire_at,
                       ST_Distance(l.geom, ST_SetSRID(ST_MakePoint(#{longitude}, #{latitude}), 4326)::geography) AS distance,
                       ROW_NUMBER() OVER (
                           PARTITION BY l.category_id
                           ORDER BY ST_Distance(l.geom, ST_SetSRID(ST_MakePoint(#{longitude}, #{latitude}), 4326)::geography)
                       ) AS rn
                FROM listings l
                JOIN categories c ON c.id = l.category_id
                JOIN users u ON u.id = l.user_id
                WHERE l.status = 1
                  AND l.expire_at > now()
                  AND ST_DWithin(l.geom,
                        ST_SetSRID(ST_MakePoint(#{longitude}, #{latitude}), 4326)::geography,
                        #{radius})
            ) t
            WHERE rn <= #{perCategory}
            ORDER BY distance
            LIMIT 400
            """)
    List<NearbyRow> selectNearbyQuota(@Param("latitude") double latitude,
                                      @Param("longitude") double longitude,
                                      @Param("radius") double radius,
                                      @Param("perCategory") int perCategory);

    /** 详情浏览计数：原子自增，只在非作者访问时调用 */
    @Update("UPDATE listings SET view_count = view_count + 1 WHERE id = #{id}")
    void incrementViewCount(@Param("id") long id);

    /** 上架中数量：发布/重新上架前的名额校验 */
    @Select("SELECT COUNT(*) FROM listings WHERE user_id = #{userId} AND status = 1")
    int countActiveByUser(@Param("userId") long userId);

    /** 定时任务：把已过期的上架记录刷成「过期」状态 */
    @Update("UPDATE listings SET status = 3 WHERE status = 1 AND expire_at <= now()")
    int markExpired();
}

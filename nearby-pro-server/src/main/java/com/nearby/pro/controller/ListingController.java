package com.nearby.pro.controller;

import com.nearby.pro.common.ApiResult;
import com.nearby.pro.common.UserContext;
import com.nearby.pro.dto.ListingDetail;
import com.nearby.pro.dto.ListingSaveReq;
import com.nearby.pro.dto.MineItem;
import com.nearby.pro.dto.NearbyItem;
import com.nearby.pro.dto.ReportReq;
import com.nearby.pro.service.ListingService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/listings")
@RequiredArgsConstructor
public class ListingController {

    private final ListingService listingService;

    /** 附近发布（免登录）：地图主接口，不含联系方式 */
    @GetMapping("/nearby")
    public ApiResult<Map<String, Object>> nearby(
            @RequestParam double latitude,
            @RequestParam double longitude,
            @RequestParam(required = false) Integer radius,
            @RequestParam(required = false, defaultValue = "0") int categoryId,
            @RequestParam(required = false, defaultValue = "") String tag,
            @RequestParam(required = false, defaultValue = "") String itemName,
            @RequestParam(required = false, defaultValue = "") String keyword) {
        List<NearbyItem> list = listingService.nearby(latitude, longitude, radius,
                categoryId, tag, itemName, keyword);
        return ApiResult.ok(Map.of("list", list, "total", list.size()));
    }

    /** 我的发布（需登录）：含下架/过期 */
    @GetMapping("/mine")
    public ApiResult<Map<String, Object>> mine() {
        List<MineItem> list = listingService.mine(UserContext.require());
        return ApiResult.ok(Map.of("list", list, "total", list.size()));
    }

    /** 发布详情：游客可看；带 viewerLatitude/viewerLongitude 时返回距离 */
    @GetMapping("/{id}")
    public ApiResult<ListingDetail> detail(@PathVariable long id,
                                           @RequestParam(required = false) Double viewerLatitude,
                                           @RequestParam(required = false) Double viewerLongitude) {
        return ApiResult.ok(listingService.detail(id, UserContext.get(), viewerLatitude, viewerLongitude));
    }

    /** 发布技能（需登录） */
    @PostMapping
    public ApiResult<Map<String, Long>> create(@Valid @RequestBody ListingSaveReq req) {
        Long id = listingService.create(UserContext.require(), req);
        return ApiResult.ok(Map.of("id", id));
    }

    /** 更新发布（仅作者）：不重置有效期与浏览数 */
    @PutMapping("/{id}")
    public ApiResult<Void> update(@PathVariable long id, @Valid @RequestBody ListingSaveReq req) {
        listingService.update(UserContext.require(), id, req);
        return ApiResult.ok();
    }

    /** 下架（仅作者） */
    @PostMapping("/{id}/offline")
    public ApiResult<Void> offline(@PathVariable long id) {
        listingService.offline(UserContext.require(), id);
        return ApiResult.ok();
    }

    /** 重新上架（仅作者）：刷新 30 天有效期 */
    @PostMapping("/{id}/relist")
    public ApiResult<Void> relist(@PathVariable long id) {
        listingService.relist(UserContext.require(), id);
        return ApiResult.ok();
    }

    /** 删除（仅作者）：物理删除 */
    @DeleteMapping("/{id}")
    public ApiResult<Void> delete(@PathVariable long id) {
        listingService.delete(UserContext.require(), id);
        return ApiResult.ok();
    }

    /** 举报（需登录）：同一用户同一条 24 小时一次 */
    @PostMapping("/{id}/report")
    public ApiResult<Void> report(@PathVariable long id, @Valid @RequestBody ReportReq req) {
        listingService.report(UserContext.require(), id, req);
        return ApiResult.ok();
    }
}

package com.nearby.pro.service;

import com.nearby.pro.mapper.ListingMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/** 定时把过期发布刷成「过期」状态，附近查询就不用每次做软删除扫描 */
@Slf4j
@Component
@RequiredArgsConstructor
public class ListingExpireTask {

    private final ListingMapper listingMapper;

    /** 每小时第 7 分钟执行，避开整点任务高峰 */
    @Scheduled(cron = "0 7 * * * *")
    public void markExpired() {
        int count = listingMapper.markExpired();
        if (count > 0) {
            log.info("定时任务：{} 条发布已过期", count);
        }
    }
}

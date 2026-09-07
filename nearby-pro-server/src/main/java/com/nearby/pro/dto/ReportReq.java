package com.nearby.pro.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Data;

@Data
public class ReportReq {

    /** fake 虚假信息 / spam 广告骚扰 / illegal 违法违规 / other 其他 */
    @NotBlank(message = "请选择举报原因")
    private String reason;

    @Size(max = 200, message = "补充说明最长 200 字")
    private String detail = "";
}

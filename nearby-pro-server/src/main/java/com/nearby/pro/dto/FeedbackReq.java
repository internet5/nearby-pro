package com.nearby.pro.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Data;

@Data
public class FeedbackReq {

    @NotBlank(message = "请填写反馈内容")
    @Size(max = 500, message = "反馈内容最长 500 字")
    private String content;
}

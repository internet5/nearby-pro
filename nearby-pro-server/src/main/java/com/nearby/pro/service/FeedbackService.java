package com.nearby.pro.service;

import com.nearby.pro.entity.Feedback;
import com.nearby.pro.mapper.FeedbackMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class FeedbackService {

    private final FeedbackMapper feedbackMapper;

    /** 意见与建议：落库，运营查库人工处理 */
    public void submit(long userId, String content) {
        Feedback feedback = new Feedback();
        feedback.setUserId(userId);
        feedback.setContent(content.trim());
        feedbackMapper.insert(feedback);
    }
}

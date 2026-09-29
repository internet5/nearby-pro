package com.nearby.pro.service;

import com.nearby.pro.common.ApiException;
import com.nearby.pro.entity.User;
import com.nearby.pro.mapper.UserMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.Map;

@Service
@RequiredArgsConstructor
public class UserService {

    private final UserMapper userMapper;

    /** 更新头像昵称：两者均可为空，空昵称由前端展示层兜底 */
    public Map<String, String> updateProfile(long userId, String nickname, String avatarUrl) {
        User user = userMapper.selectById(userId);
        if (user == null) {
            throw new ApiException("用户不存在");
        }
        user.setNickname(nickname == null ? "" : nickname.trim());
        user.setAvatarUrl(avatarUrl == null ? "" : avatarUrl.trim());
        userMapper.updateById(user);
        return Map.of("nickname", user.getNickname(), "avatarUrl", user.getAvatarUrl());
    }
}

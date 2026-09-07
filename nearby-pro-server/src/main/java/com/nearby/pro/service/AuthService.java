package com.nearby.pro.service;

import com.nearby.pro.config.WxProperties;
import com.nearby.pro.dto.LoginResp;
import com.nearby.pro.dto.WxLoginReq;
import com.nearby.pro.entity.User;
import com.nearby.pro.mapper.UserMapper;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.util.Date;
import java.util.Random;

@Service
@RequiredArgsConstructor
public class AuthService {

    private static final Random RANDOM = new Random();

    private final WxProperties wx;
    private final UserMapper userMapper;
    private final WxService wxService;

    /** 小程序登录：code 换 openid，不存在则建号，签发 JWT */
    public LoginResp wxLogin(WxLoginReq req) {
        String openid = wxService.code2Session(req.getCode());
        User user = userMapper.selectByOpenid(openid);
        if (user == null) {
            user = new User();
            user.setOpenid(openid);
            user.setNickname(blankToDefault(req.getNickname(), "用户" + (1000 + RANDOM.nextInt(9000))));
            user.setAvatarUrl(blankToDefault(req.getAvatarUrl(), ""));
            user.setPhone("");
            userMapper.insert(user);
        }
        return LoginResp.builder()
                .token(issueToken(user.getId()))
                .userId(user.getId())
                .nickname(user.getNickname())
                .avatarUrl(user.getAvatarUrl())
                .phone(user.getPhone())
                .build();
    }

    /** 从 Authorization: Bearer {token} 解析 userId；缺失或非法返回 null（游客） */
    public Long parseUserId(String authorization) {
        if (authorization == null || !authorization.startsWith("Bearer ")) {
            return null;
        }
        try {
            Claims claims = Jwts.parser()
                    .verifyWith(key())
                    .build()
                    .parseSignedClaims(authorization.substring("Bearer ".length()))
                    .getPayload();
            return Long.valueOf(claims.getSubject());
        } catch (Exception e) {
            return null;
        }
    }

    private String issueToken(long userId) {
        Date expiry = new Date(System.currentTimeMillis() + wx.getJwtExpireDays() * 86400000L);
        return Jwts.builder()
                .subject(String.valueOf(userId))
                .issuedAt(new Date())
                .expiration(expiry)
                .signWith(key())
                .compact();
    }

    private SecretKey key() {
        return Keys.hmacShaKeyFor(wx.getJwtSecret().getBytes(StandardCharsets.UTF_8));
    }

    private String blankToDefault(String value, String fallback) {
        return value == null || value.isBlank() ? fallback : value.trim();
    }
}

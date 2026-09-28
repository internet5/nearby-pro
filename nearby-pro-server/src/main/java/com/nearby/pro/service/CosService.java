package com.nearby.pro.service;

import com.nearby.pro.common.ApiException;
import com.nearby.pro.config.CosProperties;
import com.tencentcloudapi.common.Credential;
import com.tencentcloudapi.common.profile.ClientProfile;
import com.tencentcloudapi.common.profile.HttpProfile;
import com.tencentcloudapi.sts.v20180813.StsClient;
import com.tencentcloudapi.sts.v20180813.models.GetFederationTokenRequest;
import com.tencentcloudapi.sts.v20180813.models.GetFederationTokenResponse;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * COS 临时密钥（STS）：发布图片由小程序直传 COS，服务端只发 30 分钟有效的上传凭证。
 * 与红包项目共用主密钥与桶，策略收窄到本项目的 nearby/image/ 前缀。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class CosService {

    private static final long DURATION_SECONDS = 1800;

    /** 临时密钥只允许写这个前缀，与红包项目的文件互不干扰 */
    private static final String UPLOAD_PREFIX = "nearby/image/*";

    private final CosProperties cos;

    public Map<String, Object> getCredentials() {
        if (cos.getSecretId().isEmpty() || cos.getBucket().isEmpty()) {
            throw new ApiException("图片存储未配置，请联系管理员");
        }
        try {
            Credential cred = new Credential(cos.getSecretId(), cos.getSecretKey());
            HttpProfile httpProfile = new HttpProfile();
            httpProfile.setEndpoint("sts.tencentcloudapi.com");
            ClientProfile clientProfile = new ClientProfile();
            clientProfile.setHttpProfile(httpProfile);
            StsClient client = new StsClient(cred, cos.getRegion(), clientProfile);

            GetFederationTokenRequest request = new GetFederationTokenRequest();
            request.setName("nearby-cos-sts");
            request.setPolicy(buildPolicy());
            request.setDurationSeconds(DURATION_SECONDS);
            GetFederationTokenResponse response = client.GetFederationToken(request);

            Map<String, Object> result = new LinkedHashMap<>();
            result.put("tmpSecretId", response.getCredentials().getTmpSecretId());
            result.put("tmpSecretKey", response.getCredentials().getTmpSecretKey());
            result.put("sessionToken", response.getCredentials().getToken());
            // 前端签名 KeyTime 用 startTime;expiredTime（与 cos-wx-sdk-v5 同款取法）；
            // 响应模型无 startTime，按我们请求的时长还原，前端签名不依赖客户端时钟
            result.put("startTime", response.getExpiredTime() - DURATION_SECONDS);
            result.put("expiredTime", response.getExpiredTime());
            result.put("bucket", cos.getBucket());
            result.put("region", cos.getRegion());
            result.put("baseUrl", cos.getBaseUrl());
            return result;
        } catch (Exception e) {
            log.error("获取 COS 临时密钥失败：{}", e.getMessage(), e);
            throw new ApiException("获取上传凭证失败，请稍后再试");
        }
    }

    /**
     * CAM 策略：只允许对本桶 nearby/image/ 前缀做上传（PutObject/PostObject）。
     * 资源串是 CAM 六段式 qcs:<service>:<region>:<account>:<resource>，region 后只能有一个冒号；
     * 误写成 "::uid/" 会多出一段空字段，STS 报 resource error
     * （前端表现：发布带图时提示「获取上传凭证失败，请稍后再试」）。
     */
    private String buildPolicy() {
        String appid = cos.getBucket().substring(cos.getBucket().lastIndexOf('-') + 1);
        String resource = "qcs::cos:" + cos.getRegion() + ":uid/" + appid
                + ":" + cos.getBucket() + "/" + UPLOAD_PREFIX;
        return "{\"version\":\"2.0\",\"statement\":[{\"effect\":\"allow\","
                + "\"action\":[\"name/cos:PutObject\",\"name/cos:PostObject\"],"
                + "\"resource\":[\"" + resource + "\"]}]}";
    }
}

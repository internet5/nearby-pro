package com.nearby.pro.common;

import com.fasterxml.jackson.databind.ObjectMapper;

import java.util.Collections;
import java.util.List;

/**
 * JSON 工具。JSONB 列在实体里统一存 JSON 文本（String），
 * 序列化/反序列化集中在 service 层通过这里转换，避免 TypeHandler 泛型擦除问题。
 */
public final class JsonUtil {

    public static final ObjectMapper MAPPER = new ObjectMapper();

    private JsonUtil() {
    }

    public static String toJson(Object obj) {
        try {
            return MAPPER.writeValueAsString(obj == null ? Collections.emptyList() : obj);
        } catch (Exception e) {
            throw new IllegalStateException("JSON 序列化失败", e);
        }
    }

    public static <T> List<T> parseList(String json, Class<T> elementClass) {
        if (json == null || json.isBlank()) {
            return Collections.emptyList();
        }
        try {
            return MAPPER.readValue(json,
                    MAPPER.getTypeFactory().constructCollectionType(List.class, elementClass));
        } catch (Exception e) {
            // 历史脏数据兜底为空列表，不让单条坏数据打挂接口
            return Collections.emptyList();
        }
    }
}

package com.nearby.pro.config;

import org.mybatis.spring.annotation.MapperScan;
import org.springframework.context.annotation.Configuration;

@Configuration
@MapperScan("com.nearby.pro.mapper")
public class MybatisPlusConfig {
}

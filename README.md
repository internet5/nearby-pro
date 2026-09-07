# 附近职人

给自由职业者和兼职人员用地图定点发布技能，需求方按分类查看附近的人。

小程序原型可用本地模拟数据独立运行；后端已就绪（Spring Boot 3 + PostgreSQL/PostGIS + Redis），接口清单见 `docs/api.md`，下一步把小程序接到真实 API。

## 仓库结构

```
nearby-pro/
├── docs/                 # 数据库、接口设计
├── sql/init.sql          # PostgreSQL + PostGIS 建表与分类种子
├── nearby-pro-wx/        # 微信小程序原型
└── nearby-pro-server/    # 后端服务（Spring Boot 3 / Java 17 / MyBatis-Plus）
```

## 启动后端

依赖：JDK 17+、Maven、PostgreSQL 14+（含 PostGIS 扩展）、Redis。

1. 建库建表（Docker 环境一行搞定）：

   ```bash
   docker exec -i postgis psql -U root -d nearby_pro < sql/init.sql
   ```

2. 数据库与 Redis 连接配置在 `nearby-pro-server/src/main/resources/application-local.yml`（已 gitignore，按本机环境修改）

3. 编译与运行（在 `nearby-pro-server/` 下）：

   ```bash
   mvn clean compile
   mvn spring-boot:run
   ```

4. 默认端口 8080，试一下分类接口：`curl http://localhost:8080/api/categories`

微信小程序密钥未配置时，`wx.mock=true`（默认）下登录接口用任意 code 都能换取测试身份，方便联调；上线前在 `application.yml` 里关掉 mock 并打开内容安全检测。

## 打开小程序原型

1. 安装 [微信开发者工具](https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html)
2. 导入目录：`nearby-pro-wx`
3. AppID 可先用测试号
4. 在真机或模拟器允许定位后，地图上会显示附近职人标记

## MVP 页面

| 页面 | 作用 |
|------|------|
| 附近 | 地图 + 分类筛选 + 点选卡片 + 列表 |
| 发布 | 选点、选分类、填简介和联系方式 |
| 详情 | 查看发布内容，复制微信 / 拨打电话 |
| 我的 | 我发布的信息，可下架 |

发布的数据暂存在小程序本地，刷新后仍在，方便演示完整闭环。

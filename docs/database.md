# 数据库设计

引擎：PostgreSQL 14+，启用 PostGIS。  
原则：第一版只保留用户、分类、发布、举报四张表。聊天、支付、广告、评价全部不做。

## ER 关系

```
users 1 ── N listings
categories 1 ── N listings
users 1 ── N reports
listings 1 ── N reports
```

## 表说明

### users（用户）

微信登录后的账号。发布方和需求方是同一个用户，用有没有有效发布来区分角色，不单独建角色表。

| 字段 | 类型 | 说明 |
|------|------|------|
| id | BIGSERIAL | 主键 |
| openid | VARCHAR(64) | 微信 openid，唯一 |
| unionid | VARCHAR(64) | 可选 |
| nickname | VARCHAR(64) | 昵称 |
| avatar_url | VARCHAR(512) | 头像 |
| phone | VARCHAR(20) | 手机号，授权后才有 |
| created_at / updated_at | TIMESTAMPTZ | 时间 |

### categories（技能分类）

预置数据，运营改库即可，不做后台分类管理。

| 字段 | 类型 | 说明 |
|------|------|------|
| id | SMALLSERIAL | 主键 |
| code | VARCHAR(32) | 英文码，前后端共用：clean / repair / tutor / photo / run / other |
| name | VARCHAR(32) | 展示名 |
| sort_order | SMALLINT | 越小越靠前 |
| enabled | BOOLEAN | 是否展示 |

种子分类：家政保洁、维修安装、家教陪练、摄影跟拍、代驾跑腿、其他。冷启动对外主推前三个。  
每个分类挂工种标签；容易误匹配的工种再挂具体项目（如家电维修 → 空调 / 冰箱 / 电磁炉）。发布时必须勾会做的项目，需求方按项目筛选。

### listings（技能发布）

一张表同时存内容和坐标。`geom` 由经纬度触发器自动生成，查询附近只用 `ST_DWithin`。

| 字段 | 类型 | 说明 |
|------|------|------|
| id | BIGSERIAL | 主键 |
| user_id | BIGINT | 发布人 |
| category_id | SMALLINT | 分类 |
| title | VARCHAR(40) | 一句话技能，如「上门水电维修」 |
| tags | JSONB | 工种，如 `["家电维修"]` |
| items | JSONB | 具体会做的项目，如 `["电磁炉","油烟机"]`，只勾会的 |
| description | VARCHAR(500) | 补充说明 |
| photo_urls | JSONB | 图片 URL 数组，最多 3 张 |
| contact_type | VARCHAR(16) | `wechat` 或 `phone` |
| contact_value | VARCHAR(64) | 微信号或手机号 |
| latitude / longitude | DOUBLE PRECISION | GCJ-02 坐标 |
| geohash | VARCHAR(12) | 备用前缀过滤 |
| geom | GEOGRAPHY(Point,4326) | 附近查询 |
| address | VARCHAR(200) | 逆地理或用户确认的地址 |
| city | VARCHAR(40) | 城市，便于按城统计 |
| status | SMALLINT | 1 上架 / 2 主动下架 / 3 过期 / 4 封禁 |
| expire_at | TIMESTAMPTZ | 默认创建后 30 天 |
| view_count | INT | 详情浏览次数 |
| created_at / updated_at | TIMESTAMPTZ | 时间 |

约束：同一用户同时最多 3 条 `status = 1` 的发布，避免地图被同一个人刷满。

索引：

- `listings_geom_gix`：GIST(geom)
- `listings_active_idx`：`(status, expire_at)` 部分索引，只覆盖上架且未过期
- `listings_user_idx`：`(user_id, status)`

### reports（举报）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | BIGSERIAL | 主键 |
| listing_id | BIGINT | 被举报发布 |
| reporter_id | BIGINT | 举报人 |
| reason | VARCHAR(32) | fake / spam / illegal / other |
| detail | VARCHAR(200) | 补充 |
| created_at | TIMESTAMPTZ | 时间 |

同一用户对同一条发布 24 小时内只能举报一次，应用层控制。

## 过期策略

发布时写入 `expire_at = now() + 30 days`。查询附近时带上 `status = 1 AND expire_at > now()`。  
后续用定时任务把过期记录改成 `status = 3`，不在查询里做软删除扫描。

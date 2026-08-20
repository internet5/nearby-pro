# 接口设计

基址：`/api`  
鉴权：除登录、分类、附近列表外，写操作需要 `Authorization: Bearer {token}`。  
统一响应：

```json
{ "success": true, "data": {}, "message": "" }
```

失败时 `success` 为 false，`data` 为 null，`message` 为原因。字段一律驼峰。

附近列表接口不返回联系方式，避免爬取；联系方式只在详情里返回。

---

## 1. 微信登录

**API**: `POST /api/auth/wxLogin`

```javascript
const requestData = {
  code: '081abc',          // wx.login 得到的 code（必需）
  nickname: '阿强',        // 可选
  avatarUrl: 'https://...' // 可选
}
```

```json
{
  "success": true,
  "data": {
    "token": "jwt...",
    "userId": "10001",
    "nickname": "阿强",
    "avatarUrl": "",
    "phone": ""
  }
}
```

## 2. 分类列表

**API**: `GET /api/categories`

无需登录。前端地图筛选条直接用这个接口，第一项「全部」由前端自己拼，不要入库。

```json
{
  "success": true,
  "data": [
    { "id": 1, "code": "clean",  "name": "家政保洁" },
    { "id": 2, "code": "repair", "name": "维修安装" },
    { "id": 3, "code": "tutor",  "name": "家教陪练" },
    { "id": 4, "code": "photo",  "name": "摄影跟拍" },
    { "id": 5, "code": "run",    "name": "代驾跑腿" },
    { "id": 6, "code": "other",  "name": "其他" }
  ]
}
```

## 3. 附近发布（地图主接口）

**API**: `GET /api/listings/nearby`

```javascript
const requestParams = {
  latitude: 30.657486,     // 必需，当前视野中心或用户位置
  longitude: 104.065735,   // 必需
  radius: 3000,            // 可选，米，默认 3000，最大 10000
  categoryId: 2,           // 可选，不传或 0 表示全部分类
  keyword: ''              // 可选，标题模糊搜
}
```

查询条件：`status = 1 AND expire_at > now() AND ST_DWithin(geom, 点, radius)`。  
按距离升序，最多返回 200 条。地图点多时前端用微信 map 的点聚合。

```json
{
  "success": true,
  "data": {
    "list": [
      {
        "id": "2001",
        "userId": "10001",
        "nickname": "张师傅",
        "avatarUrl": "",
        "categoryId": 2,
        "categoryCode": "repair",
        "categoryName": "维修安装",
        "title": "上门水电维修",
        "latitude": 30.65912,
        "longitude": 104.06801,
        "address": "天府广场附近",
        "distance": 312,
        "expireTime": "2026-09-19T10:00:00+08:00"
      }
    ],
    "total": 1
  }
}
```

`distance` 单位米，整数。此接口**不含** `contactType` / `contactValue`。

## 4. 发布详情

**API**: `GET /api/listings/{id}`

每成功访问一次，`view_count + 1`。已下架/过期/封禁对非作者返回失败。

```json
{
  "success": true,
  "data": {
    "id": "2001",
    "userId": "10001",
    "nickname": "张师傅",
    "avatarUrl": "",
    "categoryId": 2,
    "categoryCode": "repair",
    "categoryName": "维修安装",
    "title": "上门水电维修",
    "description": "电路跳闸、水管漏水，一般当天能上门。",
    "photoUrls": [],
    "contactType": "wechat",
    "contactValue": "zhang_repair",
    "latitude": 30.65912,
    "longitude": 104.06801,
    "address": "天府广场附近",
    "distance": 312,
    "status": 1,
    "expireTime": "2026-09-19T10:00:00+08:00",
    "viewCount": 18,
    "createTime": "2026-08-20T10:00:00+08:00",
    "isOwner": false
  }
}
```

`distance` 在请求带了 lat/lng 时才有。`isOwner` 用于详情页展示「下架」。

## 5. 发布技能

**API**: `POST /api/listings`  
需要登录。

```javascript
const requestData = {
  categoryId: 2,
  title: '上门水电维修',
  description: '电路跳闸、水管漏水，一般当天能上门。',
  photoUrls: [],
  contactType: 'wechat',
  contactValue: 'zhang_repair',
  latitude: 30.65912,
  longitude: 104.06801,
  address: '天府广场附近',
  city: '成都'
}
```

服务端校验：标题 2–40 字；简介 ≤500；图片 ≤3；同一用户上架中的发布 ≤3；坐标必填。  
`expireTime` 服务端设为 now+30 天，客户端不要传。

```json
{
  "success": true,
  "data": { "id": "2001" }
}
```

## 6. 更新发布

**API**: `PUT /api/listings/{id}`  
仅作者。字段与创建相同，全部覆盖。更新后**不**重置过期时间。

## 7. 下架

**API**: `POST /api/listings/{id}/offline`  
仅作者。把 `status` 改为 2。无返回体。

## 8. 我的发布

**API**: `GET /api/listings/mine`  
需要登录。包含已下架和已过期，按创建时间倒序。

```json
{
  "success": true,
  "data": {
    "list": [
      {
        "id": "2001",
        "categoryName": "维修安装",
        "title": "上门水电维修",
        "status": 1,
        "address": "天府广场附近",
        "viewCount": 18,
        "expireTime": "2026-09-19T10:00:00+08:00",
        "createTime": "2026-08-20T10:00:00+08:00"
      }
    ]
  }
}
```

## 9. 举报

**API**: `POST /api/listings/{id}/report`  
需要登录。

```javascript
const requestData = {
  reason: 'fake',
  detail: ''
}
```

`reason`：`fake` 虚假信息 / `spam` 广告骚扰 / `illegal` 违法违规 / `other` 其他。

## 附近查询 SQL 示意

```sql
SELECT l.id, l.user_id, l.category_id, l.title,
       l.latitude, l.longitude, l.address, l.expire_at,
       ST_Distance(l.geom, ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)::geography) AS distance
FROM listings l
WHERE l.status = 1
  AND l.expire_at > now()
  AND (:categoryId = 0 OR l.category_id = :categoryId)
  AND ST_DWithin(
        l.geom,
        ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)::geography,
        :radius
      )
ORDER BY distance
LIMIT 200;
```

## 明确不做（MVP）

- 支付 / 会员年费
- 即时通讯
- 广告位
- 评价与订单
- 管理后台（违规先靠举报 + 手工改库）

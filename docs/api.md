# 接口设计

基址：`/api`  
鉴权：`Authorization: Bearer {token}`（`POST /api/auth/wxLogin` 签发，JWT，30 天有效）。

| 免登录 | 可选登录 | 必须登录 |
|--------|----------|----------|
| wxLogin / categories / nearby | 详情（`isOwner` 判断） | 发布 / 更新 / 下架 / 重新上架 / 删除 / 我的发布 / 举报 / 反馈 |

统一响应：

```json
{ "success": true, "data": {}, "message": "" }
```

失败时 `success` 为 false，`data` 为 null，`message` 为原因（HTTP 仍为 200，小程序端统一在 success 回调里判断 success 字段）。字段一律驼峰。

附近列表接口不返回联系方式，避免爬取；联系方式只在详情里返回。

## 内容安全

发布与更新时，服务端把 `title + description + contactValue` 提交微信 `msgSecCheck` 检测，不通过返回失败「内容含违规信息，请修改后重试」。由配置 `wx.security-check` 控制，**上线前必须开启**；本地 mock 模式自动跳过。

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
    "userId": 10001,
    "nickname": "阿强",
    "avatarUrl": "",
    "phone": ""
  }
}
```

本地联调：`wx.mock=true` 时任意 code 都能登录（openid = `mock_{code}`），不访问微信。

## 2. 分类列表

**API**: `GET /api/categories`

无需登录。`tags` 是两级字典：工种 → 具体项目，发布页勾选与地图筛选条共用，改库即生效。第一项「全部」由前端自己拼，不要入库。

```json
{
  "success": true,
  "data": [
    {
      "id": 2,
      "code": "repair",
      "name": "维修安装",
      "tags": [
        { "name": "水电维修", "items": ["电路跳闸", "水管漏水", "开关插座", "灯具"] },
        { "name": "家电维修", "items": ["空调", "冰箱", "洗衣机", "热水器", "油烟机", "电磁炉", "电视"] },
        { "name": "家具安装", "items": ["灯具窗帘", "晾衣架", "家具组装", "电视挂墙"] },
        { "name": "管道疏通", "items": ["马桶", "地漏", "厨房管道"] }
      ]
    }
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
  tag: '水电维修',          // 可选，按工种筛
  itemName: '空调',         // 可选，按具体项目筛
  keyword: ''              // 可选，标题模糊搜
}
```

查询条件：`status = 1 AND expire_at > now() AND ST_DWithin(geom, 点, radius)`。  
按距离升序，最多返回 200 条。点不多时地图气泡直接展示技能名，先不要开点聚合。

```json
{
  "success": true,
  "data": {
    "list": [
      {
        "id": 2001,
        "userId": 10001,
        "nickname": "张师傅",
        "avatarUrl": "",
        "categoryId": 2,
        "categoryCode": "repair",
        "categoryName": "维修安装",
        "tags": ["水电维修", "管道疏通"],
        "items": [{ "tag": "水电维修", "names": ["电路跳闸", "水管漏水"] }],
        "title": "上门水电维修",
        "latitude": 30.65912,
        "longitude": 104.06801,
        "address": "天府广场附近",
        "distance": 312,
        "expireTime": "2026-09-19T10:00:00"
      }
    ],
    "total": 1
  }
}
```

`distance` 单位米，整数。此接口**不含** `contactType` / `contactValue`。

## 4. 发布详情

**API**: `GET /api/listings/{id}`

游客可看。可选参数 `viewerLatitude` / `viewerLongitude`，带上时返回 `distance`（米）。  
非作者访问有效发布时 `view_count + 1`（作者自己看不计数）；已下架/过期/封禁对非作者返回失败，作者可看并带状态。

```json
{
  "success": true,
  "data": {
    "id": 2001,
    "userId": 10001,
    "nickname": "张师傅",
    "avatarUrl": "",
    "categoryId": 2,
    "categoryCode": "repair",
    "categoryName": "维修安装",
    "tags": ["水电维修", "管道疏通"],
    "items": [{ "tag": "水电维修", "names": ["电路跳闸", "水管漏水"] }],
    "title": "上门水电维修",
    "description": "电路跳闸、水管漏水，一般当天能上门。",
    "photoUrls": [],
    "contactType": "wechat",
    "contactValue": "zhang_repair",
    "latitude": 30.65912,
    "longitude": 104.06801,
    "address": "天府广场附近",
    "city": "成都",
    "distance": 312,
    "status": 1,
    "expireTime": "2026-09-19T10:00:00",
    "viewCount": 18,
    "createTime": "2026-08-20T10:00:00",
    "isOwner": false
  }
}
```

`isOwner` 用于详情页展示「下架」，以及区分「我发布的」。

## 5. 发布技能

**API**: `POST /api/listings`  
需要登录。

```javascript
const requestData = {
  categoryId: 2,
  tags: ['水电维修', '管道疏通'],                                  // 1~3 个，须属于该分类
  items: [{ 'tag': '水电维修', 'names': ['电路跳闸', '水管漏水'] }], // 按工种分组；names 须属于对应工种
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

服务端校验：标题 2–40 字；简介 ≤500；图片 ≤3；工种 1–3 个且属于分类；所选工种里只要有任一提供具体项目就要求至少勾一项（与发布页一致）；同一用户上架中的发布 ≤3；坐标必填；内容安全检测。  
`expireTime` 服务端设为 now+30 天，客户端不要传。

```json
{
  "success": true,
  "data": { "id": 2001 }
}
```

## 6. 更新发布

**API**: `PUT /api/listings/{id}`  
仅作者。字段与创建相同，全部覆盖内容字段。更新后**不**重置过期时间、不清浏览数。

## 7. 下架

**API**: `POST /api/listings/{id}/offline`  
仅作者。把 `status` 改为 2。无返回体。

## 8. 重新上架

**API**: `POST /api/listings/{id}/relist`  
仅作者。`status` 2/3 → 1，并把有效期刷新为 now+30 天；上架中已满 3 条时返回失败「上架中的已满 3 条，先下架一条」。

## 9. 删除

**API**: `DELETE /api/listings/{id}`  
仅作者。物理删除，不可恢复。无返回体。

## 10. 我的发布

**API**: `GET /api/listings/mine`  
需要登录。包含已下架和已过期，按创建时间倒序。

```json
{
  "success": true,
  "data": {
    "list": [
      {
        "id": 2001,
        "categoryId": 2,
        "categoryCode": "repair",
        "categoryName": "维修安装",
        "tags": ["水电维修"],
        "items": [{ "tag": "水电维修", "names": ["电路跳闸"] }],
        "title": "上门水电维修",
        "address": "天府广场附近",
        "status": 1,
        "viewCount": 18,
        "expireTime": "2026-09-19T10:00:00",
        "createTime": "2026-08-20T10:00:00"
      }
    ],
    "total": 1
  }
}
```

编辑回填走「发布详情」接口（列表里只留展示字段）。

## 11. 举报

**API**: `POST /api/listings/{id}/report`  
需要登录。不能举报自己的发布；同一用户对同一条 24 小时内只能举报一次。

```javascript
const requestData = {
  reason: 'fake',
  detail: ''
}
```

`reason`：`fake` 虚假信息 / `spam` 广告骚扰 / `illegal` 违法违规 / `other` 其他。

## 12. 意见与建议

**API**: `POST /api/feedbacks`  
需要登录。运营查库人工处理，不做自动回复。

```javascript
const requestData = {
  content: '希望能加一个搬家分类'   // 1~500 字
}
```

## 附近查询 SQL 示意

```sql
SELECT l.id, l.user_id, u.nickname, u.avatar_url,
       l.category_id, c.code AS category_code, c.name AS category_name,
       l.tags, l.items, l.title, l.latitude, l.longitude, l.address, l.expire_at,
       ST_Distance(l.geom, ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)::geography) AS distance
FROM listings l
JOIN categories c ON c.id = l.category_id
JOIN users u ON u.id = l.user_id
WHERE l.status = 1
  AND l.expire_at > now()
  AND (:categoryId = 0 OR l.category_id = :categoryId)
  AND (:tag = '' OR l.tags @> to_jsonb(:tag))
  AND (:itemName = '' OR EXISTS (
        SELECT 1 FROM jsonb_array_elements(l.items) g,
                     jsonb_array_elements_text(g -> 'names') n
        WHERE n = :itemName))
  AND (:keyword = '' OR l.title LIKE '%' || :keyword || '%')
  AND ST_DWithin(l.geom,
        ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)::geography,
        :radius)
ORDER BY distance
LIMIT 200;
```

## 明确不做（MVP）

- 支付 / 会员年费
- 即时通讯
- 广告位
- 评价与订单
- 管理后台（违规先靠举报 + 手工改库）

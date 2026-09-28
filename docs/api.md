# 接口设计

基址：`/api`  
鉴权：`Authorization: Bearer {token}`（`POST /api/auth/wxLogin` 签发，JWT，30 天有效）。

| 免登录 | 可选登录 | 必须登录 |
|--------|----------|----------|
| wxLogin / categories / nearby | 详情（`isOwner` / `isFavorited` 判断） | 发布 / 更新 / 下架 / 重新上架 / 删除 / 我的发布 / 举报 / 反馈 / 收藏 / COS 上传凭证 / 私聊辅助接口（§14） |

统一响应：

```json
{ "success": true, "data": {}, "message": "" }
```

失败时 `success` 为 false，`data` 为 null，`message` 为原因（HTTP 仍为 200，小程序端统一在 success 回调里判断 success 字段）。字段一律驼峰。

附近列表接口不返回联系方式，避免爬取；联系方式只在详情里返回。发布页已不再收集联系方式（需求方走私聊 IM 联系），仅历史发布仍有值。

## 内容安全

发布与更新时，服务端把 `title + description + autoReply` 提交微信 `msgSecCheck` 检测，不通过返回失败「内容含违规信息，请修改后重试」。由配置 `wx.security-check` 控制，**上线前必须开启**；关闭时直接放行。

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

## 2. 分类列表

**API**: `GET /api/categories`

无需登录。分类为两级：一级分类必选，二级为预设标签（`tags`，发布时可选 0~3 个、可跳过；地图筛选条共用），改库即生效。第一项「全部」由前端自己拼，不要入库。

```json
{
  "success": true,
  "data": [
    {
      "id": 2,
      "code": "repair",
      "name": "维修安装",
      "tags": [
        { "name": "水电维修" },
        { "name": "家电维修" },
        { "name": "门窗维修" },
        { "name": "家具安装" },
        { "name": "管道疏通" },
        { "name": "开锁换锁" }
      ]
    }
  ]
}
```

全量 10 类：家政保洁 / 维修安装 / 家教 / 摄影 / 代驾跑腿 / 其他 / 陪护 / 卖货 / 搬运搬家 / IT·设计。「其他」无预设标签。

## 3. 附近发布（地图主接口）

**API**: `GET /api/listings/nearby`

免登录，**按 IP 限流：60 秒内最多 6 次**，超过返回失败「请求过于频繁，请稍后再试」（取 `X-Forwarded-For` 首段 → `X-Real-IP` → 远端地址；Redis 不可用时放行）。

```javascript
const requestParams = {
  latitude: 30.657486,     // 必需，当前视野中心或用户位置
  longitude: 104.065735,   // 必需
  radius: 20000,           // 可选，米，默认 3000，最大 20000（超出会被截断）
  categoryId: 2,           // 可选，不传或 0 表示全部分类
  tag: '水电维修'           // 可选，按预设标签筛
}
```

查询条件：`status = 1 AND expire_at > now() AND ST_DWithin(geom, 点, radius)`。  
按距离升序：传 `categoryId` 时最多 300 条；不传（全部）走配额模式，每分类最多 30 条、共 300 条。地图 marker 的常驻 label 显示 `title`（用户自定义技能名称）。

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

`distance` 单位米，整数。此接口**不含** `contactType` / `contactValue`，也不再返回 `items`（三级字典已废弃）。

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
    "title": "水电维修",
    "description": "电路跳闸、水管漏水，一般当天能上门。",
    "photoUrls": ["https://red-packet-1254310674.cos.ap-chengdu.myqcloud.com/nearby/image/xxx.jpg"],
    "autoReply": "您好，工作时间内会尽快回复～",
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
    "isOwner": false,
    "isFavorited": false
  }
}
```

`isOwner` 用于详情页展示「下架」，以及区分「我发布的」。`isFavorited` 仅登录用户有意义，详情页收藏星标用。发布页已不收集联系方式，新发布的 `contactValue` 为空串，前端仅在非空时展示联系方式卡片与复制/拨打按钮。`autoReply` 随详情返回，编辑页回填用。

## 5. 发布技能

**API**: `POST /api/listings`  
需要登录。

```javascript
const requestData = {
  categoryId: 2,                 // 必需，一级分类
  tags: ['水电维修', '管道疏通'], // 可选，0~3 个，须属于该分类的预设标签
  title: '水电维修',              // 必需，2~8 字
  description: '电路跳闸、水管漏水，一般当天能上门。',
  photoUrls: ['https://...cos.ap-chengdu.myqcloud.com/nearby/image/xxx.jpg'], // COS 直传后的 URL，≤3 张
  autoReply: '您好，看到您的咨询会尽快回复～', // 可选 ≤200 字；仅在有别人首次咨询这个技能时由服务端代发
  contactType: 'wechat',         // 不再收集；新建固定 wechat（历史数据编辑时回传原值）
  contactValue: '',              // 不再收集；新建传空串，编辑老数据时回传原值
  latitude: 30.65912,
  longitude: 104.06801,
  address: '天府广场附近',
  city: '成都'
}
```

`items`（三级字典遗留字段）已废弃：老客户端仍可能传，服务端不再校验，落库固定 `[]`。

服务端校验：标题 2–8 字（超过报「技能名称最长 8 个字」）；简介 ≤500；图片 ≤3；标签 0~3 个且属于该分类预设；自动回复 ≤200；同一用户上架中的发布 ≤3；坐标必填；内容安全检测（title+description+autoReply）。  
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
        "title": "水电维修",
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

## 13. 收藏

**收藏**：`POST /api/favorites/{listingId}`  
**取消收藏**：`DELETE /api/favorites/{listingId}`  
均需登录。仅上架中的发布可收藏；重复收藏幂等，取消不存在的收藏静默成功。

**我的收藏**：`GET /api/favorites`  
需要登录。按收藏时间倒序最多 100 条，只返回仍在上架中的（下架/过期的收藏自然消失）。坐标带上，供「看位置」跳地图聚焦。

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
        "title": "水电维修",
        "address": "天府广场附近",
        "latitude": 30.65912,
        "longitude": 104.06801
      }
    ],
    "total": 1
  }
}
```

## 附近查询 SQL 示意

```sql
SELECT l.id, l.user_id, u.nickname, u.avatar_url,
       l.category_id, c.code AS category_code, c.name AS category_name,
       l.tags, l.title, l.latitude, l.longitude, l.address, l.expire_at,
       ST_Distance(l.geom, ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)::geography) AS distance
FROM listings l
JOIN categories c ON c.id = l.category_id
JOIN users u ON u.id = l.user_id
WHERE l.status = 1
  AND l.expire_at > now()
  AND (:categoryId = 0 OR l.category_id = :categoryId)
  AND (:tag = '' OR l.tags @> to_jsonb(:tag))
  AND ST_DWithin(l.geom,
        ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)::geography,
        :radius)
ORDER BY distance
LIMIT 300;
```

## 14. 私聊（MobileIMSDK）

实时收发走 MobileIMSDK WebSocket 长连接（握手路径 `ws(s)://host:3000/websocket`，登录包 token 用 JWT），REST 只负责拉取类辅助操作，全部需登录。会话维度是「对方 + 技能」：同一个用户对不同的技能是不同的聊天框；`listingId` 为空（NULL）表示无技能的旧会话/普通会话。

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/chat/sessions` | 会话列表：`{list:[{peerId,nickname,avatarUrl,listingId,listingTitle,lastContent,lastTypeu,lastTime,unread,initiatedByMe}]}`，`listingTitle` 为 null 表示无技能会话 |
| GET | `/api/chat/messages?peerId=&cursor=&limit=&listingId=` | 历史分页：`{list:[{id,from,to,content,typeu,fp,status,listingId,isAuto,createTime}],nextCursor,hasMore}`；`listingId` 不传只查无技能的旧会话，副作用把对方在该会话发我的 status=1 置 2 |
| POST | `/api/chat/read` | body `{peerId, listingId?}`，标记该会话已读（status<3 置 3），按 listingId 收窄 |
| GET | `/api/chat/unread` | `{total}` 未读总数（「我的」页角标，跨所有会话） |

**消息信封**：C2C 帧（Protocal）没有扩展字段，技能上下文打进 `dataContent` JSON 信封，客户端与服务端（`ChatService.buildEnvelope/parseEnvelope`）格式一致：

```json
{ "v": 1, "lid": 2001, "c": "你好，想咨询下水电", "a": 0 }
```

- `v` 信封版本（固定 1）；`lid` 技能 id（0 = 无技能）；`c` 纯文本内容；`a` 是否服务端代发（1 = 自动回复）
- 解析失败或裸文本（老客户端消息）按纯文本落库，`listing_id = NULL`
- 服务端校验 `lid`：技能不存在、或收发双方都不是该技能发布人时按 NULL 落库（防伪造）

**技能自动回复**：发布人可为每个技能设置 `autoReply`。当**新会话的首条**咨询消息到达（普通消息、挂了有效技能、收件人是发布人、该「咨询者+技能」会话此前无消息）时，服务端以发布人身份自动回复一次，无论发布人是否在线。自动回复消息 `isAuto=1` 落库，前端气泡带「自动回复」小标；同一咨询者对同一技能 7 天内至多触发一次（Redis 闸防并发）。

消息状态：1=已存储 2=接收方已拉取 3=已读。离线消息不做服务端推送，由客户端上线后拉历史兜底；fp 全局唯一防 QoS 重发重复落库。

**离线微信提醒**：对方不在线时，服务端经微信「订阅消息」（一次性订阅）推送提醒，点击直达聊天页（带技能上下文直达对应会话）。一次性订阅的机制是「用户授权一次 = 可下发一条」：小程序端在「联系TA」「发送」点击时静默请求授权（用户勾选「总是保持以上选择」后不再弹窗、持续攒额度）；服务端发送失败（43101 未订阅/额度用完）静默。模板 id 配置在 `wx.subscribe-template-id`（后端）与小程序 `SUBSCRIBE_TMPL_ID`（前端），两处需一致。

## 15. COS 上传凭证（图片直传）

**API**: `GET /api/cos/credentials`  
需要登录。

发布页图片由小程序**直传腾讯云 COS**（PostObject 表单上传），服务端只签发 30 分钟有效的临时凭证（STS GetFederationToken），权限收窄到本桶 `nearby/image/*` 前缀的 PutObject/PostObject（与红包项目的文件共用桶但前缀隔离）。

```json
{
  "success": true,
  "data": {
    "tmpSecretId": "AKID...",
    "tmpSecretKey": "...",
    "sessionToken": "...",
    "startTime": 1726900000,
    "expiredTime": 1726901800,
    "bucket": "red-packet-1254310674",
    "region": "ap-chengdu",
    "baseUrl": "https://red-packet-1254310674.cos.ap-chengdu.myqcloud.com"
  }
}
```

直传要点（前端实现在 `nearby-pro-wx/utils/cos-upload.js`，签名算法与 cos-wx-sdk-v5 一致）：

- `key = nearby/image/{时间戳}_{随机串}{ext}`，KeyTime 用返回的 `startTime;expiredTime`（不依赖客户端时钟）
- `wx.uploadFile` POST 到 `baseUrl/`，表单字段：`key`、`success_action_status=200`、`Signature`（完整 `q-sign-algorithm=...` Authorization 串）、`x-cos-security-token`、`acl=public-read`、`Content-Type`（按扩展名映射）
- 2xx 即成功，访问地址 = `baseUrl + '/' + key`

**上线提醒**：小程序 mp 后台「开发设置」的 uploadFile 合法域名需加入 `https://red-packet-1254310674.cos.ap-chengdu.myqcloud.com`（downloadFile 建议一并加入）。

## 明确不做（MVP）

- 支付 / 会员年费
- 广告位
- 评价与订单
- 管理后台（违规先靠举报 + 手工改库）

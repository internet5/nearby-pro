# 附近职人 小程序

原生微信小程序。用微信开发者工具打开本目录。

- 接口已全量走后端（`utils/request.js` 统一封装，`utils/api.js` 按业务分组）
- 分类字典：`utils/categories.js`（接口数据 > 本地缓存 > 硬编码兜底）
- 私聊 IM：`utils/im/`（MobileIMSDK WebSocket 长连接；消息信封带技能上下文）
- 图片直传：`utils/cos-upload.js`（COS PostObject 直传，STS 临时凭证由后端签发）

注意：`project.config.json` 的 `es6`/`enhance` 必须保持 `false`（转译 helper 会白屏）。

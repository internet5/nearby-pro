# 附近职人（nearby-pro）开发约定

## 沟通
- 全程使用中文沟通
- 代码注释使用中文
- 变量名和方法名使用英文

## 后端
- 编译命令：`mvn clean compile`
- 每次修改后端代码后必须编译，确认无报错
- MobileIMSDK 为本地 jar（`nearby-pro-server/lib/MobileIMSDKServer.jar`，无中央仓库包）：换机器首次构建前先手动执行
  `mvn install:install-file -Dfile=nearby-pro-server/lib/MobileIMSDKServer.jar -DgroupId=com.mobileimsdk -DartifactId=mobileimsdk-server -Dversion=6.5 -Dpackaging=jar`（pom 里的 install-file 绑定晚于依赖收集，救不了首次构建）

## 产品范围（MVP）
- 自由职业者在地图定点发布技能
- 需求方按分类查看附近发布
- 不做支付、广告、评价；私聊 IM 已接入（MobileIMSDK 嵌入 Spring Boot，见 docs/api.md 第 14 节）

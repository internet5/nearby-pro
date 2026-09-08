# Docker 部署

```
docker/
├── middleware-deploy/   中间件：PostGIS + Redis + Nginx（整个目录拷上服务器即可部署）
│   ├── docker-compose.yml
│   ├── deploy.sh        一键部署：建 /data 目录 + 同步 conf/证书 + 启动
│   ├── nginx/
│   │   ├── conf/default.conf   反代 443 -> 宿主机 8080（deploy.sh 同步到 /data/nginx/conf/）
│   │   └── ssl/                证书 *.crt *.key（gitignore，随目录拷贝上传、不走 git）
│   └── sql/nearby-init.sql     数据库全量初始化脚本（postgis 首次启动自动执行）
└── app-deploy/          应用：Spring Boot jar 包（目录整体挂载运行）
    ├── docker-compose.yml
    └── nearby-pro-server-*.jar   mvn package 后拷入（gitignore，随目录上传）
```

两个 compose 各用默认网络，跨 compose 走宿主机端口（`172.17.0.1` 是 docker0 网桥的
宿主机地址，容器经它访问宿主机上映射的端口），不需要手动建网络。

宿主机目录约定（数据与配置统一在 /data 下）：

| 目录 | 内容 | 怎么来的 |
|------|------|---------|
| `/data/postgis` | 数据库数据 | Docker 自动写入 |
| `/data/redis` | Redis 持久化数据 | Docker 自动写入 |
| `/data/nginx/conf/` | `default.conf` 等配置 | deploy.sh 从仓库 `nginx/conf/` 同步 |
| `/data/nginx/ssl/` | `red-packet.com.cn_bundle.crt` / `.key` | deploy.sh 从仓库 `nginx/ssl/` 拷入，或命令行传参指定证书目录 |
| `/data/nginx/logs/` | Nginx 访问/错误日志 | Docker 自动写入 |

应用不占 /data：`app-deploy/` 目录本身挂载进容器（compose 的 `.` 相对路径），
jar 放在 app-deploy 目录里即可。

## 首次部署

**本机把两个部署目录整个拷上服务器（证书、SQL 脚本、jar 都在里面），服务器上两条命令：**

```bash
# 1. 本机整个目录上传（scp / tar 均可；证书在里面，务必目录拷贝而非 git——私钥不进 git）
scp -r docker/middleware-deploy docker/app-deploy root@服务器IP:/root/

# 2. 服务器上：一键起中间件（自动建 /data 目录、同步 conf、拷证书、启动）
bash /root/middleware-deploy/deploy.sh

# 3. 启动应用（jar 随目录挂载）
cd /root/app-deploy && docker compose up -d
```

等价的手动步骤（不用脚本时）：

```bash
# 1. 准备 /data 目录并放入配置、证书
mkdir -p /data/postgis /data/redis /data/app /data/nginx/conf /data/nginx/ssl /data/nginx/logs
cp <项目>/docker/middleware-deploy/nginx/conf/*.conf /data/nginx/conf/
cp <项目>/docker/middleware-deploy/nginx/ssl/*.crt <项目>/docker/middleware-deploy/nginx/ssl/*.key /data/nginx/ssl/

# 2. 起中间件（postgis 首次启动自动执行 sql/nearby-init.sql：建 PostGIS 扩展、建表、分类与测试数据）
cd <项目>/docker/middleware-deploy
docker compose up -d

# 3. 打包并部署应用（jar 拷进 app-deploy 目录，随目录挂载运行）
cd ../..
mvn clean package -DskipTests
cp nearby-pro-server/target/nearby-pro-server-*.jar docker/app-deploy/
cd docker/app-deploy
docker compose up -d
```

验证（服务器本机）：
`curl --resolve red-packet.com.cn:443:127.0.0.1 https://red-packet.com.cn/api/categories`

## 日常更新

```bash
# 改了 nginx 配置 / 证书 / SQL 脚本：把 middleware-deploy 再传一次，然后一条命令
bash <路径>/middleware-deploy/deploy.sh

# 改了后端代码：重新打包 + 拷进 app-deploy 目录
mvn clean package -DskipTests
cp nearby-pro-server/target/nearby-pro-server-*.jar docker/app-deploy/
#   服务器上传新 jar 后：cd app-deploy && docker compose restart nearby-app

# 本地数据库有新数据要带到服务器：重新导出脚本（本地 postgis 容器在跑时执行）
cd docker/middleware-deploy/sql
{ echo "DROP EXTENSION IF EXISTS postgis;"; \
  echo "DROP SCHEMA IF EXISTS public CASCADE;"; \
  echo "CREATE SCHEMA public;"; \
  echo ""; \
  docker exec postgis pg_dump -U root -d nearby_pro --no-owner; } > nearby-init.sql
#   导出后整目录再传一次；服务器上清空 /data/postgis/* 并 up -d postgis
#   （仅空数据目录会自动执行初始化脚本）
```

## 注意事项

- 数据都在 `/data/postgis`、`/data/redis`，`docker compose down` 不丢数据；
  删目录才会丢，慎动。
- **改了 docker-compose.yml 本身必须 `up -d` 重建**（restart 不重读配置文件），
  这是「改了配置却没生效」的最常见原因。
- Nginx 挂载均为整目录（conf、ssl、logs），不存在「宿主机文件不存在被 Docker
  建成目录」的单文件挂载问题；但目录内容要先放好（conf/ 里没 default.conf 时
  nginx 起来也没有站点）。
- `nearby-init.sql` 头部自带「摘 PostGIS 扩展 + 清空 public schema」，
  空库 / 已有旧数据的库都能整段重复执行、无 DROP 报错。
- 跨容器访问全走宿主机端口（172.17.0.1），因此 5432/6379 对外网是暴露的，
  云服务器安全组务必只对可信 IP 放行这两个端口（80/443 对公网开放）。
- 上线前在 `docker/app-deploy/docker-compose.yml` 调整三项：`WX_MOCK=false`、`WX_SECURITY_CHECK=true`、
  `WX_JWT_SECRET` 换随机长串；小程序 request 合法域名配 `https://red-packet.com.cn`。

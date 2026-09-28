-- 附近职人 MVP 建表脚本
-- 适用：PostgreSQL 14+ / PostGIS
-- 用法：psql -U root -d nearby_pro -f sql/init.sql
-- 或 Docker：docker exec -i postgis psql -U root -d nearby_pro < sql/init.sql

CREATE EXTENSION IF NOT EXISTS postgis;

SET timezone = 'Asia/Shanghai';

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION fill_listing_geo()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.latitude IS NOT NULL AND NEW.longitude IS NOT NULL THEN
        NEW.geohash := ST_GeoHash(
            ST_SetSRID(ST_MakePoint(NEW.longitude, NEW.latitude), 4326),
            8
        );
        NEW.geom := ST_SetSRID(ST_MakePoint(NEW.longitude, NEW.latitude), 4326)::geography;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 用户
CREATE TABLE IF NOT EXISTS users (
    id          BIGSERIAL PRIMARY KEY,
    openid      VARCHAR(64)  NOT NULL,
    unionid     VARCHAR(64),
    nickname    VARCHAR(64)  NOT NULL DEFAULT '',
    avatar_url  VARCHAR(512) NOT NULL DEFAULT '',
    phone       VARCHAR(20)  NOT NULL DEFAULT '',
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uk_users_openid UNIQUE (openid)
);

CREATE TRIGGER trg_users_updated_at
BEFORE UPDATE ON users
FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 分类
-- tags 为可选预设标签数组，与小程序发布页/筛选条共用
-- 形如 [{"name":"水电维修"}, ...]，发布时可选 0~3 个，也可跳过
CREATE TABLE IF NOT EXISTS categories (
    id          SMALLSERIAL PRIMARY KEY,
    code        VARCHAR(32) NOT NULL,
    name        VARCHAR(32) NOT NULL,
    tags        JSONB       NOT NULL DEFAULT '[]'::jsonb,
    sort_order  SMALLINT    NOT NULL DEFAULT 0,
    enabled     BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uk_categories_code UNIQUE (code)
);

CREATE TRIGGER trg_categories_updated_at
BEFORE UPDATE ON categories
FOR EACH ROW EXECUTE FUNCTION update_updated_at();

INSERT INTO categories (id, code, name, tags, sort_order, enabled) VALUES
    (1, 'clean', '家政保洁',
     '[{"name":"日常保洁"},{"name":"深度保洁"},{"name":"油烟机清洗"},{"name":"空调清洗"},{"name":"家电清洗"},{"name":"收纳整理"}]'::jsonb,
     10, TRUE),
    (2, 'repair', '维修安装',
     '[{"name":"水电维修"},{"name":"家电维修"},{"name":"门窗维修"},{"name":"家具安装"},{"name":"管道疏通"},{"name":"开锁换锁"}]'::jsonb,
     20, TRUE),
    (3, 'tutor', '家教',
     '[{"name":"小学课辅"},{"name":"中学课辅"},{"name":"英语辅导"},{"name":"音乐"},{"name":"美术"},{"name":"书法"}]'::jsonb,
     30, TRUE),
    (4, 'photo', '摄影',
     '[{"name":"婚礼跟拍"},{"name":"儿童摄影"},{"name":"证件照"},{"name":"约拍"},{"name":"产品拍摄"}]'::jsonb,
     40, TRUE),
    (5, 'run', '代驾跑腿',
     '[{"name":"代驾"},{"name":"代买"},{"name":"代送"},{"name":"排队代办"},{"name":"同城取件"}]'::jsonb,
     50, TRUE),
    (6, 'other', '其他', '[]'::jsonb, 90, TRUE),
    (7, 'care', '陪护',
     '[{"name":"老人陪护"},{"name":"病人陪护"},{"name":"母婴护理"},{"name":"育儿嫂"},{"name":"钟点照护"}]'::jsonb,
     60, TRUE),
    (8, 'sell', '卖货',
     '[{"name":"水果生鲜"},{"name":"小吃熟食"},{"name":"手工艺品"},{"name":"日用百货"},{"name":"花卉绿植"}]'::jsonb,
     70, TRUE),
    (9, 'move', '搬运搬家',
     '[{"name":"搬家"},{"name":"搬货"},{"name":"家具搬运"},{"name":"设备搬运"},{"name":"家具拆装"}]'::jsonb,
     80, TRUE),
    (10, 'design', 'IT·设计',
     '[{"name":"小程序开发"},{"name":"网站开发"},{"name":"App开发"},{"name":"UI设计"},{"name":"平面设计"},{"name":"Logo设计"},{"name":"文案策划"},{"name":"视频剪辑"}]'::jsonb,
     85, TRUE)
ON CONFLICT (id) DO UPDATE
    SET code = EXCLUDED.code,
        name = EXCLUDED.name,
        tags = EXCLUDED.tags,
        sort_order = EXCLUDED.sort_order,
        enabled = EXCLUDED.enabled;

SELECT setval('categories_id_seq', (SELECT MAX(id) FROM categories));

-- 技能发布
-- tags：预设标签数组，如 ["水电维修","管道疏通"]，可为空
-- items：已废弃的三级字典遗留列，新数据固定写 []
CREATE TABLE IF NOT EXISTS listings (
    id             BIGSERIAL PRIMARY KEY,
    user_id        BIGINT           NOT NULL REFERENCES users (id),
    category_id    SMALLINT         NOT NULL REFERENCES categories (id),
    title          VARCHAR(40)      NOT NULL,
    description    VARCHAR(500)     NOT NULL DEFAULT '',
    photo_urls     JSONB            NOT NULL DEFAULT '[]'::jsonb,
    tags           JSONB            NOT NULL DEFAULT '[]'::jsonb,
    items          JSONB            NOT NULL DEFAULT '[]'::jsonb,
    auto_reply     VARCHAR(200)     NOT NULL DEFAULT '',
    contact_type   VARCHAR(16)      NOT NULL,
    contact_value  VARCHAR(64)      NOT NULL,
    latitude       DOUBLE PRECISION NOT NULL,
    longitude      DOUBLE PRECISION NOT NULL,
    geohash        VARCHAR(12)      NOT NULL DEFAULT '',
    geom           GEOGRAPHY(Point, 4326),
    address        VARCHAR(200)     NOT NULL DEFAULT '',
    city           VARCHAR(40)      NOT NULL DEFAULT '',
    status         SMALLINT         NOT NULL DEFAULT 1,
    expire_at      TIMESTAMPTZ      NOT NULL,
    view_count     INT              NOT NULL DEFAULT 0,
    created_at     TIMESTAMPTZ      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at     TIMESTAMPTZ      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT ck_listings_contact_type CHECK (contact_type IN ('wechat', 'phone')),
    CONSTRAINT ck_listings_status CHECK (status IN (1, 2, 3, 4)),
    CONSTRAINT ck_listings_title CHECK (char_length(btrim(title)) >= 2),
    CONSTRAINT ck_listings_title_max CHECK (char_length(btrim(title)) <= 8)
);

CREATE INDEX IF NOT EXISTS listings_geom_gix ON listings USING GIST (geom);
CREATE INDEX IF NOT EXISTS listings_active_idx ON listings (status, expire_at)
    WHERE status = 1;
CREATE INDEX IF NOT EXISTS listings_user_idx ON listings (user_id, status);
CREATE INDEX IF NOT EXISTS listings_category_idx ON listings (category_id)
    WHERE status = 1;

CREATE TRIGGER trg_listings_updated_at
BEFORE UPDATE ON listings
FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_listings_fill_geo
BEFORE INSERT OR UPDATE OF latitude, longitude ON listings
FOR EACH ROW EXECUTE FUNCTION fill_listing_geo();

-- 举报
CREATE TABLE IF NOT EXISTS reports (
    id           BIGSERIAL PRIMARY KEY,
    listing_id   BIGINT      NOT NULL REFERENCES listings (id),
    reporter_id  BIGINT      NOT NULL REFERENCES users (id),
    reason       VARCHAR(32) NOT NULL,
    detail       VARCHAR(200) NOT NULL DEFAULT '',
    created_at   TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT ck_reports_reason CHECK (reason IN ('fake', 'spam', 'illegal', 'other'))
);

CREATE INDEX IF NOT EXISTS reports_listing_idx ON reports (listing_id, created_at DESC);

-- 意见与建议（用户提交，运营查库人工处理，MVP 不做后台状态管理）
CREATE TABLE IF NOT EXISTS feedbacks (
    id          BIGSERIAL PRIMARY KEY,
    user_id     BIGINT       NOT NULL REFERENCES users (id),
    content     VARCHAR(500) NOT NULL,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE users IS '微信用户，发布方和需求方共用';
COMMENT ON TABLE categories IS '技能分类，预置数据；tags 为可选预设标签数组（发布时可跳过）';
COMMENT ON TABLE listings IS '地图上的技能发布点';
COMMENT ON TABLE reports IS '用户举报';
COMMENT ON TABLE feedbacks IS '意见与建议';
COMMENT ON COLUMN listings.status IS '1上架 2主动下架 3过期 4封禁';
COMMENT ON COLUMN listings.tags IS '预设标签，如 ["水电维修"]，可为空';
COMMENT ON COLUMN listings.items IS '已废弃的三级字典遗留列，新数据固定 []';
COMMENT ON COLUMN listings.auto_reply IS '自动回复内容；有别人首次咨询该技能时由服务端以发布人身份自动发送';
COMMENT ON COLUMN listings.contact_type IS 'wechat 微信号 / phone 手机号';

-- 附近职人 MVP 建表脚本
-- 适用：PostgreSQL 14+ / PostGIS
-- 用法：psql -U postgres -d nearby_pro -f sql/init.sql

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
CREATE TABLE IF NOT EXISTS categories (
    id          SMALLSERIAL PRIMARY KEY,
    code        VARCHAR(32) NOT NULL,
    name        VARCHAR(32) NOT NULL,
    sort_order  SMALLINT    NOT NULL DEFAULT 0,
    enabled     BOOLEAN     NOT NULL DEFAULT TRUE,
    CONSTRAINT uk_categories_code UNIQUE (code)
);

INSERT INTO categories (id, code, name, sort_order, enabled) VALUES
    (1, 'clean',  '家政保洁', 10, TRUE),
    (2, 'repair', '维修安装', 20, TRUE),
    (3, 'tutor',  '家教陪练', 30, TRUE),
    (4, 'photo',  '摄影跟拍', 40, TRUE),
    (5, 'run',    '代驾跑腿', 50, TRUE),
    (6, 'other',  '其他',     90, TRUE)
ON CONFLICT (id) DO NOTHING;

SELECT setval('categories_id_seq', (SELECT MAX(id) FROM categories));

-- 技能发布
CREATE TABLE IF NOT EXISTS listings (
    id             BIGSERIAL PRIMARY KEY,
    user_id        BIGINT           NOT NULL REFERENCES users (id),
    category_id    SMALLINT         NOT NULL REFERENCES categories (id),
    title          VARCHAR(40)      NOT NULL,
    description    VARCHAR(500)     NOT NULL DEFAULT '',
    photo_urls     JSONB            NOT NULL DEFAULT '[]'::jsonb,
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
    CONSTRAINT ck_listings_title CHECK (char_length(btrim(title)) >= 2)
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

COMMENT ON TABLE users IS '微信用户，发布方和需求方共用';
COMMENT ON TABLE categories IS '技能分类，预置数据';
COMMENT ON TABLE listings IS '地图上的技能发布点';
COMMENT ON TABLE reports IS '用户举报';
COMMENT ON COLUMN listings.status IS '1上架 2主动下架 3过期 4封禁';
COMMENT ON COLUMN listings.contact_type IS 'wechat 微信号 / phone 手机号';

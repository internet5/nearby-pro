-- 增量迁移：技能发布支持自动回复，2026-09-21
-- 幂等脚本，可直接对已有库重复执行
-- 执行：docker exec -i postgis psql -U root -d nearby_pro < upgrade-20260921-listings-auto-reply.sql

ALTER TABLE listings
    ADD COLUMN IF NOT EXISTS auto_reply VARCHAR(200) NOT NULL DEFAULT '';

COMMENT ON COLUMN listings.auto_reply IS '自动回复内容；有别人首次咨询该技能时由服务端以发布人身份自动发送';

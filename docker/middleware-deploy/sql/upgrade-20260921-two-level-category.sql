-- 增量迁移：分类两级化（一级分类 + 可选预设标签，去掉「工种->具体项目」三级），2026-09-21
-- 幂等脚本，可直接对已有库重复执行；严禁对线上库执行 nearby-init.sql（会 DROP SCHEMA 清库）
-- 执行：docker exec -i postgis psql -U root -d nearby_pro < upgrade-20260921-two-level-category.sql
--
-- 变更说明：
-- 1. tags 字典形状从 [{"name":"水电维修","items":[...]}] 简化为 [{"name":"水电维修"}]
--    （保留对象形状以兼容小程序端本地缓存 nearby_pro_categories 的解析）
-- 2. 一级分类改为 10 个：家政保洁/维修安装/家教/摄影/代驾跑腿/其他 沿用 id 1-6 改名收窄，
--    新增 7 陪护(care)、8 卖货(sell)、9 搬运搬家(move)、10 IT·设计(design)
-- 3. listings.title 增加最长 8 字约束（NOT VALID 不回查存量行，新写入生效）

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

-- 技能名称最长 8 字（前后端同校验；NOT VALID 只约束新写入，存量行不回查）
ALTER TABLE listings DROP CONSTRAINT IF EXISTS ck_listings_title_max;
ALTER TABLE listings
    ADD CONSTRAINT ck_listings_title_max CHECK (char_length(btrim(title)) <= 8) NOT VALID;

COMMENT ON TABLE categories IS '技能分类，预置数据；tags 为可选预设标签数组（发布时可跳过）';

-- 增量迁移：聊天挂接技能（每个用户对每个技能一个会话）+ 自动回复标记，2026-09-21
-- 幂等脚本，可直接对已有库重复执行
-- 执行：docker exec -i postgis psql -U root -d nearby_pro < upgrade-20260921-chat-listing.sql
--
-- 变更说明：
-- 1. chat_messages.listing_id：消息关联的技能发布，NULL = 未挂技能（存量消息与老客户端均为 NULL，
--    会话聚合时归为「无技能」旧会话）
-- 2. chat_messages.is_auto：1 = 服务端以发布人身份发出的自动回复（防回声、前端展示「自动回复」小标）
-- 3. 会话聚合键从 (to,from) 变为 (to,from,listing_id)，新增配套索引；旧 pair 索引保留观察一段时间后可删

ALTER TABLE public.chat_messages
    ADD COLUMN IF NOT EXISTS listing_id BIGINT NULL REFERENCES public.listings(id);
ALTER TABLE public.chat_messages
    ADD COLUMN IF NOT EXISTS is_auto SMALLINT NOT NULL DEFAULT 0;

ALTER TABLE public.chat_messages DROP CONSTRAINT IF EXISTS ck_chat_messages_is_auto;
ALTER TABLE public.chat_messages
    ADD CONSTRAINT ck_chat_messages_is_auto CHECK (is_auto IN (0, 1));

-- 会话聚合新腿：(from,to,listing) 与反向；DISTINCT ON 取每会话最新一条
CREATE INDEX IF NOT EXISTS chat_messages_pair_listing_idx
    ON public.chat_messages USING btree (from_user_id, to_user_id, listing_id, id DESC);
CREATE INDEX IF NOT EXISTS chat_messages_pair_listing_rev_idx
    ON public.chat_messages USING btree (to_user_id, from_user_id, listing_id, id DESC);

COMMENT ON COLUMN public.chat_messages.listing_id IS '关联的技能发布 id；NULL=未挂技能的旧会话/老客户端消息';
COMMENT ON COLUMN public.chat_messages.is_auto IS '1=服务端自动回复（新会话首条咨询时以发布人身份发送）';

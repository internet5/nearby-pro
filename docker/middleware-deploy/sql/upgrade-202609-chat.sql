-- 增量迁移：私聊消息表（MobileIMSDK C2C 落库），2026-09
-- 幂等脚本，可直接对已有库重复执行；严禁对线上库执行 nearby-init.sql（会 DROP SCHEMA 清库）
-- 执行：docker exec -i postgis psql -U root -d nearby_pro < upgrade-202609-chat.sql

CREATE SEQUENCE IF NOT EXISTS public.chat_messages_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

CREATE TABLE IF NOT EXISTS public.chat_messages (
    id bigint NOT NULL DEFAULT nextval('public.chat_messages_id_seq'::regclass),
    from_user_id bigint NOT NULL,
    to_user_id bigint NOT NULL,
    content character varying(1000) DEFAULT ''::character varying NOT NULL,
    typeu smallint DEFAULT (-1) NOT NULL,
    fp character varying(64) NOT NULL,
    status smallint DEFAULT 1 NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT ck_chat_messages_self CHECK ((from_user_id <> to_user_id)),
    CONSTRAINT ck_chat_messages_status CHECK ((status = ANY (ARRAY[1, 2, 3])))
);

-- 主键与唯一约束（幂等：已存在时忽略报错）
ALTER TABLE public.chat_messages DROP CONSTRAINT IF EXISTS chat_messages_pkey;
ALTER TABLE public.chat_messages ADD CONSTRAINT chat_messages_pkey PRIMARY KEY (id);

ALTER TABLE public.chat_messages DROP CONSTRAINT IF EXISTS uk_chat_messages_fp;
ALTER TABLE public.chat_messages ADD CONSTRAINT uk_chat_messages_fp UNIQUE (fp);

-- 索引：(to,status) 未读数；(from,to,id) + (to,from,id) 会话历史两腿
CREATE INDEX IF NOT EXISTS chat_messages_to_status_idx
    ON public.chat_messages USING btree (to_user_id, status);
CREATE INDEX IF NOT EXISTS chat_messages_pair_idx
    ON public.chat_messages USING btree (from_user_id, to_user_id, id DESC);
CREATE INDEX IF NOT EXISTS chat_messages_pair_rev_idx
    ON public.chat_messages USING btree (to_user_id, from_user_id, id DESC);

COMMENT ON TABLE public.chat_messages IS '私聊消息（MobileIMSDK C2C 落库），消息不可变无 updated_at';
COMMENT ON COLUMN public.chat_messages.typeu IS '消息业务类型（Protocal.typeu 透传）：1=文本，预留扩展';
COMMENT ON COLUMN public.chat_messages.fp IS '消息指纹（Protocal.fp），全局唯一防重发落库';
COMMENT ON COLUMN public.chat_messages.status IS '1=已存储 2=接收方已拉取 3=已读';

ALTER TABLE public.chat_messages DROP CONSTRAINT IF EXISTS chat_messages_from_user_id_fkey;
ALTER TABLE public.chat_messages
    ADD CONSTRAINT chat_messages_from_user_id_fkey FOREIGN KEY (from_user_id) REFERENCES public.users(id);

ALTER TABLE public.chat_messages DROP CONSTRAINT IF EXISTS chat_messages_to_user_id_fkey;
ALTER TABLE public.chat_messages
    ADD CONSTRAINT chat_messages_to_user_id_fkey FOREIGN KEY (to_user_id) REFERENCES public.users(id);

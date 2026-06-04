-- Track which template a message used (for template performance analytics)
-- and any media attachment URL (for media messages in the inbox).
alter table messages add column if not exists content_sid text;
alter table messages add column if not exists media_url text;
create index if not exists idx_messages_content_sid on messages(content_sid);

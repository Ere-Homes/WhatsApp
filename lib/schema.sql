-- ERE WhatsApp CRM — minimal schema (run in the fresh Supabase project)

create table if not exists conversations (
  id             uuid primary key default gen_random_uuid(),
  wa_phone       text not null unique,          -- E.164, no whatsapp: prefix
  name           text,
  status         text not null default 'open',  -- open | closed | blocked
  last_body      text,
  last_at        timestamptz,
  unread         boolean not null default false, -- inbound arrived, not yet opened
  last_direction text,                           -- in | out (of last message)
  last_status    text,                           -- last outbound delivery status
  created_at     timestamptz not null default now()
);

-- If the table already exists, add the inbox-status columns:
-- alter table conversations
--   add column if not exists unread boolean not null default false,
--   add column if not exists last_direction text,
--   add column if not exists last_status text;

create table if not exists messages (
  id            uuid primary key default gen_random_uuid(),
  conversation  uuid not null references conversations(id) on delete cascade,
  direction     text not null,                -- in | out
  body          text,
  status        text,                         -- queued | sent | delivered | read | failed | received
  twilio_sid    text,
  created_at    timestamptz not null default now()
);

create index if not exists idx_messages_conversation on messages(conversation, created_at);
create index if not exists idx_conversations_last_at on conversations(last_at desc);

-- Realtime for the inbox UI
alter publication supabase_realtime add table messages;
alter publication supabase_realtime add table conversations;

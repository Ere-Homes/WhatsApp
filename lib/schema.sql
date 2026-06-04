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
  lead_status    text not null default 'new',    -- new | hot | warm | cold | won | lost
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
  content_sid   text,                         -- template SID used (for template performance)
  media_url     text,                         -- attachment URL (media messages)
  created_at    timestamptz not null default now()
);

create index if not exists idx_messages_conversation on messages(conversation, created_at);
create index if not exists idx_conversations_last_at on conversations(last_at desc);

-- Button / keyword auto-reply rules (managed in /automation)
create table if not exists auto_replies (
  id             uuid primary key default gen_random_uuid(),
  trigger        text not null,                  -- button text / keyword (case-insensitive)
  reply          text,                           -- auto-reply message (optional)
  block          boolean not null default false, -- mark conversation blocked (opt-out)
  push_pipedrive boolean not null default false, -- create a Hot lead in Pipedrive
  enabled        boolean not null default true,
  created_at     timestamptz not null default now()
);

-- Campaigns (bulk sends) — one row per campaign, messages link back via
-- messages.campaign for the per-recipient delivery report.
create table if not exists campaigns (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  template_sid  text,
  template_name text,
  sender        text,
  mode          text not null default 'now',      -- now | later | drip
  total         int  not null default 0,
  sent          int  not null default 0,
  scheduled     int  not null default 0,
  failed        int  not null default 0,
  skipped       int  not null default 0,
  status        text not null default 'sending',  -- sending | scheduled | completed | canceled
  finish_at     timestamptz,
  created_at    timestamptz not null default now()
);
alter table messages add column if not exists campaign uuid references campaigns(id) on delete set null;
create index if not exists idx_messages_campaign on messages(campaign);
create index if not exists idx_campaigns_created_at on campaigns(created_at desc);

-- Realtime for the inbox UI
alter publication supabase_realtime add table messages;
alter publication supabase_realtime add table conversations;
alter publication supabase_realtime add table campaigns;

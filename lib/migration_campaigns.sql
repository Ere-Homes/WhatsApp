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

-- Lead temperature per conversation (separate from open/closed/blocked status).
alter table conversations add column if not exists lead_status text not null default 'new';
create index if not exists idx_conversations_lead_status on conversations(lead_status);

-- Link a conversation to its Pipedrive person/lead/note so we can keep the
-- transcript note current and sync lead status without re-searching each time.
alter table conversations add column if not exists pipedrive_person_id text;
alter table conversations add column if not exists pipedrive_lead_id text;
alter table conversations add column if not exists pipedrive_note_id text;

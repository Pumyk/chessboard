-- Room codes: a short shareable code per open challenge, so friends can join
-- by code OR by link.
alter table challenges add column if not exists code text;
create unique index if not exists challenges_code_uidx on challenges (code);

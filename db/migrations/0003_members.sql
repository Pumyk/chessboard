-- 0003: local member accounts (email + password), replacing the Supabase-only
-- member identity for the self-hosted clone. Members are rows in profiles
-- with a scrypt password hash; auth flows live in /api/auth/*.

alter table profiles drop constraint member_has_auth;

alter table profiles
  add column email text unique,
  add column password_hash text;

-- members must have email; guests never do
alter table profiles
  add constraint member_email_check check (is_guest or email is not null);

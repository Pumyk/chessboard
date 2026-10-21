-- ChessBoard (working name) — replica of Chess.com Play Online
-- Postgres (Supabase). Migration 0001: tables, enums, RLS.
-- All writes to game state go through security-definer RPCs; clients never
-- write games/moves directly. RLS below is the backstop, not the mechanism.

-- gen_random_uuid() is built into Postgres 13+; no extension needed

-- Current user: the app sets app.current_user per connection (guest or
-- auth). Same semantics as the current_user_id() shim, but in public so it also
-- works on hosted Supabase where the auth schema is not writable.
create or replace function current_user_id() returns uuid language sql stable
  as $$ select nullif(current_setting('app.current_user', true), '')::uuid $$;

-- ============ profiles (guest or member) ============
create table profiles (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid references auth.users(id) on delete cascade, -- null for guests (auth schema is Supabase's; tests shim it)
  username text not null unique,
  skill_level smallint check (skill_level between 1 and 4),
  is_guest boolean not null default false,
  abort_count_24h smallint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint member_has_auth check (is_guest or auth_user_id is not null)
);
create index on profiles (auth_user_id);
create index on profiles (username);

-- ============ ratings (one row per user per category) ============
create type rating_category as enum ('bullet','blitz','rapid');

create table ratings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  category rating_category not null,
  glicko integer not null default 1500 check (glicko between 100 and 4000),
  rd integer not null default 350 check (rd between 30 and 350),
  games_played smallint not null default 0,
  provisional boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, category)
);
create index on ratings (category, glicko desc); -- leaderboard later

-- ============ games ============
create type game_status as enum ('active','finished');
create type game_result as enum ('1-0','0-1','1/2-1/2','*');
create type game_end_reason as enum (
  'checkmate','resign','timeout','timeout_insufficient_material',
  'draw_agreement','repetition','stalemate','insufficient_material',
  'fifty_move','aborted'
);
create type game_type as enum ('quick','challenge','bot','pass_and_play');

create table games (
  id uuid primary key default gen_random_uuid(),
  type game_type not null default 'quick',
  white_id uuid not null references profiles(id) on delete cascade,
  black_id uuid not null references profiles(id) on delete cascade,
  time_control_seconds smallint not null check (time_control_seconds between 15 and 10800),
  increment_seconds smallint not null default 0 check (increment_seconds between 0 and 60),
  category rating_category not null,
  rated boolean not null default true,
  status game_status not null default 'active',
  result game_result not null default '*',
  end_reason game_end_reason,
  fen text not null default 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
  pgn text not null default '',
  clock_white_ms integer not null check (clock_white_ms >= 0),
  clock_black_ms integer not null check (clock_black_ms >= 0),
  turn char(1) not null default 'w' check (turn in ('w','b')),
  turn_started_at timestamptz not null default now(),
  draw_offer_by uuid references profiles(id) on delete set null, -- pending offer, null = none
  first_move_at timestamptz,                   -- null until ply 1; auto-abort clocks on this
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint result_set_when_finished check (
    status = 'active'
    or (end_reason is not null and ended_at is not null and (result <> '*' or end_reason = 'aborted'))),
  constraint not_playing_self check (white_id <> black_id)
);
create index on games (status, category, created_at desc);
create index on games (white_id, created_at desc);
create index on games (black_id, created_at desc);

-- ============ moves (source of truth; fen/pgn on games are caches) ============
create table moves (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references games(id) on delete cascade,
  ply smallint not null check (ply >= 1),
  san text not null,
  uci text not null,
  fen_after text not null,
  clock_white_ms integer not null check (clock_white_ms >= 0),
  clock_black_ms integer not null check (clock_black_ms >= 0),
  move_at timestamptz not null default now(),
  -- two clients racing the same ply: the loser dies here, not in the UI
  unique (game_id, ply),
  constraint game_move_order foreign key (game_id) references games(id) on delete cascade
);
create index on moves (game_id, ply);

-- ============ quick-pair search tickets ============
create type ticket_status as enum ('searching','paired','cancelled','expired');

create table search_tickets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  category rating_category not null,
  time_control_seconds smallint not null,
  increment_seconds smallint not null default 0,
  rated boolean not null default true,
  rating_glicko integer not null default 1500,
  rating_window smallint not null default 200,   -- widens over time server-side ("window" is reserved)
  status ticket_status not null default 'searching',
  game_id uuid references games(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index one_searching_ticket
  on search_tickets (user_id) where (status = 'searching');
create index on search_tickets (category, status, rating_glicko);

-- ============ challenges (open/friend challenges) ============
create type challenge_status as enum ('open','accepted','expired','cancelled');

create table challenges (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references profiles(id) on delete cascade,
  category rating_category not null,
  time_control_seconds smallint not null,
  increment_seconds smallint not null default 0,
  rated boolean not null default true,
  color text not null default 'random' check (color in ('white','black','random')),
  rating_range smallint check (rating_range between 0 and 1000),
  status challenge_status not null default 'open',
  game_id uuid references games(id) on delete set null,
  expires_at timestamptz not null default (now() + interval '24 hours'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on challenges (status, category, created_at desc);

-- ============ chat ============
create table chat_messages (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references games(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  body text not null check (length(body) between 1 and 300),
  created_at timestamptz not null default now()
);
create index on chat_messages (game_id, created_at);

-- ============ row level security ============
alter table profiles      enable row level security;
alter table ratings       enable row level security;
alter table games         enable row level security;
alter table moves         enable row level security;
alter table search_tickets enable row level security;
alter table challenges    enable row level security;
alter table chat_messages enable row level security;

create policy "own profile" on profiles for all
  using (id = current_user_id() or auth_user_id = current_user_id());
create policy "ratings readable" on ratings for select using (true); -- ratings are public
create policy "game participants read" on games for select
  using (white_id = (select id from profiles where auth_user_id = current_user_id())
      or black_id = (select id from profiles where auth_user_id = current_user_id()));
create policy "moves readable by game participants" on moves for select
  using (exists (select 1 from games g where g.id = game_id
           and (g.white_id = (select id from profiles where auth_user_id = current_user_id())
            or g.black_id = (select id from profiles where auth_user_id = current_user_id()))));
create policy "own ticket" on search_tickets for all
  using (user_id = (select id from profiles where auth_user_id = current_user_id()));
create policy "open challenges readable" on challenges for select using (true);
create policy "own chat rows" on chat_messages for insert
  with check (user_id = (select id from profiles where auth_user_id = current_user_id()));
create policy "chat readable by game participants" on chat_messages for select
  using (exists (select 1 from games g where g.id = game_id
           and (g.white_id = (select id from profiles where auth_user_id = current_user_id())
            or g.black_id = (select id from profiles where auth_user_id = current_user_id()))));

-- games, moves, ratings are WRITTEN only by security definer RPCs
-- (apply_move, finalize_game, pair_queue) — no client-side insert/update policies.

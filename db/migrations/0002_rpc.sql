-- Migration 0002: authoritative RPCs. Clients never write games/moves directly.
-- pair_queue, finalize_game (Glicko-1), sweeps for the cron jobs.

-- ============ quick pairing ============
-- Pairs the caller's searching ticket with the closest-rating waiting ticket
-- in the same category + time control. FOR UPDATE SKIP LOCKED keeps two
-- concurrent pairings from claiming the same opponent.
create or replace function pair_queue(p_user uuid) returns uuid
language plpgsql security definer as $$
declare
  me search_tickets; other search_tickets; g games; n integer;
begin
  select * into me from search_tickets
    where status = 'searching' and user_id = p_user
    order by created_at limit 1 for update;
  if me.id is null then return null; end if;

  select * into other from search_tickets
    where status = 'searching' and user_id <> p_user
      and category = me.category
      and time_control_seconds = me.time_control_seconds
      and increment_seconds = me.increment_seconds
      and rated = me.rated
      and abs(rating_glicko - me.rating_glicko) <= greatest(me.rating_window, rating_window)
    order by abs(rating_glicko - me.rating_glicko), created_at
    limit 1 for update skip locked;
  if other.id is null then
    -- no match yet: widen the window while searching (50 pts/min, capped)
    update search_tickets
      set rating_window = least(1000, 200 + floor(extract(epoch from (now() - created_at)) / 60) * 50),
          updated_at = now()
      where id = me.id;
    return null;
  end if;

  insert into games (type, white_id, black_id, time_control_seconds, increment_seconds,
                    category, rated, clock_white_ms, clock_black_ms)
  values ('quick',
          other.user_id, me.user_id,   -- earlier searcher gets white
          me.time_control_seconds, me.increment_seconds,
          me.category, me.rated,
          me.time_control_seconds * 1000, me.time_control_seconds * 1000)
  returning * into g;

  update search_tickets set status = 'paired', game_id = g.id, updated_at = now()
    where id in (me.id, other.id);
  return g.id;
end $$;

-- ============ finishing a game: result + Glicko-1 ratings, atomically ============
create or replace function finalize_game(
  p_game uuid, p_result game_result, p_reason game_end_reason
) returns void
language plpgsql security definer as $$
declare
  g games; w ratings; b ratings;
  rw double precision; rb double precision; rdw double precision; rdb double precision;
  gw double precision; gb double precision;
  ew double precision; eb double precision;
  sw double precision; -- 1 win, 0.5 draw, 0 loss for white
  dscorew double precision; v double precision;
  q constant double precision := 0.0057565;  -- ln(10)/400
begin
  select * into g from games where id = p_game for update;
  if g.id is null or g.status <> 'active' then return; end if;

  update games set status = 'finished', result = p_result, end_reason = p_reason,
                   ended_at = now(), updated_at = now()
  where id = p_game;

  if not g.rated then return; end if;

  select * into w from ratings where user_id = g.white_id and category = g.category;
  select * into b from ratings where user_id = g.black_id and category = g.category;
  if w.id is null or b.id is null then return; end if;

  sw := case p_result when '1-0' then 1 when '0-1' then 0 else 0.5 end;

  gw := 1 / sqrt(1 + 3 * q * q * w.rd * w.rd / pi() / pi());
  gb := 1 / sqrt(1 + 3 * q * q * b.rd * b.rd / pi() / pi());
  ew := 1 / (1 + power(10, -gb * (w.glicko - b.glicko) / 400));
  eb := 1 / (1 + power(10, -gw * (b.glicko - w.glicko) / 400));

  v := q * q * gw * gw * ew * (1 - ew);
  dscorew := q * gw * (sw - ew);
  rw := w.glicko + dscorew / (1.0 / (w.rd * w.rd) + v);
  rb := b.glicko + (q * gb * ((1 - sw) - eb)) / (1.0 / (b.rd * b.rd) + q * q * gb * gb * eb * (1 - eb));

  rdw := sqrt(1.0 / (1.0 / (w.rd * w.rd) + v));
  rdb := sqrt(1.0 / (1.0 / (b.rd * b.rd) + q * q * gb * gb * eb * (1 - eb)));

  update ratings set glicko = least(4000, greatest(100, rw::int)),
                     rd = least(350, greatest(30, rdw::int)),
                     games_played = games_played + 1,
                     provisional = (games_played + 1) < 5,
                     updated_at = now()
  where id = w.id;
  update ratings set glicko = least(4000, greatest(100, rb::int)),
                     rd = least(350, greatest(30, rdb::int)),
                     games_played = games_played + 1,
                     provisional = (games_played + 1) < 5,
                     updated_at = now()
  where id = b.id;
end $$;

-- ============ cron sweeps (Vercel Cron calls these) ============
-- Flag games where the side to move ran out of time.
create or replace function sweep_timeouts() returns integer
language plpgsql security definer as $$
declare n integer := 0; g record; loser char(1);
begin
  for g in select * from games where status = 'active' and first_move_at is not null for update skip locked loop
    loser := g.turn;
    if (case when g.turn = 'w'
             then g.clock_white_ms - extract(epoch from (now() - g.turn_started_at)) * 1000
             else g.clock_black_ms - extract(epoch from (now() - g.turn_started_at)) * 1000 end) <= 0 then
      perform finalize_game(g.id, case when loser = 'w' then '0-1' else '1-0' end, 'timeout');
      n := n + 1;
    end if;
  end loop;
  return n;
end $$;

-- Auto-abort games where nobody moved (chess.com's 0:19 abort timer uses a
-- short fuse pre-first-move; we use 2 minutes).
create or replace function sweep_unstarted() returns integer
language plpgsql security definer as $$
declare n integer;
begin
  update games set status = 'finished', result = '*', end_reason = 'aborted',
                   ended_at = now(), updated_at = now()
  where status = 'active' and first_move_at is null and created_at < now() - interval '2 minutes';
  get diagnostics n = row_count;
  return n;
end $$;

create or replace function sweep_tickets() returns integer
language plpgsql security definer as $$
declare n integer;
begin
  update search_tickets set status = 'expired', updated_at = now()
  where status = 'searching' and created_at < now() - interval '5 minutes';
  get diagnostics n = row_count;
  return n;
end $$;

create or replace function sweep_challenges() returns integer
language plpgsql security definer as $$
declare n integer;
begin
  update challenges set status = 'expired', updated_at = now()
  where status = 'open' and expires_at < now();
  get diagnostics n = row_count;
  return n;
end $$;

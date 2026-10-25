-- Quick pairing, take two: with only a handful of players, insisting on the
-- exact same time control strands searchers. After a ticket has searched for
-- 30s, fall back to matching anyone live in the same category; the earlier
-- searcher's time control wins.

create or replace function pair_queue(p_user uuid) returns uuid
language plpgsql security definer as $$
declare
  me search_tickets; other search_tickets; g games; relaxed boolean;
begin
  select * into me from search_tickets
    where status = 'searching' and user_id = p_user
    order by created_at limit 1 for update;
  if me.id is null then return null; end if;

  relaxed := me.created_at < now() - interval '30 seconds';

  -- exact match first: same category + time control, live poller only
  select * into other from search_tickets
    where status = 'searching' and user_id <> p_user
      and category = me.category
      and time_control_seconds = me.time_control_seconds
      and increment_seconds = me.increment_seconds
      and rated = me.rated
      and updated_at > now() - interval '30 seconds'
      and abs(rating_glicko - me.rating_glicko) <= greatest(me.rating_window, rating_window)
    order by abs(rating_glicko - me.rating_glicko), created_at
    limit 1 for update skip locked;

  -- no exact match and we've been waiting a while: anyone live in the category
  if other.id is null and relaxed then
    select * into other from search_tickets
      where status = 'searching' and user_id <> p_user
        and category = me.category
        and updated_at > now() - interval '30 seconds'
      order by abs(rating_glicko - me.rating_glicko), created_at
      limit 1 for update skip locked;
  end if;

  if other.id is null then
    -- no match yet: widen the window while searching (50 pts/min, capped)
    update search_tickets
      set rating_window = least(1000, 200 + floor(extract(epoch from (now() - created_at)) / 60) * 50),
          updated_at = now()
      where id = me.id;
    return null;
  end if;

  -- the earlier ticket (by created_at) gets white AND its own time control:
  -- in a relaxed match "other" may be the newer ticket
  if me.created_at <= other.created_at then
    insert into games (type, white_id, black_id, time_control_seconds, increment_seconds,
                       category, rated, clock_white_ms, clock_black_ms)
    values ('quick', me.user_id, other.user_id,
            me.time_control_seconds, me.increment_seconds, me.category, me.rated,
            me.time_control_seconds * 1000, me.time_control_seconds * 1000)
    returning * into g;
  else
    insert into games (type, white_id, black_id, time_control_seconds, increment_seconds,
                       category, rated, clock_white_ms, clock_black_ms)
    values ('quick', other.user_id, me.user_id,
            other.time_control_seconds, other.increment_seconds, other.category, other.rated,
            other.time_control_seconds * 1000, other.time_control_seconds * 1000)
    returning * into g;
  end if;

  update search_tickets set status = 'paired', game_id = g.id, updated_at = now()
    where id in (me.id, other.id);
  return g.id;
end $$;

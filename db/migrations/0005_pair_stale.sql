-- Quick pairing: a searching ticket whose poller is gone (closed tab,
-- dropped connection) must never be matched against. Pollers touch their
-- ticket at least every ~3s, so anything not updated for 30s is a ghost.

-- one-time sweep of ghosts already stuck in the queue
update search_tickets
  set status = 'cancelled', updated_at = now()
  where status = 'searching'
    and updated_at < now() - interval '30 seconds';

create or replace function pair_queue(p_user uuid) returns uuid
language plpgsql security definer as $$
declare
  me search_tickets; other search_tickets; g games; n integer;
begin
  select * into me from search_tickets
    where status = 'searching' and user_id = p_user
    order by created_at limit 1 for update;
  if me.id is null then return null; end if;

  -- only match against tickets with a LIVE poller
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
  if other.id is null then
    -- no match yet: widen the window while searching (50 pts/min, capped)
    update search_tickets
      set rating_window = least(1000, 200 + floor(extract(epoch from (now() - created_at)) / 60) * 50),
          updated_at = now()
      where id = me.id;
    return null;
  end if;

  insert into games
    (type, white_id, black_id, time_control_seconds, increment_seconds,
     category, rated, clock_white_ms, clock_black_ms)
  values
    ('quick', other.user_id, me.user_id,   -- earlier searcher gets white
     me.time_control_seconds, me.increment_seconds,
     me.category, me.rated, me.time_control_seconds * 1000, me.time_control_seconds * 1000)
  returning * into g;

  update search_tickets set status = 'paired', game_id = g.id, updated_at = now()
    where id in (me.id, other.id);
  return g.id;
end $$;

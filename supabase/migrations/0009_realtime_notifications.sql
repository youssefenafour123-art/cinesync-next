-- Notifications, delivered when they happen.
--
-- The bell has been correct and slow. A follow is written by a trigger on
-- somebody else's action — `notify_on_follow` in 0006 — so nothing in the
-- recipient's browser knows it happened, and the client has been closing that
-- gap by re-reading the table every 45 seconds and on every window focus.
--
-- That is fine for a number on an icon and wrong for a card that announces
-- itself. Reported as notifications only appearing once the bell is pressed:
-- pressing it forces a read, so the poll was being beaten to it by the person
-- waiting for it. Forty-five seconds is not "somebody just followed you", it
-- is "somebody followed you at some point in the last minute".
--
-- Postgres already publishes these writes; Supabase's realtime server just is
-- not listening to this table. Adding it to the publication is the whole
-- change, and it is one line of DDL against a mechanism that is already
-- running for the tables that were opted in when the project was created.
--
-- Why this is safe to do to a table with no public read at all: realtime
-- applies the same row-level security as a query does. `notifications` has a
-- single select policy, `auth.uid() = user_id`, so a subscriber is sent the
-- rows they could have selected and no others. Somebody subscribing to the
-- whole table receives only their own notifications, which is exactly what the
-- policy has always said.

do $$
begin
  -- Idempotent, because these are run by hand and a second pass should be a
  -- no-op rather than an error. `alter publication ... add table` has no
  -- `if not exists` form, so the check is written out.
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
end
$$;

-- Deliberately *not* `replica identity full`.
--
-- That setting exists so UPDATE and DELETE events can carry the row as it was
-- before the change, and it makes every such write log the entire old row to
-- the WAL. The client only subscribes to INSERT, and an INSERT always carries
-- the whole new row regardless — the default identity, the primary key, is
-- everything this needs. Marking it full would buy nothing and cost write
-- volume on the one table that grows fastest.

-- ---------------------------------------------------------------- verify
--
-- Should return one row after this runs:
--
--   select schemaname, tablename
--   from pg_publication_tables
--   where pubname = 'supabase_realtime' and tablename = 'notifications';

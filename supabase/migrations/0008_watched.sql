-- What you have actually seen.
--
-- The watchlist answers "what do I mean to watch". Nothing answered "what have
-- I watched" — the only record of that was whatever a connected Stremio
-- account happened to report, which is not a record the user owns and is empty
-- for anyone who never connected one.
--
-- Modelled as a second flag on `lists` rather than a table of its own, because
-- it is the same shape as the watchlist in every respect that matters: one row
-- per account, created with the account, holding `list_items`, readable under
-- the same visibility rule. A new table would have meant a second set of
-- policies saying what 0002 and 0003 already say, and a second code path in
-- front of it. The flag means the watched list is a list, so everything that
-- already works for lists works for it.
--
-- Why not a `kind` column replacing `is_watchlist`: that would rewrite the
-- policies, the indexes and every existing query for a schema no cleaner than
-- this one. Two booleans with a check that they are never both true says the
-- same thing and leaves the working parts alone.

alter table public.lists
  add column if not exists is_watched boolean not null default false;

-- A list is one of the two, or neither. Never both.
alter table public.lists
  drop constraint if exists lists_system_kind_exclusive;
alter table public.lists
  add constraint lists_system_kind_exclusive
  check (not (is_watchlist and is_watched));

-- Exactly one watched list per person, the same way 0002 guarantees exactly
-- one watchlist: a partial unique index, so the database refuses a second
-- rather than every caller having to remember not to make one.
create unique index if not exists lists_one_watched_per_user
  on public.lists (user_id) where is_watched;

/*
   Both lists are created with the account, in the same transaction as the
   profile — `create or replace` again rather than a third trigger, exactly as
   0002 and 0003 did.

   Followers-only, matching the watchlist. What someone has watched is the
   more revealing of the two lists, so it starts no more visible than the one
   that already existed, and the visibility menu can widen it per list.
*/
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, username)
  values (new.id, lower(new.raw_user_meta_data ->> 'username'));

  insert into public.lists (user_id, name, is_watchlist, visibility)
  values (new.id, 'Watchlist', true, 'followers');

  insert into public.lists (user_id, name, is_watched, visibility)
  values (new.id, 'Watched', true, 'followers');

  return new;
end;
$$;

-- Everyone who signed up before this migration needs one too — the same
-- reasoning as the watchlist backfill in 0002: a feature that only works for
-- accounts created after the deploy is broken for the people already here.
insert into public.lists (user_id, name, is_watched, visibility)
select p.id, 'Watched', true, 'followers'
from public.profiles p
where not exists (
  select 1 from public.lists l where l.user_id = p.id and l.is_watched
);

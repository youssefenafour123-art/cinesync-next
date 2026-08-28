-- The connected Stremio library, as something other people can be shown.
--
-- Up to now it existed only in the browser that owned it. `useLibrarySync`
-- reads api.strem.io with an authKey held in that browser's localStorage and
-- puts the result in a zustand store; nothing about it was ever written down.
-- That is fine for badges and for the Library tab, and it makes "visible to
-- followers" impossible by construction: a follower's browser has no authKey
-- for somebody else's Stremio account and never should have one. Somebody
-- else can only see this library if this account has written it somewhere
-- they are allowed to read.
--
-- So it becomes a third system list, exactly the way the watched list became
-- the second in 0008: a flag on `lists`, one row per account, created by the
-- same trigger, holding `list_items`, read under the same `can_view` rule. A
-- table of its own would have meant a third set of policies restating what
-- 0002 and 0003 already say, and a third code path in front of them.
--
-- It is a *mirror*, and the one place that matters is deletion. The watched
-- sync in `useWatchedSync` deliberately never re-adds a title the user removed
-- by hand, because Stremio's watch state and the Watched list are two records
-- that are allowed to disagree. This list is not a record of its own — it is a
-- picture of what the connected accounts hold right now — so a title removed
-- in Stremio has to leave here too, and the client writes both directions of
-- the diff.

alter table public.lists
  add column if not exists is_stremio boolean not null default false;

-- A list is one of the three, or none of them. Never two.
--
-- Replaces the two-way version from 0008 rather than adding a second
-- constraint beside it: two overlapping checks on the same three columns is
-- two places to read before you know what is allowed.
alter table public.lists
  drop constraint if exists lists_system_kind_exclusive;
alter table public.lists
  add constraint lists_system_kind_exclusive
  check (
    (is_watchlist::int + is_watched::int + is_stremio::int) <= 1
  );

-- Exactly one per person, the same partial unique index 0002 and 0008 use, so
-- the database refuses a second rather than every caller remembering not to
-- make one.
create unique index if not exists lists_one_stremio_per_user
  on public.lists (user_id) where is_stremio;

/*
   Created with the account, in the same transaction as the profile and the
   other two — `create or replace` again rather than a fourth trigger.

   Followers-only, matching the other two. What someone keeps in their Stremio
   library is the same order of private as what they have watched, and the
   visibility menu on the shelf widens it per list.
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

  insert into public.lists (user_id, name, is_stremio, visibility)
  values (new.id, 'Stremio Library', true, 'followers');

  return new;
end;
$$;

-- Everyone who signed up before this migration needs one too — the same
-- reasoning as the backfills in 0002 and 0008. It starts empty for everybody,
-- including accounts with no Stremio account connected; the client fills it on
-- the next library read and leaves it alone otherwise.
insert into public.lists (user_id, name, is_stremio, visibility)
select p.id, 'Stremio Library', true, 'followers'
from public.profiles p
where not exists (
  select 1 from public.lists l where l.user_id = p.id and l.is_stremio
);

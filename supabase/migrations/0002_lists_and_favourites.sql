-- Accounts, phase 2: the things a person actually keeps.
--
-- Three tables: a top five per catalogue, named lists, and the titles in them.
-- The watchlist is not a fourth table — it is a `lists` row with
-- `is_watchlist` set, created by the same trigger that creates the profile, so
-- adding to it and adding to any other list is one code path rather than two
-- that drift.
--
-- Every title is stored denormalised: imdb_id, tmdb_id, title, poster. A list
-- has to render without calling TMDB, and a saved title has to keep the name
-- it had when it was saved.

-- ---------------------------------------------------------------- favourites

create table public.favorites (
  user_id  uuid     not null references auth.users on delete cascade,
  kind     text     not null check (kind in ('movie', 'series')),
  -- One through five. The rank *is* the identity: saving to slot 3 replaces
  -- whatever was in slot 3, which is what a "top five" means and what makes
  -- the primary key below do the work instead of the application.
  rank     smallint not null check (rank between 1 and 5),
  imdb_id  text     not null,
  tmdb_id  integer,
  title    text     not null,
  poster   text,
  primary key (user_id, kind, rank)
);

-- The same film twice in one top five is a mistake, not a preference.
create unique index favorites_no_duplicate_title
  on public.favorites (user_id, kind, imdb_id);

alter table public.favorites enable row level security;

-- Readable by everyone: a top five is the most public thing on a profile, and
-- profiles are searchable by design.
create policy "favourites are readable by everyone"
  on public.favorites for select using (true);

create policy "a user writes only their own favourites"
  on public.favorites for all
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- --------------------------------------------------------------------- lists

create table public.lists (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users on delete cascade,
  name         text not null,
  description  text,
  is_public    boolean not null default true,
  is_watchlist boolean not null default false,
  created_at   timestamptz not null default now(),

  constraint lists_name_length check (char_length(name) between 1 and 60),
  constraint lists_description_length check (description is null or char_length(description) <= 300)
);

-- Exactly one watchlist per person. A partial unique index rather than a
-- check, so ordinary lists are unconstrained and the database is what stops a
-- second watchlist appearing rather than every caller remembering not to.
create unique index lists_one_watchlist_per_user
  on public.lists (user_id) where is_watchlist;

create index lists_by_user on public.lists (user_id);

alter table public.lists enable row level security;

create policy "public lists, and your own private ones, are readable"
  on public.lists for select
  using (is_public or (select auth.uid()) = user_id);

create policy "a user writes only their own lists"
  on public.lists for all
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------- list items

create table public.list_items (
  list_id    uuid not null references public.lists on delete cascade,
  imdb_id    text not null,
  tmdb_id    integer,
  kind       text not null check (kind in ('movie', 'series')),
  title      text not null,
  poster     text,
  -- Not `position`: that is a keyword in the SQL standard, and a column name
  -- that needs quoting somewhere is a column name that will be forgotten
  -- somewhere.
  sort_order integer not null default 0,
  added_at   timestamptz not null default now(),

  -- The same title twice in one list is a mistake, and this makes "add"
  -- idempotent: a second add updates the row it already has.
  primary key (list_id, imdb_id)
);

alter table public.list_items enable row level security;

/*
   Items inherit their list's visibility.

   Written as a subquery against `lists` rather than duplicating `is_public`
   onto every item: two copies of the same fact drift, and the copy on the item
   is the one nobody remembers to update when a list is made private. The
   index on `lists (id)` is the primary key, so this is a point lookup.
*/
create policy "list items follow the visibility of their list"
  on public.list_items for select
  using (
    exists (
      select 1 from public.lists l
      where l.id = list_items.list_id
        and (l.is_public or (select auth.uid()) = l.user_id)
    )
  );

create policy "a user writes only into their own lists"
  on public.list_items for all
  using (
    exists (
      select 1 from public.lists l
      where l.id = list_items.list_id and (select auth.uid()) = l.user_id
    )
  )
  with check (
    exists (
      select 1 from public.lists l
      where l.id = list_items.list_id and (select auth.uid()) = l.user_id
    )
  );

-- ------------------------------------------------------- watchlist on signup

/*
   Replaces the phase-1 function rather than adding a second trigger, so the
   profile and the watchlist are created in one transaction with the account.
   `create or replace` keeps the existing trigger pointing at it.
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

  insert into public.lists (user_id, name, is_watchlist, is_public)
  values (new.id, 'Watchlist', true, true);

  return new;
end;
$$;

-- Everyone who signed up before this migration needs one too — same reasoning
-- as the profiles backfill: a feature that only works for accounts created
-- after the deploy is a feature that is broken for the people already here.
insert into public.lists (user_id, name, is_watchlist, is_public)
select p.id, 'Watchlist', true, true
from public.profiles p
where not exists (
  select 1 from public.lists l where l.user_id = p.id and l.is_watchlist
);

-- Following people, and being told about it.
--
-- Two things the app could not do: find someone to follow, and notice that
-- anything happened. `follows` has existed since 0003 because the visibility
-- policies need it, and nothing has ever written to it.
--
-- This adds the other half of "following": people who are not users — actors,
-- directors, writers — and a notifications table that both kinds feed.

-- ----------------------------------------------------------- people you follow

/*
   A followed person is a TMDB id, not a row in `auth.users`.

   Name and picture are denormalised on purpose. A followers list has to render
   without one TMDB request per row, and the name someone was followed under is
   the name to show even if TMDB later renames them.
*/
create table if not exists public.person_follows (
  user_id         uuid not null default auth.uid() references auth.users on delete cascade,
  person_tmdb_id  integer not null,
  name            text not null,
  profile         text,
  department      text,

  /*
     What that person already had announced when they were followed.

     Without this, following Christopher Nolan would immediately produce a
     notification for every one of the two dozen projects TMDB already lists
     for him — none of which is news. Only credits that appear *after* this
     baseline are new, which is what "a new project dropped" means.
  */
  baseline_tmdb_ids integer[] not null default '{}',

  created_at      timestamptz not null default now(),

  primary key (user_id, person_tmdb_id)
);

alter table public.person_follows enable row level security;

/*
   Readable by everyone, like `follows`. Who someone follows is part of a
   profile people are meant to be able to look at, and the alternative — a
   private list — would make "12 people followed" a number nobody can check.
*/
drop policy if exists "person follows are readable by everyone" on public.person_follows;
create policy "person follows are readable by everyone"
  on public.person_follows for select using (true);

drop policy if exists "a user follows people as themselves" on public.person_follows;
create policy "a user follows people as themselves"
  on public.person_follows for all
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- ------------------------------------------------------------- notifications

create table if not exists public.notifications (
  id          uuid primary key default gen_random_uuid(),
  -- Who is being told.
  user_id     uuid not null references auth.users on delete cascade,
  kind        text not null check (kind in ('follow', 'release')),

  -- 'follow': who did it. Denormalised username, because `notifications`
  -- references `auth.users` and PostgREST therefore has no relationship to
  -- `profiles` to traverse — reading the name would otherwise be a second
  -- query per notification.
  actor_id        uuid references auth.users on delete cascade,
  actor_username  text,

  -- 'release': whose project, and which one.
  person_tmdb_id  integer,
  person_name     text,
  title           text,
  title_tmdb_id   integer,
  title_kind      text check (title_kind in ('movie', 'series')),
  poster          text,
  release_date    text,

  created_at  timestamptz not null default now(),
  read_at     timestamptz
);

-- "my unread ones, newest first", which is the only question the bell asks.
create index if not exists notifications_for_reader
  on public.notifications (user_id, created_at desc);

/*
   One notification per person per title. The release check runs on every load
   and would otherwise re-announce the same film every time, and the client
   inserts with `on conflict do nothing` so a second tab racing the first is
   simply a no-op rather than a duplicate.

   Not a partial index, though only release rows ever fill these columns.
   `ON CONFLICT (user_id, person_tmdb_id, title_tmdb_id)` — which is what
   PostgREST sends for the upsert — infers its target from the index, and
   inference cannot match a partial index unless the statement repeats its
   predicate, which PostgREST has no way to express. A `where kind = 'release'`
   here therefore fails at runtime with "no unique or exclusion constraint
   matching the ON CONFLICT specification".

   Covering every row costs nothing: a follow notification leaves both id
   columns null, and Postgres treats nulls as distinct in a unique index, so
   any number of them coexist.
*/
create unique index if not exists notifications_one_per_release
  on public.notifications (user_id, person_tmdb_id, title_tmdb_id);

alter table public.notifications enable row level security;

-- Yours and nobody else's. Unlike every other table here, there is no public
-- read: a notification is addressed to one person by definition.
drop policy if exists "notifications are readable by their recipient" on public.notifications;
create policy "notifications are readable by their recipient"
  on public.notifications for select
  using ((select auth.uid()) = user_id);

/*
   You may write notifications addressed to yourself, and only of the kind the
   client is responsible for discovering.

   Release alerts have to be inserted by the client, because there is no
   background job on this project to notice that TMDB announced something. That
   is safe precisely because the policy pins `user_id` to the caller: the worst
   anyone can do is spam themselves.

   Follow notifications are deliberately excluded — they are addressed to
   someone else, so allowing a client to write them would let anyone put
   anything in anyone's bell. The trigger below writes those instead.
*/
drop policy if exists "a user records release alerts for themselves" on public.notifications;
create policy "a user records release alerts for themselves"
  on public.notifications for insert
  with check ((select auth.uid()) = user_id and kind = 'release');

-- Marking as read, and clearing. Both are yours alone.
drop policy if exists "a user updates their own notifications" on public.notifications;
create policy "a user updates their own notifications"
  on public.notifications for update
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "a user deletes their own notifications" on public.notifications;
create policy "a user deletes their own notifications"
  on public.notifications for delete
  using ((select auth.uid()) = user_id);

/*
   A new follower becomes a notification, written by the database.

   `security definer` so it can insert a row addressed to the person being
   followed — which no client is allowed to do, and that is the whole point. It
   means a follow notification can only ever exist because a follow actually
   happened, rather than because someone asked for one.

   `search_path = ''` for the usual reason: a definer function that resolves
   unqualified names through the caller's search path is a definer function the
   caller can redirect.
*/
create or replace function public.notify_on_follow()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.notifications (user_id, kind, actor_id, actor_username)
  values (
    new.followee_id,
    'follow',
    new.follower_id,
    (select username from public.profiles where id = new.follower_id)
  );
  return new;
end;
$$;

drop trigger if exists on_follow_notify on public.follows;
create trigger on_follow_notify
  after insert on public.follows
  for each row execute function public.notify_on_follow();

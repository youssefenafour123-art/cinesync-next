-- Lists become followers-only by default, which needs a follow graph to mean
-- anything — so `follows` arrives here rather than in phase 3.
--
-- The boolean goes too. `is_public` could say "everyone" or "only me"; it had
-- no way to say "the people who follow me", and adding a second boolean
-- beside it would make two flags with four combinations for three states, one
-- of which is nonsense.

-- -------------------------------------------------------------- follow graph

create table public.follows (
  follower_id uuid not null references auth.users on delete cascade,
  followee_id uuid not null references auth.users on delete cascade,
  created_at  timestamptz not null default now(),

  primary key (follower_id, followee_id),
  constraint follows_not_self check (follower_id <> followee_id)
);

-- "who follows this person", which the visibility policies below ask on every
-- read. The primary key already covers the other direction.
create index follows_by_followee on public.follows (followee_id);

alter table public.follows enable row level security;

/*
   The graph is readable by everyone, and it has to be: the list policies below
   run their subquery as the person asking, so a reader who could not see the
   edge proving they follow someone would be refused that someone's lists —
   the rule would silently never grant anything.

   It is also the ordinary expectation. Who follows whom is public on every
   comparable service, and a follower list nobody can see is not a feature
   people would recognise.
*/
create policy "the follow graph is readable by everyone"
  on public.follows for select using (true);

-- You may create and destroy only your own following, never a follower of
-- someone else — otherwise anyone could add themselves to another person's
-- followers and read their followers-only lists.
create policy "a user follows and unfollows as themselves"
  on public.follows for all
  using ((select auth.uid()) = follower_id)
  with check ((select auth.uid()) = follower_id);

-- ---------------------------------------------------------------- visibility

alter table public.lists
  add column visibility text not null default 'followers'
    check (visibility in ('private', 'followers', 'public'));

-- Everything that exists now was created under the old default of public, and
-- silently narrowing what someone already published would be as wrong as
-- silently widening it. Watchlists are the exception: they were made public by
-- a default nobody chose, which is the thing being corrected.
update public.lists set visibility = case
  when is_watchlist then 'followers'
  when is_public    then 'public'
  else 'private'
end;

alter table public.lists drop column is_public;

/*
   Whether the reader may see something this person marked "followers".

   A function so the rule is written once and both tables call it — and
   `security definer` so it is evaluated with the definer's rights rather than
   the reader's, which keeps it honest even if the `follows` policy above is
   ever narrowed.
*/
create or replace function public.can_view(owner uuid, level text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    level = 'public'
    or (select auth.uid()) = owner
    or (
      level = 'followers'
      and exists (
        select 1 from public.follows f
        where f.followee_id = owner
          and f.follower_id = (select auth.uid())
      )
    );
$$;

drop policy if exists "public lists, and your own private ones, are readable" on public.lists;

create policy "lists are readable by whoever their visibility allows"
  on public.lists for select
  using (public.can_view(user_id, visibility));

drop policy if exists "list items follow the visibility of their list" on public.list_items;

create policy "list items follow the visibility of their list"
  on public.list_items for select
  using (
    exists (
      select 1 from public.lists l
      where l.id = list_items.list_id
        and public.can_view(l.user_id, l.visibility)
    )
  );

/*
   New accounts get a followers-only watchlist. Replacing the function again
   rather than altering the column default, because the default is what an
   explicit insert bypasses and this insert is explicit.
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

  return new;
end;
$$;

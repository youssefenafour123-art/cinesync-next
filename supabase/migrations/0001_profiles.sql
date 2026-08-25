-- Accounts, phase 1: one profile per user, and the username people search by.
--
-- Row-level security is declared here, in the same migration that creates the
-- table, rather than added later. A table that exists for even one deploy
-- without a policy is a table that was readable by anyone holding the
-- publishable key, which is by design a public value.

create extension if not exists citext;

create table public.profiles (
  id            uuid primary key references auth.users on delete cascade,
  -- citext so `Youssef` and `youssef` cannot both be taken. The unique index
  -- is what actually enforces it; the app's own check is only for a good error.
  username      citext not null unique,
  display_name  text,
  bio           text,
  avatar_url    text,
  -- Watch history is visible to followers from signup. That is the chosen
  -- default and the signup form says so out loud; this is the switch that
  -- turns it off, and the policy on `watched` (phase 3) reads it.
  share_watched boolean not null default true,
  created_at    timestamptz not null default now(),

  -- Mirrors USERNAME_RE in apps/web/lib/auth.ts. Duplicated on purpose: the
  -- client check exists to give a helpful message, this one exists because a
  -- client check is not a constraint.
  constraint profiles_username_format check (username ~ '^[a-z0-9_]{3,20}$')
);

alter table public.profiles enable row level security;

-- Public on purpose: finding someone by username is the point of having one.
-- Only the columns above are exposed, and none of them is private.
create policy "profiles are readable by everyone"
  on public.profiles for select
  using (true);

create policy "a user updates only their own profile"
  on public.profiles for update
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- Deliberately no INSERT policy. Rows are created by the trigger below, which
-- runs as the definer inside the same transaction as the auth user — so an
-- account without a profile, which is an account nobody can find or follow,
-- cannot exist. A client-side insert could fail on its own and leave exactly
-- that.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
-- Empty search_path so a schema planted on the session cannot shadow the
-- objects this function names; every reference below is fully qualified.
set search_path = ''
as $$
begin
  insert into public.profiles (id, username)
  values (new.id, lower(new.raw_user_meta_data ->> 'username'));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Backfill.
--
-- Accounts can already exist: signing up before this migration ran created an
-- `auth.users` row and, with no trigger yet, no profile — which is the very
-- state the trigger exists to prevent. Running this migration must repair
-- those rather than leave them permanently unfindable.
--
-- The username comes from the metadata the signup form sent. Where that is
-- missing, a stable one is derived from the user id so the row is valid and
-- the person can rename later.
insert into public.profiles (id, username)
select
  u.id,
  coalesce(
    nullif(lower(u.raw_user_meta_data ->> 'username'), ''),
    'user_' || left(replace(u.id::text, '-', ''), 8)
  )
from auth.users u
where not exists (select 1 from public.profiles p where p.id = u.id)
-- A pre-existing account whose chosen username collides with another's is left
-- without a profile deliberately: inventing a different handle for someone
-- silently is worse than a row an admin can see is missing.
on conflict (username) do nothing;

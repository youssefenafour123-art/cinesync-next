-- Somewhere to put a profile picture.
--
-- `profiles.avatar_url` has existed since 0001 and nothing could ever write it,
-- because there was nowhere to put the file. This is that place.
--
-- A bucket rather than a column: an image in a `bytea` would travel through
-- PostgREST on every profile read, and the profile read is the one query that
-- happens whenever anybody looks at anybody.

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

/*
   Public to read, and that is a deliberate choice rather than an oversight.

   A profile is findable by username on purpose — that is what usernames are
   for here — so the picture on it is as public as the top five beside it. A
   signed URL would buy nothing except an expiry to get wrong, and it would
   have to be minted on every render of every avatar in a follower list.

   The file name is unguessable-ish but not secret. Nothing private goes in
   this bucket.
*/
drop policy if exists "avatars are readable by everyone" on storage.objects;
create policy "avatars are readable by everyone"
  on storage.objects for select
  using (bucket_id = 'avatars');

/*
   Write access is scoped by path: the first folder segment must be your own
   user id, so `avatars/<uid>/avatar.webp` is writable only by <uid>.

   This is the same shape as every other policy in this schema — the owner
   column, here encoded in the path, is compared against `auth.uid()` — and it
   is why the client is not allowed to choose an arbitrary file name. Without
   it, any signed-in account could overwrite anyone's picture.

   `storage.foldername(name)` splits the object path; `[1]` is the first
   segment, because Postgres arrays start at one.
*/
drop policy if exists "a user writes only their own avatar" on storage.objects;
create policy "a user writes only their own avatar"
  on storage.objects for insert
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- Replacing a picture is an update to the same path, since the client always
-- writes `avatar.webp`. Without this, the second upload fails and the first
-- picture is permanent.
drop policy if exists "a user replaces only their own avatar" on storage.objects;
create policy "a user replaces only their own avatar"
  on storage.objects for update
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "a user deletes only their own avatar" on storage.objects;
create policy "a user deletes only their own avatar"
  on storage.objects for delete
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

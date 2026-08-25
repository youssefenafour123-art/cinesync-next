-- Two things the schema left open, and a set of length caps.
--
-- Nothing here fixes an exploit that has happened. It closes the gaps that
-- come from trusting a client with a column, which is the same reasoning as
-- the `auth.uid()` defaults in 0004: the policy should be the last line of
-- defence, not the only one.

-- ------------------------------------------------------- the avatars bucket

/*
   Restrict what may be stored, not just who may store it.

   The write policy in 0005 checks that the path starts with your own user id,
   and stops there — so a signed-in account could put *anything* in its own
   folder, including an HTML file with `content-type: text/html`. The bucket is
   public, so Supabase would then serve that document, from a supabase.co
   origin, to anyone given the link. Our client only ever uploads a 256px WebP;
   nothing but our client was ever stopped from doing otherwise.

   Storage enforces both of these itself, before an object is written, which is
   why they belong on the bucket rather than in `lib/avatar.ts` where they can
   only ever be a suggestion.
*/
update storage.buckets
set
  -- Comfortably above the ~20KB the client produces, and far below anything
  -- worth hosting.
  file_size_limit = 2 * 1024 * 1024,
  allowed_mime_types = array['image/webp', 'image/jpeg', 'image/png']
where id = 'avatars';

-- --------------------------------------------------------------- text sizes

/*
   Caps on everything a client writes and someone else reads.

   `lists.name` and `lists.description` were given these in 0002 and the tables
   added since were not, which is an inconsistency rather than a decision.
   Profiles and top fives are readable by everyone, so a title or a bio is a
   payload one account can put in front of every other one — nothing is
   executed, because React escapes text, but a megabyte of it is still served
   to every visitor of that profile.

   The numbers are generous: the longest real film title is comfortably under
   200 characters, and a profile bio that will not fit in 500 is not a bio.
*/
alter table public.profiles
  drop constraint if exists profiles_display_name_length,
  add constraint profiles_display_name_length
    check (display_name is null or char_length(display_name) <= 60);

alter table public.profiles
  drop constraint if exists profiles_bio_length,
  add constraint profiles_bio_length
    check (bio is null or char_length(bio) <= 500);

alter table public.favorites
  drop constraint if exists favorites_title_length,
  add constraint favorites_title_length
    check (char_length(title) between 1 and 300);

alter table public.list_items
  drop constraint if exists list_items_title_length,
  add constraint list_items_title_length
    check (char_length(title) between 1 and 300);

alter table public.person_follows
  drop constraint if exists person_follows_name_length,
  add constraint person_follows_name_length
    check (char_length(name) between 1 and 200);

/*
   A followed person's picture is a URL the client supplies and an `<img src>`
   renders. `javascript:` is inert in that position, so this is not an XSS
   fix — it is that an arbitrary URL there is an arbitrary outbound request
   from every viewer's browser, which is a tracking pixel with extra steps.
   TMDB images are the only thing that legitimately goes here.
*/
alter table public.person_follows
  drop constraint if exists person_follows_profile_url,
  add constraint person_follows_profile_url
    check (profile is null or profile ~ '^https://');

alter table public.notifications
  drop constraint if exists notifications_text_lengths,
  add constraint notifications_text_lengths
    check (
      (actor_username is null or char_length(actor_username) <= 40)
      and (person_name is null or char_length(person_name) <= 200)
      and (title is null or char_length(title) <= 300)
      and (poster is null or char_length(poster) <= 500)
    );

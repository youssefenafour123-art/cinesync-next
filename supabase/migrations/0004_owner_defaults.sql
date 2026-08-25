-- Let the database fill in who you are.
--
-- `lists.user_id` and `follows.follower_id` are both "the person doing this",
-- and both were declared not-null with no default — so every insert had to
-- carry a user id the client looked up and sent. Found the hard way: a follow
-- posted with only `followee_id` was refused by row-level security, because
-- the with-check compared `auth.uid()` against a null.
--
-- Two things are wrong with making the caller supply it. The visible one is
-- that `createList()` could never have worked, since it inserts a name and no
-- user. The quieter one is that a value the client chooses is a value the
-- client can get wrong, and the only thing standing between a wrong one and a
-- row owned by somebody else is the policy — which should be the last line of
-- defence, not the only one.
--
-- `auth.uid()` as the default makes the honest case automatic and leaves the
-- policy checking a value the client no longer has a reason to send.
--
-- Bare `auth.uid()`, not `(select auth.uid())`. The parenthesised form is the
-- right one inside a policy, where it makes the planner evaluate the call once
-- per statement instead of once per row — but a DEFAULT expression may not
-- contain a subquery at all, and the first version of this migration was
-- refused with "cannot use subquery in DEFAULT expression". A default is
-- evaluated once per inserted row regardless, so there is nothing the wrapper
-- would have bought here.

alter table public.lists
  alter column user_id set default auth.uid();

alter table public.follows
  alter column follower_id set default auth.uid();

-- `favorites.user_id` gets the same treatment for consistency, even though its
-- caller does pass one — there is no reason for two conventions.
alter table public.favorites
  alter column user_id set default auth.uid();

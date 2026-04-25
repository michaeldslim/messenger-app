-- Fix self-referential RLS policy on kuku_conversation_members.
-- The original policy queried the same table from within its own RLS check,
-- causing PostgreSQL stack-depth recursion errors.
-- Replace with a SECURITY DEFINER helper function that bypasses RLS internally.

create or replace function public.is_conversation_member(conv_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.kuku_conversation_members
    where conversation_id = conv_id
      and user_id = auth.uid()
  );
$$;

drop policy if exists "Members can view conversation members" on public.kuku_conversation_members;

create policy "Members can view conversation members"
  on public.kuku_conversation_members for select
  using (is_conversation_member(conversation_id));

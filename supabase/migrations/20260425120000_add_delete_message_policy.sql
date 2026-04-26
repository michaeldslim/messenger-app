-- Allow users to soft-delete their own messages
create policy "Users can soft delete own messages"
  on public.kuku_messages for update
  using (auth.uid() = sender_id)
  with check (auth.uid() = sender_id);

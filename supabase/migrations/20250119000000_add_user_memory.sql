-- Migration: Add user memory table for State & Memory Agent
-- This enables persistent context, user preferences, conversation summaries, and cross-session memory

-- User memory table: Stores persistent context, preferences, and conversation summaries
create table public.user_memory (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  key text not null,  -- e.g., "preferences", "conversation_summary_2025-01", "important_facts"
  value jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint unique_user_memory_key unique (user_id, key)
);

-- Index for efficient lookups
create index user_memory_user_id_idx on public.user_memory(user_id);
create index user_memory_key_idx on public.user_memory(key);
create index user_memory_updated_at_idx on public.user_memory(updated_at);

-- Trigger to automatically update updated_at timestamp
create trigger set_user_memory_updated_at
before update on public.user_memory
for each row execute procedure public.set_updated_at();

-- Row Level Security for user_memory
alter table public.user_memory enable row level security;

create policy "Select own memory"
  on public.user_memory
  for select
  using (auth.uid() = user_id);

create policy "Insert own memory"
  on public.user_memory
  for insert
  with check (auth.uid() = user_id);

create policy "Update own memory"
  on public.user_memory
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Delete own memory"
  on public.user_memory
  for delete
  using (auth.uid() = user_id);

comment on table public.user_memory is 'Persistent memory storage for user context, preferences, and conversation summaries managed by State & Memory Agent.';
comment on column public.user_memory.key is 'Memory key identifier (e.g., "preferences", "conversation_summary_2025-01-19", "important_facts").';
comment on column public.user_memory.value is 'JSONB value containing the memory data (preferences object, summary text, facts array, etc.).';


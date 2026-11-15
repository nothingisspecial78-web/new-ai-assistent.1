-- ==============================================================================
-- Supabase pgvector Migration for Multi-Tenant Embeddable AI Assistant
-- Run in Supabase SQL Editor or via Supabase CLI migrations
-- ==============================================================================

-- 1. Enable pgvector extension
create extension if not exists vector;

-- 2. Knowledge chunks table (strictly isolated by app_id)
-- Note: Default dimension 1536 matches OpenAI text-embedding-3-small.
-- Adjust vector(1536) if switching to a different embedding dimension.
create table if not exists assistant_chunks (
  id text primary key,
  app_id text not null,
  source text not null,
  heading text not null,
  chunk_index integer not null default 0,
  content text not null,
  token_count integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  embedding vector(1536) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 3. Indexes for fast app_id isolation + vector similarity search
create index if not exists idx_assistant_chunks_app_id
  on assistant_chunks (app_id);

create index if not exists idx_assistant_chunks_app_source
  on assistant_chunks (app_id, source);

create index if not exists idx_assistant_chunks_embedding
  on assistant_chunks
  using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

-- 4. Action audit log table (who, what, when, result, created_ids for undo)
create table if not exists assistant_action_logs (
  id text primary key,
  app_id text not null,
  user_id text not null,
  tool_name text not null,
  risk text not null check (risk in ('read', 'write')),
  status text not null check (status in ('pending', 'confirmed', 'executed', 'failed', 'undone', 'cancelled')),
  summary text not null,
  args jsonb not null default '{}'::jsonb,
  result jsonb,
  created_ids jsonb default '[]'::jsonb,
  created_at timestamptz not null default now(),
  executed_at timestamptz,
  undone_at timestamptz
);

create index if not exists idx_assistant_action_logs_app_user
  on assistant_action_logs (app_id, user_id, created_at desc);

-- 5. Match function with mandatory app_id namespace filter
create or replace function match_assistant_chunks (
  query_embedding vector(1536),
  filter_app_id text,
  match_count int default 5,
  min_similarity float default 0.0
)
returns table (
  id text,
  app_id text,
  source text,
  heading text,
  chunk_index integer,
  content text,
  token_count integer,
  metadata jsonb,
  similarity float
)
language sql
stable
as $$
  select
    c.id,
    c.app_id,
    c.source,
    c.heading,
    c.chunk_index,
    c.content,
    c.token_count,
    c.metadata,
    1 - (c.embedding <=> query_embedding) as similarity
  from assistant_chunks c
  where c.app_id = filter_app_id
    and 1 - (c.embedding <=> query_embedding) >= min_similarity
  order by c.embedding <=> query_embedding
  limit match_count;
$$;

-- 6. Row-level security (service role bypasses RLS; anon/authenticated blocked by default)
alter table assistant_chunks enable row level security;
alter table assistant_action_logs enable row level security;

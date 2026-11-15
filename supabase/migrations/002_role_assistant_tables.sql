-- ==============================================================================
-- Migration 002: Role-Aware Per-User Assistant Tables & Scoped Isolation
-- ==============================================================================

-- 1. Add visibility to assistant_chunks for RAG document scoping
alter table assistant_chunks 
  add column if not exists visibility text not null default 'all' 
  check (visibility in ('all', 'manager', 'admin'));

create index if not exists idx_assistant_chunks_visibility
  on assistant_chunks (app_id, visibility);

-- Updated match function with visibility filter
create or replace function match_assistant_chunks_scoped (
  query_embedding vector(1536),
  filter_app_id text,
  allowed_visibilities text[] default array['all']::text[],
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
  visibility text,
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
    c.visibility,
    1 - (c.embedding <=> query_embedding) as similarity
  from assistant_chunks c
  where c.app_id = filter_app_id
    and c.visibility = any(allowed_visibilities)
    and 1 - (c.embedding <=> query_embedding) >= min_similarity
  order by c.embedding <=> query_embedding
  limit match_count;
$$;

-- 2. Conversations table strictly owned by user_id
create table if not exists assistant_conversations (
  id text primary key,
  user_id text not null,
  app_id text not null,
  title text not null default 'New Conversation',
  summary text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_assistant_conversations_user
  on assistant_conversations (user_id, created_at desc);

create index if not exists idx_assistant_conversations_app_user
  on assistant_conversations (app_id, user_id);

-- 3. Messages table
create table if not exists assistant_messages (
  id text primary key,
  conversation_id text not null references assistant_conversations(id) on delete cascade,
  user_id text not null,
  role text not null check (role in ('user', 'assistant', 'system', 'tool')),
  content text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_assistant_messages_conv
  on assistant_messages (conversation_id, created_at asc);

create index if not exists idx_assistant_messages_user
  on assistant_messages (user_id, created_at desc);

-- 4. User profile / preferences
create table if not exists assistant_user_profile (
  user_id text primary key,
  preferred_language text not null default 'en',
  answer_style text not null default 'concise' check (answer_style in ('concise', 'detailed', 'step-by-step')),
  notes_json jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- 5. Chip usage tracking for personalization ranking
create table if not exists assistant_chip_usage (
  user_id text not null,
  chip_id text not null,
  page_id text not null,
  shown_count integer not null default 0,
  click_count integer not null default 0,
  last_clicked_at timestamptz,
  primary key (user_id, chip_id, page_id)
);

create index if not exists idx_assistant_chip_usage_user_page
  on assistant_chip_usage (user_id, page_id);

-- 6. Audit logs for all read/write operations
create table if not exists assistant_audit_logs (
  id text primary key,
  user_id text not null,
  role text not null,
  scope jsonb not null default '{}'::jsonb,
  tool text not null,
  parameters jsonb not null default '{}'::jsonb,
  result jsonb,
  timestamp timestamptz not null default now()
);

create index if not exists idx_assistant_audit_logs_user
  on assistant_audit_logs (user_id, timestamp desc);

create index if not exists idx_assistant_audit_logs_role
  on assistant_audit_logs (role, timestamp desc);

-- Enable RLS
alter table assistant_conversations enable row level security;
alter table assistant_messages enable row level security;
alter table assistant_user_profile enable row level security;
alter table assistant_chip_usage enable row level security;
alter table assistant_audit_logs enable row level security;

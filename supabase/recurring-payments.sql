-- Run once in Supabase: SQL Editor → New query.
-- Adds monthly repeating income and expense templates.

create table if not exists public.recurring_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null check (type in ('income', 'expense')),
  amount numeric(12, 2) not null check (amount > 0),
  category text not null check (char_length(category) <= 40),
  note text check (char_length(note) <= 60),
  start_date date not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.transactions
  add column if not exists recurring_transaction_id uuid
  references public.recurring_transactions(id) on delete set null;

create unique index if not exists recurring_transaction_occurrence_idx
  on public.transactions (recurring_transaction_id, transaction_date)
  where recurring_transaction_id is not null;

alter table public.recurring_transactions enable row level security;

create policy "People can view their own recurring transactions"
  on public.recurring_transactions for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "People can add their own recurring transactions"
  on public.recurring_transactions for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "People can update their own recurring transactions"
  on public.recurring_transactions for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "People can delete their own recurring transactions"
  on public.recurring_transactions for delete
  to authenticated
  using ((select auth.uid()) = user_id);

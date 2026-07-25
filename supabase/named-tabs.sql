-- Run once in Supabase: SQL Editor → New query.
-- Creates named money tabs and moves existing entries into a Personal tab.

create table if not exists public.ledgers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 40),
  created_at timestamptz not null default now(),
  unique (user_id, name)
);

alter table public.transactions
  add column if not exists ledger_id uuid references public.ledgers(id) on delete cascade;

alter table public.recurring_transactions
  add column if not exists ledger_id uuid references public.ledgers(id) on delete cascade;

insert into public.ledgers (user_id, name)
select user_id, 'Personal'
from (
  select user_id from public.transactions
  union
  select user_id from public.recurring_transactions
) as existing_users
on conflict (user_id, name) do nothing;

update public.transactions as transaction
set ledger_id = ledger.id
from public.ledgers as ledger
where ledger.user_id = transaction.user_id
  and ledger.name = 'Personal'
  and transaction.ledger_id is null;

update public.recurring_transactions as recurring
set ledger_id = ledger.id
from public.ledgers as ledger
where ledger.user_id = recurring.user_id
  and ledger.name = 'Personal'
  and recurring.ledger_id is null;

alter table public.transactions alter column ledger_id set not null;
alter table public.recurring_transactions alter column ledger_id set not null;

create index if not exists transactions_ledger_date_idx
  on public.transactions (ledger_id, transaction_date desc);

create index if not exists recurring_transactions_ledger_idx
  on public.recurring_transactions (ledger_id);

alter table public.ledgers enable row level security;

create policy "People can view their own tabs"
  on public.ledgers for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "People can add their own tabs"
  on public.ledgers for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "People can update their own tabs"
  on public.ledgers for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "People can delete their own tabs"
  on public.ledgers for delete to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Create own transactions" on public.transactions;
drop policy if exists "Update own transactions" on public.transactions;
drop policy if exists "People can add their own recurring transactions" on public.recurring_transactions;
drop policy if exists "People can update their own recurring transactions" on public.recurring_transactions;

create policy "Create own transactions"
  on public.transactions for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.ledgers
      where id = ledger_id and user_id = (select auth.uid())
    )
  );

create policy "Update own transactions"
  on public.transactions for update to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.ledgers
      where id = ledger_id and user_id = (select auth.uid())
    )
  );

create policy "People can add their own recurring transactions"
  on public.recurring_transactions for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.ledgers
      where id = ledger_id and user_id = (select auth.uid())
    )
  );

create policy "People can update their own recurring transactions"
  on public.recurring_transactions for update to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.ledgers
      where id = ledger_id and user_id = (select auth.uid())
    )
  );

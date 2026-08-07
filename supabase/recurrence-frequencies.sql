-- Run once in the Supabase SQL Editor.
-- Existing recurring payments remain monthly.
alter table public.recurring_transactions
  add column if not exists frequency text not null default 'monthly';

alter table public.recurring_transactions
  drop constraint if exists recurring_transactions_frequency_check;

alter table public.recurring_transactions
  add constraint recurring_transactions_frequency_check
  check (frequency in ('weekly', 'biweekly', 'monthly', 'bimonthly'));

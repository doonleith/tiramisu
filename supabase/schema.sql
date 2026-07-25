create table public.transactions (id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id) on delete cascade,type text not null check(type in ('income','expense')),amount numeric(12,2) not null check(amount>0),category text not null check(char_length(category)<=40),transaction_date date not null,note text check(char_length(note)<=60),created_at timestamptz not null default now());
alter table public.transactions enable row level security;
create policy "View own transactions" on public.transactions for select to authenticated using ((select auth.uid())=user_id);
create policy "Create own transactions" on public.transactions for insert to authenticated with check ((select auth.uid())=user_id);
create policy "Update own transactions" on public.transactions for update to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
create policy "Delete own transactions" on public.transactions for delete to authenticated using ((select auth.uid())=user_id);
create index transactions_user_date_idx on public.transactions(user_id,transaction_date desc);

-- Run once after named-tabs.sql in Supabase: SQL Editor → New query.
-- Adds one-time invite links and member access to money spaces.

create table if not exists public.ledger_members (
  ledger_id uuid not null references public.ledgers(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 100),
  role text not null default 'member' check (role in ('member')),
  joined_at timestamptz not null default now(),
  primary key (ledger_id, user_id)
);

create table if not exists public.ledger_invites (
  id uuid primary key default gen_random_uuid(),
  ledger_id uuid not null references public.ledgers(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade,
  expires_at timestamptz not null default (now() + interval '7 days'),
  accepted_at timestamptz,
  accepted_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.transactions
  add column if not exists created_by_name text;

alter table public.recurring_transactions
  add column if not exists created_by_name text;

update public.transactions
set created_by_name = 'Space owner'
where created_by_name is null;

update public.recurring_transactions
set created_by_name = 'Space owner'
where created_by_name is null;

create or replace function public.is_ledger_member(target_ledger_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.ledgers
    where id = target_ledger_id
      and user_id = auth.uid()
  ) or exists (
    select 1
    from public.ledger_members
    where ledger_id = target_ledger_id
      and user_id = auth.uid()
  );
$$;

create or replace function public.is_ledger_owner(target_ledger_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.ledgers
    where id = target_ledger_id
      and user_id = auth.uid()
  );
$$;

revoke all on function public.is_ledger_member(uuid) from public;
revoke all on function public.is_ledger_owner(uuid) from public;
grant execute on function public.is_ledger_member(uuid) to authenticated;
grant execute on function public.is_ledger_owner(uuid) to authenticated;

alter table public.ledger_members enable row level security;
alter table public.ledger_invites enable row level security;

grant select, delete on public.ledger_members to authenticated;
grant select, delete on public.ledger_invites to authenticated;

drop policy if exists "People can view their own tabs" on public.ledgers;
drop policy if exists "People can add their own tabs" on public.ledgers;
drop policy if exists "People can update their own tabs" on public.ledgers;
drop policy if exists "People can delete their own tabs" on public.ledgers;

create policy "Members can view money spaces"
  on public.ledgers for select to authenticated
  using (public.is_ledger_member(id));

create policy "Owners can create money spaces"
  on public.ledgers for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Owners can update money spaces"
  on public.ledgers for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Owners can delete money spaces"
  on public.ledgers for delete to authenticated
  using ((select auth.uid()) = user_id);

create policy "Members can view space membership"
  on public.ledger_members for select to authenticated
  using (public.is_ledger_member(ledger_id));

create policy "Owners can remove space members"
  on public.ledger_members for delete to authenticated
  using (public.is_ledger_owner(ledger_id));

create policy "Owners can view space invites"
  on public.ledger_invites for select to authenticated
  using (public.is_ledger_owner(ledger_id));

create policy "Owners can remove space invites"
  on public.ledger_invites for delete to authenticated
  using (public.is_ledger_owner(ledger_id));

create or replace function public.create_ledger_invite(target_ledger_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  invite_id uuid;
begin
  if not public.is_ledger_owner(target_ledger_id) then
    raise exception 'Only the space owner can create an invite.';
  end if;

  insert into public.ledger_invites (ledger_id, created_by)
  values (target_ledger_id, auth.uid())
  returning id into invite_id;

  return invite_id;
end;
$$;

create or replace function public.accept_ledger_invite(invite_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  invite public.ledger_invites;
  member_name text;
begin
  select *
  into invite
  from public.ledger_invites
  where id = invite_id
    and accepted_at is null
    and expires_at > now()
  for update;

  if invite.id is null then
    raise exception 'This invite is invalid, expired, or has already been used.';
  end if;

  if public.is_ledger_owner(invite.ledger_id) then
    return invite.ledger_id;
  end if;

  member_name := coalesce(
    auth.jwt() -> 'user_metadata' ->> 'full_name',
    auth.jwt() ->> 'email',
    'Member'
  );

  insert into public.ledger_members (
    ledger_id,
    user_id,
    display_name
  )
  values (
    invite.ledger_id,
    auth.uid(),
    left(member_name, 100)
  )
  on conflict (ledger_id, user_id) do update
  set display_name = excluded.display_name;

  update public.ledger_invites
  set
    accepted_at = now(),
    accepted_by = auth.uid()
  where id = invite.id;

  return invite.ledger_id;
end;
$$;

revoke all on function public.create_ledger_invite(uuid) from public;
revoke all on function public.accept_ledger_invite(uuid) from public;
grant execute on function public.create_ledger_invite(uuid) to authenticated;
grant execute on function public.accept_ledger_invite(uuid) to authenticated;

drop policy if exists "View own transactions" on public.transactions;
drop policy if exists "Create own transactions" on public.transactions;
drop policy if exists "Update own transactions" on public.transactions;
drop policy if exists "Delete own transactions" on public.transactions;

create policy "Members can view transactions"
  on public.transactions for select to authenticated
  using (public.is_ledger_member(ledger_id));

create policy "Members can create transactions"
  on public.transactions for insert to authenticated
  with check (
    public.is_ledger_member(ledger_id)
    and user_id = (select auth.uid())
  );

create policy "Members can update transactions"
  on public.transactions for update to authenticated
  using (public.is_ledger_member(ledger_id))
  with check (public.is_ledger_member(ledger_id));

create policy "Members can delete transactions"
  on public.transactions for delete to authenticated
  using (public.is_ledger_member(ledger_id));

drop policy if exists "People can view their own recurring transactions"
  on public.recurring_transactions;
drop policy if exists "People can add their own recurring transactions"
  on public.recurring_transactions;
drop policy if exists "People can update their own recurring transactions"
  on public.recurring_transactions;
drop policy if exists "People can delete their own recurring transactions"
  on public.recurring_transactions;

create policy "Members can view recurring transactions"
  on public.recurring_transactions for select to authenticated
  using (public.is_ledger_member(ledger_id));

create policy "Members can create recurring transactions"
  on public.recurring_transactions for insert to authenticated
  with check (
    public.is_ledger_member(ledger_id)
    and user_id = (select auth.uid())
  );

create policy "Members can update recurring transactions"
  on public.recurring_transactions for update to authenticated
  using (public.is_ledger_member(ledger_id))
  with check (public.is_ledger_member(ledger_id));

create policy "Members can delete recurring transactions"
  on public.recurring_transactions for delete to authenticated
  using (public.is_ledger_member(ledger_id));

create or replace function public.preserve_entry_creator()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.user_id := old.user_id;
  new.created_by_name := old.created_by_name;
  return new;
end;
$$;

drop trigger if exists preserve_transaction_creator
  on public.transactions;

create trigger preserve_transaction_creator
before update on public.transactions
for each row execute function public.preserve_entry_creator();

drop trigger if exists preserve_recurring_creator
  on public.recurring_transactions;

create trigger preserve_recurring_creator
before update on public.recurring_transactions
for each row execute function public.preserve_entry_creator();

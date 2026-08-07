-- Run once in the Supabase SQL Editor after checking the query below returns no rows.
-- It prevents duplicate generated occurrences when the app is open in two places.

select recurring_transaction_id, transaction_date, count(*) as occurrences
from public.transactions
where recurring_transaction_id is not null
group by recurring_transaction_id, transaction_date
having count(*) > 1;

-- If the query above returns no rows, run this statement too.
create unique index if not exists transactions_recurring_occurrence_unique
  on public.transactions (recurring_transaction_id, transaction_date)
  where recurring_transaction_id is not null;

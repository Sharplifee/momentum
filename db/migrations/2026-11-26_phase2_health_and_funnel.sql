-- Phase 2 additive migration: cached system health + funnel view
-- Safe to run multiple times.

-- 1) Cached system status table
create table if not exists public.system_status (
  key text primary key,
  ok boolean,
  detail jsonb,
  checked_at timestamptz default now()
);
alter table public.system_status owner to postgres;
grant select on public.system_status to anon, authenticated;
grant insert, update, delete on public.system_status to service_role;

-- 2) Funnel view over the last 30 days, bucketed by ISO week (Monday start)
create or replace view public.v_funnel_weekly as
with base as (
  select
    date_trunc('week', created_at)::date as week_start,
    id,
    first_response_at,
    (case when quote_visit_date is not null then 1 else 0 end) as visit_booked,
    (select 1 from quotes q where q.lead_id = leads.id and q.status = 'sent' limit 1) as quote_sent,
    (case when stage = 'closed_won' then 1 else 0 end) as won
  from leads
  where created_at > now() - interval '30 days'
    and source <> 'test'
    and (full_name is null or full_name not ilike 'zz %')
    and (phone is null or phone not like '+1555%')
)
select
  week_start as week,
  count(*) as leads,
  count(first_response_at) as replied,
  sum(visit_booked) as visits_booked,
  coalesce(sum(quote_sent),0) as quotes_sent,
  sum(won) as won,
  percentile_cont(0.5) within group (order by extract(epoch from (first_response_at - (week_start))) ) as median_response_s
from base
group by week_start
order by week_start desc;


begin;
create table public.eo_ai_summaries (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.eo_profiles(id),
  period_from date not null, period_to date not null,
  store_ids uuid[] not null default '{}',
  group_by text not null check(group_by in ('region','store')),
  provider text not null check(provider='anthropic'),
  model text not null,
  summary text not null check(length(summary) between 1 and 12000),
  sample_count integer not null, total_entries bigint not null,
  cutoff timestamptz not null, created_at timestamptz not null default now()
);
alter table public.eo_ai_summaries enable row level security;
revoke all on public.eo_ai_summaries from public,anon,authenticated;
grant select,insert on public.eo_ai_summaries to service_role;
create index eo_ai_summaries_person_time on public.eo_ai_summaries(person_id,created_at desc);
insert into eo_private.schema_migrations(version) values('202611070004_anthropic_summaries');
commit;

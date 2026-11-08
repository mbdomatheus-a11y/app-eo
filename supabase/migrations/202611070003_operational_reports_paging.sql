-- Relatórios paginados. Eventos são append-only; cutoff fixa o conjunto exportado.
begin;

create index eo_day_records_report_date on public.eo_day_records(entry_date,created_at,updated_at desc,id desc);
create index eo_mood_records_report_date on public.eo_mood_records(entry_date,created_at,updated_at desc,id desc);

-- NULL representa todas as lojas para admin; array vazio representa nenhuma loja.
-- Resolve a abrangência uma única vez por RPC, em vez de consultar has_store por evento.
create function eo_private.operational_report_scope(p_stores uuid[]) returns uuid[]
language plpgsql stable security definer set search_path='' as $$
declare v_role text:=eo_private.role_of_actor(); v_scope uuid[];
begin
  if v_role is null then raise exception 'Acesso não autorizado' using errcode='42501'; end if;
  if coalesce(cardinality(p_stores),0)>10000 or array_position(p_stores,null) is not null then raise exception 'Seleção de lojas inválida'; end if;
  if coalesce(cardinality(p_stores),0)>0 then
    if v_role<>'admin' and exists(select 1 from unnest(p_stores) s where not eo_private.has_store(s)) then
      raise exception 'Loja fora da abrangência' using errcode='42501'; end if;
    select array_agg(distinct s) into v_scope from unnest(p_stores) s;
    return v_scope;
  end if;
  if v_role='admin' then return null; end if;
  select coalesce(array_agg(s.id),'{}'::uuid[]) into v_scope from public.eo_stores s where eo_private.has_store(s.id);
  return v_scope;
end; $$;
revoke all on function eo_private.operational_report_scope(uuid[]) from public,anon,authenticated;

create function public.eo_day_entries_page(p_from date,p_to date,p_stores uuid[] default '{}',
  p_limit integer default 50,p_offset integer default 0,p_cutoff timestamptz default now()) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare v_role text:=eo_private.role_of_actor(); v_scope uuid[]; v_items jsonb; v_total bigint;
  v_limit integer:=greatest(1,least(coalesce(p_limit,50),500)); v_offset integer:=greatest(0,coalesce(p_offset,0));
begin
  v_scope:=eo_private.operational_report_scope(p_stores);
  if p_from is null or p_to is null or p_to<p_from or p_to-p_from>366 or p_cutoff is null then
    raise exception 'Escolha um intervalo de até 367 dias e um corte válido'; end if;
  select count(*) into v_total from public.eo_day_records r
    where r.entry_date between p_from and p_to and r.created_at<=p_cutoff
      and (v_scope is null or r.store_id=any(v_scope))
      and (v_role in ('admin','diretor') or r.person_id=auth.uid());
  select coalesce(jsonb_agg(to_jsonb(q) order by q.updated_at desc,q.id desc),'[]'::jsonb) into v_items from (
    select r.id,r.store_id,r.store_code,r.store_name,r.region,r.person_id,r.person_name,r.entry_date,
      r.outcome,r.reasons,r.note,r.transcript,r.audio_path,r.audio_seconds,r.transcription_status,r.created_at,r.updated_at
    from public.eo_day_records r
    where r.entry_date between p_from and p_to and r.created_at<=p_cutoff
      and (v_scope is null or r.store_id=any(v_scope))
      and (v_role in ('admin','diretor') or r.person_id=auth.uid())
    order by r.updated_at desc,r.id desc limit v_limit offset v_offset
  ) q;
  return jsonb_build_object('items',v_items,'total',v_total,'cutoff',p_cutoff);
end; $$;

create function public.eo_mood_entries_page(p_from date,p_to date,p_stores uuid[] default '{}',
  p_limit integer default 50,p_offset integer default 0,p_cutoff timestamptz default now()) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare v_role text:=eo_private.role_of_actor(); v_scope uuid[]; v_items jsonb; v_total bigint;
  v_limit integer:=greatest(1,least(coalesce(p_limit,50),500)); v_offset integer:=greatest(0,coalesce(p_offset,0));
begin
  v_scope:=eo_private.operational_report_scope(p_stores);
  if p_from is null or p_to is null or p_to<p_from or p_to-p_from>366 or p_cutoff is null then
    raise exception 'Escolha um intervalo de até 367 dias e um corte válido'; end if;
  select count(*) into v_total from public.eo_mood_records r
    where r.entry_date between p_from and p_to and r.created_at<=p_cutoff
      and (v_scope is null or r.store_id=any(v_scope))
      and (v_role in ('admin','diretor') or r.person_id=auth.uid());
  select coalesce(jsonb_agg(to_jsonb(q) order by q.updated_at desc,q.id desc),'[]'::jsonb) into v_items from (
    select r.id,r.store_id,r.store_code,r.store_name,r.region,r.person_id,r.person_name,r.entry_date,r.mood,r.created_at,r.updated_at
    from public.eo_mood_records r
    where r.entry_date between p_from and p_to and r.created_at<=p_cutoff
      and (v_scope is null or r.store_id=any(v_scope))
      and (v_role in ('admin','diretor') or r.person_id=auth.uid())
    order by r.updated_at desc,r.id desc limit v_limit offset v_offset
  ) q;
  return jsonb_build_object('items',v_items,'total',v_total,'cutoff',p_cutoff);
end; $$;

create function public.eo_operational_overview(p_from date,p_to date,p_stores uuid[] default '{}',
  p_group text default 'region',p_cutoff timestamptz default now()) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare v_role text:=eo_private.role_of_actor(); v_scope uuid[]; v_result jsonb;
begin
  v_scope:=eo_private.operational_report_scope(p_stores);
  if p_from is null or p_to is null or p_to<p_from or p_to-p_from>366 or p_cutoff is null then
    raise exception 'Escolha um intervalo de até 367 dias e um corte válido'; end if;
  if p_group is null or p_group not in ('region','store') then raise exception 'Agrupamento inválido'; end if;
  with diary as materialized (
    select r.store_id,r.store_code,r.store_name,r.region,r.person_id,r.reasons,r.created_at
    from public.eo_day_records r
    where r.entry_date between p_from and p_to and r.created_at<=p_cutoff
      and (v_scope is null or r.store_id=any(v_scope))
      and (v_role in ('admin','diretor') or r.person_id=auth.uid())
  ), moods as materialized (
    select r.store_id,r.store_code,r.store_name,r.region,r.person_id,r.mood,r.created_at
    from public.eo_mood_records r
    where r.entry_date between p_from and p_to and r.created_at<=p_cutoff
      and (v_scope is null or r.store_id=any(v_scope))
      and (v_role in ('admin','diretor') or r.person_id=auth.uid())
  ), events as materialized (
    select d.store_id,d.store_code,d.store_name,d.region,d.person_id,d.created_at,'diary'::text kind,null::text mood from diary d
    union all
    select m.store_id,m.store_code,m.store_name,m.region,m.person_id,m.created_at,'mood'::text,m.mood from moods m
  ), grouped_events as (
    select e.*,case when p_group='store' then e.store_id::text else coalesce(nullif(trim(e.region),''),'Sem regional') end group_key,
      case when p_group='store' then e.store_code||' · '||e.store_name else coalesce(nullif(trim(e.region),''),'Sem regional') end group_label
    from events e
  ), groups as (
    select group_key,
      max(group_label) label,
      count(*) filter(where kind='diary') diary_count,
      count(*) filter(where mood='happy') happy,count(*) filter(where mood='neutral') neutral,count(*) filter(where mood='sad') sad
    from grouped_events group by group_key
  ), reasons as (
    select r.reason,count(*) occurrences from diary d cross join lateral unnest(d.reasons) r(reason)
    group by r.reason order by occurrences desc,r.reason limit 20
  ) select jsonb_build_object(
    'diary_count',(select count(*) from diary),'mood_count',(select count(*) from moods),
    'store_count',(select count(distinct store_id) from events),'people_count',(select count(distinct person_id) from events),
    'groups',coalesce((select jsonb_agg(jsonb_build_object('key',group_key,'label',label,'diary_count',diary_count,
      'happy',happy,'neutral',neutral,'sad',sad) order by label,group_key) from groups),'[]'::jsonb),
    'top_reasons',coalesce((select jsonb_agg(jsonb_build_object('reason',reason,'count',occurrences) order by occurrences desc,reason) from reasons),'[]'::jsonb),
    'cutoff',p_cutoff
  ) into v_result;
  return v_result;
end; $$;

-- As versões antigas permanecem para manutenção/testes SQL, sem acesso de clientes.
revoke execute on function public.eo_day_entries(date,date,uuid),public.eo_mood_entries(date,date,uuid) from authenticated;
revoke all on function public.eo_day_entries_page(date,date,uuid[],integer,integer,timestamptz),
  public.eo_mood_entries_page(date,date,uuid[],integer,integer,timestamptz),
  public.eo_operational_overview(date,date,uuid[],text,timestamptz) from public,anon;
grant execute on function public.eo_day_entries_page(date,date,uuid[],integer,integer,timestamptz),
  public.eo_mood_entries_page(date,date,uuid[],integer,integer,timestamptz),
  public.eo_operational_overview(date,date,uuid[],text,timestamptz) to authenticated;
insert into eo_private.schema_migrations(version) values('202611070003_operational_reports_paging');
commit;

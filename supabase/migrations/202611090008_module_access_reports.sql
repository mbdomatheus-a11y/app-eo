begin;
create table public.eo_module_access(module_id text primary key, label text not null, audience text not null default 'all' check(audience in ('all','selected')), updated_at timestamptz not null default now(), updated_by uuid references public.eo_profiles(id));
create table public.eo_module_people(module_id text not null references public.eo_module_access(module_id) on delete cascade,person_id uuid not null references public.eo_profiles(id),primary key(module_id,person_id));
alter table public.eo_module_access enable row level security;
alter table public.eo_module_people enable row level security;
revoke all on public.eo_module_access,public.eo_module_people from public,anon,authenticated;
insert into public.eo_module_access(module_id,label) values ('notices','Comunicados'),('sales','Vendas'),('product','Pedir produto'),('assortment','Sortimento'),('diary','Diário de vendas'),('mood','Como está seu dia?'),('checklists','Checklists'),('reports','Relatórios');
create function public.eo_module_allowed(p_module text) returns boolean
language sql stable security definer set search_path='' as $$
 select eo_private.role_of_actor() is not null and (eo_private.role_of_actor()='admin' or not exists(select 1 from public.eo_module_access m where m.module_id=p_module and m.audience='selected' and not exists(select 1 from public.eo_module_people p where p.module_id=m.module_id and p.person_id=auth.uid())));
$$;
create function public.eo_require_module(p_module text) returns void
language plpgsql stable security definer set search_path='' as $$
begin if not public.eo_module_allowed(p_module) then raise exception 'Módulo indisponível para sua conta' using errcode='42501'; end if; end; $$;
create function public.eo_my_modules() returns jsonb
language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',module_id,'label',label,'visible',public.eo_module_allowed(module_id)) order by label),'[]') from public.eo_module_access where eo_private.role_of_actor() is not null;
$$;
create function public.eo_admin_module_access() returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if eo_private.role_of_actor() is distinct from 'admin' then raise exception 'Acesso administrativo necessário' using errcode='42501'; end if;
 return (select coalesce(jsonb_agg(jsonb_build_object('id',m.module_id,'label',m.label,'audience',m.audience,'people',(select coalesce(jsonb_agg(person_id),'[]') from public.eo_module_people p where p.module_id=m.module_id)) order by m.label),'[]') from public.eo_module_access m);
end; $$;
create function public.eo_admin_set_module_access(p_module text,p_audience text,p_people uuid[] default '{}') returns void
language plpgsql security definer set search_path='' as $$
begin
 if eo_private.role_of_actor() is distinct from 'admin' then raise exception 'Acesso administrativo necessário' using errcode='42501'; end if;
 if p_audience not in ('all','selected') or p_audience is null or p_module is null then raise exception 'Configuração inválida'; end if;
 perform 1 from public.eo_module_access where module_id=p_module for update;
 if not found then raise exception 'Módulo não encontrado'; end if;
 if exists(select 1 from unnest(p_people) x where not exists(select 1 from public.eo_profiles where id=x and active)) then raise exception 'Selecione pessoas ativas'; end if;
 update public.eo_module_access set audience=p_audience,updated_at=now(),updated_by=auth.uid() where module_id=p_module;
 delete from public.eo_module_people where module_id=p_module;
 if p_audience='selected' then insert into public.eo_module_people select p_module,x from (select distinct unnest(p_people) x) q; end if;
 insert into public.eo_audit_events(actor,action,entity_id,detail) values(auth.uid(),'module.access.changed',p_module,jsonb_build_object('audience',p_audience,'people_count',coalesce(cardinality(p_people),0)));
end; $$;
create function public.eo_reports_summary(p_from date,p_to date) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb:='[]'; n bigint; leader boolean:=eo_private.role_of_actor() in ('admin','diretor');
begin
 perform public.eo_require_module('reports');
 if p_from is null or p_to is null or p_to<p_from or p_to-p_from>366 then raise exception 'Escolha um período de até 367 dias'; end if;
 if public.eo_module_allowed('notices') then
  select count(*) into n from public.eo_notice_recipients r join public.eo_notice_versions v on v.notice_id=r.notice_id and v.version=r.version where r.user_id=auth.uid() and (v.published_at at time zone 'America/Sao_Paulo')::date between p_from and p_to;
  result:=result||jsonb_build_array(jsonb_build_object('id','notices','label','Comunicados e feedback','count',n,'note','Comunicados destinados à sua conta. Leitura, ciência e feedback são eventos distintos.'));
 end if;
 if public.eo_module_allowed('product') then
  n:=(public.eo_commercial_page('product',p_from,p_to)->>'total')::bigint;
  result:=result||jsonb_build_array(jsonb_build_object('id','product','label','Pedidos de produto','count',n,'note','Histórico das unidades da abrangência atual, incluindo arquivados.'));
 end if;
 if public.eo_module_allowed('assortment') then
  n:=(public.eo_commercial_page('assortment',p_from,p_to)->>'total')::bigint;
  result:=result||jsonb_build_array(jsonb_build_object('id','assortment','label','Sortimento','count',n,'note','Leituras registradas, incluindo rascunhos. Consulte sessões para envio, validação e CSV.'));
 end if;
 if public.eo_module_allowed('diary') then
  n:=(public.eo_day_entries_page(p_from,p_to)->>'total')::bigint;
  result:=result||jsonb_build_array(jsonb_build_object('id','diary','label','Diário de vendas','count',n,'note','Mesma abrangência e privacidade aplicadas no diário.'));
 end if;
 if public.eo_module_allowed('mood') then
  n:=(public.eo_mood_entries_page(p_from,p_to)->>'total')::bigint;
  result:=result||jsonb_build_array(jsonb_build_object('id','mood','label','Sentimento','count',n,'note','Respeita a liberação de histórico e os limites de acesso do módulo.'));
 end if;
 if public.eo_module_allowed('checklists') then
  select count(*) into n from public.eo_checklist_runs r where (r.assigned_at at time zone 'America/Sao_Paulo')::date between p_from and p_to and eo_private.has_store(r.store_id) and (leader or r.assigned_to=auth.uid());
  result:=result||jsonb_build_array(jsonb_build_object('id','checklists','label','Checklists','count',n,'note','Execuções atribuídas no período, conforme a abrangência atual.'));
 end if;
 insert into public.eo_audit_events(actor,action,entity_id,detail) values(auth.uid(),'reports.viewed','reports',jsonb_build_object('from',p_from,'to',p_to));
 return result;
end; $$;
create function public.eo_report_audit_page(p_from date,p_to date,p_offset integer default 0,p_limit integer default 100) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 if eo_private.role_of_actor() is distinct from 'admin' then raise exception 'Auditoria exclusiva da administração' using errcode='42501'; end if;
 if p_from is null or p_to is null or p_to<p_from or p_to-p_from>366 then raise exception 'Período inválido'; end if;
 with scoped as materialized(select a.id,a.created_at,a.action,a.entity_id,p.display_name actor_name from public.eo_audit_events a left join public.eo_profiles p on p.id=a.actor where (a.created_at at time zone 'America/Sao_Paulo')::date between p_from and p_to), page as (select * from scoped order by id desc limit greatest(1,least(coalesce(p_limit,100),500)) offset greatest(0,coalesce(p_offset,0)))
 select jsonb_build_object('items',(select coalesce(jsonb_agg(to_jsonb(page) order by id desc),'[]') from page),'total',(select count(*) from scoped)) into result;
 insert into public.eo_audit_events(actor,action,entity_id,detail) values(auth.uid(),'reports.audit.viewed','audit',jsonb_build_object('from',p_from,'to',p_to));
 return result;
end; $$;
create function public.eo_report_export_log(p_kind text,p_count integer) returns void
language plpgsql security definer set search_path='' as $$
begin
 perform public.eo_require_module('reports');
 if p_kind not in ('summary','audit') or p_count is null or p_count<0 or p_count>100000 then raise exception 'Exportação inválida'; end if;
 if p_kind='audit' and eo_private.role_of_actor() is distinct from 'admin' then raise exception 'Acesso administrativo necessário' using errcode='42501'; end if;
 insert into public.eo_audit_events(actor,action,entity_id,detail) values(auth.uid(),'reports.exported',p_kind,jsonb_build_object('count',p_count));
end; $$;
-- Preserva nomes, assinaturas e ACLs existentes. Guardas ficam dentro das RPCs,
-- impedindo chamadas diretas quando o módulo estiver oculto para a pessoa.
do $$
declare f record; module_expr text; definition text; body text;
begin
 for f in select p.oid,p.proname,p.prosrc,l.lanname from pg_proc p join pg_namespace n on n.oid=p.pronamespace join pg_language l on l.oid=p.prolang where n.nspname='public' and (
 p.proname ~ '^eo_(sales_|begin_sales|append_sales|finish_sales|publish_sales|archive_sales)' or
 p.proname ~ '^eo_(product_|save_product)' or p.proname ~ '^eo_(assortment|begin_assortment|save_assortment)' or
 p.proname ~ '^eo_(diary_|day_entries|save_day_entry)' or p.proname ~ '^eo_(mood_|save_mood)' or
 p.proname ~ '^eo_(checklist_|my_checklist|save_checklist|assign_checklist)' or
 p.proname ~ '^eo_(notice_|acknowledge_notice|publish_notice|revise_notice)' or p.proname in ('eo_commercial_page','eo_feed','eo_acknowledge','eo_message_object_readable','eo_record_checklist_location','eo_operational_upload_allowed','eo_operational_object_readable'))
 loop
  module_expr:=case when f.proname='eo_commercial_page' then 'p_kind'
   when f.proname in ('eo_operational_upload_allowed','eo_operational_object_readable') then 'case when p_bucket=''eo-sales-html'' then ''sales'' else ''diary'' end'
   when f.proname ~ 'assortment' then '''assortment'''
   when f.proname ~ 'product' then '''product'''
   when f.proname ~ 'sales' then '''sales'''
   when f.proname ~ 'checklist' then '''checklists'''
   when f.proname ~ 'mood' then '''mood'''
   when f.proname ~ '(diary|day_entries|save_day_entry)' then '''diary''' else '''notices''' end;
  definition:=pg_get_functiondef(f.oid);
  if f.lanname='plpgsql' then
   definition:=regexp_replace(definition,'\mbegin\M','begin perform public.eo_require_module('||module_expr||');','i');
  elsif f.lanname='sql' then
   body:='select guarded.* from ('||regexp_replace(btrim(f.prosrc),';\s*$','')||') guarded where public.eo_module_allowed('||module_expr||')';
   definition:=replace(definition,f.prosrc,body);
  else continue; end if;
  execute definition;
 end loop;
end; $$;
-- Consultas compartilhadas filtram cada origem separadamente.
do $guard$
declare f record; definition text;
begin
 for f in select p.oid,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('eo_operational_overview','eo_inbox') loop
  definition:=pg_get_functiondef(f.oid);
  if f.proname='eo_operational_overview' then
   definition:=replace(definition,'where r.entry_date between p_from and p_to and r.created_at<=p_cutoff', 'where public.eo_module_allowed(''diary'') and r.entry_date between p_from and p_to and r.created_at<=p_cutoff');
   definition:=regexp_replace(definition,'(from public.eo_mood_records r[[:space:]]+where public.eo_module_allowed\()''diary''', '\1''mood''');
  else
   definition:=replace(definition,'where r.user_id=auth.uid() and r.inbox_cleared_at', 'where public.eo_module_allowed(''notices'') and r.user_id=auth.uid() and r.inbox_cleared_at');
  end if;
  execute definition;
 end loop;
end; $guard$;
revoke all on function public.eo_module_allowed(text),public.eo_require_module(text),public.eo_my_modules(),public.eo_admin_module_access(),public.eo_admin_set_module_access(text,text,uuid[]),public.eo_reports_summary(date,date),public.eo_report_audit_page(date,date,integer,integer),public.eo_report_export_log(text,integer) from public,anon;
grant execute on function public.eo_module_allowed(text),public.eo_require_module(text),public.eo_my_modules(),public.eo_admin_module_access(),public.eo_admin_set_module_access(text,text,uuid[]),public.eo_reports_summary(date,date),public.eo_report_audit_page(date,date,integer,integer),public.eo_report_export_log(text,integer) to authenticated;
insert into eo_private.schema_migrations(version) values('202611090008_module_access_reports') on conflict do nothing;
commit;

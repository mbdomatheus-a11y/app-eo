-- EO: dados de vendas estruturados, importação idempotente e escopo validado no servidor.
begin;
alter table public.eo_sales_publications add column structured boolean not null default false,
  add column import_state text not null default 'ready' check(import_state in ('pending','ready'));
create table public.eo_sales_batches (
  publication_id uuid not null references public.eo_sales_publications(id), batch integer not null check(batch>=0),
  payload_hash text not null, accepted integer not null, ignored integer not null,
  primary key(publication_id,batch)
);
create table public.eo_sales_rows (
  id bigint generated always as identity primary key,
  publication_id uuid not null references public.eo_sales_publications(id),
  store_id uuid not null references public.eo_stores(id),
  batch integer not null, level text not null, department text not null, region text not null,
  real numeric not null, meta numeric not null, real_ly numeric not null, data jsonb not null
);
create index eo_sales_rows_scope on public.eo_sales_rows(publication_id,level,store_id);
alter table public.eo_sales_batches enable row level security;
alter table public.eo_sales_rows enable row level security;
revoke all on public.eo_sales_batches,public.eo_sales_rows from public,anon,authenticated;
revoke all on sequence public.eo_sales_rows_id_seq from public,anon,authenticated;

create function public.eo_begin_sales_dataset(p_title text,p_period text,p_object_path text,p_stores uuid[]) returns uuid
language plpgsql security definer set search_path='' as $$
declare v_id uuid;
begin
  v_id:=public.eo_publish_sales_report(p_title,p_period,p_object_path,p_stores);
  update public.eo_sales_publications set structured=true,import_state='pending' where id=v_id;
  return v_id;
end; $$;

create function public.eo_append_sales_dataset(p_id uuid,p_batch integer,p_rows jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_report public.eo_sales_publications%rowtype; v_previous public.eo_sales_batches%rowtype;
  v_row jsonb; v_store uuid; v_code text; v_count integer; v_accepted integer:=0; v_ignored integer:=0;
  v_hash text:=md5(p_rows::text); v_key text;
  v_text_keys text[]:=array['codigo_loja','nome_loja','regional','departamento','secao','nome_secao','lmpa','nivel'];
  v_number_keys text[]:=array['real','meta','real_ly','estoque_2025','estoque_2026','estoque_d1','estoque_d364',
    'ly_estoque_atual','estoque_vermelho_d1','estoque_branco_d1','estoque_transito','estoque_esperado_alocado',
    'cupons_2026','cupons_2025','itens','itens_ly','venda_custo','venda_custo_ly'];
begin
  if eo_private.role_of_actor() is distinct from 'admin' then raise exception 'Acesso administrativo necessário' using errcode='42501'; end if;
  if p_batch is null or p_batch<0 or p_rows is null or jsonb_typeof(p_rows)<>'array' then raise exception 'Lote inválido'; end if;
  if jsonb_array_length(p_rows) not between 1 and 500 then raise exception 'Envie entre 1 e 500 linhas por lote'; end if;
  select * into v_report from public.eo_sales_publications where id=p_id for update;
  if not found or not v_report.structured then raise exception 'Importação não encontrada'; end if;
  select * into v_previous from public.eo_sales_batches where publication_id=p_id and batch=p_batch;
  if found then
    if v_previous.payload_hash<>v_hash then raise exception 'Número de lote já usado com outro conteúdo'; end if;
    return jsonb_build_object('accepted',v_previous.accepted,'ignored',v_previous.ignored,'replayed',true);
  end if;
  if v_report.import_state<>'pending' then raise exception 'Importação já finalizada'; end if;
  for v_row in select value from jsonb_array_elements(p_rows) loop
    if jsonb_typeof(v_row)<>'object' then raise exception 'Linha inválida'; end if;
    if (select count(*) from jsonb_object_keys(v_row))<>26 then raise exception 'Linha deve conter as 26 colunas'; end if;
    foreach v_key in array v_text_keys loop
      if not (v_row ? v_key) or jsonb_typeof(v_row->v_key) not in ('string','number','null')
        or length(coalesce(v_row->>v_key,''))>240 then raise exception 'Coluna textual inválida: %',v_key; end if;
    end loop;
    foreach v_key in array v_number_keys loop
      if not (v_row ? v_key) or jsonb_typeof(v_row->v_key) not in ('number','null') then raise exception 'Coluna numérica inválida: %',v_key; end if;
    end loop;
    if coalesce(v_row->>'nivel','') not in ('LOJA_TOTAL','DEP_TOTAL','SEC_TOTAL','LMPA') then raise exception 'Nível inválido'; end if;
    if nullif(btrim(v_row->>'codigo_loja'),'') is null then raise exception 'Código de loja obrigatório'; end if;
    v_code:=coalesce(nullif(ltrim(btrim(v_row->>'codigo_loja'),'0'),''),'0');
    select count(*),(array_agg(s.id))[1] into v_count,v_store from public.eo_stores s
      where s.active and s.id=any(v_report.store_ids)
        and coalesce(nullif(ltrim(btrim(s.code),'0'),''),'0')=v_code;
    if v_count<>1 then v_ignored:=v_ignored+1; continue; end if;
    insert into public.eo_sales_rows(publication_id,store_id,batch,level,department,region,real,meta,real_ly,data)
      values(p_id,v_store,p_batch,v_row->>'nivel',coalesce(v_row->>'departamento',''),coalesce(v_row->>'regional',''),
        coalesce((v_row->>'real')::numeric,0),coalesce((v_row->>'meta')::numeric,0),coalesce((v_row->>'real_ly')::numeric,0),v_row);
    v_accepted:=v_accepted+1;
  end loop;
  insert into public.eo_sales_batches values(p_id,p_batch,v_hash,v_accepted,v_ignored);
  insert into public.eo_audit_events(actor,action,entity_id,detail) values(auth.uid(),'sales_dataset.batch',p_id::text,
    jsonb_build_object('batch',p_batch,'accepted',v_accepted,'ignored',v_ignored));
  return jsonb_build_object('accepted',v_accepted,'ignored',v_ignored,'replayed',false);
end; $$;

create function public.eo_finish_sales_dataset(p_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_count bigint; v_report public.eo_sales_publications%rowtype;
begin
  if eo_private.role_of_actor() is distinct from 'admin' then raise exception 'Acesso administrativo necessário' using errcode='42501'; end if;
  select * into v_report from public.eo_sales_publications where id=p_id for update;
  if not found or not v_report.structured then raise exception 'Importação não encontrada'; end if;
  select count(*) into v_count from public.eo_sales_rows where publication_id=p_id;
  if v_count=0 then raise exception 'Nenhuma linha reconhecida para as lojas selecionadas'; end if;
  if v_report.import_state<>'ready' then
    update public.eo_sales_publications set import_state='ready' where id=p_id;
    insert into public.eo_audit_events(actor,action,entity_id,detail) values(auth.uid(),'sales_dataset.ready',p_id::text,jsonb_build_object('row_count',v_count));
  end if;
  return jsonb_build_object('status','ready','row_count',v_count);
end; $$;

create function public.eo_sales_dataset_page(p_id uuid,p_level text default 'LOJA_TOTAL',p_query text default '',
  p_region text default '',p_store text default '',p_department text default '',p_sort text default 'real',
  p_desc boolean default true,p_limit integer default 50,p_offset integer default 0) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare v_report public.eo_sales_publications%rowtype; v_scope uuid[]; v_result jsonb;
begin
  if eo_private.role_of_actor() is null then raise exception 'Acesso não autorizado' using errcode='42501'; end if;
  select * into v_report from public.eo_sales_publications where id=p_id and structured;
  if not found then raise exception 'Relatório não encontrado' using errcode='42501'; end if;
  select coalesce(array_agg(s),'{}'::uuid[]) into v_scope from unnest(v_report.store_ids) s where eo_private.has_store(s);
  if eo_private.role_of_actor()<>'admin' and (v_report.archived_at is not null or v_report.import_state<>'ready' or cardinality(v_scope)=0) then
    raise exception 'Relatório indisponível para sua abrangência' using errcode='42501'; end if;
  if p_level is null or p_level not in ('LOJA_TOTAL','DEP_TOTAL','SEC_TOTAL','LMPA') then raise exception 'Nível inválido'; end if;
  if p_sort is null or p_sort not in ('codigo_loja','nome_loja','regional','departamento','secao','nome_secao','lmpa',
    'real','meta','real_ly','estoque_2025','estoque_2026','estoque_d1','estoque_d364','ly_estoque_atual',
    'estoque_vermelho_d1','estoque_branco_d1','estoque_transito','estoque_esperado_alocado','cupons_2026','cupons_2025','itens','itens_ly','venda_custo','venda_custo_ly') then raise exception 'Ordenação inválida'; end if;
  with scoped as materialized (
    select r.* from public.eo_sales_rows r where r.publication_id=p_id and r.store_id=any(v_scope)
  ), filtered as materialized (
    select * from scoped r where r.level=p_level
      and (coalesce(p_region,'')='' or r.region=p_region)
      and (coalesce(p_department,'')='' or r.department=p_department)
      and (coalesce(p_store,'')='' or coalesce(nullif(ltrim(btrim(r.data->>'codigo_loja'),'0'),''),'0')=coalesce(nullif(ltrim(btrim(p_store),'0'),''),'0'))
      and (coalesce(p_query,'')='' or concat_ws(' ',r.data->>'codigo_loja',r.data->>'nome_loja',r.department,r.data->>'nome_secao',r.data->>'lmpa') ilike '%'||p_query||'%')
  ), page as (
    select r.* from filtered r order by
      case when coalesce(p_desc,true) then nullif(r.data->p_sort,'null'::jsonb) end desc nulls last,
      case when not coalesce(p_desc,true) then nullif(r.data->p_sort,'null'::jsonb) end asc nulls last,r.id
    limit greatest(1,least(coalesce(p_limit,50),500)) offset greatest(0,coalesce(p_offset,0))
  ) select jsonb_build_object('status',v_report.import_state,
    'items',(select coalesce(jsonb_agg(data order by
      case when coalesce(p_desc,true) then nullif(data->p_sort,'null'::jsonb) end desc nulls last,
      case when not coalesce(p_desc,true) then nullif(data->p_sort,'null'::jsonb) end asc nulls last,id),'[]'::jsonb) from page),
    'total',(select count(*) from filtered),
    'totals',(select jsonb_build_object('real',coalesce(sum(real),0),'meta',coalesce(sum(meta),0),'real_ly',coalesce(sum(real_ly),0)) from filtered),
    'regions',(select coalesce(jsonb_agg(region order by region),'[]'::jsonb) from (select distinct region from scoped) q),
    'departments',(select coalesce(jsonb_agg(department order by department),'[]'::jsonb) from (select distinct department from scoped r where department<>''
      and (coalesce(p_region,'')='' or r.region=p_region)
      and (coalesce(p_store,'')='' or coalesce(nullif(ltrim(btrim(r.data->>'codigo_loja'),'0'),''),'0')=coalesce(nullif(ltrim(btrim(p_store),'0'),''),'0'))) q),
    'stores',(select coalesce(jsonb_agg(jsonb_build_object('code',code,'name',name) order by code),'[]'::jsonb)
      from (select distinct s.code,s.name from scoped r join public.eo_stores s on s.id=r.store_id
        where coalesce(p_region,'')='' or r.region=p_region) q)
  ) into v_result;
  return v_result;
end; $$;

create or replace function public.eo_operational_object_readable(p_bucket text,p_path text) returns boolean
language sql stable security definer set search_path='' as $$
  select eo_private.role_of_actor() is not null and (
    (p_bucket='eo-sales-html' and exists(select 1 from public.eo_sales_publications r where r.object_path=p_path
      and (eo_private.role_of_actor()='admin' or (not r.structured and r.archived_at is null and exists(
        select 1 from unnest(r.store_ids) s where eo_private.has_store(s))))))
    or (p_bucket='eo-day-audio' and exists(select 1 from public.eo_day_records r where r.audio_path=p_path
      and (eo_private.role_of_actor()='admin' or eo_private.has_store(r.store_id))
      and (r.person_id=auth.uid() or eo_private.role_of_actor() in ('admin','diretor'))))
  );
$$;
create or replace function public.eo_sales_reports(p_period text default null) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  if eo_private.role_of_actor() is null then raise exception 'Acesso não autorizado' using errcode='42501'; end if;
  if p_period is not null and p_period not in ('week','month','year') then raise exception 'Período inválido'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'title',r.title,'period',r.period,
    'published_at',r.published_at,'object_path',r.object_path,'archived_at',r.archived_at,'structured',r.structured,'import_state',r.import_state,
    'store_ids',(select coalesce(jsonb_agg(s),'[]') from unnest(r.store_ids) s where eo_private.role_of_actor()='admin' or eo_private.has_store(s)))
    order by r.published_at desc,r.id) from public.eo_sales_publications r
    where (p_period is null or r.period=p_period) and (eo_private.role_of_actor()='admin' or
      (r.import_state='ready' and r.archived_at is null and exists(select 1 from unnest(r.store_ids) s where eo_private.has_store(s))))),'[]');
end; $$;
revoke all on function public.eo_begin_sales_dataset(text,text,text,uuid[]),public.eo_append_sales_dataset(uuid,integer,jsonb),
  public.eo_finish_sales_dataset(uuid),public.eo_sales_dataset_page(uuid,text,text,text,text,text,text,boolean,integer,integer) from public,anon,authenticated;
grant execute on function public.eo_begin_sales_dataset(text,text,text,uuid[]),public.eo_append_sales_dataset(uuid,integer,jsonb),
  public.eo_finish_sales_dataset(uuid),public.eo_sales_dataset_page(uuid,text,text,text,text,text,text,boolean,integer,integer) to authenticated;
commit;




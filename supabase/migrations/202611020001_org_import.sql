begin;

-- Estrutura organizacional carregada em um único lote validado pelo administrador.
alter table public.eo_stores add column if not exists ggl text;
create index if not exists eo_stores_ggl on public.eo_stores(ggl) where active;

create table public.eo_store_details (
  store_id uuid primary key references public.eo_stores(id) on delete cascade,
  attributes jsonb not null default '{}',
  import_batch uuid,
  updated_at timestamptz not null default now()
);
create table public.eo_regional_groups (
  ggl text primary key check(length(ggl) between 1 and 20),
  regional_name text not null check(length(regional_name) between 2 and 120),
  chapa text,
  phone text,
  area text not null default '',
  email text,
  active boolean not null default true,
  import_batch uuid,
  updated_at timestamptz not null default now()
);
create table public.eo_directory_people (
  chapa text primary key check(chapa ~ '^[0-9]{1,20}$'),
  display_name text not null check(length(display_name) between 2 and 120),
  operational_role text not null,
  email text,
  phone text,
  active boolean not null default true,
  import_batch uuid,
  updated_at timestamptz not null default now()
);
create table public.eo_store_managers (
  store_id uuid primary key references public.eo_stores(id) on delete cascade,
  chapa text not null references public.eo_directory_people(chapa),
  import_batch uuid,
  updated_at timestamptz not null default now()
);
create table public.eo_org_assignments (
  chapa text not null references public.eo_directory_people(chapa) on delete cascade,
  scope_type text not null check(scope_type in ('LOJA','GGL')),
  scope_code text not null,
  active boolean not null default true,
  import_batch uuid,
  primary key(chapa,scope_type,scope_code),
  constraint eo_org_assignment_scope_fk check (
    (scope_type='LOJA' and length(scope_code) between 1 and 20) or
    (scope_type='GGL' and length(scope_code) between 1 and 20)
  )
);
create index eo_org_assignments_scope on public.eo_org_assignments(scope_type,scope_code) where active;
create table public.eo_org_import_batches (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references public.eo_profiles(id),
  created_at timestamptz not null default now(),
  source_name text not null check(length(source_name) between 1 and 180),
  store_count integer not null,
  manager_count integer not null,
  regional_count integer not null,
  people_count integer not null,
  assignment_count integer not null,
  is_current boolean not null default true
);
create unique index eo_org_one_current_batch on public.eo_org_import_batches(is_current) where is_current;
alter table public.eo_store_details add constraint eo_store_details_batch_fk foreign key(import_batch) references public.eo_org_import_batches(id);
alter table public.eo_regional_groups add constraint eo_regional_batch_fk foreign key(import_batch) references public.eo_org_import_batches(id);
alter table public.eo_directory_people add constraint eo_directory_batch_fk foreign key(import_batch) references public.eo_org_import_batches(id);
alter table public.eo_store_managers add constraint eo_store_managers_batch_fk foreign key(import_batch) references public.eo_org_import_batches(id);
alter table public.eo_org_assignments add constraint eo_org_assignment_batch_fk foreign key(import_batch) references public.eo_org_import_batches(id);

alter table public.eo_store_details enable row level security;
alter table public.eo_regional_groups enable row level security;
alter table public.eo_directory_people enable row level security;
alter table public.eo_store_managers enable row level security;
alter table public.eo_org_assignments enable row level security;
alter table public.eo_org_import_batches enable row level security;
revoke all on public.eo_store_details,public.eo_regional_groups,public.eo_directory_people,
  public.eo_store_managers,public.eo_org_assignments,public.eo_org_import_batches from anon,authenticated;

create or replace function eo_private.has_store(p_store uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.eo_stores s where s.id=p_store and s.active and
   (eo_private.role_of_actor()='admin'
    or exists(select 1 from public.eo_store_members m where m.user_id=(select auth.uid()) and m.store_id=s.id)
    or exists(select 1 from public.eo_org_assignments a where a.active and a.chapa=(
        select p.login_chapa from public.eo_profiles p where p.id=(select auth.uid()))
      and ((a.scope_type='LOJA' and a.scope_code=s.code) or (a.scope_type='GGL' and a.scope_code=s.ggl)))))
   and eo_private.role_of_actor() is not null;
$$;

create function public.eo_admin_import_org(p_source_name text,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_batch uuid := gen_random_uuid(); v_actor uuid := auth.uid();
  v_stores jsonb := coalesce(p_payload->'Lojas','[]'::jsonb);
  v_managers jsonb := coalesce(p_payload->'Gerentes','[]'::jsonb);
  v_regionals jsonb := coalesce(p_payload->'Regionais','[]'::jsonb);
  v_people jsonb := coalesce(p_payload->'Pessoas','[]'::jsonb);
  v_links jsonb := coalesce(p_payload->'Vinculos','[]'::jsonb);
  v_row jsonb; v_store_id uuid; v_count int;
begin
  if eo_private.role_of_actor() is distinct from 'admin' then
    raise exception 'Acesso administrativo necessário' using errcode='42501';
  end if;
  if length(trim(p_source_name)) not between 1 and 180 or jsonb_typeof(p_payload)<>'object' then raise exception 'Arquivo inválido'; end if;
  if jsonb_typeof(v_stores)<>'array' or jsonb_array_length(v_stores) not between 1 and 5000
    or jsonb_typeof(v_managers)<>'array' or jsonb_typeof(v_regionals)<>'array'
    or jsonb_typeof(v_people)<>'array' or jsonb_typeof(v_links)<>'array' then raise exception 'Abas obrigatórias ausentes ou vazias'; end if;
  if jsonb_array_length(v_managers)>5000 or jsonb_array_length(v_regionals)>500
    or jsonb_array_length(v_people)>10000 or jsonb_array_length(v_links)>20000 then raise exception 'Arquivo excede o limite de linhas'; end if;
  if exists(select 1 from jsonb_array_elements(v_stores) x where coalesce(trim(x->>'COD'),'')='' or coalesce(trim(x->>'LOJA'),'')='') then raise exception 'Cada loja precisa de COD e LOJA'; end if;
  if (select count(*) from jsonb_array_elements(v_stores))<>(select count(distinct trim(x->>'COD')) from jsonb_array_elements(v_stores) x) then raise exception 'COD duplicado na aba Lojas'; end if;
  if exists(select 1 from jsonb_array_elements(v_stores) x where length(trim(x->>'COD'))>20 or length(trim(x->>'LOJA'))>120) then raise exception 'COD ou nome da loja excede o limite'; end if;
  if exists(select 1 from jsonb_array_elements(v_managers) x where coalesce(trim(x->>'CHAPA'),'') !~ '^[0-9]{1,20}$' or coalesce(trim(x->>'COD LOJA'),'')='') then raise exception 'Gerente precisa de CHAPA numérica e COD LOJA'; end if;
  if exists(select 1 from jsonb_array_elements(v_managers) x where not exists(select 1 from jsonb_array_elements(v_stores) s where trim(s->>'COD')=trim(x->>'COD LOJA'))) then raise exception 'Há gerente associado a COD LOJA que não existe nesta base'; end if;
  if exists(select 1 from jsonb_array_elements(v_regionals) x where coalesce(trim(x->>'GGL'),'')='' or coalesce(trim(x->>'REGIONAL'),'')='') then raise exception 'Cada regional precisa de GGL e nome'; end if;
  if exists(select 1 from jsonb_array_elements(v_stores) x where coalesce(trim(x->>'GGL'),'')<>'' and not exists(select 1 from jsonb_array_elements(v_regionals) g where trim(g->>'GGL')=trim(x->>'GGL'))) then raise exception 'Há loja com GGL sem regional correspondente'; end if;
  if exists(select 1 from jsonb_array_elements(v_links) x where upper(trim(x->>'TIPO ESCOPO')) not in ('LOJA','GGL') or coalesce(trim(x->>'CHAPA'),'') !~ '^[0-9]{1,20}$' or coalesce(trim(x->>'CODIGO ESCOPO'),'')='') then raise exception 'Vínculo inválido: use CHAPA, TIPO ESCOPO e CODIGO ESCOPO'; end if;
  if exists(select 1 from jsonb_array_elements(v_links) x where (upper(trim(x->>'TIPO ESCOPO'))='LOJA' and not exists(select 1 from jsonb_array_elements(v_stores) s where trim(s->>'COD')=trim(x->>'CODIGO ESCOPO'))) or (upper(trim(x->>'TIPO ESCOPO'))='GGL' and not exists(select 1 from jsonb_array_elements(v_regionals) g where trim(g->>'GGL')=trim(x->>'CODIGO ESCOPO')))) then raise exception 'Há vínculo para uma loja ou GGL inexistente'; end if;
  if exists(select 1 from jsonb_array_elements(v_stores) x where upper(coalesce(nullif(trim(x->>'ATIVA'),''),'SIM')) not in ('SIM','NÃO','NAO','TRUE','FALSE','1','0')) then raise exception 'O campo ATIVA deve ser SIM ou NÃO'; end if;

  update public.eo_org_import_batches set is_current=false where id<>v_batch and is_current;
  insert into public.eo_org_import_batches(id,created_by,source_name,store_count,manager_count,regional_count,people_count,assignment_count)
  values(v_batch,v_actor,trim(p_source_name),jsonb_array_length(v_stores),jsonb_array_length(v_managers),jsonb_array_length(v_regionals),jsonb_array_length(v_people),jsonb_array_length(v_links));

  for v_row in select value from jsonb_array_elements(v_regionals) loop
    insert into public.eo_regional_groups(ggl,regional_name,chapa,phone,area,email,active,import_batch,updated_at)
    values(trim(v_row->>'GGL'),left(trim(v_row->>'REGIONAL'),120),nullif(trim(v_row->>'CHAPA'),''),nullif(trim(v_row->>'TELEFONE'),''),coalesce(v_row->>'ÁREA DE ATUAÇÃO',''),nullif(trim(v_row->>'E-MAIL REAL'),''),true,v_batch,now())
    on conflict(ggl) do update set regional_name=excluded.regional_name,chapa=excluded.chapa,phone=excluded.phone,area=excluded.area,email=excluded.email,active=true,import_batch=v_batch,updated_at=now();
  end loop;
  update public.eo_regional_groups set active=false,updated_at=now() where import_batch is distinct from v_batch;

  update public.eo_stores set active=false;
  for v_row in select value from jsonb_array_elements(v_stores) loop
    insert into public.eo_stores(code,name,region,ggl,active)
    values(trim(v_row->>'COD'),left(trim(v_row->>'LOJA'),120),coalesce(v_row->>'REGIONAL',''),nullif(trim(v_row->>'GGL'),''),upper(coalesce(nullif(v_row->>'ATIVA',''),'SIM')) not in ('NÃO','NAO','FALSE','0'))
    on conflict(code) do update set name=excluded.name,region=excluded.region,ggl=excluded.ggl,active=excluded.active
    returning id into v_store_id;
    insert into public.eo_store_details(store_id,attributes,import_batch,updated_at)
    values(v_store_id,v_row,v_batch,now()) on conflict(store_id) do update set attributes=excluded.attributes,import_batch=v_batch,updated_at=now();
  end loop;
  delete from public.eo_store_managers;
  update public.eo_directory_people set active=false,updated_at=now();
  for v_row in select value from jsonb_array_elements(v_managers) loop
    insert into public.eo_directory_people(chapa,display_name,operational_role,email,phone,active,import_batch,updated_at)
    values(trim(v_row->>'CHAPA'),left(coalesce(nullif(trim(v_row->>'NOME DO GERENTE'),''),'Gerente'),120),'Gerente',nullif(trim(v_row->>'E-MAIL REAL'),''),nullif(trim(v_row->>'TELEFONE'),''),true,v_batch,now())
    on conflict(chapa) do update set display_name=excluded.display_name,operational_role='Gerente',email=excluded.email,phone=excluded.phone,active=true,import_batch=v_batch,updated_at=now();
    select id into v_store_id from public.eo_stores where code=trim(v_row->>'COD LOJA');
    insert into public.eo_store_managers(store_id,chapa,import_batch,updated_at) values(v_store_id,trim(v_row->>'CHAPA'),v_batch,now());
  end loop;
  for v_row in select value from jsonb_array_elements(v_regionals) loop
    if nullif(trim(v_row->>'CHAPA'),'') is not null then
      insert into public.eo_directory_people(chapa,display_name,operational_role,email,phone,active,import_batch,updated_at)
      values(trim(v_row->>'CHAPA'),left(trim(v_row->>'REGIONAL'),120),'Regional',nullif(trim(v_row->>'E-MAIL REAL'),''),nullif(trim(v_row->>'TELEFONE'),''),true,v_batch,now())
      on conflict(chapa) do update set display_name=excluded.display_name,operational_role=excluded.operational_role,email=excluded.email,phone=excluded.phone,active=true,import_batch=v_batch,updated_at=now();
    end if;
  end loop;
  for v_row in select value from jsonb_array_elements(v_people) loop
    if coalesce(trim(v_row->>'CHAPA'),'')<>'' then
      if trim(v_row->>'CHAPA') !~ '^[0-9]{1,20}$' or coalesce(trim(v_row->>'NOME'),'')='' or coalesce(trim(v_row->>'CARGO OPERACIONAL'),'')='' then raise exception 'Pessoa precisa de CHAPA, NOME e CARGO OPERACIONAL'; end if;
      insert into public.eo_directory_people(chapa,display_name,operational_role,email,phone,active,import_batch,updated_at)
      values(trim(v_row->>'CHAPA'),left(trim(v_row->>'NOME'),120),left(trim(v_row->>'CARGO OPERACIONAL'),80),nullif(trim(v_row->>'E-MAIL REAL'),''),nullif(trim(v_row->>'TELEFONE CELULAR'),''),upper(coalesce(nullif(v_row->>'ATIVO',''),'SIM')) not in ('NÃO','NAO','FALSE','0'),v_batch,now())
      on conflict(chapa) do update set display_name=excluded.display_name,operational_role=excluded.operational_role,email=excluded.email,phone=excluded.phone,active=excluded.active,import_batch=v_batch,updated_at=now();
    end if;
  end loop;
  delete from public.eo_org_assignments;
  insert into public.eo_org_assignments(chapa,scope_type,scope_code,active,import_batch)
  select trim(m->>'CHAPA'),'LOJA',trim(m->>'COD LOJA'),true,v_batch from jsonb_array_elements(v_managers) m
  on conflict(chapa,scope_type,scope_code) do update set active=true,import_batch=v_batch;
  insert into public.eo_org_assignments(chapa,scope_type,scope_code,active,import_batch)
  select trim(g->>'CHAPA'),'GGL',trim(g->>'GGL'),true,v_batch from jsonb_array_elements(v_regionals) g where coalesce(trim(g->>'CHAPA'),'')<>''
  on conflict(chapa,scope_type,scope_code) do update set active=true,import_batch=v_batch;
  for v_row in select value from jsonb_array_elements(v_links) loop
    insert into public.eo_org_assignments(chapa,scope_type,scope_code,active,import_batch)
    values(trim(v_row->>'CHAPA'),upper(trim(v_row->>'TIPO ESCOPO')),trim(v_row->>'CODIGO ESCOPO'),upper(coalesce(nullif(v_row->>'ATIVO',''),'SIM')) not in ('NÃO','NAO','FALSE','0'),v_batch)
    on conflict(chapa,scope_type,scope_code) do update set active=excluded.active,import_batch=v_batch;
  end loop;
  insert into public.eo_audit_events(actor,action,entity_id,detail)
  values(v_actor,'organization.imported',v_batch::text,jsonb_build_object('source',trim(p_source_name),'stores',jsonb_array_length(v_stores),'managers',jsonb_array_length(v_managers),'regionals',jsonb_array_length(v_regionals),'people',jsonb_array_length(v_people),'assignments',jsonb_array_length(v_links)));
  return jsonb_build_object('batch_id',v_batch,'stores',jsonb_array_length(v_stores),'managers',jsonb_array_length(v_managers),'regionals',jsonb_array_length(v_regionals),'people',jsonb_array_length(v_people),'assignments',jsonb_array_length(v_links));
end; $$;

create function public.eo_admin_import_status() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  if eo_private.role_of_actor() is distinct from 'admin' then raise exception 'Acesso administrativo necessário' using errcode='42501'; end if;
  return coalesce((select to_jsonb(b) from public.eo_org_import_batches b where is_current),'{}'::jsonb);
end; $$;
revoke all on function public.eo_admin_import_org(text,jsonb),public.eo_admin_import_status() from public,anon;
grant execute on function public.eo_admin_import_org(text,jsonb),public.eo_admin_import_status() to authenticated;

-- Manter a comunicação auditável e permitir ocultá-la da equipe sem apagar a cópia administrativa.
alter table public.eo_alerts add column hidden_from_users boolean not null default false;
alter table public.eo_alerts add column hidden_by uuid references public.eo_profiles(id);
alter table public.eo_alerts add column hidden_at timestamptz;

create or replace function public.eo_alert_feed() returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  if eo_private.role_of_actor() is null then raise exception 'Acesso não autorizado' using errcode='42501'; end if;
  return (select coalesce(jsonb_agg(to_jsonb(q) order by q.created_at desc),'[]') from (
    select a.id,a.title,a.body,a.urgent,a.created_at,a.hidden_from_users,r.seen_at,r.dismissed_at
    from public.eo_alert_recipients r join public.eo_alerts a on a.id=r.alert_id
    where r.user_id=auth.uid() and (not a.hidden_from_users or eo_private.role_of_actor()='admin')
    order by a.created_at desc limit 100
  ) q);
end; $$;

create or replace function public.eo_publish_alert(p_title text,p_body text,p_stores uuid[],p_urgent boolean default false) returns uuid
language plpgsql security definer set search_path='' as $$
declare v_id uuid := gen_random_uuid(); v_role text := eo_private.role_of_actor(); v_store_codes jsonb;
begin
  if v_role not in ('admin','diretor','gerente') or v_role is null then raise exception 'Publicação não autorizada' using errcode='42501'; end if;
  if coalesce(cardinality(p_stores),0)=0 or cardinality(p_stores)>2000 or length(trim(p_title)) not between 3 and 120 or length(trim(p_body)) not between 1 and 3000 then raise exception 'Revise título, mensagem e lojas'; end if;
  if exists(select 1 from unnest(p_stores) s where not eo_private.has_store(s)) then raise exception 'Loja fora da abrangência' using errcode='42501'; end if;
  select coalesce(jsonb_agg(code order by code),'[]'::jsonb) into v_store_codes from public.eo_stores where id=any(p_stores);
  insert into public.eo_alerts(id,created_by,title,body,urgent) values(v_id,auth.uid(),trim(p_title),trim(p_body),coalesce(p_urgent,false));
  insert into public.eo_alert_stores select distinct v_id,s from unnest(p_stores) s;
  insert into public.eo_alert_recipients(alert_id,user_id)
    select v_id,p.id from public.eo_profiles p where p.active and (p.role='admin' or exists(select 1 from public.eo_store_members m where m.user_id=p.id and m.store_id=any(p_stores)) or exists(select 1 from public.eo_org_assignments a where a.active and a.chapa=p.login_chapa and ((a.scope_type='LOJA' and a.scope_code in (select code from public.eo_stores where id=any(p_stores))) or (a.scope_type='GGL' and a.scope_code in (select ggl from public.eo_stores where id=any(p_stores))))));
  insert into public.eo_audit_events(actor,action,entity_id,detail)
    values(auth.uid(),'alert.published',v_id::text,jsonb_build_object('title',trim(p_title),'body',trim(p_body),'urgent',coalesce(p_urgent,false),'store_codes',v_store_codes,'recipient_count',(select count(*) from public.eo_alert_recipients where alert_id=v_id)));
  return v_id;
end; $$;

create function public.eo_admin_hide_alert(p_alert uuid,p_hidden boolean default true) returns void
language plpgsql security definer set search_path='' as $$
begin
  if eo_private.role_of_actor() is distinct from 'admin' then raise exception 'Acesso administrativo necessário' using errcode='42501'; end if;
  update public.eo_alerts set hidden_from_users=coalesce(p_hidden,true),hidden_by=auth.uid(),hidden_at=now() where id=p_alert;
  if not found then raise exception 'Mensagem não encontrada'; end if;
  insert into public.eo_audit_events(actor,action,entity_id,detail)
    values(auth.uid(),case when p_hidden then 'alert.hidden_from_users' else 'alert.restored_for_users' end,p_alert::text,'{}');
end; $$;
revoke all on function public.eo_admin_hide_alert(uuid,boolean) from public,anon;
grant execute on function public.eo_admin_hide_alert(uuid,boolean) to authenticated;

insert into eo_private.schema_migrations(version) values('202611020001_org_import');
commit;

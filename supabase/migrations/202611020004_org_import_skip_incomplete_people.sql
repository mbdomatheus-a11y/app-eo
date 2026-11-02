-- Ignora pessoas sem CHAPA numérica, nome e cargo, mantendo a importação das demais abas.
-- Substitui somente a função organizacional existente.
create or replace function public.eo_admin_import_org(p_source_name text,p_payload jsonb)
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
  -- Linhas vazias ou incompletas de Pessoas não invalidam a carga das lojas.
  select coalesce(jsonb_agg(p.value),'[]'::jsonb) into v_people
  from jsonb_array_elements(v_people) as p(value)
  where coalesce(trim(p.value->>'CHAPA'),'') ~ '^[0-9]{1,20}$'
    and coalesce(trim(p.value->>'NOME'),'')<>''
    and coalesce(trim(p.value->>'CARGO OPERACIONAL'),'')<>'';
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

  update public.eo_stores set active=false where active=true;
  for v_row in select value from jsonb_array_elements(v_stores) loop
    insert into public.eo_stores(code,name,region,ggl,active)
    values(trim(v_row->>'COD'),left(trim(v_row->>'LOJA'),120),coalesce(v_row->>'REGIONAL',''),nullif(trim(v_row->>'GGL'),''),upper(coalesce(nullif(v_row->>'ATIVA',''),'SIM')) not in ('NÃO','NAO','FALSE','0'))
    on conflict(code) do update set name=excluded.name,region=excluded.region,ggl=excluded.ggl,active=excluded.active
    returning id into v_store_id;
    insert into public.eo_store_details(store_id,attributes,import_batch,updated_at)
    values(v_store_id,v_row,v_batch,now()) on conflict(store_id) do update set attributes=excluded.attributes,import_batch=v_batch,updated_at=now();
  end loop;
  delete from public.eo_store_managers where store_id is not null;
  update public.eo_directory_people set active=false,updated_at=now() where active=true;
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
  delete from public.eo_org_assignments where chapa is not null;
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

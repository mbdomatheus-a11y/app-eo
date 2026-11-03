-- Segmentação segura para comunicação/relatórios e consulta editável da base.
create or replace function public.eo_context() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare v_person jsonb; v_stores jsonb;
begin
  if eo_private.role_of_actor() is null then
    raise exception 'Acesso não liberado. Solicite autorização à administração.' using errcode='42501';
  end if;
  select jsonb_build_object('id',id,'name',display_name,'role',role,'master_admin',master_admin)
    into v_person from public.eo_profiles where id=(select auth.uid());
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',s.id,'code',s.code,'name',s.name,'region',s.region,
    'team_count',(select count(distinct p.id) from public.eo_profiles p where p.active and p.role<>'admin' and
      (exists(select 1 from public.eo_store_members m where m.user_id=p.id and m.store_id=s.id) or exists(
        select 1 from public.eo_org_assignments a where a.active and a.chapa=p.login_chapa and
        ((a.scope_type='LOJA' and a.scope_code=s.code) or (a.scope_type='GGL' and a.scope_code=s.ggl))))),
    'segments', jsonb_strip_nulls(jsonb_build_object(
      'GGL',nullif(s.ggl,''),'REGIONAL',coalesce(nullif(g.regional_name,''),nullif(s.region,'')),
      'UF',nullif(d.attributes->>'UF',''),'CIDADE',nullif(d.attributes->>'CIDADE',''),
      'SAFRA',nullif(d.attributes->>'SAFRA',''),'GRUPO_CIDADE',nullif(d.attributes->>'Grupo Cidade',''),
      'POPULACAO',nullif(d.attributes->>'População',''),'GRUPO_LOJA',nullif(d.attributes->>'GRUPO_LOJA',''),
      'CLIMA',nullif(d.attributes->>'CLIMA',''),'PERFIL_PRECO',nullif(d.attributes->>'PERFIL_PRECO',''),
      'CLUSTERS_VEST_26',nullif(d.attributes->>'CLUSTERS VEST 26',''),
      'CLUSTERS_VEST_10_25',nullif(d.attributes->>'CLUSTERS VEST 10/25',''),
      'RE_VAREJO_24',nullif(d.attributes->>'RE VAREJO 24',''),'STATUS_RE_24',nullif(d.attributes->>'STATUS RE 24',''),
      'LATITUDE',nullif(d.attributes->>'LATITUDE',''),'LONGITUDE',nullif(d.attributes->>'LONGITUDE',''),
      'COORDENADAS',case when nullif(d.attributes->>'LATITUDE','') is not null and nullif(d.attributes->>'LONGITUDE','') is not null then (d.attributes->>'LATITUDE')||', '||(d.attributes->>'LONGITUDE') end,
      'TIPO',nullif(d.attributes->>'TIPO',''),'AT',nullif(d.attributes->>'A.T. CONSTRUÍDO',''),
      'TOTAL_VENDAS',coalesce(nullif(d.attributes->>'TOTAL VENDAS (VENDA 12 MESES 2025)',''),nullif(d.attributes->>'TOTAL VENDAS (TAMANHO)','')),
      'PORTE_VENDAS',nullif(d.attributes->>'PORTE (VENDAS)','')
    ))) order by s.code),'[]'::jsonb)
    into v_stores
  from public.eo_stores s
  left join public.eo_store_details d on d.store_id=s.id
  left join public.eo_regional_groups g on g.ggl=s.ggl
  where s.active and eo_private.has_store(s.id);
  return jsonb_build_object('person',v_person,'stores',v_stores,
    'settings',(select to_jsonb(x) from public.eo_settings x where id=true));
end; $$;

create or replace function public.eo_admin_imported_stores()
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  if eo_private.role_of_actor() is distinct from 'admin' then
    raise exception 'Acesso administrativo necessário' using errcode='42501';
  end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
    'id',s.id,'code',s.code,'name',s.name,'region',s.region,'ggl',s.ggl,
    'attributes',coalesce(d.attributes,'{}'::jsonb),
    'manager_chapa',m.chapa,'manager_name',p.display_name,'manager_phone',p.phone
  ) order by s.code)
  from public.eo_stores s left join public.eo_store_details d on d.store_id=s.id
  left join public.eo_store_managers m on m.store_id=s.id
  left join public.eo_directory_people p on p.chapa=m.chapa where s.active),'[]'::jsonb);
end; $$;

create or replace function public.eo_admin_export_org()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_out jsonb;
begin
  if eo_private.role_of_actor() is distinct from 'admin' then raise exception 'Acesso administrativo necessário' using errcode='42501'; end if;
  select jsonb_build_object(
    'Lojas',coalesce((select jsonb_agg(coalesce(d.attributes,'{}'::jsonb)||jsonb_build_object('COD',s.code,'LOJA',s.name,'REGIONAL',coalesce(g.regional_name,s.region),'GGL',s.ggl) order by s.code) from public.eo_stores s left join public.eo_store_details d on d.store_id=s.id left join public.eo_regional_groups g on g.ggl=s.ggl where s.active),'[]'::jsonb),
    'Gerentes',coalesce((select jsonb_agg(jsonb_build_object('CHAPA',m.chapa,'COD LOJA',s.code,'NOME',p.display_name,'TELEFONE',p.phone,'EMAIL',p.email) order by s.code) from public.eo_store_managers m join public.eo_stores s on s.id=m.store_id join public.eo_directory_people p on p.chapa=m.chapa where s.active),'[]'::jsonb),
    'Regionais',coalesce((select jsonb_agg(jsonb_build_object('GGL',ggl,'REGIONAL',regional_name,'CHAPA',chapa,'TELEFONE',phone,'ÁREA ATUAÇÃO',area) order by ggl) from public.eo_regional_groups where active),'[]'::jsonb),
    'Pessoas',coalesce((select jsonb_agg(jsonb_build_object('CHAPA',chapa,'NOME',display_name,'CARGO OPERACIONAL',operational_role,'EMAIL',email,'TELEFONE',phone) order by chapa) from public.eo_directory_people where active),'[]'::jsonb),
    'Vinculos',coalesce((select jsonb_agg(jsonb_build_object('CHAPA',chapa,'TIPO ESCOPO',scope_type,'CODIGO ESCOPO',scope_code) order by chapa,scope_type,scope_code) from public.eo_org_assignments where active),'[]'::jsonb)
  ) into v_out;
  return v_out;
end; $$;

create or replace function public.eo_admin_update_store_attributes(p_store uuid,p_attributes jsonb)
returns void language plpgsql security definer set search_path='' as $$
declare v_old jsonb; v_actor uuid := (select auth.uid()); v_code text; v_name text; v_region text; v_ggl text;
begin
  if eo_private.role_of_actor() is distinct from 'admin' then raise exception 'Acesso administrativo necessário' using errcode='42501'; end if;
  if jsonb_typeof(p_attributes) is distinct from 'object' or octet_length(p_attributes::text)>30000 then raise exception 'Dados da loja inválidos'; end if;
  select coalesce(d.attributes,'{}'::jsonb),s.code,s.name,s.region,s.ggl into v_old,v_code,v_name,v_region,v_ggl
    from public.eo_stores s left join public.eo_store_details d on d.store_id=s.id where s.id=p_store and s.active for update of s;
  if not found then raise exception 'Loja não encontrada'; end if;
  if exists(select 1 from jsonb_object_keys(p_attributes) k where not (v_old ? k) and k not in ('COD','LOJA','REGIONAL','GGL','CHAPA GERENTE','NOME DO GERENTE','TELEFONE')) then raise exception 'A edição só pode alterar colunas já existentes na base'; end if;
  if p_attributes ? 'COD' then v_code:=nullif(trim(p_attributes->>'COD'),''); end if;
  if p_attributes ? 'LOJA' then v_name:=nullif(trim(p_attributes->>'LOJA'),''); end if;
  if p_attributes ? 'REGIONAL' then v_region:=nullif(trim(p_attributes->>'REGIONAL'),''); end if;
  if p_attributes ? 'GGL' then v_ggl:=nullif(trim(p_attributes->>'GGL'),''); end if;
  if v_code is null or v_name is null then raise exception 'COD e LOJA são obrigatórios'; end if;
  if exists(select 1 from public.eo_stores where code=v_code and id<>p_store) then raise exception 'COD já pertence a outra loja'; end if;
  if v_ggl is not null and not exists(select 1 from public.eo_regional_groups where ggl=v_ggl and active) then raise exception 'GGL não corresponde a uma regional ativa'; end if;
  insert into public.eo_store_details(store_id,attributes,import_batch,updated_at)
    values(p_store,v_old||(p_attributes-'CHAPA GERENTE'-'NOME DO GERENTE'-'TELEFONE'),(select id from public.eo_org_import_batches where is_current limit 1),now())
  on conflict(store_id) do update set attributes=excluded.attributes,updated_at=now();
  update public.eo_stores set code=v_code,name=v_name,region=coalesce(v_region,''),ggl=v_ggl where id=p_store;
  if p_attributes ? 'CHAPA GERENTE' or p_attributes ? 'NOME DO GERENTE' or p_attributes ? 'TELEFONE' then
    if nullif(trim(p_attributes->>'CHAPA GERENTE'),'') is not null and trim(p_attributes->>'CHAPA GERENTE') !~ '^[0-9]{1,20}$' then raise exception 'CHAPA do gerente deve ser numérica'; end if;
    if p_attributes ? 'CHAPA GERENTE' and nullif(trim(p_attributes->>'CHAPA GERENTE'),'') is not null then
      if not exists(select 1 from public.eo_directory_people where chapa=trim(p_attributes->>'CHAPA GERENTE')) then raise exception 'Cadastre a nova chapa na aba Pessoas antes de associá-la'; end if;
      update public.eo_store_managers set chapa=trim(p_attributes->>'CHAPA GERENTE') where store_id=p_store;
    end if;
    update public.eo_directory_people p set display_name=coalesce(nullif(trim(p_attributes->>'NOME DO GERENTE'),''),p.display_name),
      phone=case when p_attributes ? 'TELEFONE' then nullif(trim(p_attributes->>'TELEFONE'),'') else p.phone end
    where p.chapa=(select m.chapa from public.eo_store_managers m where m.store_id=p_store);
  end if;
  insert into public.eo_audit_events(actor,action,entity_id,detail) values(v_actor,'organization.store_edited',p_store::text,
    jsonb_build_object('changed_columns', (select coalesce(jsonb_agg(k),'[]'::jsonb) from jsonb_object_keys(p_attributes) k)));
end; $$;

drop function if exists public.eo_admin_notice_report(uuid,integer,text);
create function public.eo_admin_notice_report(
  p_notice uuid,p_version integer,p_group_by text default 'regional',
  p_segment_by text default null,p_segment_values text[] default '{}'
) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_groups jsonb; v_total integer; v_read integer; v_full integer; v_key text;
begin
  if eo_private.role_of_actor() is distinct from 'admin' then raise exception 'Acesso administrativo necessário' using errcode='42501'; end if;
  if p_group_by not in ('regional','loja','ggl','uf','cidade','tipo','clima','perfil_preco','grupo_loja','safra') then raise exception 'Agrupamento inválido'; end if;
  if p_segment_by is not null and p_segment_by not in ('regional','ggl','uf','cidade','safra','grupo_cidade','populacao','grupo_loja','clima','perfil_preco','clusters_vest_26','clusters_vest_10_25','re_varejo_24','status_re_24','latitude','longitude','coordenadas','tipo','at','total_vendas','porte_vendas') then raise exception 'Segmentação inválida'; end if;
  if not exists(select 1 from public.eo_notice_versions where notice_id=p_notice and version=p_version) then raise exception 'Comunicado não encontrado'; end if;
  v_key:=case p_segment_by when 'regional' then 'REGIONAL' when 'ggl' then 'GGL' when 'uf' then 'UF' when 'cidade' then 'CIDADE' when 'safra' then 'SAFRA' when 'grupo_cidade' then 'GRUPO_CIDADE' when 'populacao' then 'POPULACAO' when 'grupo_loja' then 'GRUPO_LOJA' when 'clima' then 'CLIMA' when 'perfil_preco' then 'PERFIL_PRECO' when 'clusters_vest_26' then 'CLUSTERS_VEST_26' when 'clusters_vest_10_25' then 'CLUSTERS_VEST_10_25' when 're_varejo_24' then 'RE_VAREJO_24' when 'status_re_24' then 'STATUS_RE_24' when 'latitude' then 'LATITUDE' when 'longitude' then 'LONGITUDE' when 'coordenadas' then 'COORDENADAS' when 'tipo' then 'TIPO' when 'at' then 'AT' when 'total_vendas' then 'TOTAL_VENDAS' when 'porte_vendas' then 'PORTE_VENDAS' end;
  with targeted as (
    select distinct s.id,s.code,s.name,s.region,s.ggl,coalesce(d.attributes,'{}'::jsonb) a,
      coalesce(nullif(g.regional_name,''),nullif(s.region,''),'Sem regional') regional,
      jsonb_strip_nulls(jsonb_build_object('GGL',nullif(s.ggl,''),'REGIONAL',coalesce(nullif(g.regional_name,''),nullif(s.region,'')),
      'UF',nullif(d.attributes->>'UF',''),'CIDADE',nullif(d.attributes->>'CIDADE',''),'SAFRA',nullif(d.attributes->>'SAFRA',''),
      'GRUPO_CIDADE',nullif(d.attributes->>'Grupo Cidade',''),'POPULACAO',nullif(d.attributes->>'População',''),
      'GRUPO_LOJA',nullif(d.attributes->>'GRUPO_LOJA',''),'CLIMA',nullif(d.attributes->>'CLIMA',''),
      'PERFIL_PRECO',nullif(d.attributes->>'PERFIL_PRECO',''),'CLUSTERS_VEST_26',nullif(d.attributes->>'CLUSTERS VEST 26',''),
      'CLUSTERS_VEST_10_25',nullif(d.attributes->>'CLUSTERS VEST 10/25',''),'RE_VAREJO_24',nullif(d.attributes->>'RE VAREJO 24',''),
      'STATUS_RE_24',nullif(d.attributes->>'STATUS RE 24',''),'LATITUDE',nullif(d.attributes->>'LATITUDE',''),'LONGITUDE',nullif(d.attributes->>'LONGITUDE',''),
      'COORDENADAS',case when nullif(d.attributes->>'LATITUDE','') is not null and nullif(d.attributes->>'LONGITUDE','') is not null then d.attributes->>'LATITUDE'||', '||d.attributes->>'LONGITUDE' end,
      'TIPO',nullif(d.attributes->>'TIPO',''),'AT',nullif(d.attributes->>'A.T. CONSTRUÍDO',''),
      'TOTAL_VENDAS',coalesce(nullif(d.attributes->>'TOTAL VENDAS (VENDA 12 MESES 2025)',''),nullif(d.attributes->>'TOTAL VENDAS (TAMANHO)','')),
      'PORTE_VENDAS',nullif(d.attributes->>'PORTE (VENDAS)',''))) seg
    from public.eo_notice_stores ns join public.eo_stores s on s.id=ns.store_id
    left join public.eo_store_details d on d.store_id=s.id left join public.eo_regional_groups g on g.ggl=s.ggl
    where ns.notice_id=p_notice and ns.version=p_version
  ), eligible as (
    select t.*,coalesce(x.eligible,0) eligible,coalesce(x.confirmed,0) confirmed
    from targeted t left join lateral (
      select count(distinct nr.user_id) eligible,count(distinct rc.user_id) confirmed
      from public.eo_notice_recipients nr join public.eo_profiles p on p.id=nr.user_id and p.role<>'admin'
      left join public.eo_notice_receipts rc on rc.notice_id=nr.notice_id and rc.version=nr.version and rc.user_id=nr.user_id
      where nr.notice_id=p_notice and nr.version=p_version and (exists(select 1 from public.eo_store_members m where m.user_id=p.id and m.store_id=t.id)
      or exists(select 1 from public.eo_org_assignments a where a.active and a.chapa=p.login_chapa and ((a.scope_type='LOJA' and a.scope_code=t.code) or (a.scope_type='GGL' and a.scope_code=t.ggl))))
    ) x on true
  ), filtered as (select * from eligible where p_segment_by is null or coalesce(seg->>v_key,'')=any(coalesce(p_segment_values,'{}'))), labeled as (
    select *,case p_group_by when 'regional' then regional when 'loja' then code||' · '||name when 'ggl' then coalesce(nullif(ggl,''),'Sem GGL')
      when 'uf' then coalesce(nullif(a->>'UF',''),'Sem UF') when 'cidade' then coalesce(nullif(a->>'CIDADE',''),'Sem cidade')
      when 'tipo' then coalesce(nullif(a->>'TIPO',''),'Sem tipo') when 'clima' then coalesce(nullif(a->>'CLIMA',''),'Sem clima')
      when 'perfil_preco' then coalesce(nullif(a->>'PERFIL_PRECO',''),'Sem perfil') when 'grupo_loja' then coalesce(nullif(a->>'GRUPO_LOJA',''),'Sem grupo')
      when 'safra' then coalesce(nullif(a->>'SAFRA',''),'Sem safra') end group_name from filtered
  )
  select count(*),count(*) filter(where confirmed>0),count(*) filter(where eligible>0 and confirmed=eligible),
    coalesce(jsonb_agg(jsonb_build_object('group',q.group_name,'total_stores',q.total_stores,'stores_with_read',q.stores_with_read,
    'stores_fully_read',q.stores_fully_read,'stores_pending',q.total_stores-q.stores_with_read) order by q.group_name),'[]'::jsonb)
  into v_total,v_read,v_full,v_groups from (select group_name,count(*) total_stores,count(*) filter(where confirmed>0) stores_with_read,
    count(*) filter(where eligible>0 and confirmed=eligible) stores_fully_read from labeled group by group_name) q;
  return jsonb_build_object('notice_id',p_notice,'version',p_version,'group_by',p_group_by,'segment_by',p_segment_by,
    'segment_values',coalesce(p_segment_values,'{}'),'total_stores',coalesce(v_total,0),'stores_with_read',coalesce(v_read,0),
    'stores_fully_read',coalesce(v_full,0),'stores_pending',coalesce(v_total-v_read,0),
    'read_rule','Ao menos uma pessoa destinatária confirmou a ciência.','groups',coalesce(v_groups,'[]'::jsonb));
end; $$;

revoke all on function public.eo_admin_imported_stores(),public.eo_admin_export_org(),public.eo_admin_update_store_attributes(uuid,jsonb),public.eo_admin_notice_report(uuid,integer,text,text,text[]) from public,anon;
grant execute on function public.eo_admin_imported_stores(),public.eo_admin_export_org(),public.eo_admin_update_store_attributes(uuid,jsonb),public.eo_admin_notice_report(uuid,integer,text,text,text[]) to authenticated;
notify pgrst, 'reload schema';
insert into eo_private.schema_migrations(version) values ('202611020007') on conflict(version) do nothing;

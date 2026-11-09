begin;
create or replace function public.eo_admin_notice_report(
  p_notice uuid,p_version integer,p_group_by text default 'regional',
  p_segment_by text default null,p_segment_values text[] default '{}'
) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_groups jsonb; v_total integer; v_read integer; v_full integer; v_key text;
begin
  perform public.eo_require_module('notices');
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
      'COORDENADAS',case when nullif(d.attributes->>'LATITUDE','') is not null and nullif(d.attributes->>'LONGITUDE','') is not null then (d.attributes->>'LATITUDE')||', '||(d.attributes->>'LONGITUDE') end,
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
  ), filtered as (select * from eligible where p_segment_by is null or coalesce(cardinality(p_segment_values),0)=0 or coalesce(seg->>v_key,'')=any(coalesce(p_segment_values,'{}'))), labeled as (
    select *,case p_group_by when 'regional' then regional when 'loja' then code||' · '||name when 'ggl' then coalesce(nullif(ggl,''),'Sem GGL')
      when 'uf' then coalesce(nullif(a->>'UF',''),'Sem UF') when 'cidade' then coalesce(nullif(a->>'CIDADE',''),'Sem cidade')
      when 'tipo' then coalesce(nullif(a->>'TIPO',''),'Sem tipo') when 'clima' then coalesce(nullif(a->>'CLIMA',''),'Sem clima')
      when 'perfil_preco' then coalesce(nullif(a->>'PERFIL_PRECO',''),'Sem perfil') when 'grupo_loja' then coalesce(nullif(a->>'GRUPO_LOJA',''),'Sem grupo')
      when 'safra' then coalesce(nullif(a->>'SAFRA',''),'Sem safra') end group_name from filtered
  )
  select coalesce(sum(q.total_stores),0),coalesce(sum(q.stores_with_read),0),coalesce(sum(q.stores_fully_read),0),
    coalesce(jsonb_agg(jsonb_build_object('group',q.group_name,'total_stores',q.total_stores,'stores_with_read',q.stores_with_read,
    'stores_fully_read',q.stores_fully_read,'stores_pending',q.total_stores-q.stores_with_read) order by q.group_name),'[]'::jsonb)
  into v_total,v_read,v_full,v_groups from (select group_name,count(*) total_stores,count(*) filter(where confirmed>0) stores_with_read,
    count(*) filter(where eligible>0 and confirmed=eligible) stores_fully_read from labeled group by group_name) q;
  return jsonb_build_object('notice_id',p_notice,'version',p_version,'group_by',p_group_by,'segment_by',p_segment_by,
    'segment_values',coalesce(p_segment_values,'{}'),'total_stores',coalesce(v_total,0),'stores_with_read',coalesce(v_read,0),
    'stores_fully_read',coalesce(v_full,0),'stores_pending',coalesce(v_total-v_read,0),
    'read_rule','Ao menos uma pessoa destinatária confirmou a ciência.','groups',coalesce(v_groups,'[]'::jsonb));
end; $$;
insert into eo_private.schema_migrations(version) values('202611090016_notice_report_totals') on conflict do nothing;
notify pgrst, 'reload schema';
commit;

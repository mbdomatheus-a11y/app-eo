begin;
alter table public.eo_profiles add column unit_type text not null default 'administracao'
  check(unit_type in ('loja','ec','cda','administracao')),
  add column deleted_at timestamptz, add column deletion_protected boolean not null default false;
update public.eo_profiles set deletion_protected=true where login_chapa='330023';
update public.eo_profiles p set unit_type='loja' where exists(select 1 from public.eo_store_members m where m.user_id=p.id)
 or exists(select 1 from public.eo_org_assignments a where a.chapa=p.login_chapa and a.active);
-- Chapa 330023 explicitamente definida por Matheus na unidade Administração.
update public.eo_profiles set unit_type='administracao' where login_chapa='330023';
-- O legado sem loja fica em Administração, sem inventar vínculos físicos.
create table public.eo_identity_preferences (
 id boolean primary key default true check(id), organization_name text not null default 'EO',
 email_domains text[] not null default '{}', require_email boolean not null default false,
 updated_at timestamptz not null default now()
);
insert into public.eo_identity_preferences(id) values(true);
alter table public.eo_identity_preferences enable row level security;
revoke all on public.eo_identity_preferences from public,anon,authenticated;

create function eo_private.identity_guard() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if TG_OP='DELETE' then
  if old.deletion_protected then raise exception 'A chapa master 330023 não pode ser excluída'; end if;
  raise exception 'Preserve a auditoria: utilize a exclusão administrativa';
 end if;
 if TG_OP='UPDATE' and old.deletion_protected and (not new.deletion_protected or new.deleted_at is not null) then raise exception 'O acesso master não pode ser excluído'; end if;
 if new.deleted_at is not null and new.active then raise exception 'Acesso excluído não pode ser reativado'; end if;
 if new.active and new.unit_type='loja' and not exists(select 1 from public.eo_store_members where user_id=new.id)
  and not exists(select 1 from public.eo_org_assignments where chapa=new.login_chapa and active) then
  raise exception 'Usuário ativo precisa de uma loja vinculada';
 end if;
 return new;
end; $$;
create trigger eo_identity_guard before insert or update or delete on public.eo_profiles for each row execute function eo_private.identity_guard();

create function public.eo_admin_identity_preferences(p_domains text[] default null,p_require_email boolean default null,p_organization text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_domains text[];
begin
 if eo_private.role_of_actor() is distinct from 'admin' then raise exception 'Acesso administrativo necessário' using errcode='42501'; end if;
 if p_domains is not null or p_require_email is not null or p_organization is not null then
  select coalesce(array_agg(distinct lower(trim(d))),'{}') into v_domains from unnest(p_domains) d;
  if exists(select 1 from unnest(v_domains) d where length(d)>253 or d !~ '^[a-z0-9]([a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}$' or d like '%..%') then raise exception 'Domínio de e-mail inválido'; end if;
  if p_organization is not null and length(trim(p_organization)) not between 2 and 120 then raise exception 'Organização inválida'; end if;
  update public.eo_identity_preferences set email_domains=case when p_domains is null then email_domains else v_domains end,require_email=coalesce(p_require_email,require_email),organization_name=coalesce(trim(p_organization),organization_name),updated_at=now() where id;
  if p_domains is not null then update public.eo_identity_preferences set email_domains=v_domains where id; end if;
  insert into public.eo_audit_events(actor,action,entity_id) values(auth.uid(),'identity.preferences_updated','organization');
 end if;
 return (select to_jsonb(p) from public.eo_identity_preferences p where id);
end; $$;

create function public.eo_admin_delete_person(p_user uuid) returns void language plpgsql security definer set search_path='' as $$
declare v_person public.eo_profiles%rowtype;
begin
 perform pg_advisory_xact_lock(hashtext('eo-admin-access-mutations'));
 if eo_private.role_of_actor() is distinct from 'admin' then raise exception 'Acesso administrativo necessário' using errcode='42501'; end if;
 select * into v_person from public.eo_profiles where id=p_user for update;
 if not found then raise exception 'Pessoa não encontrada'; end if;
 if v_person.deletion_protected or p_user=auth.uid() then raise exception 'Este acesso não pode ser excluído'; end if;
 if v_person.deleted_at is not null then return; end if;
 update public.eo_profiles set active=false,deleted_at=now() where id=p_user;
 update public.eo_org_assignments set active=false where chapa=v_person.login_chapa and active;
 insert into public.eo_audit_events(actor,action,entity_id,detail) values(auth.uid(),'member.deleted',p_user::text,
 jsonb_build_object('chapa',v_person.login_chapa,'name',v_person.display_name,'role',v_person.role,'unit_type',v_person.unit_type,'preserved_history',true));
end; $$;

create function public.eo_admin_set_person_unit(p_user uuid,p_unit_type text) returns void language plpgsql security definer set search_path='' as $$
begin
 if eo_private.role_of_actor() is distinct from 'admin' then raise exception 'Acesso administrativo necessário' using errcode='42501'; end if;
 if p_unit_type is null or p_unit_type not in ('loja','ec','cda','administracao') then raise exception 'Unidade inválida'; end if;
 update public.eo_profiles set unit_type=p_unit_type where id=p_user and deleted_at is null;
 if not found then raise exception 'Pessoa não encontrada'; end if;
 insert into public.eo_audit_events(actor,action,entity_id,detail) values(auth.uid(),'member.unit_updated',p_user::text,jsonb_build_object('unit_type',p_unit_type));
end; $$;
drop function public.eo_admin_update_person(uuid,text,text,text,uuid[],boolean);
create or replace function public.eo_admin_update_person(
  p_user uuid, p_name text, p_role text, p_chapa text, p_stores uuid[], p_active boolean, p_unit_type text default null
) returns void language plpgsql security definer set search_path='' as $$
declare v_target public.eo_profiles%rowtype; v_stores uuid[];
begin
  -- Serializa alterações entre administradores e revalida a autorização após a espera.
  perform pg_advisory_xact_lock(hashtext('eo-admin-access-mutations'));
  if eo_private.role_of_actor() is distinct from 'admin' then raise exception 'Acesso administrativo necessário' using errcode='42501'; end if;
  select * into v_target from public.eo_profiles where id=p_user for update;
  if not found then raise exception 'Pessoa não encontrada'; end if;
  if v_target.deleted_at is not null then raise exception 'Pessoa excluída'; end if;
  if p_user=(select auth.uid()) then raise exception 'Seu próprio acesso é protegido contra remoção e alteração administrativa'; end if;
  if p_role is null or p_role not in ('colaborador','gerente','diretor','admin') or p_active is null then raise exception 'Perfil ou estado inválido'; end if;
  if p_name is null or length(trim(p_name)) not between 2 and 120 then raise exception 'Nome inválido'; end if;
  if trim(p_chapa) is distinct from v_target.login_chapa then raise exception 'A chapa não pode ser alterada: ela identifica o login. Crie outro acesso e arquive o anterior se necessário'; end if;
  select coalesce(array_agg(distinct s),'{}'::uuid[]) into v_stores from unnest(p_stores) s;
  if exists(select 1 from unnest(v_stores) x where not exists(select 1 from public.eo_stores s where s.id=x)) then raise exception 'Loja inválida'; end if;
  delete from public.eo_store_members where user_id=p_user;
  insert into public.eo_store_members(user_id,store_id) select p_user,s from unnest(v_stores) s;
  -- A edição individual assume os vínculos; evita que um vínculo importado
  -- continue concedendo silenciosamente uma loja removida pelo administrador.
  update public.eo_profiles set display_name=trim(p_name),role=p_role,active=p_active,
    unit_type=coalesce(p_unit_type,case when p_role='admin' and cardinality(v_stores)=0 then 'administracao' else unit_type end),
    master_admin=case when p_role='admin' then master_admin else false end where id=p_user;
  update public.eo_org_assignments set active=false where chapa=v_target.login_chapa and active;
  insert into public.eo_audit_events(actor,action,entity_id,detail) values((select auth.uid()),'member.access_updated',p_user::text,
    jsonb_build_object('previous_role',v_target.role,'role',p_role,'previous_active',v_target.active,'active',p_active,'store_count',cardinality(v_stores)));
end; $$;


revoke all on function public.eo_admin_update_person(uuid,text,text,text,uuid[],boolean,text) from public,anon;
grant execute on function public.eo_admin_update_person(uuid,text,text,text,uuid[],boolean,text) to authenticated;
create or replace function public.eo_admin_people_page(
  p_search text default '', p_role text default '', p_state text default '',
  p_region text default '', p_uf text default '', p_limit integer default 30,
  p_offset integer default 0, p_sort text default 'name', p_user uuid default null
) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_result jsonb;
begin
  if eo_private.role_of_actor() is distinct from 'admin' then raise exception 'Acesso administrativo necessário' using errcode='42501'; end if;
  with filtered as (
    select p.id,p.display_name,p.role,p.login_chapa,p.contact_email,p.active,p.master_admin,p.must_change_password,p.unit_type,p.deleted_at,p.deletion_protected,
      coalesce((select jsonb_agg(s.id order by s.code) from public.eo_stores s where
        exists(select 1 from public.eo_store_members m where m.user_id=p.id and m.store_id=s.id)
        or exists(select 1 from public.eo_org_assignments a where a.active and a.chapa=p.login_chapa and ((a.scope_type='LOJA' and a.scope_code=s.code) or (a.scope_type='GGL' and a.scope_code=s.ggl)))),'[]'::jsonb) stores
    from public.eo_profiles p
    where p.deleted_at is null and (p_user is null or p.id=p_user)
      and (coalesce(p_search,'')='' or concat_ws(' ',p.display_name,p.login_chapa,p.contact_email) ilike '%'||left(p_search,120)||'%')
      and (coalesce(p_role,'')='' or p.role=p_role)
      and (coalesce(p_state,'')='' or (p_state='active' and p.active) or (p_state='archived' and not p.active) or (p_state='pending' and p.active and p.must_change_password))
      and ((coalesce(p_region,'')='' and coalesce(p_uf,'')='') or exists(
        select 1 from public.eo_stores s left join public.eo_store_details d on d.store_id=s.id left join public.eo_regional_groups g on g.ggl=s.ggl
        where (p.role='admin' or exists(select 1 from public.eo_store_members m where m.user_id=p.id and m.store_id=s.id)
          or exists(select 1 from public.eo_org_assignments a where a.active and a.chapa=p.login_chapa and ((a.scope_type='LOJA' and a.scope_code=s.code) or (a.scope_type='GGL' and a.scope_code=s.ggl))))
          and (coalesce(p_region,'')='' or coalesce(nullif(g.regional_name,''),s.region)=p_region)
          and (coalesce(p_uf,'')='' or d.attributes->>'UF'=p_uf)))
  ), paged as (
    select * from filtered order by
      case when p_sort='chapa' then login_chapa end,
      case when p_sort='role' then role end,
      lower(display_name),id limit greatest(1,least(coalesce(p_limit,30),100)) offset greatest(0,coalesce(p_offset,0))
  ) select jsonb_build_object('items',coalesce((select jsonb_agg(to_jsonb(p)) from paged p),'[]'::jsonb),'total',(select count(*) from filtered)) into v_result;
  return v_result;
end; $$;


revoke all on function public.eo_admin_delete_person(uuid),public.eo_admin_set_person_unit(uuid,text),public.eo_admin_identity_preferences(text[],boolean,text) from public,anon;
grant execute on function public.eo_admin_delete_person(uuid),public.eo_admin_set_person_unit(uuid,text),public.eo_admin_identity_preferences(text[],boolean,text) to authenticated;
grant select on public.eo_identity_preferences to service_role;
-- Corrige precedência entre concatenação e extração JSON na versão já instalada.
create or replace function public.eo_context() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare v_person jsonb; v_stores jsonb;
begin
  if eo_private.role_of_actor() is null then
    raise exception 'Acesso não liberado. Solicite autorização à administração.' using errcode='42501';
  end if;
  select jsonb_build_object('id',id,'name',display_name,'role',role,'master_admin',master_admin,'unit_type',unit_type)
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

create or replace function public.eo_admin_notice_report(
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



-- Validação adiada permite substituir vínculos atomicamente, sem deixar ativos sem unidade.
create function eo_private.identity_unit_invariant() returns trigger language plpgsql security definer set search_path='' as $$
declare v_users uuid[];
begin
 if TG_TABLE_NAME='eo_profiles' then v_users:=array[new.id,old.id];
 elsif TG_TABLE_NAME='eo_store_members' then v_users:=array[new.user_id,old.user_id];
 else select array_agg(p.id) into v_users from public.eo_profiles p where p.login_chapa=any(array[new.chapa,old.chapa]);
 end if;
 if exists(select 1 from public.eo_profiles p where p.id=any(v_users) and p.active and p.unit_type='loja'
  and not exists(select 1 from public.eo_store_members m where m.user_id=p.id)
  and not exists(select 1 from public.eo_org_assignments a where a.chapa=p.login_chapa and a.active)) then
  raise exception 'Usuário ativo precisa de uma loja vinculada';
 end if;
 return null;
end; $$;
create constraint trigger eo_identity_unit_profile after insert or update on public.eo_profiles deferrable initially deferred for each row execute function eo_private.identity_unit_invariant();
create constraint trigger eo_identity_unit_member after insert or update or delete on public.eo_store_members deferrable initially deferred for each row execute function eo_private.identity_unit_invariant();
create constraint trigger eo_identity_unit_assignment after insert or update or delete on public.eo_org_assignments deferrable initially deferred for each row execute function eo_private.identity_unit_invariant();

insert into eo_private.schema_migrations(version) values('202611090001_identity_units') on conflict do nothing;
commit;

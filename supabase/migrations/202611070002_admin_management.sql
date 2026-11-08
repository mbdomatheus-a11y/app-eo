begin;

-- Todos os administradores ativos têm a mesma alçada. Arquivamento é reversível.
create or replace function public.eo_admin_update_person(
  p_user uuid, p_name text, p_role text, p_chapa text, p_stores uuid[], p_active boolean
) returns void language plpgsql security definer set search_path='' as $$
declare v_target public.eo_profiles%rowtype; v_stores uuid[];
begin
  -- Serializa alterações entre administradores e revalida a autorização após a espera.
  perform pg_advisory_xact_lock(hashtext('eo-admin-access-mutations'));
  if eo_private.role_of_actor() is distinct from 'admin' then raise exception 'Acesso administrativo necessário' using errcode='42501'; end if;
  select * into v_target from public.eo_profiles where id=p_user for update;
  if not found then raise exception 'Pessoa não encontrada'; end if;
  if p_user=(select auth.uid()) then raise exception 'Seu próprio acesso é protegido contra remoção e alteração administrativa'; end if;
  if p_role is null or p_role not in ('colaborador','gerente','diretor','admin') or p_active is null then raise exception 'Perfil ou estado inválido'; end if;
  if p_name is null or length(trim(p_name)) not between 2 and 120 then raise exception 'Nome inválido'; end if;
  if trim(p_chapa) is distinct from v_target.login_chapa then raise exception 'A chapa não pode ser alterada: ela identifica o login. Crie outro acesso e arquive o anterior se necessário'; end if;
  select coalesce(array_agg(distinct s),'{}'::uuid[]) into v_stores from unnest(p_stores) s;
  if exists(select 1 from unnest(v_stores) x where not exists(select 1 from public.eo_stores s where s.id=x)) then raise exception 'Loja inválida'; end if;
  update public.eo_profiles set display_name=trim(p_name),role=p_role,active=p_active,
    master_admin=case when p_role='admin' then master_admin else false end where id=p_user;
  delete from public.eo_store_members where user_id=p_user;
  insert into public.eo_store_members(user_id,store_id) select p_user,s from unnest(v_stores) s;
  -- A edição individual assume os vínculos; evita que um vínculo importado
  -- continue concedendo silenciosamente uma loja removida pelo administrador.
  update public.eo_org_assignments set active=false where chapa=v_target.login_chapa and active;
  insert into public.eo_audit_events(actor,action,entity_id,detail) values((select auth.uid()),'member.access_updated',p_user::text,
    jsonb_build_object('previous_role',v_target.role,'role',p_role,'previous_active',v_target.active,'active',p_active,'store_count',cardinality(v_stores)));
end; $$;

create or replace function public.eo_admin_set_person_active(p_user uuid,p_active boolean)
returns void language plpgsql security definer set search_path='' as $$
declare v_old boolean;
begin
  perform pg_advisory_xact_lock(hashtext('eo-admin-access-mutations'));
  if eo_private.role_of_actor() is distinct from 'admin' then raise exception 'Acesso administrativo necessário' using errcode='42501'; end if;
  if p_user=(select auth.uid()) then raise exception 'Você não pode arquivar seu próprio acesso'; end if;
  if p_active is null then raise exception 'Estado inválido'; end if;
  select active into v_old from public.eo_profiles where id=p_user for update;
  if not found then raise exception 'Pessoa não encontrada'; end if;
  update public.eo_profiles set active=p_active where id=p_user;
  insert into public.eo_audit_events(actor,action,entity_id,detail) values((select auth.uid()),
    case when p_active then 'member.reactivated' else 'member.archived' end,p_user::text,jsonb_build_object('previous_active',v_old,'active',p_active));
end; $$;

create or replace function public.eo_admin_people_page(
  p_search text default '', p_role text default '', p_state text default '',
  p_region text default '', p_uf text default '', p_limit integer default 30,
  p_offset integer default 0, p_sort text default 'name', p_user uuid default null
) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_result jsonb;
begin
  if eo_private.role_of_actor() is distinct from 'admin' then raise exception 'Acesso administrativo necessário' using errcode='42501'; end if;
  with filtered as (
    select p.id,p.display_name,p.role,p.login_chapa,p.contact_email,p.active,p.master_admin,p.must_change_password,
      coalesce((select jsonb_agg(s.id order by s.code) from public.eo_stores s where
        exists(select 1 from public.eo_store_members m where m.user_id=p.id and m.store_id=s.id)
        or exists(select 1 from public.eo_org_assignments a where a.active and a.chapa=p.login_chapa and ((a.scope_type='LOJA' and a.scope_code=s.code) or (a.scope_type='GGL' and a.scope_code=s.ggl)))),'[]'::jsonb) stores
    from public.eo_profiles p
    where (p_user is null or p.id=p_user)
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

create or replace function public.eo_admin_stores() returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  if eo_private.role_of_actor() is distinct from 'admin' then raise exception 'Acesso administrativo necessário' using errcode='42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'code',s.code,'name',s.name,'region',s.region,'active',s.active,
    'segments',coalesce(d.attributes,'{}'::jsonb)||jsonb_build_object('REGIONAL',coalesce(nullif(g.regional_name,''),s.region))) order by s.code)
    from public.eo_stores s left join public.eo_store_details d on d.store_id=s.id left join public.eo_regional_groups g on g.ggl=s.ggl),'[]'::jsonb);
end; $$;

create or replace function public.eo_admin_manage_store(p_store uuid,p_code text,p_name text,p_region text,p_active boolean)
returns void language plpgsql security definer set search_path='' as $$
declare v_old public.eo_stores%rowtype; v_ggl text; v_region text; v_matches integer;
begin
  if eo_private.role_of_actor() is distinct from 'admin' then raise exception 'Acesso administrativo necessário' using errcode='42501'; end if;
  select * into v_old from public.eo_stores where id=p_store for update;
  if not found then raise exception 'Loja não encontrada'; end if;
  if p_code is null or length(trim(p_code)) not between 1 and 20 or p_name is null or length(trim(p_name)) not between 2 and 120 or p_active is null or length(coalesce(p_region,''))>120 then raise exception 'Confira os dados da loja'; end if;
  v_region:=trim(coalesce(p_region,''));
  -- A regional exibida nos segmentos vem do GGL. Atualizar ambos evita uma
  -- loja mostrar a regional antiga mesmo após a edição administrativa.
  select count(*) into v_matches from public.eo_regional_groups g
    where lower(trim(g.regional_name))=lower(v_region) and (g.active or g.ggl=v_old.ggl);
  if v_matches>1 then
    select g.ggl,g.regional_name into v_ggl,v_region from public.eo_regional_groups g
      where g.ggl=v_old.ggl and lower(trim(g.regional_name))=lower(v_region);
    if not found then raise exception 'Nome de regional ambíguo. Revise os grupos regionais antes de mover a loja'; end if;
  elsif v_matches=1 then
    select g.ggl,g.regional_name into v_ggl,v_region from public.eo_regional_groups g
      where lower(trim(g.regional_name))=lower(v_region) and (g.active or g.ggl=v_old.ggl);
  elsif nullif(v_old.ggl,'') is not null then
    raise exception 'Selecione uma regional existente. Lojas importadas devem preservar um vínculo GGL válido';
  else
    v_ggl:=null;
  end if;
  update public.eo_stores set code=trim(p_code),name=trim(p_name),region=v_region,ggl=v_ggl,active=p_active where id=p_store;
  if v_old.code is distinct from trim(p_code) then
    update public.eo_org_assignments set scope_code=trim(p_code) where scope_type='LOJA' and scope_code=v_old.code;
  end if;
  update public.eo_store_details set attributes=attributes||jsonb_build_object('COD',trim(p_code),'LOJA',trim(p_name),'REGIONAL',v_region,'GGL',v_ggl),updated_at=now() where store_id=p_store;
  insert into public.eo_audit_events(actor,action,entity_id,detail) values((select auth.uid()),
    case when v_old.active and not p_active then 'store.archived' when not v_old.active and p_active then 'store.reactivated' else 'store.updated' end,p_store::text,
    jsonb_build_object('previous_code',v_old.code,'code',trim(p_code),'previous_active',v_old.active,'active',p_active,
      'previous_ggl',v_old.ggl,'ggl',v_ggl,'previous_region',v_old.region,'region',v_region));
end; $$;

revoke all on function public.eo_admin_update_person(uuid,text,text,text,uuid[],boolean),public.eo_admin_set_person_active(uuid,boolean),public.eo_admin_people_page(text,text,text,text,text,integer,integer,text,uuid),public.eo_admin_stores(),public.eo_admin_manage_store(uuid,text,text,text,boolean) from public,anon;
grant execute on function public.eo_admin_update_person(uuid,text,text,text,uuid[],boolean),public.eo_admin_set_person_active(uuid,boolean),public.eo_admin_people_page(text,text,text,text,text,integer,integer,text,uuid),public.eo_admin_stores(),public.eo_admin_manage_store(uuid,text,text,text,boolean) to authenticated;
insert into eo_private.schema_migrations(version) values('202611070002_admin_management') on conflict do nothing;
commit;

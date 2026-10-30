begin;

alter table public.eo_profiles
  add column login_chapa text unique,
  add column contact_email text,
  add column master_admin boolean not null default false,
  add column must_change_password boolean not null default false;

alter table public.eo_profiles
  add constraint eo_profiles_chapa_format
  check (login_chapa is null or login_chapa ~ '^[0-9]{1,20}$');

-- O primeiro administrador é identificado pelo UUID do convite autorizado.
update public.eo_profiles
set login_chapa='123456', contact_email=null, master_admin=true,
    must_change_password=true
where id='00000000-0000-0000-0000-000000000000'
  and role='admin' and active;

create or replace function eo_private.role_of_actor() returns text
language sql stable security definer set search_path='' as $$
  select role from public.eo_profiles
  where id=(select auth.uid()) and active and not must_change_password;
$$;

create or replace function public.eo_context() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare v_person jsonb; v_stores jsonb;
begin
  if eo_private.role_of_actor() is null then
    raise exception 'Acesso não liberado. Solicite autorização à administração.' using errcode='42501';
  end if;
  select jsonb_build_object('id',id,'name',display_name,'role',role,'master_admin',master_admin)
    into v_person from public.eo_profiles where id=auth.uid();
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'code',code,'name',name,'region',region) order by code),'[]')
    into v_stores from public.eo_stores where active and eo_private.has_store(id);
  return jsonb_build_object('person',v_person,'stores',v_stores,
    'settings',(select to_jsonb(s) from public.eo_settings s where id=true));
end; $$;

create function public.eo_password_status() returns jsonb
language sql stable security definer set search_path='' as $$
  select jsonb_build_object(
    'must_change_password', p.must_change_password,
    'has_chapa_login', p.login_chapa is not null
  )
  from public.eo_profiles p
  where p.id=(select auth.uid()) and p.active;
$$;

create function public.eo_admin_update_person(
  p_user uuid, p_name text, p_role text, p_chapa text,
  p_stores uuid[], p_active boolean
) returns void language plpgsql security definer set search_path='' as $$
declare v_actor uuid := auth.uid(); v_master boolean;
begin
  if eo_private.role_of_actor() is distinct from 'admin' then
    raise exception 'Acesso administrativo necessário' using errcode='42501';
  end if;
  select master_admin into v_master from public.eo_profiles where id=v_actor;
  if p_user=v_actor then raise exception 'Não altere seu próprio acesso por este fluxo'; end if;
  if p_role not in ('colaborador','gerente','diretor','admin') then raise exception 'Perfil inválido'; end if;
  if p_role in ('diretor','admin') and not coalesce(v_master,false) then
    raise exception 'Somente o administrador master pode conceder este perfil' using errcode='42501';
  end if;
  if length(trim(p_name)) not between 2 and 120 or p_chapa !~ '^[0-9]{1,20}$' then
    raise exception 'Nome ou chapa inválidos';
  end if;
  if p_role<>'admin' and coalesce(cardinality(p_stores),0)=0 then raise exception 'Selecione ao menos uma loja'; end if;
  if exists(select 1 from unnest(p_stores) s where not eo_private.has_store(s)) then raise exception 'Loja inválida'; end if;
  if not exists(select 1 from auth.users where id=p_user and email_confirmed_at is not null) then
    raise exception 'A pessoa precisa aceitar o convite antes da liberação';
  end if;
  insert into public.eo_profiles(id,display_name,role,login_chapa,active)
    values(p_user,trim(p_name),p_role,trim(p_chapa),p_active)
  on conflict(id) do update set display_name=excluded.display_name,role=excluded.role,
    login_chapa=excluded.login_chapa,active=excluded.active;
  delete from public.eo_store_members where user_id=p_user;
  insert into public.eo_store_members select distinct p_user,s from unnest(p_stores) s;
  insert into public.eo_audit_events(actor,action,entity_id,detail)
    values(v_actor,'member.access_updated',p_user::text,
      jsonb_build_object('role',p_role,'active',p_active,'store_count',coalesce(cardinality(p_stores),0)));
end; $$;

revoke all on function public.eo_password_status(), public.eo_admin_update_person(uuid,text,text,text,uuid[],boolean)
  from public,anon;
grant execute on function public.eo_password_status() to authenticated;
grant execute on function public.eo_admin_update_person(uuid,text,text,text,uuid[],boolean) to authenticated;
revoke execute on function public.eo_admin_member(uuid,text,text,uuid[],boolean) from authenticated;

insert into eo_private.schema_migrations(version) values('202610290002_identity');
commit;

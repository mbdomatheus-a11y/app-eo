begin;
create table public.eo_business_units (
 id uuid primary key default gen_random_uuid(),code text not null unique check(length(code) between 1 and 50),
 name text not null check(length(name) between 2 and 160),kind text not null check(kind in ('loja','ec','cda','administracao')),
 store_id uuid unique references public.eo_stores(id),active boolean not null default true,
 latitude numeric check(latitude between -90 and 90),longitude numeric check(longitude between -180 and 180),
 check((latitude is null)=(longitude is null)),check((kind='loja')=(store_id is not null)),
 updated_at timestamptz not null default now()
);
alter table public.eo_business_units enable row level security;
revoke all on public.eo_business_units from public,anon,authenticated;
insert into public.eo_business_units(code,name,kind) values
 ('EC','Escritório Central','ec'),('CDA','Centro de Distribuição Araçariguama','cda'),('ADMIN','Administração','administracao');
insert into public.eo_business_units(code,name,kind,store_id,active)
 select 'LOJA-'||code,name,'loja',id,active from public.eo_stores;
alter table public.eo_profiles add column primary_unit_id uuid references public.eo_business_units(id);
create index eo_profiles_primary_unit_active on public.eo_profiles(primary_unit_id) where active and deleted_at is null;

create function eo_private.resolve_primary_unit(p_user uuid,p_kind text,p_chapa text,p_preferred uuid) returns uuid
language sql stable security definer set search_path='' as $$
 select u.id from public.eo_business_units u where u.active and u.kind=p_kind
 and (p_kind='loja' or not exists(select 1 from public.eo_business_units preferred where preferred.id=p_preferred and (not preferred.active or preferred.kind<>p_kind)))
 and (p_kind<>'loja' or exists(select 1 from public.eo_store_members m where m.user_id=p_user and m.store_id=u.store_id)
  or exists(select 1 from public.eo_org_assignments a join public.eo_stores s on s.id=u.store_id
   where a.chapa=p_chapa and a.active and ((a.scope_type='LOJA' and a.scope_code=s.code) or (a.scope_type='GGL' and a.scope_code=s.ggl))))
 order by (u.id=p_preferred) desc nulls last,case when u.code in ('ADMIN','EC','CDA') then 0 else 1 end,u.code limit 1;
$$;
update public.eo_profiles p set primary_unit_id=eo_private.resolve_primary_unit(p.id,p.unit_type,p.login_chapa,null);
do $$ begin if exists(select 1 from public.eo_profiles where active and deleted_at is null and primary_unit_id is null)
 then raise exception 'Existem pessoas ativas sem unidade válida; corrija os vínculos antes desta migração';end if;end;$$;

create function eo_private.ensure_primary_unit() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if TG_OP='UPDATE' and new.unit_type is distinct from old.unit_type and new.primary_unit_id is not distinct from old.primary_unit_id then new.primary_unit_id:=null;end if;
 new.primary_unit_id:=eo_private.resolve_primary_unit(new.id,new.unit_type,new.login_chapa,new.primary_unit_id);
 if new.active and new.deleted_at is null and new.primary_unit_id is null then raise exception 'Usuário ativo precisa de uma unidade válida';end if;
 return new;
end;$$;
create trigger eo_primary_unit before insert or update on public.eo_profiles for each row execute function eo_private.ensure_primary_unit();

create function eo_private.sync_store_unit() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.eo_business_units(code,name,kind,store_id,active) values('LOJA-'||new.code,new.name,'loja',new.id,new.active)
 on conflict(store_id) do update set code=excluded.code,name=excluded.name,active=excluded.active,updated_at=now();
 return new;
end;$$;
create trigger eo_store_unit after insert or update on public.eo_stores for each row execute function eo_private.sync_store_unit();

-- Validate the final membership set, not the temporary gap during a transfer.
create function eo_private.validate_primary_units() returns trigger language plpgsql security definer set search_path='' as $$
declare p record;resolved uuid;ids uuid[];
begin
 if TG_TABLE_NAME='eo_store_members' then
  if TG_OP='INSERT' then ids:=array[new.user_id];elsif TG_OP='DELETE' then ids:=array[old.user_id];else ids:=array[old.user_id,new.user_id];end if;
 elsif TG_TABLE_NAME='eo_org_assignments' then
  if TG_OP='INSERT' then select array_agg(id) into ids from public.eo_profiles where login_chapa=new.chapa;
  elsif TG_OP='DELETE' then select array_agg(id) into ids from public.eo_profiles where login_chapa=old.chapa;
  else select array_agg(id) into ids from public.eo_profiles where login_chapa in (old.chapa,new.chapa);end if;
 else
  if new.store_id is null and (not new.active or new.kind is distinct from old.kind) and exists(select 1 from public.eo_profiles where primary_unit_id=new.id and active and deleted_at is null) then
   raise exception 'Reatribua as pessoas ativas antes de arquivar ou alterar o tipo desta unidade';
  end if;
  select array_agg(id) into ids from public.eo_profiles where primary_unit_id=new.id;
 end if;
 for p in select id,unit_type,login_chapa,primary_unit_id from public.eo_profiles where active and deleted_at is null and id=any(coalesce(ids,'{}')) loop
  resolved:=eo_private.resolve_primary_unit(p.id,p.unit_type,p.login_chapa,p.primary_unit_id);
  if resolved is null then raise exception 'Reatribua a unidade das pessoas ativas antes de remover este vínculo';end if;
  if resolved is distinct from p.primary_unit_id then update public.eo_profiles set primary_unit_id=resolved where id=p.id;end if;
 end loop;
 return null;
end;$$;
create constraint trigger eo_primary_members after insert or update or delete on public.eo_store_members deferrable initially deferred for each row execute function eo_private.validate_primary_units();
create constraint trigger eo_primary_org after insert or update or delete on public.eo_org_assignments deferrable initially deferred for each row execute function eo_private.validate_primary_units();
create constraint trigger eo_primary_entity after update on public.eo_business_units deferrable initially deferred for each row execute function eo_private.validate_primary_units();

create function public.eo_units(p_search text default '',p_limit integer default 30,p_offset integer default 0) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if eo_private.role_of_actor() is null then raise exception 'Entre novamente' using errcode='42501';end if;
 return jsonb_build_object('items',(select coalesce(jsonb_agg(to_jsonb(q)),'[]') from (
  select u.* from public.eo_business_units u where (eo_private.role_of_actor()='admin' or u.id=(select primary_unit_id from public.eo_profiles where id=auth.uid()) or (u.store_id is not null and eo_private.has_store(u.store_id)))
  and (u.code ilike '%'||left(p_search,120)||'%' or u.name ilike '%'||left(p_search,120)||'%')
  order by u.kind,u.code limit greatest(1,least(coalesce(p_limit,30),100)) offset greatest(0,coalesce(p_offset,0))) q),
  'primary_unit_id',(select primary_unit_id from public.eo_profiles where id=auth.uid()));
end;$$;
create function public.eo_admin_save_unit(p_id uuid,p_code text,p_name text,p_kind text,p_active boolean default true,p_lat numeric default null,p_lon numeric default null) returns uuid
language plpgsql security definer set search_path='' as $$
declare result uuid;
begin
 if eo_private.role_of_actor() is distinct from 'admin' then raise exception 'Acesso administrativo necessário' using errcode='42501';end if;
 if p_kind is null or p_kind not in ('ec','cda','administracao') or length(trim(p_code)) not between 1 and 50 or length(trim(p_name)) not between 2 and 160 or p_code is null or p_name is null or p_active is null then raise exception 'Revise a unidade; lojas são cadastradas no cadastro de lojas';end if;
 if p_id is null then insert into public.eo_business_units(code,name,kind,active,latitude,longitude) values(trim(p_code),trim(p_name),p_kind,p_active,p_lat,p_lon) returning id into result;
 else update public.eo_business_units set code=trim(p_code),name=trim(p_name),kind=p_kind,active=p_active,latitude=p_lat,longitude=p_lon,updated_at=now() where id=p_id and store_id is null returning id into result;
 end if;
 if result is null then raise exception 'Unidade não encontrada';end if;
 insert into public.eo_audit_events(actor,action,entity_id,detail) values(auth.uid(),'unit.saved',result::text,jsonb_build_object('kind',p_kind,'active',p_active));
 return result;
end;$$;
create function public.eo_admin_assign_unit(p_user uuid,p_unit uuid) returns void language plpgsql security definer set search_path='' as $$
declare u public.eo_business_units%rowtype;
begin
 if eo_private.role_of_actor() is distinct from 'admin' then raise exception 'Acesso administrativo necessário' using errcode='42501';end if;
 select * into strict u from public.eo_business_units where id=p_unit and active;
 if u.store_id is not null then insert into public.eo_store_members(user_id,store_id) values(p_user,u.store_id) on conflict do nothing;end if;
 update public.eo_profiles set unit_type=u.kind,primary_unit_id=u.id where id=p_user and deleted_at is null;
 if not found then raise exception 'Pessoa não encontrada';end if;
 insert into public.eo_audit_events(actor,action,entity_id,detail) values(auth.uid(),'member.unit_assigned',p_user::text,jsonb_build_object('unit_id',u.id));
end;$$;
revoke all on function public.eo_units(text,integer,integer),public.eo_admin_save_unit(uuid,text,text,text,boolean,numeric,numeric),public.eo_admin_assign_unit(uuid,uuid) from public,anon;
grant execute on function public.eo_units(text,integer,integer),public.eo_admin_save_unit(uuid,text,text,text,boolean,numeric,numeric),public.eo_admin_assign_unit(uuid,uuid) to authenticated;
insert into eo_private.schema_migrations(version) values('202611090010_business_units') on conflict do nothing;
commit;

-- App EO. Migração inicial aditiva. Executar uma vez no projeto exclusivo SUP_EO1.
begin;
create schema if not exists eo_private;
revoke all on schema eo_private from public, anon, authenticated;

create table public.eo_profiles (
  id uuid primary key references auth.users(id),
  display_name text not null check (length(display_name) between 2 and 120),
  role text not null check (role in ('colaborador','gerente','diretor','admin')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create table public.eo_stores (
  id uuid primary key default gen_random_uuid(), code text not null unique check(length(code) between 1 and 20),
  name text not null check(length(name) between 2 and 120), region text not null default '', active boolean not null default true,
  created_at timestamptz not null default now()
);
create table public.eo_store_members (
  user_id uuid not null references public.eo_profiles(id), store_id uuid not null references public.eo_stores(id),
  primary key(user_id,store_id)
);
create index eo_store_members_store on public.eo_store_members(store_id,user_id);
create table public.eo_notices (
  id uuid primary key default gen_random_uuid(), created_by uuid not null references public.eo_profiles(id),
  created_at timestamptz not null default now()
);
create table public.eo_notice_versions (
  notice_id uuid not null references public.eo_notices(id), version integer not null check(version>0),
  title text not null check(length(title) between 3 and 120), body text not null check(length(body) between 1 and 5000),
  category text not null default 'Operações', urgent boolean not null default false,
  published_at timestamptz not null default now(), primary key(notice_id,version)
);
create index eo_versions_feed on public.eo_notice_versions(published_at desc,notice_id desc);
create table public.eo_notice_stores (
  notice_id uuid not null, version integer not null, store_id uuid not null references public.eo_stores(id),
  primary key(notice_id,version,store_id), foreign key(notice_id,version) references public.eo_notice_versions(notice_id,version)
);
create index eo_notice_stores_lookup on public.eo_notice_stores(store_id,notice_id,version);
create table public.eo_notice_recipients (
  notice_id uuid not null, version integer not null, user_id uuid not null references public.eo_profiles(id),
  primary key(notice_id,version,user_id), foreign key(notice_id,version) references public.eo_notice_versions(notice_id,version)
);
create index eo_recipients_user on public.eo_notice_recipients(user_id,notice_id,version);
create table public.eo_notice_receipts (
  notice_id uuid not null, version integer not null, user_id uuid not null,
  acknowledged_at timestamptz not null default now(), primary key(notice_id,version,user_id),
  foreign key(notice_id,version,user_id) references public.eo_notice_recipients(notice_id,version,user_id)
);
create index eo_receipts_user on public.eo_notice_receipts(user_id,notice_id,version);
create table public.eo_audit_events (
  id bigint generated always as identity primary key, actor uuid references public.eo_profiles(id),
  action text not null, entity_id text, detail jsonb not null default '{}', created_at timestamptz not null default now()
);
create index eo_audit_date on public.eo_audit_events(created_at desc,id desc);
create table public.eo_settings (
  id boolean primary key default true check(id), workspace_name text not null default 'Operação conectada',
  disabled_modules text[] not null default '{}'
);
insert into public.eo_settings(id) values(true);

-- Auxiliares só executáveis por funções do servidor. Nunca confiar em role enviado pelo cliente.
create function eo_private.role_of_actor() returns text language sql stable security definer set search_path='' as $$
 select role from public.eo_profiles where id=(select auth.uid()) and active;
$$;
create function eo_private.has_store(p_store uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.eo_stores s where s.id=p_store and s.active and
 (eo_private.role_of_actor()='admin' or exists(select 1 from public.eo_store_members m where m.user_id=(select auth.uid()) and m.store_id=s.id)))
 and eo_private.role_of_actor() is not null;
$$;
create function eo_private.can_read_notice(p_notice uuid,p_version int) returns boolean language sql stable security definer set search_path='' as $$
 select eo_private.role_of_actor()='admin' or (exists(select 1 from public.eo_notice_recipients r
 where r.notice_id=p_notice and r.version=p_version and r.user_id=(select auth.uid())) and
 exists(select 1 from public.eo_notice_stores s where s.notice_id=p_notice and s.version=p_version and eo_private.has_store(s.store_id)));
$$;
revoke all on all functions in schema eo_private from public,anon,authenticated;

-- RLS em todas as tabelas; acesso por RPCs validadas, sem concessões diretas a clientes.
alter table public.eo_profiles enable row level security;
alter table public.eo_stores enable row level security;
alter table public.eo_store_members enable row level security;
alter table public.eo_notices enable row level security;
alter table public.eo_notice_versions enable row level security;
alter table public.eo_notice_stores enable row level security;
alter table public.eo_notice_recipients enable row level security;
alter table public.eo_notice_receipts enable row level security;
alter table public.eo_audit_events enable row level security;
alter table public.eo_settings enable row level security;
revoke all on public.eo_profiles,public.eo_stores,public.eo_store_members,public.eo_notices,public.eo_notice_versions,public.eo_notice_stores,public.eo_notice_recipients,public.eo_notice_receipts,public.eo_audit_events,public.eo_settings from anon,authenticated;

create function public.eo_context() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_person jsonb; v_stores jsonb;
begin
 if eo_private.role_of_actor() is null then raise exception 'Acesso não liberado. Solicite autorização à administração.' using errcode='42501'; end if;
 select jsonb_build_object('id',id,'name',display_name,'role',role) into v_person from public.eo_profiles where id=auth.uid();
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'code',code,'name',name,'region',region) order by code),'[]') into v_stores
 from public.eo_stores where active and eo_private.has_store(id);
 return jsonb_build_object('person',v_person,'stores',v_stores,'settings',(select to_jsonb(s) from public.eo_settings s where id=true));
end; $$;

create function public.eo_feed(p_before timestamptz default null,p_before_id uuid default null,p_limit int default 20)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_items jsonb;
begin
 if eo_private.role_of_actor() is null then raise exception 'Acesso não autorizado' using errcode='42501'; end if;
 if p_before is not null and p_before_id is null then raise exception 'Cursor inválido'; end if;
 select coalesce(jsonb_agg(to_jsonb(q) order by q.published_at desc,q.notice_id desc),'[]') into v_items from (
 select v.*, exists(select 1 from public.eo_notice_receipts r where r.notice_id=v.notice_id and r.version=v.version and r.user_id=auth.uid()) as acknowledged,
 (select count(*) from public.eo_notice_recipients r where r.notice_id=v.notice_id and r.version=v.version) as eligible_count,
 (select count(*) from public.eo_notice_receipts r where r.notice_id=v.notice_id and r.version=v.version) as receipt_count
 from public.eo_notice_versions v where eo_private.can_read_notice(v.notice_id,v.version)
 and (p_before is null or (v.published_at,v.notice_id)<(p_before,p_before_id))
 order by v.published_at desc,v.notice_id desc limit greatest(1,least(coalesce(p_limit,20),100))) q;
 return v_items;
end; $$;

create function public.eo_publish_notice(p_title text,p_body text,p_stores uuid[],p_urgent boolean default false,p_request_id uuid default gen_random_uuid())
returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid; v_actor uuid := auth.uid();
begin
 if eo_private.role_of_actor() not in ('admin','diretor') or eo_private.role_of_actor() is null then raise exception 'Publicação não autorizada' using errcode='42501'; end if;
 if coalesce(cardinality(p_stores),0)=0 or cardinality(p_stores)>2000 then raise exception 'Selecione as lojas destinatárias'; end if;
 if exists(select 1 from unnest(p_stores) s where not eo_private.has_store(s)) then raise exception 'Loja fora da abrangência' using errcode='42501'; end if;
 if length(trim(p_title)) not between 3 and 120 or length(trim(p_body)) not between 1 and 5000 then raise exception 'Título ou mensagem inválidos'; end if;
 insert into public.eo_notices(id,created_by) values(p_request_id,v_actor) on conflict do nothing returning id into v_id;
 if v_id is null then
   if exists(select 1 from public.eo_notices where id=p_request_id and created_by=v_actor) then return p_request_id; end if;
   raise exception 'Solicitação inválida';
 end if;
 insert into public.eo_notice_versions(notice_id,version,title,body,urgent) values(v_id,1,trim(p_title),trim(p_body),p_urgent);
 insert into public.eo_notice_stores select distinct v_id,1,s from unnest(p_stores) s;
 insert into public.eo_notice_recipients
 select v_id,1,p.id from public.eo_profiles p where p.active and (p.role='admin' or exists(
 select 1 from public.eo_store_members m where m.user_id=p.id and m.store_id=any(p_stores)));
 insert into public.eo_audit_events(actor,action,entity_id,detail) values(v_actor,'notice.published',v_id::text,jsonb_build_object('version',1,'store_count',cardinality(p_stores)));
 return v_id;
end; $$;

create function public.eo_acknowledge(p_notice uuid,p_version int) returns timestamptz language plpgsql security definer set search_path='' as $$
declare v_time timestamptz;
begin
 if eo_private.role_of_actor() is null or not coalesce(eo_private.can_read_notice(p_notice,p_version),false) then raise exception 'Ciência não autorizada' using errcode='42501'; end if;
 -- Admin só confirma se estiver entre os destinatários originais.
 if not exists(select 1 from public.eo_notice_recipients where notice_id=p_notice and version=p_version and user_id=auth.uid()) then raise exception 'Você não está entre os destinatários desta versão'; end if;
 insert into public.eo_notice_receipts(notice_id,version,user_id) values(p_notice,p_version,auth.uid()) on conflict do nothing returning acknowledged_at into v_time;
 if v_time is not null then
 insert into public.eo_audit_events(actor,action,entity_id,detail) values(auth.uid(),'notice.acknowledged',p_notice::text,jsonb_build_object('version',p_version));
 else select acknowledged_at into v_time from public.eo_notice_receipts where notice_id=p_notice and version=p_version and user_id=auth.uid(); end if;
 return v_time;
end; $$;

create function public.eo_admin_store(p_code text,p_name text,p_region text default '') returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid;
begin
 if eo_private.role_of_actor() is distinct from 'admin' then raise exception 'Acesso administrativo necessário' using errcode='42501'; end if;
 insert into public.eo_stores(code,name,region) values(trim(p_code),trim(p_name),left(trim(p_region),120)) returning id into v_id;
 insert into public.eo_audit_events(actor,action,entity_id) values(auth.uid(),'store.created',v_id::text);
 return v_id;
end; $$;

create function public.eo_admin_people() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if eo_private.role_of_actor() is distinct from 'admin' then raise exception 'Acesso administrativo necessário' using errcode='42501'; end if;
 return (select coalesce(jsonb_agg(to_jsonb(q)),'[]') from (select p.*, (select coalesce(jsonb_agg(store_id),'[]') from public.eo_store_members m where m.user_id=p.id) stores from public.eo_profiles p order by p.created_at desc limit 100) q);
end; $$;
create function public.eo_admin_audit(p_before bigint default null) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if eo_private.role_of_actor() is distinct from 'admin' then raise exception 'Acesso administrativo necessário' using errcode='42501'; end if;
 return (select coalesce(jsonb_agg(to_jsonb(q) order by q.id desc),'[]') from (select a.*,p.display_name actor_name from public.eo_audit_events a left join public.eo_profiles p on p.id=a.actor where p_before is null or a.id<p_before order by a.id desc limit 50) q);
end; $$;

-- Cadastro de acesso para conta Auth já existente, sem senha ou convites enviados pelo navegador.
create function public.eo_admin_member(p_user uuid,p_name text,p_role text,p_stores uuid[],p_active boolean default true) returns void language plpgsql security definer set search_path='' as $$
begin
 if eo_private.role_of_actor() is distinct from 'admin' then raise exception 'Acesso administrativo necessário' using errcode='42501'; end if;
 if p_user=auth.uid() then raise exception 'Não altere seu próprio acesso por este fluxo'; end if;
 if p_role not in ('colaborador','gerente','diretor','admin') then raise exception 'Perfil inválido'; end if;
 if p_role<>'admin' and coalesce(cardinality(p_stores),0)=0 then raise exception 'Selecione ao menos uma loja'; end if;
 if exists(select 1 from unnest(p_stores) s where not eo_private.has_store(s)) then raise exception 'Loja inválida'; end if;
 if not exists(select 1 from auth.users where id=p_user and email_confirmed_at is not null) then raise exception 'Conta confirmada não encontrada'; end if;
 insert into public.eo_profiles(id,display_name,role,active) values(p_user,trim(p_name),p_role,p_active)
 on conflict(id) do update set display_name=excluded.display_name,role=excluded.role,active=excluded.active;
 delete from public.eo_store_members where user_id=p_user;
 insert into public.eo_store_members select distinct p_user,s from unnest(p_stores) s;
 insert into public.eo_audit_events(actor,action,entity_id,detail) values(auth.uid(),'member.updated',p_user::text,jsonb_build_object('role',p_role,'active',p_active));
end; $$;

revoke all on function public.eo_context(),public.eo_feed(timestamptz,uuid,int),public.eo_publish_notice(text,text,uuid[],boolean,uuid),public.eo_acknowledge(uuid,int),public.eo_admin_store(text,text,text),public.eo_admin_people(),public.eo_admin_audit(bigint),public.eo_admin_member(uuid,text,text,uuid[],boolean) from public,anon;
grant execute on function public.eo_context(),public.eo_feed(timestamptz,uuid,int),public.eo_publish_notice(text,text,uuid[],boolean,uuid),public.eo_acknowledge(uuid,int),public.eo_admin_store(text,text,text),public.eo_admin_people(),public.eo_admin_audit(bigint),public.eo_admin_member(uuid,text,text,uuid[],boolean) to authenticated;

create table eo_private.schema_migrations(version text primary key,applied_at timestamptz not null default now());
alter table eo_private.schema_migrations enable row level security;
insert into eo_private.schema_migrations(version) values('202610290001_core');
commit;

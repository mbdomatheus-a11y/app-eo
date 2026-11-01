begin;

create table public.eo_alerts (
  id uuid primary key default gen_random_uuid(), created_by uuid not null references public.eo_profiles(id),
  title text not null check (length(title) between 3 and 120),
  body text not null check (length(body) between 1 and 3000),
  urgent boolean not null default false, created_at timestamptz not null default now()
);
create table public.eo_alert_stores (
  alert_id uuid not null references public.eo_alerts(id) on delete cascade,
  store_id uuid not null references public.eo_stores(id), primary key(alert_id,store_id)
);
create table public.eo_alert_recipients (
  alert_id uuid not null references public.eo_alerts(id) on delete cascade,
  user_id uuid not null references public.eo_profiles(id), seen_at timestamptz, dismissed_at timestamptz,
  primary key(alert_id,user_id)
);
create index eo_alert_recipient_feed on public.eo_alert_recipients(user_id,alert_id);
create table public.eo_notification_settings (
  user_id uuid primary key references public.eo_profiles(id), sound_enabled boolean not null default true,
  updated_at timestamptz not null default now()
);
create table public.eo_push_devices (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.eo_profiles(id),
  expo_push_token text not null unique check(length(expo_push_token) between 20 and 200), platform text not null check(platform in ('ios','android')),
  updated_at timestamptz not null default now()
);
create index eo_push_devices_user on public.eo_push_devices(user_id);

create table public.eo_checklist_templates (
  id uuid primary key default gen_random_uuid(), created_by uuid not null references public.eo_profiles(id),
  title text not null check(length(title) between 3 and 120), description text not null default '', active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.eo_checklist_items (
  id uuid primary key default gen_random_uuid(), template_id uuid not null references public.eo_checklist_templates(id) on delete cascade,
  position integer not null check(position between 1 and 100), prompt text not null check(length(prompt) between 2 and 500),
  answer_type text not null check(answer_type in ('acceptance','photo','text','yes_no')),
  required boolean not null default true, options jsonb not null default '[]' check(jsonb_typeof(options)='array'),
  unique(template_id,position)
);
create table public.eo_checklist_runs (
  id uuid primary key default gen_random_uuid(), template_id uuid not null references public.eo_checklist_templates(id),
  store_id uuid not null references public.eo_stores(id), assigned_to uuid not null references public.eo_profiles(id),
  assigned_by uuid not null references public.eo_profiles(id), status text not null default 'pending' check(status in ('pending','in_progress','completed')),
  assigned_at timestamptz not null default now(), updated_at timestamptz not null default now(), completed_at timestamptz
);
create index eo_checklist_run_inbox on public.eo_checklist_runs(assigned_to,status,assigned_at desc);
create table public.eo_checklist_answers (
  run_id uuid not null references public.eo_checklist_runs(id) on delete cascade,
  item_id uuid not null references public.eo_checklist_items(id), answer jsonb not null,
  updated_by uuid not null references public.eo_profiles(id), updated_at timestamptz not null default now(),
  primary key(run_id,item_id)
);
create table public.eo_checklist_answer_history (
  id bigint generated always as identity primary key, run_id uuid not null references public.eo_checklist_runs(id),
  item_id uuid not null references public.eo_checklist_items(id), answer jsonb not null,
  updated_by uuid not null references public.eo_profiles(id), saved_at timestamptz not null default now()
);
create index eo_checklist_history_run on public.eo_checklist_answer_history(run_id,item_id,saved_at desc);
create table public.eo_checklist_media (
  id uuid primary key default gen_random_uuid(), run_id uuid not null references public.eo_checklist_runs(id) on delete cascade,
  item_id uuid not null references public.eo_checklist_items(id), user_id uuid not null references public.eo_profiles(id),
  object_path text not null unique, created_at timestamptz not null default now()
);

alter table public.eo_alerts enable row level security;
alter table public.eo_alert_stores enable row level security;
alter table public.eo_alert_recipients enable row level security;
alter table public.eo_notification_settings enable row level security;
alter table public.eo_push_devices enable row level security;
alter table public.eo_checklist_templates enable row level security;
alter table public.eo_checklist_items enable row level security;
alter table public.eo_checklist_runs enable row level security;
alter table public.eo_checklist_answers enable row level security;
alter table public.eo_checklist_answer_history enable row level security;
alter table public.eo_checklist_media enable row level security;
revoke all on public.eo_alerts,public.eo_alert_stores,public.eo_alert_recipients,public.eo_notification_settings,
  public.eo_push_devices,public.eo_checklist_templates,public.eo_checklist_items,public.eo_checklist_runs,public.eo_checklist_answers,public.eo_checklist_answer_history,public.eo_checklist_media from anon,authenticated;
create policy "EO realtime own alert receipts" on public.eo_alert_recipients for select to authenticated using(user_id=auth.uid());
create policy "EO realtime own checklist runs" on public.eo_checklist_runs for select to authenticated using(assigned_to=auth.uid());
create policy "EO realtime own checklist answers" on public.eo_checklist_answers for select to authenticated using(exists(select 1 from public.eo_checklist_runs r where r.id=run_id and r.assigned_to=auth.uid()));
grant select on public.eo_alert_recipients,public.eo_checklist_runs,public.eo_checklist_answers to authenticated;
grant select on public.eo_alert_recipients,public.eo_push_devices,public.eo_notification_settings to service_role;
grant insert on public.eo_audit_events to service_role;
grant usage,select on sequence public.eo_audit_events_id_seq to service_role;

create function public.eo_alert_feed() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if eo_private.role_of_actor() is null then raise exception 'Acesso não autorizado' using errcode='42501'; end if;
 return (select coalesce(jsonb_agg(to_jsonb(q) order by q.created_at desc),'[]') from (
   select a.id,a.title,a.body,a.urgent,a.created_at,r.seen_at,r.dismissed_at
   from public.eo_alert_recipients r join public.eo_alerts a on a.id=r.alert_id
   where r.user_id=auth.uid() order by a.created_at desc limit 100
 ) q);
end; $$;

create function public.eo_alert_mark(p_alert uuid,p_action text) returns void language plpgsql security definer set search_path='' as $$
begin
 if p_action not in ('view','dismiss') or not exists(select 1 from public.eo_alert_recipients where alert_id=p_alert and user_id=auth.uid()) then
   raise exception 'Alerta indisponível' using errcode='42501';
 end if;
 if p_action='view' then update public.eo_alert_recipients set seen_at=coalesce(seen_at,now()) where alert_id=p_alert and user_id=auth.uid();
 else update public.eo_alert_recipients set seen_at=coalesce(seen_at,now()),dismissed_at=coalesce(dismissed_at,now()) where alert_id=p_alert and user_id=auth.uid(); end if;
 insert into public.eo_audit_events(actor,action,entity_id,detail) values(auth.uid(),'alert.'||p_action,p_alert::text,'{}');
end; $$;

create function public.eo_notification_preferences(p_sound_enabled boolean default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_enabled boolean;
begin
 if eo_private.role_of_actor() is null then raise exception 'Acesso não autorizado' using errcode='42501'; end if;
 if p_sound_enabled is not null then
   insert into public.eo_notification_settings(user_id,sound_enabled) values(auth.uid(),p_sound_enabled)
   on conflict(user_id) do update set sound_enabled=excluded.sound_enabled,updated_at=now();
   insert into public.eo_audit_events(actor,action,entity_id,detail) values(auth.uid(),'notification.sound.changed',auth.uid()::text,jsonb_build_object('sound_enabled',p_sound_enabled));
 end if;
 select coalesce((select sound_enabled from public.eo_notification_settings where user_id=auth.uid()),true) into v_enabled;
 return jsonb_build_object('sound_enabled',v_enabled,'system_permission_managed_by_os',true);
end; $$;

create function public.eo_register_push_device(p_token text,p_platform text) returns void language plpgsql security definer set search_path='' as $$
begin
 if eo_private.role_of_actor() is null or p_platform not in ('ios','android') or p_token !~ '^ExponentPushToken\[[^]]+\]$' then raise exception 'Dispositivo ou sessão inválidos' using errcode='42501'; end if;
 insert into public.eo_push_devices(user_id,expo_push_token,platform) values(auth.uid(),p_token,p_platform)
 on conflict(expo_push_token) do update set user_id=excluded.user_id,platform=excluded.platform,updated_at=now();
 insert into public.eo_audit_events(actor,action,entity_id,detail) values(auth.uid(),'notification.device.registered',auth.uid()::text,jsonb_build_object('platform',p_platform));
end; $$;

create function public.eo_alert_push_metadata(p_alert uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if eo_private.role_of_actor() not in ('admin','diretor','gerente') or eo_private.role_of_actor() is null then raise exception 'Envio de alerta não autorizado' using errcode='42501'; end if;
 if not exists(select 1 from public.eo_alerts where id=p_alert and created_by=auth.uid()) then raise exception 'Alerta indisponível' using errcode='42501'; end if;
 return (select jsonb_build_object('id',a.id,'title',a.title,'body',a.body,'urgent',a.urgent) from public.eo_alerts a where a.id=p_alert);
end; $$;

create function public.eo_test_push_metadata() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if eo_private.role_of_actor() is distinct from 'admin' then raise exception 'Apenas administrador pode enviar teste' using errcode='42501'; end if;
 return jsonb_build_object('user_id',auth.uid());
end; $$;

create function public.eo_publish_alert(p_title text,p_body text,p_stores uuid[],p_urgent boolean default false) returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid := gen_random_uuid(); v_role text := eo_private.role_of_actor();
begin
 if v_role not in ('admin','diretor','gerente') or v_role is null then raise exception 'Publicação não autorizada' using errcode='42501'; end if;
 if coalesce(cardinality(p_stores),0)=0 or cardinality(p_stores)>2000 or length(trim(p_title)) not between 3 and 120 or length(trim(p_body)) not between 1 and 3000 then raise exception 'Revise título, mensagem e lojas'; end if;
 if exists(select 1 from unnest(p_stores) s where not eo_private.has_store(s)) then raise exception 'Loja fora da abrangência' using errcode='42501'; end if;
 insert into public.eo_alerts(id,created_by,title,body,urgent) values(v_id,auth.uid(),trim(p_title),trim(p_body),coalesce(p_urgent,false));
 insert into public.eo_alert_stores select distinct v_id,s from unnest(p_stores) s;
 insert into public.eo_alert_recipients(alert_id,user_id)
 select v_id,p.id from public.eo_profiles p where p.active and (p.role='admin' or exists(select 1 from public.eo_store_members m where m.user_id=p.id and m.store_id=any(p_stores)));
 insert into public.eo_audit_events(actor,action,entity_id,detail) values(auth.uid(),'alert.published',v_id::text,jsonb_build_object('store_count',cardinality(p_stores),'recipient_count',(select count(*) from public.eo_alert_recipients where alert_id=v_id)));
 return v_id;
end; $$;

create function public.eo_checklist_create(p_title text,p_description text,p_items jsonb,p_stores uuid[]) returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid := gen_random_uuid(); v_item jsonb; v_pos int := 0; v_role text := eo_private.role_of_actor(); v_store uuid;
begin
 if v_role not in ('admin','diretor','gerente') or v_role is null then raise exception 'Criação não autorizada' using errcode='42501'; end if;
 if length(trim(p_title)) not between 3 and 120 or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items) not between 1 and 100 or coalesce(cardinality(p_stores),0)=0 then raise exception 'Informe título, perguntas e lojas'; end if;
 if exists(select 1 from unnest(p_stores) s where not eo_private.has_store(s)) then raise exception 'Loja fora da abrangência' using errcode='42501'; end if;
 insert into public.eo_checklist_templates(id,created_by,title,description) values(v_id,auth.uid(),trim(p_title),left(trim(coalesce(p_description,'')),1000));
 for v_item in select value from jsonb_array_elements(p_items) loop
   v_pos:=v_pos+1;
   if v_item->>'type' not in ('acceptance','photo','text','yes_no') or length(trim(coalesce(v_item->>'prompt',''))) not between 2 and 500 then raise exception 'Pergunta % inválida',v_pos; end if;
   insert into public.eo_checklist_items(template_id,position,prompt,answer_type,required,options)
   values(v_id,v_pos,trim(v_item->>'prompt'),v_item->>'type',coalesce((v_item->>'required')::boolean,true),coalesce(v_item->'options','[]'::jsonb));
 end loop;
 foreach v_store in array p_stores loop
   insert into public.eo_checklist_runs(template_id,store_id,assigned_to,assigned_by)
   select v_id,v_store,m.user_id,auth.uid() from public.eo_store_members m join public.eo_profiles p on p.id=m.user_id and p.active where m.store_id=v_store
   on conflict do nothing;
 end loop;
 insert into public.eo_audit_events(actor,action,entity_id,detail) values(auth.uid(),'checklist.created',v_id::text,jsonb_build_object('items',v_pos,'stores',cardinality(p_stores)));
 return v_id;
end; $$;

create function public.eo_checklist_feed() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if eo_private.role_of_actor() is null then raise exception 'Acesso não autorizado' using errcode='42501'; end if;
 return (select coalesce(jsonb_agg(to_jsonb(q) order by q.assigned_at desc),'[]') from (
   select r.id run_id,r.status,r.assigned_at,r.updated_at,s.id store_id,s.name store_name,t.id template_id,t.title,t.description,
    (select count(*) from public.eo_checklist_items i where i.template_id=t.id) item_count,
    (select count(*) from public.eo_checklist_answers a join public.eo_checklist_items i on i.id=a.item_id where a.run_id=r.id) answered_count
   from public.eo_checklist_runs r join public.eo_checklist_templates t on t.id=r.template_id join public.eo_stores s on s.id=r.store_id
   where r.assigned_to=auth.uid() order by r.assigned_at desc limit 100
 ) q);
end; $$;

create function public.eo_checklist_detail(p_run uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_out jsonb;
begin
 if not exists(select 1 from public.eo_checklist_runs r where r.id=p_run and (r.assigned_to=auth.uid() or (eo_private.role_of_actor() in ('admin','diretor','gerente') and eo_private.has_store(r.store_id)))) then raise exception 'Checklist não autorizado' using errcode='42501'; end if;
 select jsonb_build_object('run',to_jsonb(r),'store_name',s.name,'title',t.title,'description',t.description,'items',coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'position',i.position,'prompt',i.prompt,'type',i.answer_type,'required',i.required,'options',i.options,'answer',a.answer) order by i.position) from public.eo_checklist_items i left join public.eo_checklist_answers a on a.item_id=i.id and a.run_id=r.id where i.template_id=t.id),'[]'))
 into v_out from public.eo_checklist_runs r join public.eo_checklist_templates t on t.id=r.template_id join public.eo_stores s on s.id=r.store_id where r.id=p_run;
 return v_out;
end; $$;

create function public.eo_checklist_save(p_run uuid,p_item uuid,p_answer jsonb) returns void language plpgsql security definer set search_path='' as $$
declare v_type text; v_required boolean; v_path text;
begin
 if jsonb_typeof(p_answer) is distinct from 'object' then raise exception 'Resposta inválida'; end if;
 if not exists(select 1 from public.eo_checklist_runs r join public.eo_checklist_templates t on t.id=r.template_id and t.active where r.id=p_run and r.assigned_to=auth.uid()) then raise exception 'Checklist não editável' using errcode='42501'; end if;
 select i.answer_type,i.required into v_type,v_required from public.eo_checklist_items i join public.eo_checklist_runs r on r.template_id=i.template_id where i.id=p_item and r.id=p_run;
 if v_type is null then raise exception 'Pergunta inválida'; end if;
 if v_type='acceptance' and coalesce(p_answer->>'accepted','')<>'true' then raise exception 'Confirme o aceite da orientação'; end if;
 if v_type='yes_no' and jsonb_typeof(p_answer->'value') is distinct from 'boolean' then raise exception 'Escolha sim ou não'; end if;
 if v_type='text' and (jsonb_typeof(p_answer->'text') is distinct from 'string' or length(p_answer->>'text')>4000 or (v_required and length(trim(coalesce(p_answer->>'text','')))=0)) then raise exception 'Resposta aberta inválida'; end if;
 if v_type='photo' then
   v_path:=p_answer->>'path';
   if v_path is null or split_part(v_path,'/',1)<>auth.uid()::text or split_part(v_path,'/',2)<>p_run::text then raise exception 'Foto sem caminho seguro'; end if;
   insert into public.eo_checklist_media(run_id,item_id,user_id,object_path) values(p_run,p_item,auth.uid(),v_path) on conflict(object_path) do nothing;
 end if;
 insert into public.eo_checklist_answer_history(run_id,item_id,answer,updated_by) values(p_run,p_item,p_answer,auth.uid());
 insert into public.eo_checklist_answers(run_id,item_id,answer,updated_by) values(p_run,p_item,p_answer,auth.uid())
 on conflict(run_id,item_id) do update set answer=excluded.answer,updated_by=excluded.updated_by,updated_at=now();
 update public.eo_checklist_runs r set status=case when r.status='pending' then 'in_progress' else r.status end,updated_at=now(),
 completed_at=case when not exists(select 1 from public.eo_checklist_items i where i.template_id=r.template_id and i.required and i.id<>p_item and not exists(select 1 from public.eo_checklist_answers a where a.run_id=r.id and a.item_id=i.id)) then now() else null end
 where r.id=p_run;
 update public.eo_checklist_runs r set status='completed' where r.id=p_run and r.completed_at is not null;
 insert into public.eo_audit_events(actor,action,entity_id,detail) values(auth.uid(),'checklist.answer.saved',p_run::text,jsonb_build_object('item_id',p_item,'type',v_type));
end; $$;

create function public.eo_checklist_photo_path(p_run uuid,p_item uuid) returns text language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.eo_checklist_runs where id=p_run and assigned_to=auth.uid()) or not exists(select 1 from public.eo_checklist_items i join public.eo_checklist_runs r on r.template_id=i.template_id where r.id=p_run and i.id=p_item and i.answer_type='photo') then raise exception 'Foto não autorizada' using errcode='42501'; end if;
 return auth.uid()::text||'/'||p_run::text||'/'||p_item::text||'/'||gen_random_uuid()::text||'.jpg';
end; $$;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('eo-checklist-photos','eo-checklist-photos',false,10485760,array['image/jpeg','image/png','image/webp']) on conflict(id) do nothing;
create policy "EO user uploads own checklist photos" on storage.objects for insert to authenticated with check(bucket_id='eo-checklist-photos' and (storage.foldername(name))[1]=auth.uid()::text and exists(select 1 from public.eo_checklist_runs r where r.id=((storage.foldername(name))[2])::uuid and r.assigned_to=auth.uid()));
create policy "EO user and authorized leaders read checklist photos" on storage.objects for select to authenticated using(bucket_id='eo-checklist-photos' and ((storage.foldername(name))[1]=auth.uid()::text or (eo_private.role_of_actor() in ('admin','diretor','gerente') and exists(select 1 from public.eo_checklist_runs r where r.id=((storage.foldername(name))[2])::uuid and eo_private.has_store(r.store_id)))));

revoke all on function public.eo_alert_feed(),public.eo_alert_mark(uuid,text),public.eo_notification_preferences(boolean),public.eo_register_push_device(text,text),public.eo_alert_push_metadata(uuid),public.eo_test_push_metadata(),public.eo_publish_alert(text,text,uuid[],boolean),public.eo_checklist_create(text,text,jsonb,uuid[]),public.eo_checklist_feed(),public.eo_checklist_detail(uuid),public.eo_checklist_save(uuid,uuid,jsonb),public.eo_checklist_photo_path(uuid,uuid) from public,anon;
grant execute on function public.eo_alert_feed(),public.eo_alert_mark(uuid,text),public.eo_notification_preferences(boolean),public.eo_register_push_device(text,text),public.eo_alert_push_metadata(uuid),public.eo_test_push_metadata(),public.eo_publish_alert(text,text,uuid[],boolean),public.eo_checklist_create(text,text,jsonb,uuid[]),public.eo_checklist_feed(),public.eo_checklist_detail(uuid),public.eo_checklist_save(uuid,uuid,jsonb),public.eo_checklist_photo_path(uuid,uuid) to authenticated;
grant select,insert,update,delete on storage.objects to authenticated;

do $$ begin
 if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='eo_alert_recipients') then alter publication supabase_realtime add table public.eo_alert_recipients; end if;
 if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='eo_checklist_runs') then alter publication supabase_realtime add table public.eo_checklist_runs; end if;
 if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='eo_checklist_answers') then alter publication supabase_realtime add table public.eo_checklist_answers; end if;
end $$;

insert into eo_private.schema_migrations(version) values('202610310001_alerts_checklists');
commit;

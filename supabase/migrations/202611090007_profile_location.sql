begin;
create table public.eo_profile_preferences (
 user_id uuid primary key references public.eo_profiles(id),
 contact_channel text not null default 'whatsapp' check(contact_channel in ('whatsapp','phone','email','other')),
 updated_at timestamptz not null default now()
);
create table public.eo_store_hours (
 store_id uuid primary key references public.eo_stores(id),
 hours jsonb not null, updated_by uuid not null references public.eo_profiles(id), updated_at timestamptz not null default now()
);
create table public.eo_checklist_locations (
 id uuid primary key default gen_random_uuid(),run_id uuid not null references public.eo_checklist_runs(id),
 actor uuid not null references public.eo_profiles(id), consent boolean not null,
 latitude numeric,longitude numeric,accuracy numeric,recorded_at timestamptz not null default now(),
 check((consent and latitude is not null and longitude is not null and accuracy is not null
   and latitude between -90 and 90 and longitude between -180 and 180 and accuracy between 0 and 1000000)
   or (not consent and latitude is null and longitude is null and accuracy is null))
);
alter table public.eo_profile_preferences enable row level security;
alter table public.eo_store_hours enable row level security;
alter table public.eo_checklist_locations enable row level security;
revoke all on public.eo_profile_preferences,public.eo_store_hours,public.eo_checklist_locations from anon,authenticated;

create function public.eo_profile_preferences(p_phone text default null,p_channel text default null,p_store uuid default null,p_hours jsonb default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_role text:=eo_private.role_of_actor();v_day jsonb;
begin
 if v_role is null then raise exception 'Entre novamente' using errcode='42501';end if;
 if p_phone is not null then perform public.eo_save_my_phone(p_phone);end if;
 if p_channel is not null then
  if p_channel not in ('whatsapp','phone','email','other') then raise exception 'Canal inválido';end if;
  insert into public.eo_profile_preferences(user_id,contact_channel) values(auth.uid(),p_channel)
   on conflict(user_id) do update set contact_channel=excluded.contact_channel,updated_at=now();
 end if;
 if p_hours is not null then
  if v_role not in ('admin','gerente') or not eo_private.has_store(p_store) then raise exception 'Unidade fora do seu acesso' using errcode='42501';end if;
  if jsonb_typeof(p_hours)<>'array' or jsonb_array_length(p_hours)<>7 then raise exception 'Informe os sete dias';end if;
  if (select count(distinct value->>'day') from jsonb_array_elements(p_hours))<>7 then raise exception 'Dia duplicado';end if;
  for v_day in select value from jsonb_array_elements(p_hours) loop
   if coalesce(v_day->>'day','') !~ '^[0-6]$' or jsonb_typeof(v_day->'closed') is distinct from 'boolean'
    or (not (v_day->>'closed')::boolean and (coalesce(v_day->>'opens','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' or coalesce(v_day->>'closes','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$')) then raise exception 'Revise os horários';end if;
  end loop;
  insert into public.eo_store_hours(store_id,hours,updated_by) values(p_store,p_hours,auth.uid())
   on conflict(store_id) do update set hours=excluded.hours,updated_by=auth.uid(),updated_at=now();
  insert into public.eo_audit_events(actor,action,entity_id,detail) values(auth.uid(),'store.hours_updated',p_store::text,jsonb_build_object('hours',p_hours));
 end if;
 return jsonb_build_object('phone',eo_private.effective_contact_phone(auth.uid()),
  'channel',coalesce((select contact_channel from public.eo_profile_preferences where user_id=auth.uid()),'whatsapp'),
  'stores',coalesce((select jsonb_agg(jsonb_build_object('store_id',h.store_id,'hours',h.hours)) from public.eo_store_hours h where eo_private.has_store(h.store_id)),'[]'::jsonb));
end;$$;

create function public.eo_record_checklist_location(p_run uuid,p_consent boolean,p_lat numeric default null,p_lon numeric default null,p_accuracy numeric default null)
returns void language plpgsql security definer set search_path='' as $$
begin
 if eo_private.role_of_actor() is null or not exists(select 1 from public.eo_checklist_runs r where r.id=p_run and r.assigned_to=auth.uid() and eo_private.has_store(r.store_id)) then raise exception 'Checklist fora do seu acesso' using errcode='42501';end if;
 if p_consent is null or (p_consent and (p_lat is null or p_lon is null or p_accuracy is null or p_lat::text='NaN' or p_lon::text='NaN' or p_accuracy::text='NaN' or p_lat not between -90 and 90 or p_lon not between -180 and 180 or p_accuracy<0 or p_accuracy>1000000)) then raise exception 'Localização inválida';end if;
 insert into public.eo_checklist_locations(run_id,actor,consent,latitude,longitude,accuracy)
 values(p_run,auth.uid(),p_consent,case when p_consent then p_lat end,case when p_consent then p_lon end,case when p_consent then p_accuracy end);
 insert into public.eo_audit_events(actor,action,entity_id,detail) values(auth.uid(),'checklist.location_recorded',p_run::text,jsonb_build_object('consent',p_consent));
end;$$;
revoke all on function public.eo_profile_preferences(text,text,uuid,jsonb),public.eo_record_checklist_location(uuid,boolean,numeric,numeric,numeric) from public,anon;
grant execute on function public.eo_profile_preferences(text,text,uuid,jsonb),public.eo_record_checklist_location(uuid,boolean,numeric,numeric,numeric) to authenticated;
insert into eo_private.schema_migrations(version) values('202611090007_profile_location') on conflict do nothing;
commit;

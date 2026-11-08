begin;
create or replace function public.eo_save_day_entry(p_store uuid,p_date date,p_outcome text,p_reasons text[],p_note text,
  p_audio_path text default null,p_audio_seconds numeric default null,p_transcript text default null,p_request_id uuid default null) returns uuid
language plpgsql security definer set search_path='' as $$
declare v_id uuid; v_store public.eo_stores%rowtype; v_reasons text[]; v_name text; v_request uuid:=coalesce(p_request_id,gen_random_uuid());
begin
  if p_audio_path is not null and coalesce(length(trim(p_transcript)),0)=0 then raise exception 'Transcreva e revise o áudio antes de salvar'; end if;
  if not eo_private.has_store(p_store) then raise exception 'Loja fora da abrangência' using errcode='42501'; end if;
  select id into v_id from public.eo_day_records where person_id=auth.uid() and request_id=v_request;
  if found then return v_id; end if;
  if p_date is null or p_outcome is null or p_outcome not in ('sold','no_sale') or length(coalesce(p_note,''))>5000
    or length(coalesce(p_transcript,''))>10000 or coalesce(cardinality(p_reasons),0)>20 then raise exception 'Revise os dados do dia'; end if;
  if exists(select 1 from unnest(p_reasons) r where r is null or length(trim(r)) not between 1 and 120) then raise exception 'Motivo inválido'; end if;
  select coalesce(array_agg(distinct trim(r)),'{}') into v_reasons from unnest(p_reasons) r;
  if p_outcome='no_sale' and cardinality(v_reasons)=0 then raise exception 'Informe pelo menos um motivo para não vender'; end if;
  if p_audio_path is not null then
    if p_audio_seconds is null or p_audio_seconds<=0 or p_audio_seconds>60 or p_audio_seconds::text='NaN' then raise exception 'O áudio deve ter até 60 segundos'; end if;
    perform eo_private.require_operational_object('eo-day-audio',p_audio_path);
  elsif p_audio_seconds is not null then raise exception 'Duração informada sem áudio'; end if;
  select * into strict v_store from public.eo_stores where id=p_store;
  select display_name into strict v_name from public.eo_profiles where id=auth.uid();
  insert into public.eo_day_records(store_id,person_id,entry_date,request_id,store_code,store_name,region,scope_snapshot,person_name,
    outcome,reasons,note,audio_path,audio_seconds,transcript,transcription_status)
  values(p_store,auth.uid(),p_date,v_request,v_store.code,v_store.name,v_store.region,
    jsonb_build_object('ggl',v_store.ggl,'role',eo_private.role_of_actor()),v_name,
    p_outcome,v_reasons,trim(coalesce(p_note,'')),p_audio_path,p_audio_seconds,nullif(trim(p_transcript),''),
    case when nullif(trim(p_transcript),'') is null then 'not_requested' else 'provided' end)
    on conflict(person_id,request_id) do nothing returning id into v_id;
  if v_id is null then
    select id into strict v_id from public.eo_day_records where person_id=auth.uid() and request_id=v_request;
    return v_id;
  end if;
  insert into public.eo_audit_events(actor,action,entity_id,detail) values(auth.uid(),'day_entry.saved',v_id::text,
    jsonb_build_object('store_id',p_store,'entry_date',p_date,'outcome',p_outcome,'has_audio',p_audio_path is not null));
  return v_id;
end; $$;
commit;

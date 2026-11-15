begin;
create table public.eo_offline_operations (
 user_id uuid not null references public.perfis(id),request_id uuid not null,method text not null,
 request_payload jsonb not null,result jsonb,recorded_at timestamptz not null,applied_at timestamptz not null default now(),
 primary key(user_id,request_id)
);
create index eo_offline_operations_actor_time on public.eo_offline_operations(user_id,applied_at desc);
alter table public.eo_offline_operations enable row level security;
revoke all on public.eo_offline_operations from public,anon,authenticated;
create function public.eo_apply_offline(p_id uuid,p_method text,p_args jsonb,p_recorded_at timestamptz) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();previous public.eo_offline_operations%rowtype;value jsonb;answer jsonb;
begin
 if actor is null or eo_private.role_of_actor() is null then raise exception 'Entre novamente para sincronizar' using errcode='42501';end if;
 if p_id is null or p_args is null or jsonb_typeof(p_args)<>'object' or pg_column_size(p_args)>65536 or p_recorded_at is null or p_recorded_at>now()+interval '1 day' then raise exception 'Registro offline inválido';end if;
 if p_method is null or p_method not in ('eo_save_day_entry','eo_save_mood','eo_save_product_request','eo_notice_open','eo_acknowledge','eo_checklist_save') then raise exception 'Operação offline não permitida' using errcode='42501';end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(actor::text||p_id::text,0));
 select * into previous from public.eo_offline_operations where user_id=actor and request_id=p_id;
 if found then
  if previous.method<>p_method or previous.request_payload<>p_args then raise exception 'Identificador offline reutilizado com outro conteúdo' using errcode='22023';end if;
  return previous.result;
 end if;
 if (select count(*) from public.eo_offline_operations where user_id=actor and applied_at>now()-interval '1 day')>=500 then raise exception 'Limite diário de sincronização atingido';end if;
 case p_method
 when 'eo_save_day_entry' then
  if p_args->>'p_audio_path' is not null or p_args->>'p_audio_seconds' is not null then raise exception 'Áudio precisa ser enviado com conexão';end if;
  select to_jsonb(public.eo_save_day_entry((p_args->>'p_store')::uuid,(p_args->>'p_date')::date,p_args->>'p_outcome',array(select jsonb_array_elements_text(coalesce(p_args->'p_reasons','[]'::jsonb))),p_args->>'p_note',null,null,p_args->>'p_transcript',coalesce((p_args->>'p_request_id')::uuid,p_id),coalesce(p_args->'p_answers','{}'::jsonb),(p_args->>'p_questionnaire_version')::integer)) into value;
 when 'eo_save_mood' then
  select to_jsonb(public.eo_save_mood((p_args->>'p_store')::uuid,(p_args->>'p_date')::date,p_args->>'p_mood',coalesce((p_args->>'p_request_id')::uuid,p_id))) into value;
 when 'eo_save_product_request' then
  if p_args->>'p_audio' is not null or p_args->>'p_seconds' is not null then raise exception 'Áudio precisa ser enviado com conexão';end if;
  select to_jsonb(public.eo_save_product_request((p_args->>'p_store')::uuid,p_args->>'p_note',coalesce(p_args->'p_details','{}'::jsonb),coalesce((p_args->>'p_request')::uuid,p_id),null,null,p_args->>'p_transcript')) into value;
 when 'eo_notice_open' then
  perform public.eo_notice_open((p_args->>'p_notice')::uuid,(p_args->>'p_version')::integer);value:='null'::jsonb;
 when 'eo_acknowledge' then
  select to_jsonb(public.eo_acknowledge((p_args->>'p_notice')::uuid,(p_args->>'p_version')::integer)) into value;
 when 'eo_checklist_save' then
  answer:=p_args->'p_answer';
  if answer is null or jsonb_typeof(answer)<>'object' or answer='{}'::jsonb or exists(select 1 from jsonb_each(answer) a where not((a.key='text' and jsonb_typeof(a.value)='string') or (a.key in ('value','accepted') and jsonb_typeof(a.value)='boolean'))) then raise exception 'Somente respostas sem mídia podem ser sincronizadas';end if;
  perform public.eo_checklist_save((p_args->>'p_run')::uuid,(p_args->>'p_item')::uuid,answer);value:='null'::jsonb;
 end case;
 insert into public.eo_offline_operations(user_id,request_id,method,request_payload,result,recorded_at) values(actor,p_id,p_method,p_args,value,p_recorded_at);
 insert into public.auditoria(actor,action,entity_id,detail,modulo) values(actor,'offline.operation.applied',p_id::text,jsonb_build_object('method',p_method,'recorded_at',p_recorded_at),'eo');
 return value;
end;$$;
revoke all on function public.eo_apply_offline(uuid,text,jsonb,timestamptz) from public,anon;
grant execute on function public.eo_apply_offline(uuid,text,jsonb,timestamptz) to authenticated;
insert into eo_private.schema_migrations(version) values('202611150003_offline_replay') on conflict do nothing;
notify pgrst,'reload schema';
commit;

-- Questionários versionados e respostas imutáveis de sentimento.
begin;
create table public.eo_diary_questionnaires (
 version integer generated always as identity primary key,
 config jsonb not null, created_by uuid references public.eo_profiles(id),created_at timestamptz not null default now()
);
alter table public.eo_diary_questionnaires enable row level security;
revoke all on public.eo_diary_questionnaires from public,anon,authenticated;
insert into public.eo_diary_questionnaires(config) values('{"prompt":"Como foi o dia de vendas?","note_label":"Conte o que aconteceu","note_required":false,"note_max_chars":5000,"sold":["Bom atendimento","Produto disponível","Campanha e preço","Fluxo de clientes","Equipe preparada","Outro"],"no_sale":["Baixo fluxo","Falta de produto","Preço","Crédito e pagamento","Equipe reduzida","Problema de sistema","Outro"],"questions":[]}');
alter table public.eo_day_records add column questionnaire_version integer references public.eo_diary_questionnaires(version);
alter table public.eo_day_records add column questionnaire_snapshot jsonb;
alter table public.eo_day_records add column answers jsonb not null default '{}';

create function eo_private.validate_diary_config(p_config jsonb) returns void
language plpgsql immutable set search_path='' as $$
declare q jsonb; v_key text; v_ids text[]:='{}'; v_limit integer;
begin
 if jsonb_typeof(p_config) is distinct from 'object' or length(trim(p_config->>'prompt')) not between 3 and 300
 or p_config->>'prompt' is null or length(trim(p_config->>'note_label')) not between 1 and 300 or p_config->>'note_label' is null
 or jsonb_typeof(p_config->'note_required') is distinct from 'boolean'
 or coalesce(p_config->>'note_max_chars','') !~ '^[0-9]{1,4}$' then raise exception 'Configuração do diário inválida'; end if;
 v_limit:=(p_config->>'note_max_chars')::integer;
 if v_limit not between 1 and 5000 then raise exception 'Limite do relato deve estar entre 1 e 5000'; end if;
 foreach v_key in array array['sold','no_sale'] loop
 if jsonb_typeof(p_config->v_key) is distinct from 'array' then raise exception 'Informe as categorias de influência'; end if;
 if jsonb_array_length(p_config->v_key) not between 1 and 20 or exists(select 1 from jsonb_array_elements(p_config->v_key) x where jsonb_typeof(x)<>'string' or length(trim(x#>>'{}')) not between 1 and 120) then raise exception 'Informe de 1 a 20 categorias de até 120 caracteres'; end if;
 end loop;
 if jsonb_typeof(p_config->'questions') is distinct from 'array' then raise exception 'Perguntas inválidas'; end if;
 if jsonb_array_length(p_config->'questions')>15 then raise exception 'Use no máximo 15 perguntas adicionais'; end if;
 for q in select * from jsonb_array_elements(p_config->'questions') loop
 if coalesce(q->>'id','') !~ '^[A-Za-z][A-Za-z0-9_]{0,39}$' or q->>'id'=any(v_ids)
 or q->>'label' is null or length(trim(q->>'label')) not between 1 and 300 or coalesce(q->>'type','') not in ('text','number','select')
 or jsonb_typeof(q->'required') is distinct from 'boolean' or coalesce(q->>'max_chars','') !~ '^[0-9]{1,4}$'
 then raise exception 'Revise identificador, texto e tipo das perguntas'; end if;
 if (q->>'max_chars')::integer not between 1 and 5000 then raise exception 'Limite de pergunta inválido'; end if;
 v_ids:=array_append(v_ids,q->>'id');
 if q->>'type'='select' then
 if jsonb_typeof(q->'options') is distinct from 'array' then raise exception 'Informe opções de seleção'; end if;
 if jsonb_array_length(q->'options') not between 1 and 30 or exists(select 1 from jsonb_array_elements(q->'options') x where jsonb_typeof(x)<>'string' or length(trim(x#>>'{}')) not between 1 and 120) then raise exception 'Opções inválidas'; end if;
 end if;
 end loop;
end; $$;
revoke all on function eo_private.validate_diary_config(jsonb) from public,anon,authenticated;
create function public.eo_diary_configuration() returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if eo_private.role_of_actor() is null then raise exception 'Acesso negado' using errcode='42501'; end if;
 return (select jsonb_build_object('version',version,'config',config) from public.eo_diary_questionnaires order by version desc limit 1);
end; $$;
create function public.eo_admin_save_diary_configuration(p_config jsonb,p_expected_version integer) returns integer
language plpgsql security definer set search_path='' as $$
declare v_version integer; v_current integer;
begin
 if eo_private.role_of_actor() is distinct from 'admin' then raise exception 'Acesso administrativo necessário' using errcode='42501'; end if;
 perform pg_catalog.pg_advisory_xact_lock(611090006);
 select max(version) into v_current from public.eo_diary_questionnaires;
 if p_expected_version is distinct from v_current then raise exception 'O questionário mudou. Recarregue antes de salvar'; end if;
 perform eo_private.validate_diary_config(p_config);
 insert into public.eo_diary_questionnaires(config,created_by) values(p_config,auth.uid()) returning version into v_version;
 insert into public.eo_audit_events(actor,action,entity_id,detail) values(auth.uid(),'diary.configuration.saved',v_version::text,jsonb_build_object('previous_version',v_current));
 return v_version;
end; $$;
create function eo_private.validate_diary_answers(p_config jsonb,p_answers jsonb,p_note text,p_outcome text,p_reasons text[]) returns void
language plpgsql immutable set search_path='' as $$
declare q jsonb; v text;
begin
 if jsonb_typeof(p_answers) is distinct from 'object' then raise exception 'Respostas inválidas'; end if;
 if length(coalesce(p_note,''))>(p_config->>'note_max_chars')::integer or ((p_config->>'note_required')::boolean and length(trim(coalesce(p_note,'')))=0) then raise exception 'Preencha o relato conforme o limite configurado'; end if;
 if exists(select 1 from unnest(p_reasons) r where not ((p_config->p_outcome) ? r)) then raise exception 'Categoria de influência inválida para este questionário'; end if;
 if exists(select 1 from jsonb_object_keys(p_answers) k where not exists(select 1 from jsonb_array_elements(p_config->'questions') x where x->>'id'=k)) then raise exception 'Resposta sem pergunta correspondente'; end if;
 for q in select * from jsonb_array_elements(p_config->'questions') loop
 v:=p_answers->>(q->>'id');
 if (q->>'required')::boolean and length(trim(coalesce(v,'')))=0 then raise exception 'Preencha a pergunta: %',q->>'label'; end if;
 if v is null or trim(v)='' then continue; end if;
 if jsonb_typeof(p_answers->(q->>'id')) is distinct from 'string' or length(v)>(q->>'max_chars')::integer then raise exception 'Resposta inválida: %',q->>'label'; end if;
 if q->>'type'='number' and v !~ '^-?[0-9]+([.,][0-9]+)?$' then raise exception 'Informe um número: %',q->>'label'; end if;
 if q->>'type'='select' and not ((q->'options') ? v) then raise exception 'Escolha uma opção: %',q->>'label'; end if;
 end loop;
end; $$;
revoke all on function eo_private.validate_diary_answers(jsonb,jsonb,text,text,text[]) from public,anon,authenticated;

-- A política do histórico fica centralizada para respeitar a decisão administrativa vigente.
create function eo_private.mood_history_allowed() returns boolean
language sql stable security definer set search_path='' as $$ select eo_private.role_of_actor()='admin'; $$;
revoke all on function eo_private.mood_history_allowed() from public,anon,authenticated;
create function eo_private.mood_immutable() returns trigger language plpgsql set search_path='' as $$
begin raise exception 'Respostas de sentimento são imutáveis. Registre uma nova resposta'; end; $$;
create trigger eo_mood_records_immutable before update or delete on public.eo_mood_records for each row execute function eo_private.mood_immutable();

create function public.eo_mood_prompt_state() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare c public.eo_mood_configuration%rowtype; v_now timestamp; v_answered boolean;
begin
 if eo_private.role_of_actor() is null then raise exception 'Acesso negado' using errcode='42501'; end if;
 select * into strict c from public.eo_mood_configuration where id;
 v_now:=now() at time zone c.timezone;
 select exists(select 1 from public.eo_mood_records where person_id=auth.uid() and entry_date=v_now::date) into v_answered;
 return jsonb_build_object('due',c.enabled and v_now::time>=c.send_time and not v_answered,'answered',v_answered,'date',v_now::date,'prompt',c.prompt);
end; $$;
revoke all on function public.eo_diary_configuration(),public.eo_admin_save_diary_configuration(jsonb,integer),public.eo_mood_prompt_state() from public,anon;
grant execute on function public.eo_diary_configuration(),public.eo_admin_save_diary_configuration(jsonb,integer),public.eo_mood_prompt_state() to authenticated;

drop function public.eo_save_day_entry(uuid,date,text,text[],text,text,numeric,text,uuid);
create function public.eo_save_day_entry(p_store uuid,p_date date,p_outcome text,p_reasons text[],p_note text,
  p_audio_path text default null,p_audio_seconds numeric default null,p_transcript text default null,p_request_id uuid default null,p_answers jsonb default '{}',p_questionnaire_version integer default null) returns uuid
language plpgsql security definer set search_path='' as $$
declare v_id uuid; v_store public.eo_stores%rowtype; v_reasons text[]; v_name text; v_request uuid:=coalesce(p_request_id,gen_random_uuid()); v_config jsonb; v_version integer;
begin
  if p_audio_path is not null and coalesce(length(trim(p_transcript)),0)=0 then raise exception 'Transcreva e revise o áudio antes de salvar'; end if;
  if not eo_private.has_store(p_store) then raise exception 'Loja fora da abrangência' using errcode='42501'; end if;
  select id into v_id from public.eo_day_records where person_id=auth.uid() and request_id=v_request;
  if found then return v_id; end if;
  select version,config into strict v_version,v_config from public.eo_diary_questionnaires order by version desc limit 1;
  if p_questionnaire_version is not null and p_questionnaire_version<>v_version then raise exception 'O questionário mudou. Atualize antes de registrar'; end if;
  perform eo_private.validate_diary_answers(v_config,p_answers,p_note,p_outcome,p_reasons);
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
    outcome,reasons,note,audio_path,audio_seconds,transcript,transcription_status,questionnaire_version,questionnaire_snapshot,answers)
  values(p_store,auth.uid(),p_date,v_request,v_store.code,v_store.name,v_store.region,
    jsonb_build_object('ggl',v_store.ggl,'role',eo_private.role_of_actor()),v_name,
    p_outcome,v_reasons,trim(coalesce(p_note,'')),p_audio_path,p_audio_seconds,nullif(trim(p_transcript),''),
    case when nullif(trim(p_transcript),'') is null then 'not_requested' else 'provided' end,v_version,v_config,p_answers)
    on conflict(person_id,request_id) do nothing returning id into v_id;
  if v_id is null then
    select id into strict v_id from public.eo_day_records where person_id=auth.uid() and request_id=v_request;
    return v_id;
  end if;
  insert into public.eo_audit_events(actor,action,entity_id,detail) values(auth.uid(),'day_entry.saved',v_id::text,
    jsonb_build_object('store_id',p_store,'entry_date',p_date,'outcome',p_outcome,'has_audio',p_audio_path is not null));
  return v_id;
end; $$;
revoke all on function public.eo_save_day_entry(uuid,date,text,text[],text,text,numeric,text,uuid,jsonb,integer) from public,anon;
grant execute on function public.eo_save_day_entry(uuid,date,text,text[],text,text,numeric,text,uuid,jsonb,integer) to authenticated;

create or replace function public.eo_save_mood(p_store uuid,p_date date,p_mood text,p_request_id uuid default null) returns uuid
language plpgsql security definer set search_path='' as $$
declare v_id uuid; v_store public.eo_stores%rowtype; v_name text; v_request uuid:=coalesce(p_request_id,gen_random_uuid());
begin
  if not eo_private.has_store(p_store) then raise exception 'Loja fora da abrangência' using errcode='42501'; end if;
  select id into v_id from public.eo_mood_records where person_id=auth.uid() and request_id=v_request;
  if found then return v_id; end if;
  if not (select enabled from public.eo_mood_configuration where id) then raise exception 'Acompanhamento de humor desativado'; end if;
  if p_date is distinct from (now() at time zone (select timezone from public.eo_mood_configuration where id))::date then raise exception 'Registre o sentimento de hoje'; end if;
  if p_date is null or p_mood is null or p_mood not in ('happy','neutral','sad') then raise exception 'Selecione um sentimento válido'; end if;
  select * into strict v_store from public.eo_stores where id=p_store;
  select display_name into strict v_name from public.eo_profiles where id=auth.uid();
  insert into public.eo_mood_records(store_id,person_id,entry_date,request_id,store_code,store_name,region,scope_snapshot,person_name,mood)
    values(p_store,auth.uid(),p_date,v_request,v_store.code,v_store.name,v_store.region,
      jsonb_build_object('ggl',v_store.ggl,'role',eo_private.role_of_actor()),v_name,p_mood)
    on conflict(person_id,request_id) do nothing returning id into v_id;
  if v_id is null then
    select id into strict v_id from public.eo_mood_records where person_id=auth.uid() and request_id=v_request;
    return v_id;
  end if;
  insert into public.eo_audit_events(actor,action,entity_id,detail) values(auth.uid(),'mood.saved',v_id::text,
    jsonb_build_object('store_id',p_store,'entry_date',p_date));
  return v_id;
end; $$;

create or replace function public.eo_mood_entries_page(p_from date,p_to date,p_stores uuid[] default '{}',
  p_limit integer default 50,p_offset integer default 0,p_cutoff timestamptz default now()) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare v_role text:=eo_private.role_of_actor(); v_history boolean:=coalesce(eo_private.mood_history_allowed(),false); v_today date:=(now() at time zone (select timezone from public.eo_mood_configuration where id))::date; v_scope uuid[]; v_items jsonb; v_total bigint;
  v_limit integer:=greatest(1,least(coalesce(p_limit,50),500)); v_offset integer:=greatest(0,coalesce(p_offset,0));
begin
  v_scope:=eo_private.operational_report_scope(p_stores);
  if p_from is null or p_to is null or p_to<p_from or (not v_history and p_to-p_from>366) or p_cutoff is null then
    raise exception 'Escolha um intervalo de até 367 dias e um corte válido'; end if;
  select count(*) into v_total from public.eo_mood_records r
    where r.entry_date between p_from and p_to and r.created_at<=p_cutoff
      and (v_scope is null or r.store_id=any(v_scope))
      and (v_history or (r.entry_date=v_today and (v_role='diretor' or r.person_id=auth.uid())));
  select coalesce(jsonb_agg(to_jsonb(q) order by q.updated_at desc,q.id desc),'[]'::jsonb) into v_items from (
    select r.id,r.store_id,r.store_code,r.store_name,r.region,r.person_id,r.person_name,r.entry_date,r.mood,r.created_at,r.updated_at
    from public.eo_mood_records r
    where r.entry_date between p_from and p_to and r.created_at<=p_cutoff
      and (v_scope is null or r.store_id=any(v_scope))
      and (v_history or (r.entry_date=v_today and (v_role='diretor' or r.person_id=auth.uid())))
    order by r.updated_at desc,r.id desc limit v_limit offset v_offset
  ) q;
  return jsonb_build_object('items',v_items,'total',v_total,'cutoff',p_cutoff);
end; $$;

create or replace function public.eo_operational_overview(p_from date,p_to date,p_stores uuid[] default '{}',
  p_group text default 'region',p_cutoff timestamptz default now()) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare v_role text:=eo_private.role_of_actor(); v_history boolean:=coalesce(eo_private.mood_history_allowed(),false); v_today date:=(now() at time zone (select timezone from public.eo_mood_configuration where id))::date; v_scope uuid[]; v_result jsonb;
begin
  v_scope:=eo_private.operational_report_scope(p_stores);
  if p_from is null or p_to is null or p_to<p_from or (not coalesce(eo_private.mood_history_allowed(),false) and p_to-p_from>366) or p_cutoff is null then
    raise exception 'Escolha um intervalo de até 367 dias e um corte válido'; end if;
  if p_group is null or p_group not in ('region','store') then raise exception 'Agrupamento inválido'; end if;
  with diary as materialized (
    select r.store_id,r.store_code,r.store_name,r.region,r.person_id,r.reasons,r.created_at
    from public.eo_day_records r
    where r.entry_date between p_from and p_to and r.created_at<=p_cutoff
      and (v_scope is null or r.store_id=any(v_scope))
      and (v_role in ('admin','diretor') or r.person_id=auth.uid())
  ), moods as materialized (
    select r.store_id,r.store_code,r.store_name,r.region,r.person_id,r.mood,r.created_at
    from public.eo_mood_records r
    where r.entry_date between p_from and p_to and r.created_at<=p_cutoff
      and (v_scope is null or r.store_id=any(v_scope))
      and (v_history or (r.entry_date=v_today and (v_role='diretor' or r.person_id=auth.uid())))
  ), events as materialized (
    select d.store_id,d.store_code,d.store_name,d.region,d.person_id,d.created_at,'diary'::text kind,null::text mood from diary d
    union all
    select m.store_id,m.store_code,m.store_name,m.region,m.person_id,m.created_at,'mood'::text,m.mood from moods m
  ), grouped_events as (
    select e.*,case when p_group='store' then e.store_id::text else coalesce(nullif(trim(e.region),''),'Sem regional') end group_key,
      case when p_group='store' then e.store_code||' · '||e.store_name else coalesce(nullif(trim(e.region),''),'Sem regional') end group_label
    from events e
  ), groups as (
    select group_key,
      max(group_label) label,
      count(*) filter(where kind='diary') diary_count,
      count(*) filter(where mood='happy') happy,count(*) filter(where mood='neutral') neutral,count(*) filter(where mood='sad') sad
    from grouped_events group by group_key
  ), reasons as (
    select r.reason,count(*) occurrences from diary d cross join lateral unnest(d.reasons) r(reason)
    group by r.reason order by occurrences desc,r.reason limit 20
  ) select jsonb_build_object(
    'diary_count',(select count(*) from diary),'mood_count',(select count(*) from moods),
    'store_count',(select count(distinct store_id) from events),'people_count',(select count(distinct person_id) from events),
    'groups',coalesce((select jsonb_agg(jsonb_build_object('key',group_key,'label',label,'diary_count',diary_count,
      'happy',happy,'neutral',neutral,'sad',sad) order by label,group_key) from groups),'[]'::jsonb),
    'top_reasons',coalesce((select jsonb_agg(jsonb_build_object('reason',reason,'count',occurrences) order by occurrences desc,reason) from reasons),'[]'::jsonb),
    'cutoff',p_cutoff
  ) into v_result;
  return v_result;
end; $$;

create or replace function public.eo_day_entries_page(p_from date,p_to date,p_stores uuid[] default '{}',
  p_limit integer default 50,p_offset integer default 0,p_cutoff timestamptz default now()) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare v_role text:=eo_private.role_of_actor(); v_scope uuid[]; v_items jsonb; v_total bigint;
  v_limit integer:=greatest(1,least(coalesce(p_limit,50),500)); v_offset integer:=greatest(0,coalesce(p_offset,0));
begin
  v_scope:=eo_private.operational_report_scope(p_stores);
  if p_from is null or p_to is null or p_to<p_from or (not coalesce(eo_private.mood_history_allowed(),false) and p_to-p_from>366) or p_cutoff is null then
    raise exception 'Escolha um intervalo de até 367 dias e um corte válido'; end if;
  select count(*) into v_total from public.eo_day_records r
    where r.entry_date between p_from and p_to and r.created_at<=p_cutoff
      and (v_scope is null or r.store_id=any(v_scope))
      and (v_role in ('admin','diretor') or r.person_id=auth.uid());
  select coalesce(jsonb_agg(to_jsonb(q) order by q.updated_at desc,q.id desc),'[]'::jsonb) into v_items from (
    select r.id,r.store_id,r.store_code,r.store_name,r.region,r.person_id,r.person_name,r.entry_date,
      r.questionnaire_version,r.questionnaire_snapshot,r.answers,r.outcome,r.reasons,r.note,r.transcript,r.audio_path,r.audio_seconds,r.transcription_status,r.created_at,r.updated_at
    from public.eo_day_records r
    where r.entry_date between p_from and p_to and r.created_at<=p_cutoff
      and (v_scope is null or r.store_id=any(v_scope))
      and (v_role in ('admin','diretor') or r.person_id=auth.uid())
    order by r.updated_at desc,r.id desc limit v_limit offset v_offset
  ) q;
  return jsonb_build_object('items',v_items,'total',v_total,'cutoff',p_cutoff);
end; $$;
insert into eo_private.schema_migrations(version) values('202611090006_operations_config') on conflict do nothing;
commit;

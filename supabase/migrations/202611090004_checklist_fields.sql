begin;
alter table public.eo_checklist_items drop constraint eo_checklist_items_answer_type_check;
alter table public.eo_checklist_items add constraint eo_checklist_items_answer_type_check check(answer_type in ('acceptance','photo','text','yes_no','short_text','long_text','number','phone','time')),
 add column min_length integer not null default 0 check(min_length between 0 and 4000),
 add column max_length integer not null default 4000 check(max_length between 1 and 4000),
 add constraint eo_checklist_item_text_limits check(min_length<=max_length);
create or replace function public.eo_checklist_create(p_title text,p_description text,p_items jsonb,p_stores uuid[])
returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid := gen_random_uuid(); v_alert uuid; v_item jsonb; v_pos int := 0; v_role text := eo_private.role_of_actor(); v_stores uuid[];
begin
 if v_role not in ('admin','diretor','gerente') or v_role is null then raise exception 'Criação não autorizada' using errcode='42501'; end if;
 if p_title is null or length(trim(p_title)) not between 3 and 120 or jsonb_typeof(p_items) is distinct from 'array' then raise exception 'Informe título, perguntas e lojas'; end if;
 if jsonb_array_length(p_items) not between 1 and 100 or coalesce(cardinality(p_stores),0)=0 then raise exception 'Informe de 1 a 100 perguntas e selecione lojas'; end if;
 if exists(select 1 from unnest(p_stores) s where s is null or not eo_private.has_store(s)) then raise exception 'Loja fora da abrangência' using errcode='42501'; end if;
 if exists(select 1 from unnest(p_stores) selected where not exists(select 1 from public.eo_stores s where s.id=selected and s.active)) then raise exception 'Selecione somente lojas ativas existentes'; end if;
 select array_agg(distinct s) into v_stores from unnest(p_stores) s;
 insert into public.eo_checklist_templates(id,created_by,title,description) values(v_id,auth.uid(),trim(p_title),left(trim(coalesce(p_description,'')),1000));
 for v_item in select value from jsonb_array_elements(p_items) loop
   v_pos:=v_pos+1;
   if jsonb_typeof(v_item) is distinct from 'object' or coalesce(v_item->>'type','') not in ('acceptance','photo','text','yes_no','short_text','long_text','number','phone','time')
     or length(trim(coalesce(v_item->>'prompt',''))) not between 2 and 500
     or (v_item ? 'required' and jsonb_typeof(v_item->'required') is distinct from 'boolean') then raise exception 'Pergunta % inválida',v_pos; end if;
   if (v_item ? 'min_length' and (v_item->>'min_length' !~ '^[0-9]{1,4}$' or (v_item->>'min_length')::int>4000))
    or (v_item ? 'max_length' and (v_item->>'max_length' !~ '^[0-9]{1,4}$' or (v_item->>'max_length')::int not between 1 and 4000))
    or coalesce((v_item->>'min_length')::int,0)>coalesce((v_item->>'max_length')::int,case when v_item->>'type'='short_text' then 280 else 4000 end)
    then raise exception 'Limites da pergunta % inválidos',v_pos; end if;
   insert into public.eo_checklist_items(template_id,position,prompt,answer_type,required,options,min_length,max_length)
   values(v_id,v_pos,trim(v_item->>'prompt'),v_item->>'type',coalesce((v_item->>'required')::boolean,true),'[]'::jsonb,coalesce((v_item->>'min_length')::int,0),coalesce((v_item->>'max_length')::int,case when v_item->>'type'='short_text' then 280 else 4000 end));
 end loop;
 insert into public.eo_checklist_runs(template_id,store_id,assigned_to,assigned_by)
 with selected_stores as materialized (select id,code,ggl from public.eo_stores where id=any(v_stores) and active),
 candidates as (
   select s.id store_id,p.id user_id from selected_stores s cross join public.eo_profiles p where p.active and p.role='admin'
   union
   select s.id,p.id from selected_stores s join public.eo_store_members m on m.store_id=s.id
     join public.eo_profiles p on p.id=m.user_id and p.active
   union
   select s.id,p.id from selected_stores s join public.eo_org_assignments a on a.scope_type='LOJA' and a.scope_code=s.code and a.active
     join public.eo_profiles p on p.login_chapa=a.chapa and p.active
   union
   select s.id,p.id from selected_stores s join public.eo_org_assignments a on a.scope_type='GGL' and a.scope_code=s.ggl and a.active
     join public.eo_profiles p on p.login_chapa=a.chapa and p.active
 ) select v_id,c.store_id,c.user_id,auth.uid() from candidates c;
 insert into public.eo_alerts(created_by,title,body,data)
 values(auth.uid(),'Novo checklist disponível','Um novo checklist foi atribuído a você. Abra Checklists para responder.',jsonb_build_object('type','checklist','template_id',v_id)) returning id into v_alert;
 insert into public.eo_alert_stores(alert_id,store_id) select v_alert,s from unnest(v_stores) s;
 insert into public.eo_alert_recipients(alert_id,user_id)
 select distinct v_alert,r.assigned_to from public.eo_checklist_runs r where r.template_id=v_id;
 update public.eo_checklist_templates set notification_alert_id=v_alert where id=v_id;
 insert into public.eo_audit_events(actor,action,entity_id,detail) values(auth.uid(),'checklist.created',v_id::text,
   jsonb_build_object('items',v_pos,'stores',cardinality(v_stores),'assignments',(select count(*) from public.eo_checklist_runs where template_id=v_id),
     'notification_alert_id',v_alert,'recipients',(select count(*) from public.eo_alert_recipients where alert_id=v_alert)));
 return v_id;
end; $$;

create or replace function public.eo_checklist_detail(p_run uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_out jsonb;
begin
 if not exists(select 1 from public.eo_checklist_runs r where r.id=p_run and (r.assigned_to=auth.uid() or (eo_private.role_of_actor() in ('admin','diretor','gerente') and eo_private.has_store(r.store_id)))) then raise exception 'Checklist não autorizado' using errcode='42501'; end if;
 select jsonb_build_object('run',to_jsonb(r),'store_name',s.name,'title',t.title,'description',t.description,'items',coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'position',i.position,'prompt',i.prompt,'type',i.answer_type,'required',i.required,'options',i.options,'min_length',i.min_length,'max_length',i.max_length,'answer',a.answer) order by i.position) from public.eo_checklist_items i left join public.eo_checklist_answers a on a.item_id=i.id and a.run_id=r.id where i.template_id=t.id),'[]'))
 into v_out from public.eo_checklist_runs r join public.eo_checklist_templates t on t.id=r.template_id join public.eo_stores s on s.id=r.store_id where r.id=p_run;
 return v_out;
end; $$;

create or replace function public.eo_checklist_save(p_run uuid,p_item uuid,p_answer jsonb) returns void language plpgsql security definer set search_path='' as $$
declare v_type text; v_required boolean; v_path text; v_text text; v_min int; v_max int; v_flag boolean; v_answer jsonb;
begin
 if eo_private.role_of_actor() is null then raise exception 'Acesso não autorizado' using errcode='42501'; end if;
 if jsonb_typeof(p_answer) is distinct from 'object' then raise exception 'Resposta inválida'; end if;
 if not exists(select 1 from public.eo_checklist_runs r join public.eo_checklist_templates t on t.id=r.template_id and t.active where r.id=p_run and r.assigned_to=auth.uid()) then raise exception 'Checklist não editável' using errcode='42501'; end if;
 select i.answer_type,i.required,i.min_length,i.max_length into v_type,v_required,v_min,v_max from public.eo_checklist_items i join public.eo_checklist_runs r on r.template_id=i.template_id where i.id=p_item and r.id=p_run;
 if v_type is null then raise exception 'Pergunta inválida'; end if;
 if v_type='acceptance' and coalesce(p_answer->>'accepted','')<>'true' then raise exception 'Confirme o aceite da orientação'; end if;
 if v_type='yes_no' and jsonb_typeof(p_answer->'value') is distinct from 'boolean' then raise exception 'Escolha sim ou não'; end if;
 if v_type in ('text','short_text','long_text','number','phone','time') then
  v_text:=p_answer->>'text';
  if jsonb_typeof(p_answer->'text') is distinct from 'string' or length(v_text)>v_max
   or (length(trim(v_text))>0 and length(v_text)<v_min) or (v_required and length(trim(v_text))=0)
   then raise exception 'Confira a resposta e o limite de caracteres'; end if;
  if trim(v_text)<>'' then
   if v_type='number' and v_text !~ '^-?[0-9]+([.,][0-9]+)?$' then raise exception 'Informe um número válido'; end if;
   if v_type='phone' and (v_text !~ '^[+0-9() .-]+$' or length(regexp_replace(v_text,'[^0-9]','','g')) not between 8 and 15) then raise exception 'Informe um telefone válido'; end if;
   if v_type='time' and v_text !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then raise exception 'Use horário HH:MM'; end if;
  end if;
 end if;
 v_flag:=coalesce(v_text ~* '\m(porra|caralho|merda|puta|foda|foder)\M',false);
 v_answer:=(p_answer-'moderation_flag')||jsonb_build_object('moderation_flag',v_flag);
 if v_type='photo' then
   v_path:=p_answer->>'path';
   if v_path is null or split_part(v_path,'/',1)<>auth.uid()::text or split_part(v_path,'/',2)<>p_run::text then raise exception 'Foto sem caminho seguro'; end if;
   insert into public.eo_checklist_media(run_id,item_id,user_id,object_path) values(p_run,p_item,auth.uid(),v_path) on conflict(object_path) do nothing;
 end if;
 insert into public.eo_checklist_answer_history(run_id,item_id,answer,updated_by) values(p_run,p_item,v_answer,auth.uid());
 insert into public.eo_checklist_answers(run_id,item_id,answer,updated_by) values(p_run,p_item,v_answer,auth.uid())
 on conflict(run_id,item_id) do update set answer=excluded.answer,updated_by=excluded.updated_by,updated_at=now();
 update public.eo_checklist_runs r set status=case when r.status='pending' then 'in_progress' else r.status end,updated_at=now(),
 completed_at=case when not exists(select 1 from public.eo_checklist_items i where i.template_id=r.template_id and i.required and i.id<>p_item and not exists(select 1 from public.eo_checklist_answers a where a.run_id=r.id and a.item_id=i.id)) then now() else null end
 where r.id=p_run;
 update public.eo_checklist_runs r set status='completed' where r.id=p_run and r.completed_at is not null;
 insert into public.eo_audit_events(actor,action,entity_id,detail) values(auth.uid(),'checklist.answer.saved',p_run::text,jsonb_build_object('item_id',p_item,'type',v_type,'moderation_flag',v_flag));
end; $$;


insert into eo_private.schema_migrations(version) values('202611090004_checklist_fields') on conflict do nothing;
commit;

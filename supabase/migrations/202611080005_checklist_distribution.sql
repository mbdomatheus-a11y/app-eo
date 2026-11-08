begin;

alter table public.eo_checklist_templates add column notification_alert_id uuid references public.eo_alerts(id);

-- Um registro por pessoa e loja. Abrangência equivalente a has_store,
-- incluindo administradores e vínculos organizacionais importados.
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
   if jsonb_typeof(v_item) is distinct from 'object' or coalesce(v_item->>'type','') not in ('acceptance','photo','text','yes_no')
     or length(trim(coalesce(v_item->>'prompt',''))) not between 2 and 500
     or (v_item ? 'required' and jsonb_typeof(v_item->'required') is distinct from 'boolean') then raise exception 'Pergunta % inválida',v_pos; end if;
   insert into public.eo_checklist_items(template_id,position,prompt,answer_type,required,options)
   values(v_id,v_pos,trim(v_item->>'prompt'),v_item->>'type',coalesce((v_item->>'required')::boolean,true),'[]'::jsonb);
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

create function public.eo_checklist_notification(p_template uuid) returns uuid
language plpgsql stable security definer set search_path='' as $$
declare v_alert uuid;
begin
 if eo_private.role_of_actor() is null then raise exception 'Acesso não autorizado' using errcode='42501'; end if;
 select t.notification_alert_id into v_alert from public.eo_checklist_templates t
 where t.id=p_template and (t.created_by=auth.uid() or eo_private.role_of_actor()='admin');
 if v_alert is null then raise exception 'Notificação de checklist indisponível' using errcode='42501'; end if;
 return v_alert;
end; $$;

-- O feed legado mantém seu contrato e limite de 100. Novos clientes buscam
-- páginas no servidor e calculam respostas somente para os registros da página.
create function public.eo_checklist_feed_page(p_limit integer default 30,p_offset integer default 0,p_query text default '',p_status text default '')
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_query text:=lower(left(trim(coalesce(p_query,'')),200)); v_status text:=coalesce(p_status,'');
begin
 if eo_private.role_of_actor() is null then raise exception 'Acesso não autorizado' using errcode='42501'; end if;
 if v_status not in ('','pending','in_progress','completed') then raise exception 'Status de checklist inválido'; end if;
 return (with eligible as materialized (
   select r.id run_id,r.status,r.assigned_at,r.updated_at,s.id store_id,s.name store_name,t.id template_id,t.title,t.description
   from public.eo_checklist_runs r join public.eo_checklist_templates t on t.id=r.template_id join public.eo_stores s on s.id=r.store_id
   where r.assigned_to=auth.uid() and (v_status='' or r.status=v_status)
     and (v_query='' or position(v_query in lower(t.title||' '||s.name||' '||s.code))>0)
 ), page as (
   select e.* from eligible e order by e.assigned_at desc,e.run_id
   limit least(100,greatest(1,coalesce(p_limit,30))) offset greatest(0,coalesce(p_offset,0))
 ), items as (
   select p.*,(select count(*) from public.eo_checklist_items i where i.template_id=p.template_id) item_count,
     (select count(*) from public.eo_checklist_answers a where a.run_id=p.run_id) answered_count from page p
 ) select jsonb_build_object('items',(select coalesce(jsonb_agg(to_jsonb(i) order by i.assigned_at desc,i.run_id),'[]'::jsonb) from items i),'total',(select count(*) from eligible)));
end; $$;

revoke all on function public.eo_checklist_create(text,text,jsonb,uuid[]),public.eo_checklist_feed_page(integer,integer,text,text),public.eo_checklist_notification(uuid) from public,anon;
grant execute on function public.eo_checklist_create(text,text,jsonb,uuid[]),public.eo_checklist_feed_page(integer,integer,text,text),public.eo_checklist_notification(uuid) to authenticated;
commit;

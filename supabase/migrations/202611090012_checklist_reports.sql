begin;
create index eo_checklist_locations_run on public.eo_checklist_locations(run_id,recorded_at desc);
create index eo_sessions_store_status on public.eo_assortment_sessions(store_id,status,created_at desc);
create index eo_scans_session_created on public.eo_assortment_scans(session_id,created_at);
create function public.eo_checklist_report(p_query text default '',p_status text default '',p_limit integer default 30,p_offset integer default 0,p_export boolean default false) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_role text:=eo_private.role_of_actor();result jsonb;
begin
 perform public.eo_require_module('checklists');perform public.eo_require_module('reports');
 if v_role is null or v_role not in ('admin','diretor') then raise exception 'Relatório exclusivo da gestão' using errcode='42501';end if;
 if coalesce(p_status,'') not in ('','pending','in_progress','completed') then raise exception 'Situação inválida';end if;
 with scoped as not materialized (
  select r.*,t.title,s.code store_code,s.name store_name,s.region,p.display_name person_name
  from public.eo_checklist_runs r join public.eo_checklist_templates t on t.id=r.template_id
  join public.eo_stores s on s.id=r.store_id join public.eo_profiles p on p.id=r.assigned_to
  where eo_private.has_store(r.store_id) and (coalesce(p_status,'')='' or r.status=p_status)
  and (coalesce(p_query,'')='' or concat_ws(' ',t.title,s.code,s.name,s.region,p.display_name) ilike '%'||left(p_query,120)||'%')
 ),page as (
  select q.*,(select count(*) from public.eo_checklist_answers a where a.run_id=q.id) answered,
   (select count(*) from public.eo_checklist_answers a where a.run_id=q.id and a.answer->>'moderation_flag'='true') flagged,
   (select count(*) from public.eo_checklist_items i where i.template_id=q.template_id) questions
  from scoped q order by q.updated_at desc,q.id limit greatest(1,least(coalesce(p_limit,30),100)) offset greatest(0,coalesce(p_offset,0))
 ) select jsonb_build_object('total',(select count(*) from scoped),'items',coalesce((select jsonb_agg(to_jsonb(page)) from page),'[]')) into result;
 insert into public.eo_audit_events(actor,action,entity_id,detail) values(auth.uid(),case when p_export then 'checklist.report.exported' else 'checklist.report.viewed' end,'checklists',jsonb_build_object('status',p_status,'offset',p_offset,'rows',jsonb_array_length(result->'items')));
 return result;
end;$$;
revoke all on function public.eo_checklist_report(text,text,integer,integer,boolean) from public,anon;
grant execute on function public.eo_checklist_report(text,text,integer,integer,boolean) to authenticated;
insert into eo_private.schema_migrations(version) values('202611090012_checklist_reports') on conflict do nothing;
commit;

begin;
insert into public.eo_module_access(module_id,label) values('agenda','Agenda de ações');
create function public.eo_action_agenda(p_limit integer default 30,p_offset integer default 0) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 perform public.eo_require_module('agenda');
 return (with tasks as not materialized (
  select 'checklist' kind,r.id source_id,null::integer version,t.title,left(t.description,400) description,r.assigned_at created_at,s.code store_code,s.name store_name
  from public.eo_checklist_runs r join public.eo_checklist_templates t on t.id=r.template_id join public.eo_stores s on s.id=r.store_id
  where r.assigned_to=auth.uid() and r.status<>'completed' and eo_private.has_store(r.store_id) and public.eo_module_allowed('checklists')
  union all
  select 'notice',v.notice_id,v.version,v.title,left(v.body,400),v.published_at,null::text,null::text
  from public.eo_notice_recipients r join public.eo_notice_versions v using(notice_id,version) join public.eo_notices n on n.id=v.notice_id
  where r.user_id=auth.uid() and n.archived_at is null and public.eo_module_allowed('notices')
   and v.version=(select max(latest.version) from public.eo_notice_versions latest where latest.notice_id=v.notice_id)
   and not exists(select 1 from public.eo_notice_receipts receipt where receipt.notice_id=r.notice_id and receipt.version=r.version and receipt.user_id=auth.uid())
 ),page as (select * from tasks order by created_at,source_id limit greatest(1,least(coalesce(p_limit,30),100)) offset greatest(0,coalesce(p_offset,0)))
 select jsonb_build_object('total',(select count(*) from tasks),'items',coalesce((select jsonb_agg(to_jsonb(page)) from page),'[]')));
end;$$;
revoke all on function public.eo_action_agenda(integer,integer) from public,anon;
grant execute on function public.eo_action_agenda(integer,integer) to authenticated;
insert into eo_private.schema_migrations(version) values('202611090015_action_agenda') on conflict do nothing;
commit;

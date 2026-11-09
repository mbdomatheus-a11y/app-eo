-- Leitura, ciência e feedback são eventos distintos. Limpar a caixa nunca apaga histórico.
begin;
alter table public.eo_notice_recipients add column opened_at timestamptz;
alter table public.eo_notice_recipients add column inbox_read_at timestamptz;
alter table public.eo_notice_recipients add column inbox_cleared_at timestamptz;
create table public.eo_notice_feedback (
 notice_id uuid not null, version integer not null, user_id uuid not null,
 feedback text not null check(length(feedback) between 1 and 500),
 updated_at timestamptz not null default now(),
 primary key(notice_id,version,user_id),
 foreign key(notice_id,version,user_id) references public.eo_notice_recipients(notice_id,version,user_id)
);
alter table public.eo_notice_feedback enable row level security;
revoke all on public.eo_notice_feedback from public,anon,authenticated;

-- Todos os admins recebem comunicados anteriores ainda ativos.
insert into public.eo_notice_recipients(notice_id,version,user_id)
 select v.notice_id,v.version,p.id from public.eo_notice_versions v join public.eo_notices n on n.id=v.notice_id
 cross join public.eo_profiles p where p.active and p.role='admin' and n.archived_at is null
 on conflict do nothing;
create function eo_private.enroll_admin_notices() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.active and new.role='admin' then
  insert into public.eo_notice_recipients(notice_id,version,user_id)
   select v.notice_id,v.version,new.id from public.eo_notice_versions v join public.eo_notices n on n.id=v.notice_id where n.archived_at is null on conflict do nothing;
 end if;
 return new;
end;$$;
create trigger eo_admin_notice_enrollment after insert or update of role,active on public.eo_profiles for each row execute function eo_private.enroll_admin_notices();

create function public.eo_notice_open(p_notice uuid,p_version integer) returns void
language plpgsql security definer set search_path='' as $$
begin
 update public.eo_notice_recipients set opened_at=coalesce(opened_at,now()),inbox_read_at=coalesce(inbox_read_at,now())
 where notice_id=p_notice and version=p_version and user_id=auth.uid();
 if not found then raise exception 'Comunicado indisponível' using errcode='42501'; end if;
 update public.eo_alert_recipients r set seen_at=coalesce(r.seen_at,now()) from public.eo_alerts a
 where a.id=r.alert_id and a.notice_id=p_notice and r.user_id=auth.uid();
end; $$;
create function eo_private.receipt_implies_opened() returns trigger language plpgsql security definer set search_path='' as $$
begin
 update public.eo_notice_recipients set opened_at=coalesce(opened_at,new.acknowledged_at),inbox_read_at=coalesce(inbox_read_at,new.acknowledged_at)
 where notice_id=new.notice_id and version=new.version and user_id=new.user_id;
 update public.eo_alert_recipients r set seen_at=coalesce(r.seen_at,new.acknowledged_at) from public.eo_alerts a where a.id=r.alert_id and a.notice_id=new.notice_id and r.user_id=new.user_id;
 return new;
end;$$;
create trigger eo_receipt_opened after insert on public.eo_notice_receipts for each row execute function eo_private.receipt_implies_opened();

create function public.eo_notice_get(p_notice uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select to_jsonb(q) from (
 select v.*,exists(select 1 from public.eo_notice_receipts c where c.notice_id=v.notice_id and c.version=v.version and c.user_id=auth.uid()) acknowledged,
 (select count(*) from public.eo_notice_recipients r where r.notice_id=v.notice_id and r.version=v.version) eligible_count,
 (select count(*) from public.eo_notice_receipts c where c.notice_id=v.notice_id and c.version=v.version) receipt_count,
 (select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'file_name',a.file_name,'mime_type',a.mime_type,'byte_size',a.byte_size,'object_path',a.object_path)),'[]'::jsonb)
 from public.eo_message_attachments a where a.notice_id=v.notice_id and a.notice_version=v.version) attachments
 from public.eo_notice_versions v join public.eo_notices n on n.id=v.notice_id
 where n.id=p_notice and n.archived_at is null and exists(select 1 from public.eo_notice_recipients r
 where r.notice_id=v.notice_id and r.version=v.version and r.user_id=auth.uid())
 order by v.version desc limit 1
 ) q;
$$;
revoke all on function public.eo_notice_get(uuid) from public,anon;
grant execute on function public.eo_notice_get(uuid) to authenticated;
create function public.eo_notice_feedback_save(p_notice uuid,p_version integer,p_feedback text) returns void
language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.eo_notice_recipients r join public.eo_notices n on n.id=r.notice_id
 where r.notice_id=p_notice and r.version=p_version and r.user_id=auth.uid() and n.archived_at is null)
 then raise exception 'Comunicado indisponível' using errcode='42501'; end if;
 if length(trim(p_feedback)) not between 1 and 500 then raise exception 'Escreva um feedback de até 500 caracteres'; end if;
 insert into public.eo_notice_feedback values(p_notice,p_version,auth.uid(),trim(p_feedback),now())
 on conflict(notice_id,version,user_id) do update set feedback=excluded.feedback,updated_at=excluded.updated_at;
 insert into public.eo_audit_events(actor,action,entity_id,detail)
 values(auth.uid(),'notice.feedback.saved',p_notice::text,jsonb_build_object('version',p_version));
end; $$;
create function public.eo_notice_engagement(p_notice uuid,p_version integer) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if eo_private.role_of_actor() is distinct from 'admin' then raise exception 'Acesso administrativo necessário' using errcode='42501'; end if;
 return (select coalesce(jsonb_agg(jsonb_build_object('user_id',r.user_id,'name',p.display_name,'opened_at',r.opened_at,
 'acknowledged_at',c.acknowledged_at,'feedback',f.feedback,'feedback_at',f.updated_at) order by p.display_name),'[]'::jsonb)
 from public.eo_notice_recipients r join public.eo_profiles p on p.id=r.user_id
 left join public.eo_notice_receipts c using(notice_id,version,user_id)
 left join public.eo_notice_feedback f using(notice_id,version,user_id)
 where r.notice_id=p_notice and r.version=p_version);
end; $$;
create function public.eo_inbox() returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Sessão necessária' using errcode='42501'; end if;
 return (select coalesce(jsonb_agg(to_jsonb(q) order by q.created_at desc),'[]'::jsonb) from (
 select 'notice'::text kind,r.notice_id id,r.version,v.title,v.body,v.published_at created_at,r.inbox_read_at read_at
 from public.eo_notice_recipients r join public.eo_notice_versions v using(notice_id,version)
 join public.eo_notices n on n.id=r.notice_id
 where r.user_id=auth.uid() and r.inbox_cleared_at is null and n.archived_at is null
 union all
 select 'alert',a.id,null::integer,a.title,a.body,a.created_at,r.seen_at
 from public.eo_alert_recipients r join public.eo_alerts a on a.id=r.alert_id
 where r.user_id=auth.uid() and r.dismissed_at is null and a.archived_at is null and not a.hidden_from_users
 and a.notice_id is null
 ) q);
end; $$;
create function public.eo_inbox_mark(p_action text,p_kind text default null,p_id uuid default null,p_version integer default null) returns void
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or p_action not in ('read','clear') or (p_kind is not null and p_kind not in ('notice','alert'))
 or (p_id is not null and p_kind is null) then raise exception 'Ação inválida'; end if;
 if p_kind is null or p_kind='notice' then
 update public.eo_notice_recipients set inbox_read_at=coalesce(inbox_read_at,now()),
 inbox_cleared_at=case when p_action='clear' then coalesce(inbox_cleared_at,now()) else inbox_cleared_at end
 where user_id=auth.uid() and (p_id is null or notice_id=p_id) and (p_version is null or version=p_version);
 update public.eo_alert_recipients r set seen_at=coalesce(r.seen_at,now()),dismissed_at=case when p_action='clear' then coalesce(r.dismissed_at,now()) else r.dismissed_at end
 from public.eo_alerts a where a.id=r.alert_id and a.notice_id is not null and r.user_id=auth.uid() and (p_id is null or a.notice_id=p_id);
 end if;
 if p_kind is null or p_kind='alert' then
 update public.eo_alert_recipients set seen_at=coalesce(seen_at,now()),
 dismissed_at=case when p_action='clear' then coalesce(dismissed_at,now()) else dismissed_at end
 where user_id=auth.uid() and (p_id is null or alert_id=p_id);
 end if;
end; $$;

create function public.eo_scheduled_list() returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if eo_private.role_of_actor() not in ('admin','diretor','gerente') or eo_private.role_of_actor() is null then raise exception 'Acesso negado' using errcode='42501'; end if;
 return (select coalesce(jsonb_agg(to_jsonb(q) order by q.scheduled_for desc),'[]'::jsonb) from (
 select * from public.eo_scheduled_messages where created_by=auth.uid() or eo_private.role_of_actor()='admin'
 ) q);
end; $$;
create function public.eo_scheduled_manage(p_id uuid,p_action text,p_title text default null,p_body text default null,p_scheduled_for timestamptz default null) returns void
language plpgsql security definer set search_path='' as $$
declare j public.eo_scheduled_messages%rowtype;
begin
 select * into j from public.eo_scheduled_messages where id=p_id for update;
 if not found or (j.created_by<>auth.uid() and eo_private.role_of_actor() is distinct from 'admin')
 or coalesce(eo_private.role_of_actor(),'') not in ('admin','diretor','gerente') then raise exception 'Agendamento indisponível' using errcode='42501'; end if;
 if j.status='published' or j.published_id is not null then raise exception 'Este envio já foi publicado'; end if;
 if p_action='cancel' and j.status in ('scheduled','failed') then
 update public.eo_scheduled_messages set status='cancelled',processed_at=now() where id=p_id;
 elsif p_action='retry' and j.status='failed' then
 update public.eo_scheduled_messages set status='scheduled',scheduled_for=greatest(now(),scheduled_for),failure=null,processed_at=null where id=p_id;
 elsif p_action='edit' and j.status in ('scheduled','failed') then
 if length(trim(p_title)) not between 3 and 120 or length(trim(p_body)) not between 1 and (case when j.message_type='alert' then 3000 else 5000 end)
 or p_title is null or p_body is null or p_scheduled_for is null or p_scheduled_for<now()+interval '2 minutes'
 or p_scheduled_for>now()+interval '90 days' then raise exception 'Revise título, mensagem e horário'; end if;
 update public.eo_scheduled_messages set title=trim(p_title),body=trim(p_body),scheduled_for=p_scheduled_for,status='scheduled',failure=null,processed_at=null where id=p_id;
 else raise exception 'Ação indisponível para este status'; end if;
 insert into public.eo_audit_events(actor,action,entity_id,detail)
 values(auth.uid(),'message.schedule.'||p_action,p_id::text,jsonb_build_object('previous_status',j.status,'store_ids',j.store_ids));
end; $$;
revoke all on function public.eo_notice_open(uuid,integer),public.eo_notice_feedback_save(uuid,integer,text),public.eo_notice_engagement(uuid,integer),public.eo_inbox(),public.eo_inbox_mark(text,text,uuid,integer),public.eo_scheduled_list(),public.eo_scheduled_manage(uuid,text,text,text,timestamptz) from public,anon;
grant execute on function public.eo_notice_open(uuid,integer),public.eo_notice_feedback_save(uuid,integer,text),public.eo_notice_engagement(uuid,integer),public.eo_inbox(),public.eo_inbox_mark(text,text,uuid,integer),public.eo_scheduled_list(),public.eo_scheduled_manage(uuid,text,text,text,timestamptz) to authenticated;

-- Tamanho condicionado somente aos limites efetivos do provedor, sem teto artificial de 10 MB.
alter table public.eo_message_attachments drop constraint eo_message_attachments_byte_size_check;
alter table public.eo_message_attachments add constraint eo_message_attachments_byte_size_check check(byte_size>0);
update storage.buckets set file_size_limit=null where id='eo-message-attachments';
create or replace function eo_private.attach_message_files(
  p_files jsonb,p_actor uuid,p_notice uuid default null,p_version integer default null,
  p_alert uuid default null,p_scheduled uuid default null
) returns void language plpgsql security definer set search_path='' as $$
declare v_file jsonb; v_path text; v_name text; v_type text; v_size bigint;
begin
  if jsonb_typeof(coalesce(p_files,'[]'::jsonb))<>'array' or jsonb_array_length(coalesce(p_files,'[]'::jsonb))>10 then
    raise exception 'Envie no máximo 10 anexos por mensagem';
  end if;
  for v_file in select value from jsonb_array_elements(coalesce(p_files,'[]'::jsonb)) loop
    v_path:=v_file->>'object_path'; v_name:=v_file->>'file_name'; v_type:=v_file->>'mime_type';
    begin v_size:=(v_file->>'byte_size')::bigint; exception when others then raise exception 'Tamanho de anexo inválido'; end;
    if v_path is null or split_part(v_path,'/',1)<>p_actor::text or length(v_path)>500
      or v_name is null or length(v_name) not between 1 and 255
      or v_type not in ('application/pdf','image/jpeg','image/png','image/webp')
      or v_size < 1 then raise exception 'Anexo inválido'; end if;
    if not exists(select 1 from storage.objects o where o.bucket_id='eo-message-attachments' and o.name=v_path) then
      raise exception 'Arquivo não localizado no armazenamento privado';
    end if;
    insert into public.eo_message_attachments(created_by,notice_id,notice_version,alert_id,scheduled_message_id,object_path,file_name,mime_type,byte_size)
    values(p_actor,p_notice,p_version,p_alert,p_scheduled,v_path,v_name,v_type,v_size)
    on conflict(object_path) do nothing;
  end loop;
end; $$;
insert into eo_private.schema_migrations(version) values('202611090002_communications') on conflict do nothing;
commit;

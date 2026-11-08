-- Executar somente em banco de teste após 202611080004. Fixtures e efeitos revertidos.
begin;
create temporary table contact_fixtures(kind text primary key,id uuid default gen_random_uuid(),
  chapa text default ('88'||lpad((floor(random()*1000000000000000)::bigint)::text,15,'0')));
insert into contact_fixtures(kind) values('admin'),('missing'),('phone'),('blocked'),('imported'),('regional'),('invalid_import');
grant select on contact_fixtures to authenticated;
insert into auth.users(id,email) select id,id||'@example.invalid' from contact_fixtures;
insert into public.eo_profiles(id,display_name,role,active,contact_phone,login_chapa)
select id,'Teste contato '||kind,case when kind='admin' then 'admin' else 'colaborador' end,
  kind<>'blocked',case when kind='phone' then '+5511999999999' else null end,chapa from contact_fixtures;
insert into public.eo_directory_people(chapa,display_name,operational_role,phone)
select chapa,'Teste importado','Gerente',case when kind='imported' then '(21) 99999-4321' else '123' end
from contact_fixtures where kind in ('imported','invalid_import');
insert into public.eo_regional_groups(ggl,regional_name,chapa,phone)
select 't-'||left(id::text,16),'Regional contato teste',chapa,'+55 (31) 3333-1234' from contact_fixtures where kind='regional';
select set_config('request.jwt.claim.sub',(select id::text from contact_fixtures where kind='admin'),true);
set local role authenticated;
do $$
declare v jsonb;
begin
  if has_table_privilege(current_user,'public.eo_contact_requests','SELECT')
    or has_table_privilege(current_user,'public.eo_contact_requests','INSERT')
    or has_function_privilege('anon','public.eo_save_my_phone(text)','EXECUTE')
    or has_function_privilege(current_user,(select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='eo_private' and p.proname='effective_contact_phone'),'EXECUTE') then raise exception 'FAIL: permissões diretas'; end if;
  v:=public.eo_admin_request_contact_update(true);
  if (v->>'requested')::integer<2 then raise exception 'FAIL: admin global sem lojas'; end if;
  v:=public.eo_admin_request_contact_update(true);
  if (v->>'requested')::integer<>0 then raise exception 'FAIL: solicitação duplicada'; end if;
end $$;
reset role;
do $$ begin
  if exists(select 1 from public.eo_contact_requests r join contact_fixtures f on f.id=r.user_id where f.kind in ('phone','blocked','imported','regional')) then raise exception 'FAIL: público sem telefone'; end if;
  if not exists(select 1 from public.eo_contact_requests r join contact_fixtures f on f.id=r.user_id where f.kind='invalid_import') then raise exception 'FAIL: telefone importado inválido não tratado como ausente'; end if;
end $$;
select set_config('request.jwt.claim.sub',(select id::text from contact_fixtures where kind='imported'),true);
set local role authenticated;
do $$ begin
  if public.eo_my_contact_request()->>'phone'<>'+5521999994321' or (public.eo_my_contact_request()->>'required')::boolean then raise exception 'FAIL: contato efetivo do diretório'; end if;
  perform public.eo_save_my_phone('(11) 98888-1234');
  if public.eo_my_contact_request()->>'phone'<>'+5511988881234' then raise exception 'FAIL: prioridade da declaração do titular'; end if;
end $$;
reset role;
do $$ begin
  if not exists(select 1 from public.eo_directory_people d join contact_fixtures f on f.chapa=d.chapa where f.kind='imported' and d.phone='(21) 99999-4321') then raise exception 'FAIL: importação sobrescrita'; end if;
end $$;
select set_config('request.jwt.claim.sub',(select id::text from contact_fixtures where kind='regional'),true);
set local role authenticated;
do $$ begin
  if public.eo_my_contact_request()->>'phone'<>'+553133331234' then raise exception 'FAIL: contato efetivo da regional'; end if;
end $$;
reset role;
select set_config('request.jwt.claim.sub',(select id::text from contact_fixtures where kind='missing'),true);
set local role authenticated;
do $$
declare denied boolean:=false;
begin
  if not (public.eo_my_contact_request()->>'required')::boolean then raise exception 'FAIL: pendência própria'; end if;
  begin perform public.eo_admin_request_contact_update(false); exception when insufficient_privilege then denied:=true; end;
  if not denied then raise exception 'FAIL: colaborador solicitou atualização'; end if;
  denied:=false;
  begin perform public.eo_save_my_phone('123'); exception when others then denied:=true; end;
  if not denied then raise exception 'FAIL: telefone inválido'; end if;
  perform public.eo_save_my_phone('+55 (11) 99999-1234');
  if (public.eo_my_contact_request()->>'required')::boolean or public.eo_my_contact_request()->>'phone'<>'+5511999991234' then raise exception 'FAIL: salvar próprio contato'; end if;
end $$;
reset role;
do $$ begin
  if not exists(select 1 from public.eo_contact_requests r join contact_fixtures f on f.id=r.user_id where f.kind='missing' and r.resolved_at is not null) then raise exception 'FAIL: resolução sem timestamp'; end if;
  if not exists(select 1 from public.eo_contact_requests r join contact_fixtures f on f.id=r.user_id where f.kind='admin' and r.resolved_at is null) then raise exception 'FAIL: alterou solicitação alheia'; end if;
  if exists(select 1 from public.eo_audit_events e join contact_fixtures f on f.id=e.actor where e.action like 'contact.%' and e.detail::text like '%999991234%') then raise exception 'FAIL: telefone na auditoria'; end if;
end $$;
select set_config('request.jwt.claim.sub',(select id::text from contact_fixtures where kind='admin'),true);
set local role authenticated;
select public.eo_admin_request_contact_update(false);
reset role;
do $$ begin
  if not exists(select 1 from public.eo_contact_requests r join contact_fixtures f on f.id=r.user_id where f.kind='phone' and r.resolved_at is null) then raise exception 'FAIL: todos não inclui telefone'; end if;
  if (select count(*) from public.eo_contact_requests r join contact_fixtures f on f.id=r.user_id where f.kind in ('imported','regional') and r.resolved_at is null)<>2 then raise exception 'FAIL: todos não inclui importados'; end if;
  if exists(select 1 from public.eo_contact_requests r join contact_fixtures f on f.id=r.user_id where f.kind='blocked') then raise exception 'FAIL: bloqueado recebeu'; end if;
end $$;
select set_config('request.jwt.claim.sub',(select id::text from contact_fixtures where kind='blocked'),true);
set local role authenticated;
do $$ declare denied boolean:=false; begin
  begin perform public.eo_save_my_phone('11999991234'); exception when insufficient_privilege then denied:=true; end;
  if not denied then raise exception 'FAIL: bloqueado salvou'; end if;
  denied:=false;
  begin perform public.eo_my_contact_request(); exception when insufficient_privilege then denied:=true; end;
  if not denied then raise exception 'FAIL: bloqueado consultou'; end if;
end $$;
reset role;
rollback;

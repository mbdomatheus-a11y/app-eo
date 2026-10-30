-- Teste de integração transacional. Fixtures são revertidas no bloco de exceção.
-- Executar como postgres no SQL Editor do projeto exclusivo do App EO.
do $$
declare
 a uuid := gen_random_uuid(); d uuid := gen_random_uuid(); m uuid := gen_random_uuid(); e uuid := gen_random_uuid();
 sa uuid := gen_random_uuid(); sb uuid := gen_random_uuid(); n uuid; t1 timestamptz; t2 timestamptz;
 denied boolean; rows_before bigint;
begin
 if has_table_privilege('authenticated','public.eo_profiles','UPDATE') or has_table_privilege('anon','public.eo_notice_versions','SELECT') then raise exception 'FAIL: privilégios diretos'; end if;
 if has_function_privilege('anon','public.eo_context()','EXECUTE') then raise exception 'FAIL: função exposta a anon'; end if;
 if exists(select 1 from pg_class c join pg_namespace s on s.oid=c.relnamespace where s.nspname='public' and c.relname like 'eo_%' and c.relkind='r' and not c.relrowsecurity) then raise exception 'FAIL: tabela sem RLS'; end if;
 begin
  insert into auth.users(id,email,email_confirmed_at) values(a,a||'@example.invalid',now()),(d,d||'@example.invalid',now()),(m,m||'@example.invalid',now()),(e,e||'@example.invalid',now());
  insert into public.eo_profiles(id,display_name,role) values(a,'Teste Admin','admin'),(d,'Teste Diretor','diretor'),(m,'Teste Gerente','gerente'),(e,'Teste Colaborador','colaborador');
  insert into public.eo_stores(id,code,name) values(sa,'t-'||left(sa::text,8),'Loja teste A'),(sb,'t-'||left(sb::text,8),'Loja teste B');
  insert into public.eo_store_members values(d,sa),(m,sa),(e,sb);
  perform set_config('request.jwt.claim.sub',d::text,true);
  denied:=false; begin perform public.eo_publish_notice('Teste fora de escopo','Não deve publicar',array[sb]); exception when insufficient_privilege then denied:=true; end;
  if not denied then raise exception 'FAIL: diretor publica fora da abrangência'; end if;
  perform set_config('request.jwt.claim.sub',m::text,true);
  denied:=false; begin perform public.eo_publish_notice('Teste do gerente','Não deve publicar',array[sa]); exception when insufficient_privilege then denied:=true; end;
  if not denied then raise exception 'FAIL: gerente publica'; end if;
  perform set_config('request.jwt.claim.sub',d::text,true);
  n:=public.eo_publish_notice('Teste autorizado','Comunicado de teste reversível',array[sa]);
  if jsonb_array_length(public.eo_feed())<>1 then raise exception 'FAIL: diretor não recebeu comunicado'; end if;
  if public.eo_publish_notice('Repetição','Mesmo pedido',array[sa],false,n)<>n then raise exception 'FAIL: repetição de publicação'; end if;
  perform set_config('request.jwt.claim.sub',e::text,true);
  if jsonb_array_length(public.eo_feed())<>0 then raise exception 'FAIL: vazamento entre lojas'; end if;
  denied:=false; begin perform public.eo_acknowledge(n,1); exception when insufficient_privilege then denied:=true; end;
  if not denied then raise exception 'FAIL: ciência fora do escopo'; end if;
  denied:=false; begin perform public.eo_admin_store('x','Loja não autorizada'); exception when insufficient_privilege then denied:=true; end;
  if not denied then raise exception 'FAIL: acesso administrativo'; end if;
  perform set_config('request.jwt.claim.sub',m::text,true);
  t1:=public.eo_acknowledge(n,1);t2:=public.eo_acknowledge(n,1);
  if t1 is distinct from t2 then raise exception 'FAIL: ciência duplicada'; end if;
  if (select count(*) from public.eo_notice_receipts where notice_id=n and user_id=m)<>1 then raise exception 'FAIL: unicidade'; end if;
  if not exists(select 1 from public.eo_audit_events where actor=m and action='notice.acknowledged' and entity_id=n::text) then raise exception 'FAIL: auditoria'; end if;
  perform set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
  denied:=false; begin perform public.eo_context(); exception when insufficient_privilege then denied:=true; end;
  if not denied then raise exception 'FAIL: conta sem perfil'; end if;
  -- Sinal exclusivo de sucesso: desfaz todas as fixtures deste bloco.
  raise exception using errcode='ZX001',message='testes concluídos';
 exception when sqlstate 'ZX001' then null;
 end;
 if exists(select 1 from public.eo_profiles where id in(a,d,m,e)) then raise exception 'FAIL: fixtures não revertidas'; end if;
end; $$;
select 'PASSOU: RLS, privilégios, abrangência, publicação, ciência idempotente, auditoria, conta sem acesso e reversão das fixtures' as resultado;

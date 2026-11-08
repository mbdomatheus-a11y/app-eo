-- Teste transacional em banco de teste após a migração 202611070002.
-- Não envia e-mail/push. Todas as identidades e alterações são revertidas.
do $$
declare
  a uuid:=gen_random_uuid(); d uuid:=gen_random_uuid(); sa uuid:=gen_random_uuid();
  ga text:='t-'||left(gen_random_uuid()::text,8); gb text:='t-'||left(gen_random_uuid()::text,8);
  chapa_d text:='99'||lpad((floor(random()*1000000000000)::bigint)::text,12,'0');
  ra text; rb text; store_code text:='t-'||left(sa::text,8); denied boolean;
begin
  if has_function_privilege('anon','public.eo_admin_update_person(uuid,text,text,text,uuid[],boolean)','EXECUTE')
    or has_function_privilege('anon','public.eo_admin_manage_store(uuid,text,text,text,boolean)','EXECUTE') then
    raise exception 'FAIL: mutação administrativa exposta'; end if;
  if not has_table_privilege('service_role','public.eo_audit_events','SELECT') then raise exception 'FAIL: rate limit de transcrição sem leitura da auditoria'; end if;
  begin
    ra:='Regional teste '||ga; rb:='Regional teste '||gb;
    insert into auth.users(id,email) values(a,a||'@example.invalid'),(d,d||'@example.invalid');
    insert into public.eo_profiles(id,display_name,role,login_chapa) values(a,'Teste Admin','admin',null),(d,'Teste Diretor','diretor',chapa_d);
    insert into public.eo_directory_people(chapa,display_name,operational_role) values(chapa_d,'Teste Diretor','Diretor');
    insert into public.eo_regional_groups(ggl,regional_name) values(ga,ra),(gb,rb);
    insert into public.eo_stores(id,code,name,region,ggl) values(sa,store_code,'Loja teste regional',ra,ga);
    insert into public.eo_store_details(store_id,attributes) values(sa,jsonb_build_object('REGIONAL',ra,'GGL',ga));
    insert into public.eo_org_assignments(chapa,scope_type,scope_code) values(chapa_d,'GGL',gb);
    perform set_config('request.jwt.claim.sub',d::text,true);
    if exists(select 1 from jsonb_array_elements(public.eo_context()->'stores') s where s->>'id'=sa::text) then
      raise exception 'FAIL: diretor recebeu loja antes da mudança de GGL'; end if;
    denied:=false;
    begin perform public.eo_admin_manage_store(sa,store_code,'Loja teste regional',rb,true);
      exception when insufficient_privilege then denied:=true; end;
    if not denied then raise exception 'FAIL: diretor alterou a regional da loja'; end if;
    perform set_config('request.jwt.claim.sub',a::text,true);
    perform public.eo_admin_manage_store(sa,store_code,'Loja teste regional',lower(rb),true);
    if not exists(select 1 from public.eo_stores where id=sa and ggl=gb and region=rb)
      or not exists(select 1 from public.eo_store_details where store_id=sa and attributes->>'GGL'=gb and attributes->>'REGIONAL'=rb) then
      raise exception 'FAIL: regional e GGL divergentes após edição'; end if;
    denied:=false;
    begin perform public.eo_admin_manage_store(sa,store_code,'Loja teste regional','Regional inexistente '||sa,true);
      exception when raise_exception then denied:=true; end;
    if not denied or not exists(select 1 from public.eo_stores where id=sa and ggl=gb and region=rb) then
      raise exception 'FAIL: regional livre removeu vínculo de loja importada'; end if;
    denied:=false;
    begin perform public.eo_admin_set_person_active(a,false); exception when raise_exception then denied:=true; end;
    if not denied then raise exception 'FAIL: administrador arquivou a si próprio'; end if;
    perform set_config('request.jwt.claim.sub',d::text,true);
    if not exists(select 1 from jsonb_array_elements(public.eo_context()->'stores') s where s->>'id'=sa::text and s->>'region'=rb) then
      raise exception 'FAIL: diretor não recebeu a loja transferida à sua regional'; end if;
    raise exception using errcode='ZX001',message='testes concluídos';
  exception when sqlstate 'ZX001' then null;
  end;
  if exists(select 1 from public.eo_profiles where id in(a,d)) then raise exception 'FAIL: fixtures não revertidas'; end if;
end; $$;
select 'PASSOU: grants, regional/GGL, abrangência antes/depois da transferência e proteção do próprio acesso' as resultado;

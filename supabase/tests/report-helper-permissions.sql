-- Executar somente em banco de teste após 202611080003. Tudo é revertido.
-- SET LOCAL ROLE é indispensável: mudar só o JWT mantém os privilégios postgres.
begin;
do $$
declare a uuid:=gen_random_uuid(); c uuid:=gen_random_uuid(); o uuid:=gen_random_uuid();
  g uuid:=gen_random_uuid(); sa uuid:=gen_random_uuid(); sb uuid:=gen_random_uuid();
  legacy uuid:=gen_random_uuid(); structured uuid:=gen_random_uuid(); t uuid:=gen_random_uuid(); run uuid:=gen_random_uuid();
begin
  insert into auth.users(id,email) select id,id||'@example.invalid' from unnest(array[a,c,o,g]) id;
  insert into public.eo_profiles(id,display_name,role) values
    (a,'Admin teste','admin'),(c,'Pessoa teste','colaborador'),(o,'Fora escopo','colaborador'),(g,'Gerente teste','gerente');
  insert into public.eo_stores(id,code,name,region) values
    (sa,left(sa::text,20),'Loja A','Reg A'),(sb,left(sb::text,20),'Loja B','Reg B');
  insert into public.eo_store_members(user_id,store_id) values(c,sa),(g,sa),(o,sb);
  insert into public.eo_sales_publications(id,title,period,object_path,store_ids,created_by,structured) values
    (legacy,'HTML teste','week',a||'/legacy.html',array[sa],a,false),
    (structured,'Dados teste','week',a||'/structured.html',array[sa,sb],a,true);
  insert into public.eo_sales_rows(publication_id,store_id,batch,level,department,region,real,meta,real_ly,data) values
    (structured,sa,0,'LOJA_TOTAL','MODA','Reg A',100,120,80,jsonb_build_object('codigo_loja','A','real',100)),
    (structured,sb,0,'LOJA_TOTAL','MODA','Reg B',200,240,160,jsonb_build_object('codigo_loja','B','real',200));
  insert into public.eo_checklist_templates(id,created_by,title) values(t,a,'Checklist teste');
  insert into public.eo_checklist_runs(id,template_id,store_id,assigned_to,assigned_by) values(run,t,sa,c,a);
  insert into storage.objects(bucket_id,name) values
    ('eo-sales-html',a||'/legacy.html'),('eo-sales-html',a||'/structured.html'),
    ('eo-checklist-photos',c||'/'||run||'/photo.jpg');
  perform set_config('eo.test.fixtures',jsonb_build_object('admin',a,'person',c,'outside',o,'manager',g,
    'legacy',legacy,'structured',structured,'photo',c||'/'||run||'/photo.jpg')::text,true);
end; $$;

set local role authenticated;
do $$
declare f jsonb:=current_setting('eo.test.fixtures')::jsonb; page jsonb; denied boolean;
begin
  if current_user<>'authenticated' then raise exception 'FAIL: teste sem papel real'; end if;
  if has_function_privilege(current_user,(select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='eo_private' and p.proname='role_of_actor'),'EXECUTE')
    or has_function_privilege(current_user,(select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='eo_private' and p.proname='has_store'),'EXECUTE')
    or has_table_privilege(current_user,'public.eo_sales_rows','SELECT') then
    raise exception 'FAIL: helpers privados ou dados brutos expostos'; end if;

  perform set_config('request.jwt.claim.sub',f->>'admin',true);
  if not exists(select 1 from jsonb_array_elements(public.eo_sales_reports()) r where r->>'id'=f->>'structured') then
    raise exception 'FAIL: admin sem relatório'; end if;
  page:=public.eo_sales_dataset_page((f->>'structured')::uuid);
  if page->>'total'<>'2' then raise exception 'FAIL: admin sem dados'; end if;
  -- Regressão real: esta consulta falhava em role_of_actor mesmo filtrando outro bucket.
  if (select count(*) from storage.objects where bucket_id='eo-sales-html' and name like (f->>'admin')||'/%')<>2 then
    raise exception 'FAIL: admin sem arquivos de relatório'; end if;
  if not public.eo_operational_object_readable('eo-sales-html',(f->>'admin')||'/structured.html') then
    raise exception 'FAIL: admin sem fonte estruturada'; end if;

  perform set_config('request.jwt.claim.sub',f->>'person',true);
  if not exists(select 1 from jsonb_array_elements(public.eo_sales_reports()) r where r->>'id'=f->>'legacy') then
    raise exception 'FAIL: pessoa sem relatório autorizado'; end if;
  page:=public.eo_sales_dataset_page((f->>'structured')::uuid);
  if page->>'total'<>'1' or page->'totals'->>'real'<>'100' then raise exception 'FAIL: escopo dataset'; end if;
  if not public.eo_operational_object_readable('eo-sales-html',(f->>'admin')||'/legacy.html')
    or public.eo_operational_object_readable('eo-sales-html',(f->>'admin')||'/structured.html') then
    raise exception 'FAIL: autorização HTML'; end if;
  if (select count(*) from storage.objects where bucket_id='eo-sales-html' and name like (f->>'admin')||'/%')<>1 then
    raise exception 'FAIL: RLS HTML fora do escopo'; end if;
  if not exists(select 1 from storage.objects where bucket_id='eo-checklist-photos' and name=f->>'photo')
    or not public.eo_checklist_object_upload_allowed('eo-checklist-photos',f->>'photo') then
    raise exception 'FAIL: fotos próprias indisponíveis'; end if;
  if public.eo_checklist_object_readable('eo-sales-html',f->>'photo')
    or public.eo_checklist_object_upload_allowed('eo-sales-html',f->>'photo')
    or public.eo_checklist_object_upload_allowed('eo-checklist-photos',(f->>'person')||'/invalido/photo.jpg') then
    raise exception 'FAIL: bucket ou UUID inválido aceito'; end if;
  perform public.eo_register_push_device('ExpoPushToken[EO_test_current_123456]','ios');
  perform public.eo_register_push_device('ExponentPushToken[EO_test_legacy_123456]','android');
  denied:=false;
  begin perform public.eo_register_push_device('arbitrary-native-token','ios'); exception when insufficient_privilege then denied:=true; end;
  if not denied then raise exception 'FAIL: token arbitrário aceito'; end if;

  perform set_config('request.jwt.claim.sub',f->>'manager',true);
  if not exists(select 1 from storage.objects where bucket_id='eo-checklist-photos' and name=f->>'photo') then
    raise exception 'FAIL: gerente sem foto da abrangência'; end if;
  if public.eo_checklist_object_upload_allowed('eo-checklist-photos',f->>'photo') then
    raise exception 'FAIL: gerente envia foto de outro usuário'; end if;

  perform set_config('request.jwt.claim.sub',f->>'outside',true);
  if exists(select 1 from storage.objects where bucket_id='eo-sales-html' and name like (f->>'admin')||'/%')
    or exists(select 1 from storage.objects where bucket_id='eo-checklist-photos' and name=f->>'photo') then
    raise exception 'FAIL: arquivos fora da abrangência'; end if;
  if exists(select 1 from jsonb_array_elements(public.eo_sales_reports()) r where r->>'id'=f->>'legacy') then
    raise exception 'FAIL: relatório externo visível'; end if;
  perform set_config('request.jwt.claim.sub','',true);
  denied:=false;
  begin perform public.eo_sales_reports(); exception when insufficient_privilege then denied:=true; end;
  if not denied then raise exception 'FAIL: sessão vazia lê relatórios'; end if;
end; $$;
reset role;
do $$
begin
  if has_function_privilege('anon','public.eo_checklist_object_readable(text,text)','EXECUTE')
    or has_function_privilege('anon','public.eo_checklist_object_upload_allowed(text,text)','EXECUTE') then
    raise exception 'FAIL: wrappers expostos a anon'; end if;
end; $$;
rollback;
select 'PASSOU: papel authenticated, RPCs, RLS de storage, checklist e tokens Expo' as resultado;

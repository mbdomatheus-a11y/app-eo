-- Executar apenas em banco de teste após as migrações. Não chama cron/Expo nem envia mensagens.
-- As identidades sintéticas e todas as alterações são revertidas pelo bloco de sucesso.
do $$
declare
  a uuid:=gen_random_uuid(); d uuid:=gen_random_uuid(); c uuid:=gen_random_uuid(); o uuid:=gen_random_uuid();
  sa uuid:=gen_random_uuid(); sb uuid:=gen_random_uuid(); report_id uuid; entry_id uuid; second_id uuid;
  path_html text; path_audio text; rejected boolean;
  day_request uuid:=gen_random_uuid(); mood_request uuid:=gen_random_uuid(); mood_id uuid;
begin
  if has_table_privilege('authenticated','public.eo_day_records','SELECT')
    or has_table_privilege('authenticated','public.eo_mood_records','INSERT')
    or has_table_privilege('anon','public.eo_sales_publications','SELECT') then
    raise exception 'FAIL: tabelas operacionais com acesso direto';
  end if;
  if has_function_privilege('anon','public.eo_day_entries(date,date,uuid)','EXECUTE')
    or has_function_privilege('authenticated','public.eo_process_mood_reminders()','EXECUTE') then
    raise exception 'FAIL: função sensível exposta';
  end if;
  begin
    insert into auth.users(id,email) values(a,a||'@example.invalid'),(d,d||'@example.invalid'),
      (c,c||'@example.invalid'),(o,o||'@example.invalid');
    insert into public.eo_profiles(id,display_name,role) values(a,'Teste Admin','admin'),
      (d,'Teste Diretor','diretor'),(c,'Teste Colaborador','colaborador'),(o,'Teste Outra Loja','colaborador');
    insert into public.eo_stores(id,code,name,region) values(sa,'t-'||left(sa::text,8),'Loja A','Regional A'),
      (sb,'t-'||left(sb::text,8),'Loja B','Regional B');
    insert into public.eo_store_members(user_id,store_id) values(d,sa),(c,sa),(o,sb);
    path_html:=a||'/teste.html'; path_audio:=c||'/teste.m4a';
    insert into storage.objects(bucket_id,name,metadata) values
      ('eo-sales-html',path_html,'{"mimetype":"text/html","size":80}'),
      ('eo-sales-html',a||'/mime-errado.html','{"mimetype":"application/javascript","size":80}'),
      ('eo-day-audio',path_audio,'{"mimetype":"audio/mp4","size":80}');
    perform set_config('request.jwt.claim.sub',a::text,true);
    report_id:=public.eo_publish_sales_report('Teste semanal','week',path_html,array[sa]);
    rejected:=false;
    begin perform public.eo_publish_sales_report('MIME inválido','week',a||'/mime-errado.html',array[sa]);
      exception when raise_exception then rejected:=true; end;
    if not rejected then raise exception 'FAIL: aceitou MIME incompatível com HTML'; end if;
    perform public.eo_admin_save_mood_settings(true,'16:00','America/Sao_Paulo');
    perform set_config('request.jwt.claim.sub',c::text,true);
    if public.eo_operational_upload_allowed('eo-sales-html',c||'/teste.html') then raise exception 'FAIL: colaborador envia HTML'; end if;
    if public.eo_operational_upload_allowed('eo-day-audio',a||'/teste.m4a')
      or public.eo_operational_upload_allowed('eo-day-audio',c||'/../teste.m4a') then raise exception 'FAIL: prefixo ou travessia de caminho'; end if;
    rejected:=false;
    begin perform public.eo_save_day_entry(sb,current_date,'sold','{}','');
      exception when insufficient_privilege then rejected:=true; end;
    if not rejected then raise exception 'FAIL: salvou fora da loja autorizada'; end if;
    rejected:=false;
    begin perform public.eo_save_day_entry(sa,current_date,'no_sale','{}','');
      exception when raise_exception then rejected:=true; end;
    if not rejected then raise exception 'FAIL: não venda sem motivo'; end if;
    rejected:=false;
    begin perform public.eo_save_day_entry(sa,current_date,'sold','{}','',path_audio,61,'Transcrição revisada no teste');
      exception when raise_exception then rejected:=true; end;
    if not rejected then raise exception 'FAIL: duração maior que 60 segundos'; end if;
    rejected:=false;
    begin perform public.eo_save_day_entry(sa,current_date,'sold','{}','',path_audio,10,null);
      exception when raise_exception then rejected:=true; end;
    if not rejected then raise exception 'FAIL: áudio sem texto revisado'; end if;
    entry_id:=public.eo_save_day_entry(sa,current_date,'no_sale',array['Falta de produto'],'Observação privada',path_audio,10,'Transcrição revisada no teste',day_request);
    if public.eo_save_day_entry(sa,current_date,'no_sale',array['Falta de produto'],'Observação privada',path_audio,10,'Transcrição revisada no teste',day_request)<>entry_id then
      raise exception 'FAIL: retransmissão do diário retornou outro registro'; end if;
    second_id:=public.eo_save_day_entry(sa,current_date,'sold','{}','Outra interação');
    if entry_id=second_id or jsonb_array_length(public.eo_day_entries(current_date,current_date,sa))<>2 then
      raise exception 'FAIL: múltiplos registros no mesmo dia foram sobrescritos'; end if;
    mood_id:=public.eo_save_mood(sa,current_date,'happy',mood_request);
    if public.eo_save_mood(sa,current_date,'happy',mood_request)<>mood_id then
      raise exception 'FAIL: retransmissão do humor retornou outro registro'; end if;
    perform public.eo_save_mood(sa,current_date,'neutral');
    if jsonb_array_length(public.eo_mood_entries(current_date,current_date,sa))<>2 then raise exception 'FAIL: humor sobrescrito no dia'; end if;
    if not public.eo_operational_object_readable('eo-day-audio',path_audio) then raise exception 'FAIL: áudio próprio indisponível'; end if;
    perform set_config('request.jwt.claim.sub',d::text,true);
    if jsonb_array_length(public.eo_day_entries(current_date,current_date,sa))<>2
      or jsonb_array_length(public.eo_mood_entries(current_date,current_date,sa))<>2
      or not public.eo_operational_object_readable('eo-day-audio',path_audio) then raise exception 'FAIL: diretor sem dados de sua abrangência'; end if;
    rejected:=false;
    begin perform public.eo_archive_sales_report(report_id,true); exception when insufficient_privilege then rejected:=true; end;
    if not rejected then raise exception 'FAIL: diretor arquiva relatório'; end if;
    perform public.eo_save_day_entry(sa,current_date,'sold','{}','Relato do diretor');
    perform set_config('request.jwt.claim.sub',c::text,true);
    if jsonb_array_length(public.eo_day_entries(current_date,current_date,sa))<>2 then raise exception 'FAIL: colaborador vê relato de outra pessoa'; end if;
    if not exists(select 1 from jsonb_array_elements(public.eo_sales_reports('week')) r where r->>'id'=report_id::text) then
      raise exception 'FAIL: relatório autorizado invisível'; end if;
    perform set_config('request.jwt.claim.sub',o::text,true);
    if public.eo_operational_object_readable('eo-day-audio',path_audio)
      or public.eo_operational_object_readable('eo-sales-html',path_html)
      or exists(select 1 from jsonb_array_elements(public.eo_sales_reports()) r where r->>'id'=report_id::text) then
      raise exception 'FAIL: arquivos ou relatórios vazam entre lojas'; end if;
    if jsonb_array_length(public.eo_day_entries(current_date,current_date))<>0
      or jsonb_array_length(public.eo_mood_entries(current_date,current_date))<>0 then raise exception 'FAIL: registros vazam entre pessoas/lojas'; end if;
    perform set_config('request.jwt.claim.sub',a::text,true);
    perform public.eo_archive_sales_report(report_id,true);
    perform set_config('request.jwt.claim.sub',c::text,true);
    if public.eo_operational_object_readable('eo-sales-html',path_html)
      or exists(select 1 from jsonb_array_elements(public.eo_sales_reports()) r where r->>'id'=report_id::text) then
      raise exception 'FAIL: relatório arquivado ainda disponível'; end if;
    perform set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
    rejected:=false;
    begin perform public.eo_mood_settings(); exception when insufficient_privilege then rejected:=true; end;
    if not rejected then raise exception 'FAIL: identidade sem perfil acessa módulo'; end if;
    raise exception using errcode='ZX001',message='testes concluídos';
  exception when sqlstate 'ZX001' then null;
  end;
  if exists(select 1 from public.eo_profiles where id in(a,d,c,o)) then raise exception 'FAIL: fixtures não revertidas'; end if;
end; $$;
select 'PASSOU: permissões, escopo, privacidade, MIME, caminhos, múltiplos eventos, limite declarado de áudio e arquivamento' as resultado;

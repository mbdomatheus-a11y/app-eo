-- Após a migração 003, em banco de teste. Fixtures integralmente revertidas.
do $$
declare
  a uuid:=gen_random_uuid(); d uuid:=gen_random_uuid(); c uuid:=gen_random_uuid();
  sa uuid:=gen_random_uuid(); sb uuid:=gen_random_uuid(); page jsonb; overview jsonb; denied boolean;
  cutoff timestamptz:=now(); first_id text;
begin
  if has_function_privilege('authenticated','public.eo_day_entries(date,date,uuid)','EXECUTE')
    or has_function_privilege('authenticated','public.eo_mood_entries(date,date,uuid)','EXECUTE')
    or has_function_privilege('anon','public.eo_day_entries_page(date,date,uuid[],integer,integer,timestamptz)','EXECUTE') then
    raise exception 'FAIL: permissões das APIs de relatórios'; end if;
  begin
    insert into auth.users(id,email) values(a,a||'@example.invalid'),(d,d||'@example.invalid'),(c,c||'@example.invalid');
    insert into public.eo_profiles(id,display_name,role) values(a,'Teste Admin','admin'),(d,'Teste Diretor','diretor'),(c,'Teste Colaborador','colaborador');
    insert into public.eo_stores(id,code,name,region) values(sa,'t-'||left(sa::text,8),'Loja teste A','Regional teste A'),
      (sb,'t-'||left(sb::text,8),'Loja teste B','Regional teste B');
    insert into public.eo_store_members(user_id,store_id) values(d,sa),(c,sa);
    perform set_config('request.jwt.claim.sub',a::text,true);
    perform public.eo_admin_save_mood_settings(true,'16:00','America/Sao_Paulo');
    perform public.eo_save_day_entry(sb,current_date,'sold','{}','');
    perform public.eo_save_mood(sb,current_date,'happy');
    perform set_config('request.jwt.claim.sub',c::text,true);
    perform public.eo_save_day_entry(sa,current_date,'sold','{}','');
    perform public.eo_save_day_entry(sa,current_date,'no_sale',array['Sem estoque'],'');
    perform public.eo_save_day_entry(sa,current_date,'no_sale',array['Sem estoque'],'');
    perform public.eo_save_mood(sa,current_date,'happy');
    perform public.eo_save_mood(sa,current_date,'neutral');
    page:=public.eo_day_entries_page(current_date,current_date,array[sa],2,0,cutoff);
    first_id:=page->'items'->0->>'id';
    if (page->>'total')::integer<>3 or jsonb_array_length(page->'items')<>2 then raise exception 'FAIL: limite ou total da primeira página'; end if;
    page:=public.eo_day_entries_page(current_date,current_date,array[sa],2,2,cutoff);
    if (page->>'total')::integer<>3 or jsonb_array_length(page->'items')<>1 or page->'items'->0->>'id'=first_id then
      raise exception 'FAIL: deslocamento da página'; end if;
    page:=public.eo_mood_entries_page(current_date,current_date,array[sa],1,1,cutoff);
    if (page->>'total')::integer<>2 or jsonb_array_length(page->'items')<>1 then raise exception 'FAIL: página de humor'; end if;
    page:=public.eo_day_entries_page(current_date,current_date,array[sa],500,0,cutoff-interval '1 second');
    if (page->>'total')::integer<>0 then raise exception 'FAIL: corte temporal ignorado'; end if;
    denied:=false;
    begin perform public.eo_day_entries_page(current_date,current_date,array[sb]); exception when insufficient_privilege then denied:=true; end;
    if not denied then raise exception 'FAIL: seleção de loja não autorizada'; end if;
    perform set_config('request.jwt.claim.sub',d::text,true);
    perform public.eo_save_day_entry(sa,current_date,'sold','{}','');
    perform public.eo_save_mood(sa,current_date,'sad');
    overview:=public.eo_operational_overview(current_date,current_date,array[sa],'region',cutoff);
    if (overview->>'diary_count')::integer<>4 or (overview->>'mood_count')::integer<>3
      or (overview->>'people_count')::integer<>2 or (overview->>'store_count')::integer<>1 then
      raise exception 'FAIL: total de eventos ou DISTINCT entre módulos'; end if;
    if not exists(select 1 from jsonb_array_elements(overview->'groups') g where g->>'key'='Regional teste A'
      and (g->>'diary_count')::integer=4 and (g->>'happy')::integer=1 and (g->>'neutral')::integer=1 and (g->>'sad')::integer=1) then
      raise exception 'FAIL: grupos do overview'; end if;
    if not exists(select 1 from jsonb_array_elements(overview->'top_reasons') r where r->>'reason'='Sem estoque' and (r->>'count')::integer=2) then
      raise exception 'FAIL: contagem dos motivos'; end if;
    perform set_config('request.jwt.claim.sub',c::text,true);
    page:=public.eo_day_entries_page(current_date,current_date,array[sa]);
    if (page->>'total')::integer<>3 then raise exception 'FAIL: colaborador acessa eventos do diretor'; end if;
    perform set_config('request.jwt.claim.sub',a::text,true);
    overview:=public.eo_operational_overview(current_date,current_date,array[sa,sb],'store',cutoff);
    if (overview->>'diary_count')::integer<>5 or (overview->>'mood_count')::integer<>4
      or (overview->>'people_count')::integer<>3 or (overview->>'store_count')::integer<>2
      or jsonb_array_length(overview->'groups')<>2 then raise exception 'FAIL: agregação administrativa entre lojas'; end if;
    raise exception using errcode='ZX001',message='testes concluídos';
  exception when sqlstate 'ZX001' then null;
  end;
  if exists(select 1 from public.eo_profiles where id in(a,d,c)) then raise exception 'FAIL: fixtures não revertidas'; end if;
end; $$;
select 'PASSOU: paginação, corte temporal, escopo e agregação DISTINCT em SQL' as resultado;

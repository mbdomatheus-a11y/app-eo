-- Executar somente em banco de teste após 202611080002. Fixtures revertidas.
do $$
declare
  a uuid:=gen_random_uuid(); c uuid:=gen_random_uuid(); o uuid:=gen_random_uuid();
  sa uuid:=gen_random_uuid(); sb uuid:=gen_random_uuid(); sc uuid:=gen_random_uuid(); report_id uuid;
  code_a text:='81'||floor(random()*1000000000)::bigint; code_b text:='82'||floor(random()*1000000000)::bigint;
  code_c text:='83'||floor(random()*1000000000)::bigint;
  row_a jsonb; rows jsonb; result jsonb; page jsonb; denied boolean; path_html text;
begin
  if has_table_privilege('authenticated','public.eo_sales_rows','SELECT')
    or has_table_privilege('authenticated','public.eo_sales_batches','INSERT')
    or has_sequence_privilege('authenticated','public.eo_sales_rows_id_seq','USAGE')
    or has_sequence_privilege('anon','public.eo_sales_rows_id_seq','SELECT')
    or has_function_privilege('anon','public.eo_append_sales_dataset(uuid,integer,jsonb)','EXECUTE')
    or has_function_privilege('anon','public.eo_sales_dataset_page(uuid,text,text,text,text,text,text,boolean,integer,integer)','EXECUTE') then
    raise exception 'FAIL: permissões diretas de vendas'; end if;
  begin
    insert into auth.users(id,email) values(a,a||'@example.invalid'),(c,c||'@example.invalid'),(o,o||'@example.invalid');
    insert into public.eo_profiles(id,display_name,role) values(a,'Admin teste','admin'),(c,'Pessoa teste','colaborador'),(o,'Outra pessoa','colaborador');
    insert into public.eo_stores(id,code,name,region) values(sa,code_a,'Loja A','Reg A'),(sb,code_b,'Loja B','Reg B'),(sc,code_c,'Loja C','Reg C');
    insert into public.eo_store_members(user_id,store_id) values(c,sa),(o,sc);
    path_html:=a||'/structured-test.html';
    insert into storage.objects(bucket_id,name,metadata) values('eo-sales-html',path_html,'{"mimetype":"text/html","size":43773370}');
    perform set_config('request.jwt.claim.sub',a::text,true);
    report_id:=public.eo_begin_sales_dataset('Teste estruturado','week',path_html,array[sa,sb]);
    row_a:=jsonb_build_object('codigo_loja','00'||code_a,'nome_loja','Loja A','regional','Reg A','departamento','MODA',
      'secao','1','nome_secao','Feminino','lmpa','X','nivel','LOJA_TOTAL','real',100,'meta',120,'real_ly',80,
      'estoque_2025',1,'estoque_2026',2,'estoque_d1',3,'estoque_d364',4,'ly_estoque_atual',5,
      'estoque_vermelho_d1',6,'estoque_branco_d1',7,'estoque_transito',8,'estoque_esperado_alocado',9,
      'cupons_2026',10,'cupons_2025',11,'itens',12,'itens_ly',13,'venda_custo',14,'venda_custo_ly',15);
    rows:=jsonb_build_array(row_a,row_a||jsonb_build_object('codigo_loja',code_b,'nome_loja','Loja B','regional','Reg B','real',200),
      row_a||jsonb_build_object('nivel','DEP_TOTAL','real',999),row_a||jsonb_build_object('codigo_loja','COD-INEXISTENTE'),
      row_a||jsonb_build_object('codigo_loja',code_c));
    result:=public.eo_append_sales_dataset(report_id,0,rows);
    if result->>'accepted'<>'3' or result->>'ignored'<>'2' then raise exception 'FAIL: COD normalizado, desconhecido ou fora da publicação'; end if;
    result:=public.eo_append_sales_dataset(report_id,0,rows);
    if result->>'replayed'<>'true' or (select count(*) from public.eo_sales_rows where publication_id=report_id)<>3 then
      raise exception 'FAIL: retry duplicou lote'; end if;
    denied:=false;
    begin perform public.eo_append_sales_dataset(report_id,0,jsonb_build_array(row_a)); exception when raise_exception then denied:=true; end;
    if not denied then raise exception 'FAIL: retry com conteúdo divergente'; end if;
    denied:=false;
    begin perform public.eo_append_sales_dataset(report_id,1,jsonb_build_array(row_a||'{"real":"100"}'::jsonb)); exception when raise_exception then denied:=true; end;
    if not denied then raise exception 'FAIL: métrica textual aceita'; end if;
    denied:=false;
    begin perform public.eo_append_sales_dataset(report_id,1,jsonb_build_array(row_a||'{"nome_loja":{"x":"html"}}'::jsonb)); exception when raise_exception then denied:=true; end;
    if not denied then raise exception 'FAIL: objeto aninhado aceito'; end if;
    perform set_config('request.jwt.claim.sub',c::text,true);
    if exists(select 1 from jsonb_array_elements(public.eo_sales_reports()) r where r->>'id'=report_id::text) then raise exception 'FAIL: pending visível'; end if;
    denied:=false;
    begin perform public.eo_sales_dataset_page(report_id); exception when insufficient_privilege then denied:=true; end;
    if not denied then raise exception 'FAIL: leitura pending'; end if;
    denied:=false;
    begin perform public.eo_append_sales_dataset(report_id,1,jsonb_build_array(row_a)); exception when insufficient_privilege then denied:=true; end;
    if not denied then raise exception 'FAIL: colaborador importa'; end if;
    denied:=false;
    begin perform public.eo_finish_sales_dataset(report_id); exception when insufficient_privilege then denied:=true; end;
    if not denied then raise exception 'FAIL: colaborador finaliza'; end if;
    perform set_config('request.jwt.claim.sub',a::text,true);
    perform public.eo_append_sales_dataset(report_id,1,jsonb_build_array(
      row_a||jsonb_build_object('codigo_loja',code_b,'regional','Reg B','departamento','ALIMENTOS','nivel','SEC_TOTAL','real',null),
      row_a||jsonb_build_object('codigo_loja',code_b,'regional','Reg B','departamento','ALIMENTOS','nivel','SEC_TOTAL','real',50)));
    perform public.eo_finish_sales_dataset(report_id);
    perform public.eo_append_sales_dataset(report_id,0,rows); -- retry após finish permanece seguro
    page:=public.eo_sales_dataset_page(report_id,p_level=>'SEC_TOTAL',p_limit=>1);
    if page->'items'->0->>'real'<>'50' then raise exception 'FAIL: nulos antes de métricas em desc'; end if;
    page:=public.eo_sales_dataset_page(report_id,p_region=>'Reg A');
    if jsonb_array_length(page->'stores')<>1 or page->'stores'->0->>'code'<>code_a
      or page->'departments'<>'["MODA"]'::jsonb then raise exception 'FAIL: opções não seguem regional'; end if;
    page:=public.eo_sales_dataset_page(report_id,p_store=>code_a);
    if page->'departments'<>'["MODA"]'::jsonb then raise exception 'FAIL: departamentos não seguem loja'; end if;
    page:=public.eo_sales_dataset_page(report_id,p_limit=>1);
    if page->>'total'<>'2' or jsonb_array_length(page->'items')<>1 or page->'items'->0->>'real'<>'200'
      or page->'totals'->>'real'<>'300' then raise exception 'FAIL: total por nível, ordenação ou página'; end if;
    page:=public.eo_sales_dataset_page(report_id,p_limit=>1,p_offset=>1);
    if page->'items'->0->>'real'<>'100' then raise exception 'FAIL: segunda página'; end if;
    page:=public.eo_sales_dataset_page(report_id,p_store=>code_a);
    if page->>'total'<>'1' or page->'totals'->>'real'<>'100' then raise exception 'FAIL: filtro de loja normalizado'; end if;
    perform set_config('request.jwt.claim.sub',c::text,true);
    page:=public.eo_sales_dataset_page(report_id);
    if page->>'total'<>'1' or page->'totals'->>'real'<>'100' or jsonb_array_length(page->'stores')<>1
      or page->'regions'<>'["Reg A"]'::jsonb then raise exception 'FAIL: escopo nos itens, totais ou opções'; end if;
    if public.eo_operational_object_readable('eo-sales-html',path_html) then raise exception 'FAIL: HTML structured disponível ao colaborador'; end if;
    page:=public.eo_sales_dataset_page(report_id,p_region=>'Reg B');
    if page->>'total'<>'0' then raise exception 'FAIL: filtro acessa loja externa'; end if;
    perform set_config('request.jwt.claim.sub',o::text,true);
    denied:=false;
    begin perform public.eo_sales_dataset_page(report_id); exception when insufficient_privilege then denied:=true; end;
    if not denied then raise exception 'FAIL: publicação fora da abrangência'; end if;
    perform set_config('request.jwt.claim.sub',a::text,true);
    if not public.eo_operational_object_readable('eo-sales-html',path_html) then raise exception 'FAIL: admin sem HTML fonte'; end if;
    perform public.eo_archive_sales_report(report_id,true);
    perform set_config('request.jwt.claim.sub',c::text,true);
    denied:=false;
    begin perform public.eo_sales_dataset_page(report_id); exception when insufficient_privilege then denied:=true; end;
    if not denied then raise exception 'FAIL: publicação arquivada disponível'; end if;
    raise exception using errcode='ZX001',message='testes concluídos';
  exception when sqlstate 'ZX001' then null;
  end;
  if exists(select 1 from public.eo_profiles where id in(a,c,o)) then raise exception 'FAIL: fixtures não revertidas'; end if;
end; $$;
select 'PASSOU: vendas estruturadas, permissões, escopo, lotes, COD e paginação' as resultado;



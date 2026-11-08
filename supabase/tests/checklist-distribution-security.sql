-- Executar apenas em banco de teste após as migrações. Tudo é revertido.
-- As chamadas RPC abaixo rodam efetivamente como authenticated.
begin;
do $$
declare
 a uuid:=gen_random_uuid(); c uuid:=gen_random_uuid(); o uuid:=gen_random_uuid(); x uuid:=gen_random_uuid();
 i uuid:=gen_random_uuid(); sa uuid:=gen_random_uuid(); sb uuid:=gen_random_uuid();
 suffix text:=left(replace(gen_random_uuid()::text,'-',''),8); chapa text:=('99'||floor(random()*1000000000000)::bigint::text);
begin
 insert into auth.users(id,email) values(a,a||'@example.invalid'),(c,c||'@example.invalid'),(o,o||'@example.invalid'),(x,x||'@example.invalid'),(i,i||'@example.invalid');
 insert into public.eo_profiles(id,display_name,role,login_chapa,active) values
 (a,'Teste Admin Checklist','admin',null,true),(c,'Teste Multiloja','colaborador',null,true),
 (o,'Teste Regional','diretor',chapa,true),(x,'Teste Sem Escopo','colaborador',null,true),(i,'Teste Inativo','colaborador',null,false);
 insert into public.eo_stores(id,code,name,region,ggl) values(sa,'ta-'||suffix,'Teste A','Teste','tg-'||suffix),(sb,'tb-'||suffix,'Teste B','Teste','tg-'||suffix);
 insert into public.eo_store_members(user_id,store_id) values(c,sa),(c,sb),(i,sa);
 insert into public.eo_directory_people(chapa,display_name,operational_role) values(chapa,'Teste Regional','Diretor');
 insert into public.eo_org_assignments(chapa,scope_type,scope_code) values(chapa,'GGL','tg-'||suffix);
 perform set_config('eo_test.admin',a::text,true); perform set_config('eo_test.multi',c::text,true);
 perform set_config('eo_test.org',o::text,true); perform set_config('eo_test.outside',x::text,true);
 perform set_config('eo_test.inactive',i::text,true); perform set_config('eo_test.sa',sa::text,true); perform set_config('eo_test.sb',sb::text,true);
end; $$;
set local role authenticated;
do $$
declare t uuid; v_alert uuid; r uuid; item uuid; detail jsonb; rejected boolean; person text; first_page jsonb; second_page jsonb; v_title text:='Checklist '||current_setting('eo_test.admin');
begin
 perform set_config('request.jwt.claim.sub',current_setting('eo_test.admin'),true);
 t:=public.eo_checklist_create(v_title,'Descrição preservada',
 '[{"prompt":"Li a orientação?","type":"acceptance","required":true},{"prompt":"Foto da loja","type":"photo","required":false},{"prompt":"Observações","type":"text","required":false},{"prompt":"Está pronto?","type":"yes_no","required":true}]',
 array[current_setting('eo_test.sa')::uuid,current_setting('eo_test.sb')::uuid,current_setting('eo_test.sa')::uuid]);
 perform set_config('eo_test.template',t::text,true);
 v_alert:=public.eo_checklist_notification(t);
 perform set_config('eo_test.alert',v_alert::text,true);
 if public.eo_alert_push_metadata(v_alert)->>'id'<>v_alert::text then raise exception 'FAIL: metadados de push do criador'; end if;
 foreach person in array array['admin','multi','org'] loop
   perform set_config('request.jwt.claim.sub',current_setting('eo_test.'||person),true);
   if (select count(*) from jsonb_array_elements(public.eo_checklist_feed()) q where q->>'template_id'=t::text)<>2 then
     raise exception 'FAIL: distribuição admin/multiloja/regional ou duplicidade (%)',person; end if;
 end loop;
 perform set_config('request.jwt.claim.sub',current_setting('eo_test.multi'),true);
 if not exists(select 1 from jsonb_array_elements(public.eo_alert_feed()) q where q->>'id'=v_alert::text) then raise exception 'FAIL: aviso interno não distribuído'; end if;
 rejected:=false;
 begin perform public.eo_checklist_notification(t); exception when insufficient_privilege then rejected:=true; end;
 if not rejected then raise exception 'FAIL: destinatário pode obter metadados de envio'; end if;
 first_page:=public.eo_checklist_feed_page(1,0,v_title,'pending');
 second_page:=public.eo_checklist_feed_page(1,1,v_title,'pending');
 if (first_page->>'total')::int<>2 or jsonb_array_length(first_page->'items')<>1
   or (second_page->>'total')::int<>2 or jsonb_array_length(second_page->'items')<>1
   or first_page->'items'->0->>'run_id'=second_page->'items'->0->>'run_id' then raise exception 'FAIL: paginação ou ordem determinística'; end if;
 if jsonb_array_length(public.eo_checklist_feed_page(1,2,v_title,'')->'items')<>0
   or (public.eo_checklist_feed_page(30,0,'sem-correspondencia-'||t,'')->>'total')::int<>0 then raise exception 'FAIL: filtro textual/offset'; end if;
 select (q->>'run_id')::uuid into r from jsonb_array_elements(public.eo_checklist_feed()) q where q->>'template_id'=t::text limit 1;
 detail:=public.eo_checklist_detail(r);
 if detail->>'description'<>'Descrição preservada' or jsonb_array_length(detail->'items')<>4
   or detail->'items'->1->>'type'<>'photo' or (detail->'items'->2->>'required')::boolean then raise exception 'FAIL: perguntas alteradas'; end if;
 item:=(detail->'items'->0->>'id')::uuid;
 perform public.eo_checklist_save(r,item,'{"accepted":true}');
 item:=(detail->'items'->3->>'id')::uuid;
 perform public.eo_checklist_save(r,item,'{"value":false}');
 if public.eo_checklist_detail(r)->'run'->>'status'<>'completed' then raise exception 'FAIL: conclusão de perguntas obrigatórias'; end if;
 if (public.eo_checklist_feed_page(30,0,v_title,'completed')->>'total')::int<>1
   or (public.eo_checklist_feed_page(30,0,v_title,'pending')->>'total')::int<>1 then raise exception 'FAIL: filtro por status'; end if;
 rejected:=false;
 begin perform public.eo_checklist_create('Sem permissão','', '[{"prompt":"Pergunta","type":"text"}]',array[current_setting('eo_test.sa')::uuid]); exception when insufficient_privilege then rejected:=true; end;
 if not rejected then raise exception 'FAIL: colaborador pode publicar'; end if;
 perform set_config('request.jwt.claim.sub',current_setting('eo_test.outside'),true);
 if (public.eo_checklist_feed_page(30,0,v_title,'')->>'total')::int<>0 then raise exception 'FAIL: página expõe checklist de outra pessoa'; end if;
 if exists(select 1 from jsonb_array_elements(public.eo_checklist_feed()) q where q->>'template_id'=t::text) then raise exception 'FAIL: pessoa sem escopo recebeu checklist'; end if;
 rejected:=false;
 begin perform public.eo_checklist_detail(r); exception when insufficient_privilege then rejected:=true; end;
 if not rejected then raise exception 'FAIL: acesso ao checklist de outra pessoa'; end if;
 rejected:=false;
 begin perform public.eo_checklist_save(r,item,'{"value":true}'); exception when insufficient_privilege then rejected:=true; end;
 if not rejected then raise exception 'FAIL: alterou checklist de outra pessoa'; end if;
 perform set_config('request.jwt.claim.sub',current_setting('eo_test.admin'),true);
 rejected:=false;
 begin perform public.eo_checklist_create('Inválido','', '[{"prompt":"Pergunta sem tipo"}]',array[current_setting('eo_test.sa')::uuid]); exception when raise_exception then rejected:=true; end;
 if not rejected then raise exception 'FAIL: aceitou pergunta sem tipo'; end if;
 rejected:=false;
 begin perform public.eo_checklist_create('Loja inexistente','', '[{"prompt":"Pergunta","type":"text"}]',array[gen_random_uuid()]); exception when insufficient_privilege or raise_exception then rejected:=true; end;
 if not rejected then raise exception 'FAIL: aceitou loja inexistente'; end if;
 rejected:=false;
 begin perform public.eo_checklist_feed_page(30,0,'','desconhecido'); exception when raise_exception then rejected:=true; end;
 if not rejected then raise exception 'FAIL: aceitou status inválido'; end if;
end; $$;
reset role;
do $$ begin
 if exists(select 1 from public.eo_checklist_runs where template_id=current_setting('eo_test.template')::uuid and assigned_to=current_setting('eo_test.inactive')::uuid) then raise exception 'FAIL: atribuição para pessoa inativa'; end if;
 if exists(select 1 from public.eo_alert_recipients where alert_id=current_setting('eo_test.alert')::uuid and user_id in(current_setting('eo_test.inactive')::uuid,current_setting('eo_test.outside')::uuid)) then raise exception 'FAIL: aviso para pessoa inativa/sem escopo'; end if;
 if (select count(*) from public.eo_alert_recipients where alert_id=current_setting('eo_test.alert')::uuid and user_id in(current_setting('eo_test.admin')::uuid,current_setting('eo_test.multi')::uuid,current_setting('eo_test.org')::uuid))<>3 then raise exception 'FAIL: aviso deve ser único por pessoa mesmo com múltiplas lojas'; end if;
 if (select data->>'type' from public.eo_alerts where id=current_setting('eo_test.alert')::uuid)<>'checklist' then raise exception 'FAIL: aviso sem tipo checklist'; end if;
end; $$;
rollback;
select 'PASSOU: checklist Excel, distribuição por abrangência, administradores, multiloja, privacidade e respostas' as resultado;

-- Fixtures fictícias, RPCs sob authenticated, sem notificações externas. Nada é persistido.
begin;
create temp table identity_fixtures(kind text primary key,id uuid default gen_random_uuid(),chapa text default ('77'||lpad(floor(random()*1e15)::bigint::text,15,'0')));
insert into identity_fixtures(kind) values('admin'),('admin_peer'),('protected'),('manager'),('worker'),('outside');
grant select on identity_fixtures to authenticated;
insert into auth.users(id,email) select id,id||'@example.invalid' from identity_fixtures;
insert into public.eo_profiles(id,display_name,role,login_chapa,active,deletion_protected)
select id,'Teste identidade '||kind,case when kind in ('admin','admin_peer','protected') then 'admin' when kind='manager' then 'gerente' else 'colaborador' end,chapa,true,kind='protected' from identity_fixtures;
create temp table identity_stores(kind text primary key,id uuid default gen_random_uuid());
insert into identity_stores(kind) values('own'),('outside');grant select on identity_stores to authenticated;
insert into public.eo_stores(id,code,name,region) select id,'it-'||left(id::text,12),'Loja teste identidade','Teste' from identity_stores;
insert into public.eo_store_members(user_id,store_id) select f.id,s.id from identity_fixtures f cross join identity_stores s where f.kind in ('manager','worker') and s.kind='own';
update public.eo_profiles set unit_type='loja' where id in(select id from identity_fixtures where kind in ('manager','worker'));
select set_config('request.jwt.claim.sub',(select id::text from identity_fixtures where kind='admin'),true);
set local role authenticated;
do $$ declare rejected boolean; p uuid; response jsonb; template uuid; begin
 if has_function_privilege('anon','public.eo_admin_delete_person(uuid)','execute') or has_function_privilege('anon','public.eo_profile_preferences(text,text,uuid,jsonb)','execute') then raise exception 'FAIL grants anon'; end if;
 select id into p from identity_fixtures where kind='protected';rejected:=false;
 begin perform public.eo_admin_delete_person(p);exception when raise_exception then rejected:=true;end;
 if not rejected then raise exception 'FAIL exclusão protegido';end if;
 -- Admin comum tem a mesma alçada para rebaixar/desativar o protegido, sem apagá-lo.
 perform public.eo_admin_update_person(p,'Teste master rebaixado','colaborador',(select chapa from identity_fixtures where kind='protected'),'{}',false,'ec');
 rejected:=false;begin perform public.eo_admin_delete_person(p);exception when raise_exception then rejected:=true;end;
 if not rejected then raise exception 'FAIL proteção dependia de role';end if;
 -- Outro admin pode excluir um admin par, preservando todas as referências históricas.
 perform public.eo_admin_delete_person((select id from identity_fixtures where kind='admin_peer'));
 response:=public.eo_admin_people_page(p_user=>(select id from identity_fixtures where kind='admin_peer'));
 if (response->>'total')::int<>0 then raise exception 'FAIL pessoa excluída aparece na listagem';end if;
 rejected:=false;begin perform public.eo_admin_set_person_active((select id from identity_fixtures where kind='admin_peer'),true);exception when raise_exception then rejected:=true;end;
 if not rejected then raise exception 'FAIL reativação de exclusão';end if;
 perform public.eo_admin_identity_preferences(array['EMPRESA.COM.BR'],true,'Organização teste');
 response:=public.eo_admin_identity_preferences();if response->'email_domains'->>0<>'empresa.com.br' or not (response->>'require_email')::boolean then raise exception 'FAIL preferências normalizadas';end if;
 template:=public.eo_checklist_create('Teste campos e consentimento','Sem envio externo',
 '[{"prompt":"Resposta curta","type":"short_text","min_length":2,"max_length":8},{"prompt":"Número","type":"number"},{"prompt":"Telefone","type":"phone"},{"prompt":"Horário","type":"time"},{"prompt":"Texto de revisão","type":"long_text","required":false}]',array[(select id from identity_stores where kind='own')]);
 perform set_config('eo_test.identity_template',template::text,true);
end $$;
reset role;
do $$ declare p uuid; rejected boolean;begin
 select id into p from identity_fixtures where kind='protected';
 update public.eo_profiles set login_chapa='76'||lpad(floor(random()*1e15)::bigint::text,15,'0') where id=p;
 rejected:=false;begin update public.eo_profiles set deletion_protected=false where id=p;exception when raise_exception then rejected:=true;end;
 if not rejected then raise exception 'FAIL proteção removível por update';end if;
 rejected:=false;begin delete from public.eo_profiles where id=p;exception when raise_exception then rejected:=true;end;
 if not rejected then raise exception 'FAIL exclusão física protegido após troca de chapa';end if;
 if not exists(select 1 from public.eo_profiles where id=(select id from identity_fixtures where kind='admin_peer') and not active and deleted_at is not null)
  or not exists(select 1 from public.eo_audit_events where entity_id=(select id::text from identity_fixtures where kind='admin_peer') and action='member.deleted') then raise exception 'FAIL histórico exclusão';end if;
 -- Remover último vínculo não pode concluir a transação.
 rejected:=false;begin delete from public.eo_store_members where user_id=(select id from identity_fixtures where kind='worker');set constraints all immediate;exception when raise_exception then rejected:=true;end;
 if not rejected then raise exception 'FAIL ativo loja ficou sem vínculo';end if;set constraints all deferred;
 rejected:=false;begin update public.eo_store_members set user_id=(select id from identity_fixtures where kind='outside') where user_id=(select id from identity_fixtures where kind='worker');set constraints all immediate;exception when raise_exception then rejected:=true;end;
 if not rejected then raise exception 'FAIL UPDATE vínculo perdeu usuário antigo';end if;set constraints all deferred;
 rejected:=false;begin
  insert into public.eo_directory_people(chapa,display_name,operational_role) select chapa,'Teste escopo','Colaborador' from identity_fixtures where kind in ('worker','outside');
  insert into public.eo_org_assignments(chapa,scope_type,scope_code) select f.chapa,'LOJA',s.code from identity_fixtures f cross join public.eo_stores s where f.kind='worker' and s.id=(select id from identity_stores where kind='own');
  delete from public.eo_store_members where user_id=(select id from identity_fixtures where kind='worker');
  update public.eo_org_assignments set chapa=(select chapa from identity_fixtures where kind='outside') where chapa=(select chapa from identity_fixtures where kind='worker');
  set constraints all immediate;
 exception when raise_exception then rejected:=true;end;
 if not rejected then raise exception 'FAIL UPDATE chapa escopo perdeu usuário antigo';end if;set constraints all deferred;

 rejected:=false;begin insert into public.eo_checklist_locations(run_id,actor,consent) select r.id,r.assigned_to,true from public.eo_checklist_runs r where r.template_id=current_setting('eo_test.identity_template')::uuid limit 1;exception when check_violation then rejected:=true;end;
 if not rejected then raise exception 'FAIL CHECK aceitou consentimento sem coordenadas';end if;

end $$;
select set_config('request.jwt.claim.sub',(select id::text from identity_fixtures where kind='worker'),true);
set local role authenticated;
do $$ declare rejected boolean; r uuid; detail jsonb; item uuid; begin
 rejected:=false;begin perform public.eo_admin_delete_person((select id from identity_fixtures where kind='admin'));exception when insufficient_privilege then rejected:=true;end;
 if not rejected then raise exception 'FAIL colaborador exclui admin';end if;
 rejected:=false;begin perform public.eo_profile_preferences(p_phone=>'123');exception when raise_exception then rejected:=true;end;
 if not rejected then raise exception 'FAIL telefone inválido';end if;
 if public.eo_profile_preferences(p_phone=>'(11) 99999-1234',p_channel=>'phone')->>'phone'<>'+5511999991234' then raise exception 'FAIL telefone/canal do titular';end if;
 rejected:=false;begin perform public.eo_profile_preferences(p_store=>(select id from identity_stores where kind='own'),p_hours=>(select jsonb_agg(jsonb_build_object('day',d,'closed',true)) from generate_series(0,6)d));exception when insufficient_privilege then rejected:=true;end;
 if not rejected then raise exception 'FAIL colaborador alterou horário';end if;
 select (q->>'run_id')::uuid into r from jsonb_array_elements(public.eo_checklist_feed()) q where q->>'template_id'=current_setting('eo_test.identity_template');
 perform set_config('eo_test.identity_run',r::text,true);detail:=public.eo_checklist_detail(r);item:=(detail->'items'->0->>'id')::uuid;
 rejected:=false;begin perform public.eo_checklist_save(r,item,'{"text":"a"}');exception when raise_exception then rejected:=true;end;if not rejected then raise exception 'FAIL mínimo texto';end if;
 rejected:=false;begin perform public.eo_checklist_save(r,item,'{"text":"123456789"}');exception when raise_exception then rejected:=true;end;if not rejected then raise exception 'FAIL máximo texto';end if;
 perform public.eo_checklist_save(r,item,'{"text":"bom"}');
 item:=(detail->'items'->1->>'id')::uuid;rejected:=false;begin perform public.eo_checklist_save(r,item,'{"text":"um"}');exception when raise_exception then rejected:=true;end;if not rejected then raise exception 'FAIL número';end if;perform public.eo_checklist_save(r,item,'{"text":"12,5"}');
 item:=(detail->'items'->2->>'id')::uuid;rejected:=false;begin perform public.eo_checklist_save(r,item,'{"text":"abc"}');exception when raise_exception then rejected:=true;end;if not rejected then raise exception 'FAIL telefone checklist';end if;perform public.eo_checklist_save(r,item,'{"text":"+55 (11) 99999-1234"}');
 item:=(detail->'items'->3->>'id')::uuid;rejected:=false;begin perform public.eo_checklist_save(r,item,'{"text":"25:00"}');exception when raise_exception then rejected:=true;end;if not rejected then raise exception 'FAIL horário checklist';end if;perform public.eo_checklist_save(r,item,'{"text":"09:30"}');
 item:=(detail->'items'->4->>'id')::uuid;perform public.eo_checklist_save(r,item,'{"text":"merda","moderation_flag":false}');
 if not (public.eo_checklist_detail(r)->'items'->4->'answer'->>'moderation_flag')::boolean then raise exception 'FAIL palavrão bloqueado ou flag false do cliente aceita';end if;
 perform public.eo_record_checklist_location(r,false,99,999,10);
 perform public.eo_record_checklist_location(r,true,-23.5,-46.6,8);
 rejected:=false;begin perform public.eo_record_checklist_location(r,true,null,null,null);exception when raise_exception then rejected:=true;end;if not rejected then raise exception 'FAIL consentimento sem coordenadas';end if;
end $$;
reset role;
select set_config('request.jwt.claim.sub',(select id::text from identity_fixtures where kind='manager'),true);
set local role authenticated;
do $$ declare h jsonb; response jsonb; rejected boolean;begin
 select jsonb_agg(jsonb_build_object('day',d,'closed',false,'opens','09:00','closes','18:00')) into h from generate_series(0,6)d;
 response:=public.eo_profile_preferences(p_store=>(select id from identity_stores where kind='own'),p_hours=>h);
 if jsonb_array_length(response->'stores')<>1 then raise exception 'FAIL gerente não salvou horário';end if;
 rejected:=false;begin perform public.eo_profile_preferences(p_store=>(select id from identity_stores where kind='outside'),p_hours=>h);exception when insufficient_privilege then rejected:=true;end;if not rejected then raise exception 'FAIL gerente altera outra unidade';end if;
 rejected:=false;begin perform public.eo_profile_preferences(p_store=>(select id from identity_stores where kind='own'),p_hours=>'[{"day":0,"closed":true}]');exception when raise_exception then rejected:=true;end;if not rejected then raise exception 'FAIL semana incompleta';end if;
end $$;
reset role;
select set_config('request.jwt.claim.sub',(select id::text from identity_fixtures where kind='outside'),true);
set local role authenticated;
do $$ declare rejected boolean:=false;begin
 begin perform public.eo_record_checklist_location(current_setting('eo_test.identity_run')::uuid,true,-23,-46,10);exception when insufficient_privilege then rejected:=true;end;
 if not rejected then raise exception 'FAIL localização em checklist alheio';end if;
end $$;
reset role;
do $$begin
 if not exists(select 1 from public.eo_checklist_locations where run_id=current_setting('eo_test.identity_run')::uuid and not consent and latitude is null and longitude is null and accuracy is null)
  or not exists(select 1 from public.eo_checklist_locations where run_id=current_setting('eo_test.identity_run')::uuid and consent and latitude=-23.5 and longitude=-46.6) then raise exception 'FAIL localização consentida/recusa';end if;
end $$;
set constraints all immediate;
select 'PASSOU: identidade protegida por ID, igualdade admin, exclusão auditável, unidade, perfil, horários, campos checklist e consentimento local' as resultado;
rollback;

begin;
create temp table u_fixtures(kind text primary key,id uuid default gen_random_uuid());
insert into u_fixtures(kind) values('admin'),('manager'),('outsider'),('store');
grant select on u_fixtures to authenticated;
insert into auth.users(id,email) select id,id||'@example.invalid' from u_fixtures where kind<>'store';
insert into public.eo_profiles(id,display_name,role,active)
 select id,'Teste unidade '||kind,case when kind='admin' then 'admin' else 'gerente' end,true from u_fixtures where kind<>'store';
insert into public.eo_stores(id,code,name) select id,'time-'||left(id::text,12),'Teste de horário' from u_fixtures where kind='store';
insert into public.eo_store_members(user_id,store_id) select m.id,s.id from u_fixtures m cross join u_fixtures s where m.kind='manager' and s.kind='store';
update public.eo_profiles set unit_type='loja' where id=(select id from u_fixtures where kind='manager');
select set_config('request.jwt.claim.sub',(select id::text from u_fixtures where kind='admin'),true);
set local role authenticated;
do $$ declare u uuid;rejected boolean:=false;config jsonb;begin
 u:=public.eo_admin_save_unit(null,'EC-test-'||left(gen_random_uuid()::text,8),'Escritório de teste','ec');
 perform public.eo_admin_assign_unit((select id from u_fixtures where kind='manager'),u);
 if not exists(select 1 from jsonb_array_elements(public.eo_units()->'items') v where v->>'id'=u::text) then raise exception 'FAIL unidade não listada';end if;
 config:=public.eo_notification_sound('eo-bell.wav');
 if config->>'sound'<>'eo-bell.wav' then raise exception 'FAIL som não persistiu';end if;
 begin perform public.eo_notification_sound('arbitrary-file.wav');exception when raise_exception then rejected:=true;end;
 if not rejected then raise exception 'FAIL som fora do catálogo';end if;
 -- O trigger adiado impede arquivar uma unidade ocupada sem reatribuição.
 rejected:=false;
 begin
  perform public.eo_admin_save_unit(u,'EC-test-archive-'||left(gen_random_uuid()::text,8),'Escritório de teste','ec',false);
  set constraints all immediate;
 exception when raise_exception then rejected:=true;
 end;
 if not rejected then raise exception 'FAIL unidade ocupada foi arquivada';end if;
end;$$;
reset role;
select set_config('request.jwt.claim.sub',(select id::text from u_fixtures where kind='manager'),true);
set local role authenticated;
do $$ declare rejected boolean:=false;begin
 begin perform public.eo_notification_sound('eo-soft.wav');exception when insufficient_privilege then rejected:=true;end;
 if not rejected then raise exception 'FAIL gerente alterou som global';end if;
 perform public.eo_profile_preferences(null,null,(select id from u_fixtures where kind='store'),
  (select jsonb_agg(jsonb_build_object('day',d,'closed',false,'opens','09:00','closes','18:00')) from generate_series(0,6) d));
 if public.eo_assortment_timing((select id from u_fixtures where kind='store'))->>'timezone'<>'America/Sao_Paulo' then raise exception 'FAIL fuso de contagem';end if;
end;$$;
reset role;
do $$ declare t jsonb;begin
 t:=eo_private.assortment_timing((select id from u_fixtures where kind='store'),'2026-11-09 10:00:00+00');
 if not (t->>'before_opening_morning')::boolean then raise exception 'FAIL manhã antes da abertura';end if;
 t:=eo_private.assortment_timing((select id from u_fixtures where kind='store'),'2026-11-09 16:00:00+00');
 if (t->>'before_opening_morning')::boolean or t->>'warning' is null then raise exception 'FAIL alerta durante vendas';end if;
 if exists(select 1 from public.eo_profiles where active and deleted_at is null and primary_unit_id is null) then raise exception 'FAIL pessoa ativa sem unidade';end if;
end;$$;
select set_config('request.jwt.claim.sub',(select id::text from u_fixtures where kind='outsider'),true);
set local role authenticated;
do $$ declare rejected boolean:=false;begin
 begin perform public.eo_assortment_timing((select id from u_fixtures where kind='store'));exception when insufficient_privilege then rejected:=true;end;
 if not rejected then raise exception 'FAIL horário de unidade fora do escopo';end if;
end;$$;
reset role;
select 'PASSOU: unidades explícitas, arquivamento protegido, sons e horários auditáveis' as resultado;
rollback;

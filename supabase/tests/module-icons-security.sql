begin;

do $$ declare admin_id uuid;worker_id uuid;rejected boolean:=false;data jsonb;begin
 select id into admin_id from public.perfis where active and role='admin' order by id limit 1;
 select id into worker_id from public.perfis where active and role<>'admin' order by id limit 1;
 if admin_id is null or worker_id is null then raise exception 'Sem perfis para teste reversível';end if;
 perform set_config('request.jwt.claim.sub',admin_id::text,true);execute 'set local role authenticated';
 data:=public.eo_admin_set_module_icon('diary','shippingbox.fill');
 if data->>'diary'<>'shippingbox.fill' then raise exception 'FAIL persistência ícone';end if;
 begin perform public.eo_admin_set_module_icon('diary','nome-livre');exception when raise_exception then rejected:=true;end;
 if not rejected then raise exception 'FAIL ícone arbitrário';end if;
 execute 'reset role';perform set_config('request.jwt.claim.sub',worker_id::text,true);execute 'set local role authenticated';
 if public.eo_module_allowed('diary') and public.eo_module_icons()->>'diary'<>'shippingbox.fill' then raise exception 'FAIL ícone não refletiu usuário';end if;
 rejected:=false;begin perform public.eo_admin_set_module_icon('diary','calendar');exception when insufficient_privilege then rejected:=true;end;
 if not rejected then raise exception 'FAIL usuário alterou ícone global';end if;
 if has_table_privilege('authenticated','public.eo_module_icon_settings','UPDATE') then raise exception 'FAIL grants tabela';end if;
 execute 'reset role';
end;$$;
select 'PASSOU: admin altera, usuário lê, nomes inválidos negados, grants privados' resultado;

rollback;
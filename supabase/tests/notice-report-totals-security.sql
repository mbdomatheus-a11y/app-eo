begin;
do $$ declare a uuid:=gen_random_uuid();s1 uuid:=gen_random_uuid();s2 uuid:=gen_random_uuid();n uuid;data jsonb;begin
 insert into auth.users(id,email) values(a,a||'@example.invalid');
 insert into public.eo_profiles(id,display_name,role) values(a,'Teste relatório','admin');
 insert into public.eo_stores(id,code,name,region) values(s1,'rt-'||left(s1::text,10),'Loja A','Mesma regional'),(s2,'rt-'||left(s2::text,10),'Loja B','Mesma regional');
 perform set_config('request.jwt.claim.sub',a::text,true);
 execute 'set local role authenticated';
 n:=public.eo_publish_notice('Teste relatório agregado','Sem disparo externo',array[s1,s2],false,gen_random_uuid());
 data:=public.eo_admin_notice_report(n,1,'regional');
 if (data->>'total_stores')::int<>2 or jsonb_array_length(data->'groups')<>1 then raise exception 'FAIL total conta grupos em vez de lojas';end if;
 if (data->>'stores_with_read')::int<>0 then raise exception 'FAIL ciência inventada';end if;
 data:=public.eo_admin_notice_report(n,1,'loja');
 if (data->>'total_stores')::int<>2 or jsonb_array_length(data->'groups')<>2 then raise exception 'FAIL agrupamento por loja';end if;
 execute 'reset role';
end;$$;
select 'PASSOU: relatório executa e totaliza lojas em grupos distintos' resultado;
rollback;

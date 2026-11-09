begin;
alter table public.eo_assortment_scans add column timing_snapshot jsonb not null default '{}';
create function eo_private.assortment_timing(p_store uuid,p_at timestamptz) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare schedule jsonb;day_config jsonb;previous_config jsonb;zone text;local_at timestamp;warning text;d integer;
begin
 select h.hours into schedule from public.eo_store_hours h where h.store_id=p_store;
 select case upper(coalesce(d.attributes->>'UF','')) when 'AC' then 'America/Rio_Branco' when 'AM' then 'America/Manaus' when 'RO' then 'America/Porto_Velho' when 'RR' then 'America/Boa_Vista' when 'MT' then 'America/Cuiaba' when 'MS' then 'America/Campo_Grande' else 'America/Sao_Paulo' end into zone from public.eo_stores s left join public.eo_store_details d on d.store_id=s.id where s.id=p_store;
 zone:=coalesce(zone,'America/Sao_Paulo');local_at:=p_at at time zone zone;d:=extract(dow from local_at)::integer;
 select value into day_config from jsonb_array_elements(coalesce(schedule,'[]')) where (value->>'day')::integer=d;
 select value into previous_config from jsonb_array_elements(coalesce(schedule,'[]')) where (value->>'day')::integer=(d+6)%7;
 if day_config is null then warning:='Horário da unidade não cadastrado. Conte de manhã, antes da abertura; vendas durante a contagem podem causar divergências.';
 elsif (day_config->>'closed')::boolean then warning:='Dia marcado como fechado. Confirme o funcionamento da unidade antes da contagem.';
 elsif local_at::time>=time '12:00' then warning:='Contagem fora da manhã: pode haver divergências devido a vendas. Prefira contar antes da abertura.';
 elsif local_at::time>=(day_config->>'opens')::time then warning:='A loja pode estar em atendimento. Vendas durante a contagem podem causar divergências.';
 elsif previous_config is not null and not (previous_config->>'closed')::boolean and (previous_config->>'closes')::time<(previous_config->>'opens')::time and local_at::time<(previous_config->>'closes')::time then warning:='O expediente anterior ainda pode estar em andamento. Vendas podem causar divergências.';
 end if;
 return jsonb_build_object('at',p_at,'timezone',zone,'local_time',local_at,'opens',day_config->>'opens','closes',day_config->>'closes','warning',warning,'before_opening_morning',warning is null);
end;$$;
create function public.eo_assortment_timing(p_store uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 perform public.eo_require_module('assortment');
 if not eo_private.has_store(p_store) then raise exception 'Unidade fora do seu acesso' using errcode='42501';end if;
 return eo_private.assortment_timing(p_store,now());
end;$$;
create function eo_private.stamp_assortment_time() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if TG_OP='INSERT' then new.timing_snapshot:=jsonb_build_object('started',eo_private.assortment_timing(new.store_id,now()));
 elsif new.status='completed' then new.timing_snapshot:=old.timing_snapshot||jsonb_build_object('saved',eo_private.assortment_timing(new.store_id,now()));end if;
 return new;
end;$$;
create trigger eo_scan_timing before insert or update of sizes,status on public.eo_assortment_scans for each row execute function eo_private.stamp_assortment_time();
create or replace function public.eo_assortment_export(p_session uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 perform public.eo_require_module('assortment');
 if eo_private.role_of_actor() is distinct from 'admin' then raise exception 'Exportação exclusiva da administração' using errcode='42501';end if;
 if not exists(select 1 from public.eo_assortment_sessions where id=p_session and eo_private.has_store(store_id)) then raise exception 'Sessão não autorizada' using errcode='42501';end if;
 return (select coalesce(jsonb_agg(jsonb_build_object('session_id',r.session_id,'store_code',s.code,'barcode',r.barcode,'size',e.key,'quantity',e.value,'status',r.status,
 'scan_id',r.id,'scanned_at',r.created_at,'saved_at',r.updated_at,'session_submitted_at',se.submitted_at,
 'timezone',r.timing_snapshot->'started'->>'timezone','started_warning',r.timing_snapshot->'started'->>'warning','saved_warning',r.timing_snapshot->'saved'->>'warning') order by r.created_at,r.id,e.key),'[]')
 from public.eo_assortment_scans r join public.eo_stores s on s.id=r.store_id join public.eo_assortment_sessions se on se.id=r.session_id cross join lateral jsonb_each(r.sizes) e where r.session_id=p_session);
end;$$;
revoke all on function public.eo_assortment_timing(uuid) from public,anon;
grant execute on function public.eo_assortment_timing(uuid) to authenticated;
insert into eo_private.schema_migrations(version) values('202611090011_assortment_timing') on conflict do nothing;
commit;

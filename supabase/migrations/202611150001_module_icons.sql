begin;
create table public.eo_module_icon_settings (
 module_id text primary key references public.modulos_acesso(module_id),
 icon_key text not null,
 updated_by uuid references public.perfis(id),
 updated_at timestamptz not null default now(),
 constraint eo_module_icon_key_valid check(icon_key=any(array['chart.bar.fill','calendar','chart.line.uptrend.xyaxis','shippingbox.fill','barcode.viewfinder','mic.fill','face.smiling','person.2.fill','doc.text.fill','checklist','chart.bar.doc.horizontal','bell.fill','building.2.fill','checkmark.shield.fill','archivebox.fill','square.grid.2x2.fill']))
);
alter table public.eo_module_icon_settings enable row level security;
revoke all on public.eo_module_icon_settings from public,anon,authenticated;
create function public.eo_module_icons() returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if eo_private.role_of_actor() is null then raise exception 'Entre novamente' using errcode='42501';end if;
 return (select coalesce(jsonb_object_agg(module_id,icon_key),'{}'::jsonb) from public.eo_module_icon_settings where public.eo_module_allowed(module_id));
end;$$;
create function public.eo_admin_set_module_icon(p_module text,p_icon text default null) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 if eo_private.role_of_actor() is distinct from 'admin' then raise exception 'Somente administradores' using errcode='42501';end if;
 if p_module is null or not exists(select 1 from public.modulos_acesso where module_id=p_module) then raise exception 'Módulo inválido';end if;
 if p_icon is not null and not (p_icon=any(array['chart.bar.fill','calendar','chart.line.uptrend.xyaxis','shippingbox.fill','barcode.viewfinder','mic.fill','face.smiling','person.2.fill','doc.text.fill','checklist','chart.bar.doc.horizontal','bell.fill','building.2.fill','checkmark.shield.fill','archivebox.fill','square.grid.2x2.fill'])) then raise exception 'Ícone inválido';end if;
 if p_icon is null then delete from public.eo_module_icon_settings where module_id=p_module;
 else insert into public.eo_module_icon_settings(module_id,icon_key,updated_by) values(p_module,p_icon,auth.uid())
 on conflict(module_id) do update set icon_key=excluded.icon_key,updated_by=excluded.updated_by,updated_at=now() where public.eo_module_icon_settings.icon_key is distinct from excluded.icon_key;
 end if;
 insert into public.auditoria(actor,action,entity_id,detail,modulo) values(auth.uid(),'module.icon.changed',p_module,jsonb_build_object('icon',p_icon),'eo');
 return public.eo_module_icons();
end;$$;
revoke all on function public.eo_module_icons() from public,anon;
revoke all on function public.eo_admin_set_module_icon(text,text) from public,anon;
grant execute on function public.eo_module_icons(),public.eo_admin_set_module_icon(text,text) to authenticated;
create or replace function public.eo_app_inicio() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_status jsonb;
begin
 v_status:=public.eo_password_status();
 if v_status is null then raise exception 'Acesso não autorizado' using errcode='42501';end if;
 if coalesce((v_status->>'must_change_password')::boolean,false) then return jsonb_build_object('status',v_status);end if;
 return jsonb_build_object('status',v_status,'context',public.eo_context(),'modules',public.eo_my_modules(),'icons',public.eo_module_icons(),
 'feed',case when eo_private.role_of_actor()='admin' or public.eo_module_allowed('notices') then coalesce(public.eo_feed(),'[]'::jsonb) else '[]'::jsonb end);
end;$$;
insert into eo_private.schema_migrations(version) values('202611150001_module_icons') on conflict do nothing;
notify pgrst, 'reload schema';
commit;

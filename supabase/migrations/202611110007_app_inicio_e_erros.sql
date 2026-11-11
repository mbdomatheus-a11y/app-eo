-- 202611110007_app_inicio_e_erros
-- 1. eo_app_inicio: abertura do app em UMA chamada (status de senha, contexto, módulos e avisos),
--    no lugar de 3 a 4 idas ao servidor em sequência. As RPCs antigas continuam iguais.
-- 2. app_erros (COMUM): erros de tela dos apps, para diagnosticar travamentos sem depender do aparelho.
begin;

create or replace function public.eo_app_inicio()
returns jsonb language plpgsql stable security definer set search_path to '' as $$
declare v_status jsonb;
begin
  v_status := public.eo_password_status();
  if v_status is null then raise exception 'Acesso não autorizado' using errcode = '42501'; end if;
  if coalesce((v_status->>'must_change_password')::boolean, false) then
    return jsonb_build_object('status', v_status);
  end if;
  return jsonb_build_object(
    'status', v_status,
    'context', public.eo_context(),
    'modules', public.eo_my_modules(),
    'feed', case when eo_private.role_of_actor() = 'admin' or public.eo_module_allowed('notices')
                 then coalesce(public.eo_feed(), '[]'::jsonb) else '[]'::jsonb end);
end $$;
revoke all on function public.eo_app_inicio() from public, anon;
grant execute on function public.eo_app_inicio() to authenticated;

create table if not exists public.app_erros (
  id bigint generated always as identity primary key,
  criado_em timestamptz not null default now(),
  perfil_id uuid,
  app text not null default 'eo',
  plataforma text,
  versao text,
  mensagem text not null,
  pilha text,
  fatal boolean not null default false,
  contexto jsonb not null default '{}'::jsonb
);
create index if not exists app_erros_criado_idx on public.app_erros (criado_em desc);
alter table public.app_erros enable row level security;
revoke all on public.app_erros from public, anon, authenticated;
grant select, insert on public.app_erros to service_role;
comment on table public.app_erros is 'COMUM. Erros de tela enviados pelos apps (EO e derivados). Sem dados pessoais além do perfil.';

-- Aceita envio antes do login (o travamento pode ser na abertura). Limites contra abuso.
create or replace function public.app_registrar_erro(p_app text, p_plataforma text, p_versao text, p_mensagem text, p_pilha text, p_fatal boolean, p_contexto jsonb default '{}'::jsonb)
returns void language plpgsql security definer set search_path to '' as $$
begin
  if (select count(*) from public.app_erros where criado_em > now() - interval '1 hour') >= 2000 then return; end if;
  if auth.uid() is not null and (select count(*) from public.app_erros where perfil_id = auth.uid() and criado_em > now() - interval '1 hour') >= 30 then return; end if;
  insert into public.app_erros (perfil_id, app, plataforma, versao, mensagem, pilha, fatal, contexto)
  values (auth.uid(), left(coalesce(p_app, 'eo'), 20), left(p_plataforma, 20), left(p_versao, 80), left(coalesce(p_mensagem, 'sem mensagem'), 1000),
          left(p_pilha, 4000), coalesce(p_fatal, false),
          case when pg_column_size(coalesce(p_contexto, '{}'::jsonb)) < 4096 then coalesce(p_contexto, '{}'::jsonb) else '{}'::jsonb end);
end $$;
revoke all on function public.app_registrar_erro(text,text,text,text,text,boolean,jsonb) from public;
grant execute on function public.app_registrar_erro(text,text,text,text,text,boolean,jsonb) to anon, authenticated;

insert into eo_private.schema_migrations(version) values ('202611110007_app_inicio_e_erros') on conflict do nothing;
commit;

-- 202611110006_escala_html_portal
-- O admin publica o HTML da Escala no portal (sem a base de colaboradores embutida, que vai para
-- public.colaboradores). Cada loja abre a versão ativa dentro do portal e grava em escala_semanas.
begin;

create table if not exists public.escala_html_versoes (
  id bigint generated always as identity primary key,
  titulo text not null check (length(titulo) between 2 and 120),
  conteudo text not null check (octet_length(conteudo) < 3000000),
  bytes int generated always as (octet_length(conteudo)) stored,
  ativa boolean not null default true,
  publicado_por uuid references public.perfis(id),
  publicado_em timestamptz not null default now()
);
create unique index if not exists escala_html_uma_ativa_idx on public.escala_html_versoes (ativa) where ativa;
alter table public.escala_html_versoes enable row level security;
revoke all on public.escala_html_versoes from public, anon, authenticated;
grant select, insert, update on public.escala_html_versoes to service_role;
comment on table public.escala_html_versoes is 'ESCALA. Versões do HTML da escala publicadas pelo admin; só uma ativa. Não guardar base de colaboradores aqui.';

create or replace function public.escala_publicar_html(p_titulo text, p_conteudo text)
returns bigint language plpgsql security definer set search_path to '' as $$
declare v_id bigint;
begin
  if eo_private.role_of_actor() is distinct from 'admin' then raise exception 'Acesso administrativo necessário' using errcode = '42501'; end if;
  if p_conteudo ~ 'var STORE_DATA = \{"' then raise exception 'Retire a base de colaboradores do HTML antes de publicar'; end if;
  update public.escala_html_versoes set ativa = false where ativa;
  insert into public.escala_html_versoes (titulo, conteudo, publicado_por) values (p_titulo, p_conteudo, (select auth.uid()))
  returning id into v_id;
  perform eo_private.escala_auditar('escala.html.publicar', v_id::text, jsonb_build_object('titulo', p_titulo, 'bytes', octet_length(p_conteudo)));
  return v_id;
end $$;

create or replace function public.escala_html_ativo()
returns jsonb language plpgsql stable security definer set search_path to '' as $$
begin
  perform public.eo_require_module('escala');
  return (select jsonb_build_object('id', v.id, 'titulo', v.titulo, 'publicado_em', v.publicado_em, 'conteudo', v.conteudo)
            from public.escala_html_versoes v where v.ativa);
end $$;

create or replace function public.escala_html_versoes_lista()
returns jsonb language plpgsql stable security definer set search_path to '' as $$
begin
  if eo_private.role_of_actor() is distinct from 'admin' then raise exception 'Acesso administrativo necessário' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', id, 'titulo', titulo, 'bytes', bytes, 'ativa', ativa, 'publicado_em', publicado_em) order by id desc)
                     from (select * from public.escala_html_versoes order by id desc limit 20) q), '[]'::jsonb);
end $$;

revoke all on function public.escala_publicar_html(text,text), public.escala_html_ativo(), public.escala_html_versoes_lista() from public, anon;
grant execute on function public.escala_publicar_html(text,text), public.escala_html_ativo(), public.escala_html_versoes_lista() to authenticated;

insert into eo_private.schema_migrations(version) values ('202611110006_escala_html_portal') on conflict do nothing;
commit;

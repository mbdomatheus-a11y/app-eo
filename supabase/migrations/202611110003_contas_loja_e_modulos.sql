-- 202611110003_contas_loja_e_modulos
-- 1. Contas genéricas por loja (gerNNN). Senha real no Auth é derivada no servidor (Edge Function acesso-loja,
--    HMAC com segredo ACESSO_LOJA_PEPPER). Assim o login só funciona pela função, que conta erros e bloqueia após 3.
-- 2. Pedido de redefinição de senha aprovado pelo admin.
-- 3. Visibilidade de módulos: todos, somente admin, ou selecionados (pessoa, perfil, loja, GGL, regional).
-- Somente aditiva. Contas nominais por chapa não mudam.

begin;

-- COMUM: contas de loja
create table if not exists public.acesso_contas_loja (
  perfil_id uuid primary key references public.perfis(id),
  usuario text not null unique check (usuario ~ '^ger[0-9]{3,4}$'),
  loja_id uuid not null unique references public.lojas(id),
  falhas int not null default 0 check (falhas >= 0),
  bloqueada boolean not null default false,
  bloqueada_em timestamptz,
  senha_padrao boolean not null default true,
  ultimo_acesso timestamptz,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
alter table public.acesso_contas_loja enable row level security;
revoke all on public.acesso_contas_loja from public, anon, authenticated;
comment on table public.acesso_contas_loja is 'COMUM. Contas genéricas gerNNN por loja. Escrita só pela Edge Function acesso-loja (service_role). Não apagar.';

create table if not exists public.acesso_reset_solicitacoes (
  id bigint generated always as identity primary key,
  perfil_id uuid not null references public.perfis(id),
  usuario text not null,
  status text not null default 'pendente' check (status in ('pendente','aprovada','recusada')),
  origem text,
  solicitado_em timestamptz not null default now(),
  resolvido_por uuid references public.perfis(id),
  resolvido_em timestamptz
);
create unique index if not exists acesso_reset_um_pendente_idx on public.acesso_reset_solicitacoes (perfil_id) where status = 'pendente';
create index if not exists acesso_reset_status_idx on public.acesso_reset_solicitacoes (status, solicitado_em desc);
alter table public.acesso_reset_solicitacoes enable row level security;
revoke all on public.acesso_reset_solicitacoes from public, anon, authenticated;
comment on table public.acesso_reset_solicitacoes is 'COMUM. Pedidos de esqueci a senha das contas de loja, aprovados no admin web.';

-- Tentativa de login (somente service_role): conta erro e bloqueia no terceiro
create or replace function public.acesso_loja_registrar_tentativa(p_usuario text, p_ok boolean, p_origem text default null)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare r public.acesso_contas_loja;
begin
  if p_ok then
    update public.acesso_contas_loja set falhas = 0, ultimo_acesso = now(), atualizado_em = now()
     where usuario = p_usuario and not bloqueada returning * into r;
  else
    update public.acesso_contas_loja set falhas = falhas + 1,
           bloqueada = (falhas + 1 >= 3), bloqueada_em = case when falhas + 1 >= 3 then now() else bloqueada_em end,
           atualizado_em = now()
     where usuario = p_usuario and not bloqueada returning * into r;
    if r.bloqueada then
      insert into public.auditoria(actor, action, entity_id, detail, modulo)
      values (r.perfil_id, 'acesso.loja.bloqueada', r.perfil_id::text, jsonb_build_object('usuario', p_usuario, 'origem', p_origem), 'acesso');
    end if;
  end if;
  return jsonb_build_object('falhas', r.falhas, 'bloqueada', r.bloqueada);
end $$;

-- Cria perfil, vínculo de loja e conta numa transação (somente service_role, depois do usuário Auth criado)
create or replace function public.acesso_loja_vincular(p_perfil uuid, p_usuario text, p_loja uuid, p_nome text)
returns void language plpgsql security definer set search_path to '' as $$
begin
  insert into public.perfis (id, display_name, role, unit_type, active, must_change_password)
  values (p_perfil, left(p_nome, 120), 'gerente', 'loja', false, true);
  insert into public.lojas_membros (user_id, store_id) values (p_perfil, p_loja) on conflict do nothing;
  update public.perfis set active = true where id = p_perfil;
  insert into public.acesso_contas_loja (perfil_id, usuario, loja_id) values (p_perfil, p_usuario, p_loja);
  insert into public.auditoria(actor, action, entity_id, detail, modulo)
  values (null, 'acesso.loja.criada', p_perfil::text, jsonb_build_object('usuario', p_usuario, 'loja', p_loja), 'acesso');
end $$;

-- Volta ao padrão (somente service_role, chamado depois de gravar a senha no Auth)
create or replace function public.acesso_loja_marcar_padrao(p_perfil uuid, p_admin uuid, p_solicitacao bigint default null)
returns void language plpgsql security definer set search_path to '' as $$
begin
  update public.acesso_contas_loja set falhas = 0, bloqueada = false, bloqueada_em = null, senha_padrao = true, atualizado_em = now()
   where perfil_id = p_perfil;
  update public.perfis set must_change_password = true where id = p_perfil;
  update public.acesso_reset_solicitacoes set status = 'aprovada', resolvido_por = p_admin, resolvido_em = now()
   where perfil_id = p_perfil and status = 'pendente';
  insert into public.auditoria(actor, action, entity_id, detail, modulo)
  values (p_admin, 'acesso.loja.senha_padrao', p_perfil::text, jsonb_build_object('solicitacao', p_solicitacao), 'acesso');
end $$;

create or replace function public.acesso_loja_marcar_trocada(p_perfil uuid)
returns void language plpgsql security definer set search_path to '' as $$
begin
  update public.acesso_contas_loja set senha_padrao = false, falhas = 0, atualizado_em = now() where perfil_id = p_perfil;
  update public.perfis set must_change_password = false where id = p_perfil;
  insert into public.auditoria(actor, action, entity_id, detail, modulo)
  values (p_perfil, 'acesso.loja.senha_trocada', p_perfil::text, '{}'::jsonb, 'acesso');
end $$;

create or replace function public.acesso_loja_solicitar_reset(p_usuario text, p_origem text)
returns void language plpgsql security definer set search_path to '' as $$
declare v uuid;
begin
  select perfil_id into v from public.acesso_contas_loja where usuario = p_usuario;
  if v is null then return; end if;
  insert into public.acesso_reset_solicitacoes (perfil_id, usuario, origem) values (v, p_usuario, left(p_origem, 40))
  on conflict do nothing;
end $$;

do $$
declare f text;
begin
  foreach f in array array['public.acesso_loja_registrar_tentativa(text,boolean,text)', 'public.acesso_loja_vincular(uuid,text,uuid,text)',
    'public.acesso_loja_marcar_padrao(uuid,uuid,bigint)', 'public.acesso_loja_marcar_trocada(uuid)', 'public.acesso_loja_solicitar_reset(text,text)'] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;

-- Admin web: listagem de contas de loja e pedidos
create or replace function public.acesso_admin_contas_loja(p_busca text default null, p_filtro text default 'todas', p_limite int default 50, p_offset int default 0)
returns jsonb language plpgsql stable security definer set search_path to '' as $$
begin
  if eo_private.role_of_actor() is distinct from 'admin' then raise exception 'Acesso administrativo necessário' using errcode = '42501'; end if;
  return jsonb_build_object(
    'resumo', (select jsonb_build_object('total', count(*), 'bloqueadas', count(*) filter (where bloqueada),
                 'senha_padrao', count(*) filter (where senha_padrao), 'pedidos', (select count(*) from public.acesso_reset_solicitacoes where status = 'pendente'),
                 'lojas_sem_conta', (select count(*) from public.lojas l where l.active and l.code ~ '^[0-9]{1,4}$' and not exists (select 1 from public.acesso_contas_loja c where c.loja_id = l.id)))
               from public.acesso_contas_loja),
    'itens', coalesce((select jsonb_agg(x) from (
      select jsonb_build_object('perfil_id', c.perfil_id, 'usuario', c.usuario, 'email', c.usuario || '@pernambucanas.com.br',
               'loja', l.code, 'loja_nome', l.name, 'bloqueada', c.bloqueada, 'falhas', c.falhas, 'senha_padrao', c.senha_padrao,
               'ultimo_acesso', c.ultimo_acesso,
               'pedido', (select jsonb_build_object('id', s.id, 'em', s.solicitado_em, 'origem', s.origem) from public.acesso_reset_solicitacoes s where s.perfil_id = c.perfil_id and s.status = 'pendente')) x
        from public.acesso_contas_loja c join public.lojas l on l.id = c.loja_id
       where (p_busca is null or c.usuario ilike '%'||p_busca||'%' or l.name ilike '%'||p_busca||'%' or l.code = ltrim(p_busca, '0'))
         and (coalesce(p_filtro,'todas') = 'todas'
              or (p_filtro = 'bloqueadas' and c.bloqueada)
              or (p_filtro = 'pedidos' and exists (select 1 from public.acesso_reset_solicitacoes s where s.perfil_id = c.perfil_id and s.status = 'pendente'))
              or (p_filtro = 'senha_padrao' and c.senha_padrao))
       order by length(l.code), l.code
       limit least(greatest(coalesce(p_limite,50),1),100) offset greatest(coalesce(p_offset,0),0)) q), '[]'::jsonb));
end $$;

create or replace function public.acesso_admin_recusar_reset(p_solicitacao bigint)
returns void language plpgsql security definer set search_path to '' as $$
begin
  if eo_private.role_of_actor() is distinct from 'admin' then raise exception 'Acesso administrativo necessário' using errcode = '42501'; end if;
  update public.acesso_reset_solicitacoes set status = 'recusada', resolvido_por = (select auth.uid()), resolvido_em = now()
   where id = p_solicitacao and status = 'pendente';
  insert into public.auditoria(actor, action, entity_id, detail, modulo)
  values ((select auth.uid()), 'acesso.loja.reset_recusado', p_solicitacao::text, '{}'::jsonb, 'acesso');
end $$;

revoke all on function public.acesso_admin_contas_loja(text,text,int,int), public.acesso_admin_recusar_reset(bigint) from public, anon;
grant execute on function public.acesso_admin_contas_loja(text,text,int,int), public.acesso_admin_recusar_reset(bigint) to authenticated;

-- Status de senha informa se é conta de loja (chave nova, compatível com os apps publicados)
create or replace function public.eo_password_status()
returns jsonb language sql stable security definer set search_path to '' as $$
  select jsonb_build_object(
    'must_change_password', p.must_change_password,
    'has_chapa_login', p.login_chapa is not null,
    'conta_loja', exists (select 1 from public.acesso_contas_loja c where c.perfil_id = p.id),
    'usuario_loja', (select c.usuario from public.acesso_contas_loja c where c.perfil_id = p.id))
  from public.perfis p where p.id = (select auth.uid()) and p.active;
$$;

-- VISIBILIDADE DE MÓDULOS
alter table public.modulos_acesso drop constraint if exists eo_module_access_audience_check;
alter table public.modulos_acesso add constraint modulos_acesso_audience_check check (audience in ('all','admin','selected'));

create table if not exists public.modulos_alvos (
  module_id text not null references public.modulos_acesso(module_id) on delete cascade,
  tipo text not null check (tipo in ('perfil','loja','ggl','regional')),
  valor text not null check (length(valor) between 1 and 80),
  primary key (module_id, tipo, valor)
);
alter table public.modulos_alvos enable row level security;
revoke all on public.modulos_alvos from public, anon, authenticated;
comment on table public.modulos_alvos is 'COMUM. Público selecionado de cada módulo além das pessoas (modulos_pessoas).';

create or replace function public.eo_module_allowed(p_module text)
returns boolean language sql stable security definer set search_path to '' as $$
  select eo_private.role_of_actor() is not null and (
    eo_private.role_of_actor() = 'admin'
    or coalesce((select case m.audience
        when 'all' then true
        when 'admin' then false
        else exists (select 1 from public.modulos_pessoas p where p.module_id = m.module_id and p.person_id = (select auth.uid()))
          or exists (select 1 from public.modulos_alvos a where a.module_id = m.module_id and a.tipo = 'perfil' and a.valor = eo_private.role_of_actor())
          or exists (select 1 from public.modulos_alvos a join public.lojas l
                       on (a.tipo = 'loja' and ltrim(l.code,'0') = ltrim(a.valor,'0'))
                       or (a.tipo = 'ggl' and l.ggl = a.valor)
                       or (a.tipo = 'regional' and upper(l.region) = upper(a.valor))
                      where a.module_id = m.module_id and l.active and eo_private.has_store(l.id))
        end from public.modulos_acesso m where m.module_id = p_module), true));
$$;

create or replace function public.eo_admin_set_module_access(p_module text, p_audience text, p_people uuid[] default '{}'::uuid[])
returns void language plpgsql security definer set search_path to '' as $$
begin
  perform public.eo_admin_set_module_targets(p_module, p_audience, p_people, '{}', '{}', '{}', '{}');
end $$;

create or replace function public.eo_admin_set_module_targets(p_module text, p_audience text, p_people uuid[], p_perfis text[], p_lojas text[], p_ggls text[], p_regionais text[])
returns void language plpgsql security definer set search_path to '' as $$
begin
  if eo_private.role_of_actor() is distinct from 'admin' then raise exception 'Acesso administrativo necessário' using errcode = '42501'; end if;
  if p_audience not in ('all','admin','selected') or p_audience is null or p_module is null then raise exception 'Configuração inválida'; end if;
  perform 1 from public.modulos_acesso where module_id = p_module for update;
  if not found then raise exception 'Módulo não encontrado'; end if;
  if exists (select 1 from unnest(coalesce(p_people,'{}')) x where not exists (select 1 from public.perfis where id = x and active)) then raise exception 'Selecione pessoas ativas'; end if;
  if exists (select 1 from unnest(coalesce(p_perfis,'{}')) x where x not in ('colaborador','gerente','diretor')) then raise exception 'Perfil inválido'; end if;
  if coalesce(cardinality(p_people),0) + coalesce(cardinality(p_perfis),0) + coalesce(cardinality(p_lojas),0) + coalesce(cardinality(p_ggls),0) + coalesce(cardinality(p_regionais),0) > 2000 then raise exception 'Seleção grande demais'; end if;
  update public.modulos_acesso set audience = p_audience, updated_at = now(), updated_by = (select auth.uid()) where module_id = p_module;
  delete from public.modulos_pessoas where module_id = p_module;
  delete from public.modulos_alvos where module_id = p_module;
  if p_audience = 'selected' then
    insert into public.modulos_pessoas select p_module, x from (select distinct unnest(coalesce(p_people,'{}')) x) q;
    insert into public.modulos_alvos select p_module, 'perfil', x from (select distinct unnest(coalesce(p_perfis,'{}')) x) q;
    insert into public.modulos_alvos select p_module, 'loja', ltrim(trim(x),'0') from (select distinct unnest(coalesce(p_lojas,'{}')) x) q where trim(x) <> '';
    insert into public.modulos_alvos select p_module, 'ggl', trim(x) from (select distinct unnest(coalesce(p_ggls,'{}')) x) q where trim(x) <> '';
    insert into public.modulos_alvos select p_module, 'regional', upper(trim(x)) from (select distinct unnest(coalesce(p_regionais,'{}')) x) q where trim(x) <> '';
  end if;
  insert into public.auditoria(actor, action, entity_id, detail)
  values ((select auth.uid()), 'module.access.changed', p_module, jsonb_build_object('audience', p_audience,
    'pessoas', coalesce(cardinality(p_people),0), 'perfis', p_perfis, 'lojas', coalesce(cardinality(p_lojas),0), 'ggls', p_ggls, 'regionais', p_regionais));
end $$;

create or replace function public.eo_admin_module_access()
returns jsonb language plpgsql stable security definer set search_path to '' as $$
begin
  if eo_private.role_of_actor() is distinct from 'admin' then raise exception 'Acesso administrativo necessário' using errcode = '42501'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('id', m.module_id, 'label', m.label, 'audience', m.audience,
      'people', (select coalesce(jsonb_agg(person_id), '[]') from public.modulos_pessoas p where p.module_id = m.module_id),
      'perfis', (select coalesce(jsonb_agg(valor), '[]') from public.modulos_alvos a where a.module_id = m.module_id and a.tipo = 'perfil'),
      'lojas', (select coalesce(jsonb_agg(valor), '[]') from public.modulos_alvos a where a.module_id = m.module_id and a.tipo = 'loja'),
      'ggls', (select coalesce(jsonb_agg(valor), '[]') from public.modulos_alvos a where a.module_id = m.module_id and a.tipo = 'ggl'),
      'regionais', (select coalesce(jsonb_agg(valor), '[]') from public.modulos_alvos a where a.module_id = m.module_id and a.tipo = 'regional')
    ) order by m.label), '[]') from public.modulos_acesso m);
end $$;

revoke all on function public.eo_admin_set_module_targets(text,text,uuid[],text[],text[],text[],text[]) from public, anon;
grant execute on function public.eo_admin_set_module_targets(text,text,uuid[],text[],text[],text[],text[]) to authenticated;

insert into eo_private.schema_migrations(version) values ('202611110003_contas_loja_e_modulos') on conflict do nothing;

commit;

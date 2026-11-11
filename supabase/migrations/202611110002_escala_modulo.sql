-- 202611110002_escala_modulo
-- Módulo Escala de Colaboradores (5x2 e 6x1) dentro do banco SUP_EO1.
-- Depende de 202611110001_padronizacao_tabelas_comuns (nomes comuns sem prefixo).
-- Padrão de acesso igual ao EO: tabelas com RLS e sem grants para anon/authenticated;
-- tudo passa por RPCs security definer com search_path vazio, que validam perfil, módulo e loja.
-- Concorrência: cada loja e semana é UMA linha (documento jsonb) com versão otimista.
-- Dois gerentes salvando a mesma semana não se sobrescrevem: o segundo recebe conflito 40001.

begin;

-- 0. Auditoria comum passa a identificar o módulo de origem
alter table public.auditoria add column if not exists modulo text not null default 'eo';
create index if not exists auditoria_modulo_criado_idx on public.auditoria (modulo, created_at desc);

-- 1. COMUM: base de colaboradores de todas as lojas (substitui a lista embutida no HTML)
create table if not exists public.colaboradores (
  id uuid primary key default gen_random_uuid(),
  chapa text not null unique check (chapa ~ '^[0-9]{1,20}$'),
  nome text not null check (length(nome) between 2 and 160),
  cargo text,
  departamento text,
  jornada_diaria_min int check (jornada_diaria_min between 0 and 720),
  situacao text,
  loja_id uuid references public.lojas(id),
  ativo boolean not null default true,
  lote_importacao uuid,
  atualizado_em timestamptz not null default now()
);
create index if not exists colaboradores_loja_ativos_idx on public.colaboradores (loja_id) where ativo;
alter table public.colaboradores enable row level security;
revoke all on public.colaboradores from public, anon, authenticated;
comment on table public.colaboradores is 'COMUM (todos os projetos). Base de colaboradores por loja. Carga só por colaboradores_importar (admin). Não apagar linhas: desativar (ativo=false).';

-- 2. ESCALA: configuração por loja
create table if not exists public.escala_lojas_config (
  loja_id uuid primary key references public.lojas(id),
  modelo text not null default '6X1' check (modelo in ('5X2','6X1')),
  folga_fixa boolean not null default false,
  abre_domingo boolean not null default true,
  config jsonb not null default '{}'::jsonb check (pg_column_size(config) < 65536),
  versao int not null default 1,
  atualizado_por uuid references public.perfis(id),
  atualizado_em timestamptz not null default now()
);
alter table public.escala_lojas_config enable row level security;
revoke all on public.escala_lojas_config from public, anon, authenticated;

-- 3. ESCALA: ajustes do gerente por colaborador (sexo, vínculo, férias, afastamento, ordem)
create table if not exists public.escala_colaborador_ajustes (
  loja_id uuid not null references public.lojas(id),
  colaborador_id uuid not null references public.colaboradores(id),
  ajustes jsonb not null default '{}'::jsonb check (pg_column_size(ajustes) < 8192),
  atualizado_por uuid references public.perfis(id),
  atualizado_em timestamptz not null default now(),
  primary key (loja_id, colaborador_id)
);
alter table public.escala_colaborador_ajustes enable row level security;
revoke all on public.escala_colaborador_ajustes from public, anon, authenticated;

-- 4. ESCALA: planejamento semanal (uma linha por loja e semana)
create table if not exists public.escala_semanas (
  id uuid primary key default gen_random_uuid(),
  loja_id uuid not null references public.lojas(id),
  semana_inicio date not null check (extract(isodow from semana_inicio) = 1),
  modelo text not null check (modelo in ('5X2','6X1')),
  status text not null default 'rascunho' check (status in ('rascunho','finalizada')),
  dados jsonb not null default '{}'::jsonb check (pg_column_size(dados) < 524288),
  versao int not null default 1,
  criado_por uuid references public.perfis(id),
  atualizado_por uuid references public.perfis(id),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  finalizada_em timestamptz,
  unique (loja_id, semana_inicio)
);
create index if not exists escala_semanas_loja_semana_idx on public.escala_semanas (loja_id, semana_inicio desc);
create index if not exists escala_semanas_status_semana_idx on public.escala_semanas (semana_inicio, status);
alter table public.escala_semanas enable row level security;
revoke all on public.escala_semanas from public, anon, authenticated;

-- 5. ESCALA: histórico de versões (mantém as 30 mais recentes por semana)
create table if not exists public.escala_semanas_versoes (
  id bigint generated always as identity primary key,
  semana_id uuid not null references public.escala_semanas(id) on delete cascade,
  versao int not null,
  status text not null,
  dados jsonb not null,
  salvo_por uuid references public.perfis(id),
  salvo_em timestamptz not null default now(),
  unique (semana_id, versao)
);
alter table public.escala_semanas_versoes enable row level security;
revoke all on public.escala_semanas_versoes from public, anon, authenticated;

-- 6. ESCALA: feedback dos gerentes
create table if not exists public.escala_feedbacks (
  id bigint generated always as identity primary key,
  loja_id uuid references public.lojas(id),
  autor uuid not null references public.perfis(id),
  mensagem text not null check (length(mensagem) between 3 and 4000),
  contexto jsonb not null default '{}'::jsonb check (pg_column_size(contexto) < 16384),
  criado_em timestamptz not null default now()
);
create index if not exists escala_feedbacks_autor_idx on public.escala_feedbacks (autor, criado_em desc);
create index if not exists escala_feedbacks_loja_idx on public.escala_feedbacks (loja_id, criado_em desc);
alter table public.escala_feedbacks enable row level security;
revoke all on public.escala_feedbacks from public, anon, authenticated;

-- 7. Registro do módulo (visível a todos; admin pode restringir em Acesso a módulos)
insert into public.modulos_acesso(module_id, label, audience)
values ('escala','Escala de colaboradores','all') on conflict (module_id) do nothing;

-- 8. Auxiliares privados
create or replace function eo_private.escala_exigir_leitura(p_loja uuid)
returns void language plpgsql stable security definer set search_path to '' as $$
begin
  perform public.eo_require_module('escala');
  if p_loja is null or not eo_private.has_store(p_loja) then
    raise exception 'Loja fora da sua abrangência' using errcode = '42501';
  end if;
end $$;

create or replace function eo_private.escala_exigir_edicao(p_loja uuid)
returns void language plpgsql stable security definer set search_path to '' as $$
begin
  perform eo_private.escala_exigir_leitura(p_loja);
  if eo_private.role_of_actor() not in ('gerente','diretor','admin') then
    raise exception 'Seu perfil não pode editar escalas' using errcode = '42501';
  end if;
end $$;

create or replace function eo_private.escala_auditar(p_acao text, p_entidade text, p_detalhe jsonb)
returns void language sql security definer set search_path to '' as $$
  insert into public.auditoria(actor, action, entity_id, detail, modulo)
  values ((select auth.uid()), p_acao, p_entidade, coalesce(p_detalhe,'{}'::jsonb), 'escala');
$$;

revoke all on function eo_private.escala_exigir_leitura(uuid), eo_private.escala_exigir_edicao(uuid),
  eo_private.escala_auditar(text,text,jsonb) from public, anon, authenticated;

-- 9. RPCs públicas (somente authenticated)

-- Códigos de loja no banco não têm zeros à esquerda (ex.: 10, 100). Comparar sempre com ltrim(code,'0').
-- Lojas que a pessoa pode abrir, com busca e paginação (máximo 100)
create or replace function public.escala_lojas_disponiveis(p_busca text default null, p_limite int default 50, p_offset int default 0)
returns jsonb language plpgsql stable security definer set search_path to '' as $$
declare v_scope uuid[]; v jsonb;
begin
  perform public.eo_require_module('escala');
  v_scope := eo_private.operational_report_scope(null);
  select coalesce(jsonb_agg(x), '[]'::jsonb) into v from (
    select jsonb_build_object('id', l.id, 'codigo', l.code, 'nome', l.name, 'ggl', l.ggl, 'regional', l.region,
             'modelo', coalesce(c.modelo, '6X1')) x
      from public.lojas l left join public.escala_lojas_config c on c.loja_id = l.id
     where l.active and (v_scope is null or l.id = any(v_scope))
       and (p_busca is null or l.code ilike '%'||p_busca||'%' or l.name ilike '%'||p_busca||'%')
     order by length(l.code), l.code
     limit least(greatest(coalesce(p_limite,50),1),100) offset greatest(coalesce(p_offset,0),0)
  ) s;
  return v;
end $$;

-- Tudo que a tela precisa para abrir uma loja, em uma chamada
create or replace function public.escala_contexto(p_loja uuid)
returns jsonb language plpgsql stable security definer set search_path to '' as $$
declare v jsonb;
begin
  perform eo_private.escala_exigir_leitura(p_loja);
  select jsonb_build_object(
    'loja', (select jsonb_build_object('id', l.id, 'codigo', l.code, 'nome', l.name, 'ggl', l.ggl, 'regional', l.region) from public.lojas l where l.id = p_loja),
    'pode_editar', eo_private.role_of_actor() in ('gerente','diretor','admin'),
    'config', (select to_jsonb(c) - 'atualizado_por' from public.escala_lojas_config c where c.loja_id = p_loja),
    'horarios', (select h.hours from public.lojas_horarios h where h.store_id = p_loja),
    'colaboradores', coalesce((
      select jsonb_agg(jsonb_build_object('id', co.id, 'chapa', co.chapa, 'nome', co.nome, 'cargo', co.cargo,
               'departamento', co.departamento, 'jornada_diaria_min', co.jornada_diaria_min, 'situacao', co.situacao,
               'ajustes', coalesce(a.ajustes, '{}'::jsonb)) order by co.departamento, co.nome)
        from public.colaboradores co
        left join public.escala_colaborador_ajustes a on a.loja_id = p_loja and a.colaborador_id = co.id
       where co.loja_id = p_loja and co.ativo), '[]'::jsonb)
  ) into v;
  return v;
end $$;

create or replace function public.escala_salvar_config(p_loja uuid, p_modelo text, p_folga_fixa boolean, p_abre_domingo boolean, p_config jsonb, p_versao int)
returns int language plpgsql security definer set search_path to '' as $$
declare v_nova int;
begin
  perform eo_private.escala_exigir_edicao(p_loja);
  insert into public.escala_lojas_config as c (loja_id, modelo, folga_fixa, abre_domingo, config, versao, atualizado_por)
  values (p_loja, p_modelo, coalesce(p_folga_fixa,false), coalesce(p_abre_domingo,true), coalesce(p_config,'{}'::jsonb), 1, (select auth.uid()))
  on conflict (loja_id) do update set modelo = excluded.modelo, folga_fixa = excluded.folga_fixa, abre_domingo = excluded.abre_domingo,
     config = excluded.config, versao = c.versao + 1, atualizado_por = excluded.atualizado_por, atualizado_em = now()
   where c.versao = coalesce(p_versao, c.versao)
  returning versao into v_nova;
  if v_nova is null then raise exception 'Configuração alterada por outra pessoa. Recarregue.' using errcode = '40001'; end if;
  perform eo_private.escala_auditar('escala.config.salvar', p_loja::text, jsonb_build_object('modelo', p_modelo, 'versao', v_nova));
  return v_nova;
end $$;

-- Ajustes em lote (até 300 colaboradores por chamada)
create or replace function public.escala_salvar_ajustes(p_loja uuid, p_itens jsonb)
returns int language plpgsql security definer set search_path to '' as $$
declare v_qtd int;
begin
  perform eo_private.escala_exigir_edicao(p_loja);
  if jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) > 300 then raise exception 'Lote inválido'; end if;
  insert into public.escala_colaborador_ajustes as a (loja_id, colaborador_id, ajustes, atualizado_por)
  select p_loja, (i->>'colaborador_id')::uuid, coalesce(i->'ajustes','{}'::jsonb), (select auth.uid())
    from jsonb_array_elements(p_itens) i
    join public.colaboradores co on co.id = (i->>'colaborador_id')::uuid and co.loja_id = p_loja
   where jsonb_typeof(coalesce(i->'ajustes','{}'::jsonb)) = 'object'
  on conflict (loja_id, colaborador_id) do update set ajustes = excluded.ajustes, atualizado_por = excluded.atualizado_por, atualizado_em = now();
  get diagnostics v_qtd = row_count;
  return v_qtd;
end $$;

create or replace function public.escala_obter_semana(p_loja uuid, p_semana date)
returns jsonb language plpgsql stable security definer set search_path to '' as $$
begin
  perform eo_private.escala_exigir_leitura(p_loja);
  return (select jsonb_build_object('id', s.id, 'semana_inicio', s.semana_inicio, 'modelo', s.modelo, 'status', s.status,
            'dados', s.dados, 'versao', s.versao, 'atualizado_em', s.atualizado_em, 'finalizada_em', s.finalizada_em,
            'atualizado_por', (select p.display_name from public.perfis p where p.id = s.atualizado_por))
            from public.escala_semanas s where s.loja_id = p_loja and s.semana_inicio = p_semana);
end $$;

-- Salvar com trava otimista. p_versao = versão que a tela abriu (null quando a semana é nova).
create or replace function public.escala_salvar_semana(p_loja uuid, p_semana date, p_modelo text, p_status text, p_dados jsonb, p_versao int)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id uuid; v_versao int; v_atual int;
begin
  perform eo_private.escala_exigir_edicao(p_loja);
  if p_status not in ('rascunho','finalizada') then raise exception 'Status inválido'; end if;
  select id, versao into v_id, v_atual from public.escala_semanas where loja_id = p_loja and semana_inicio = p_semana for update;
  if v_id is null then
    if p_versao is not null then raise exception 'A semana não existe mais. Recarregue.' using errcode = '40001'; end if;
    insert into public.escala_semanas (loja_id, semana_inicio, modelo, status, dados, criado_por, atualizado_por, finalizada_em)
    values (p_loja, p_semana, p_modelo, p_status, p_dados, (select auth.uid()), (select auth.uid()), case when p_status='finalizada' then now() end)
    returning id, versao into v_id, v_versao;
  else
    if p_versao is distinct from v_atual then
      raise exception 'Esta escala foi salva por outra pessoa (versão %). Recarregue para não perder alterações.', v_atual using errcode = '40001';
    end if;
    update public.escala_semanas set modelo = p_modelo, status = p_status, dados = p_dados, versao = versao + 1,
           atualizado_por = (select auth.uid()), atualizado_em = now(),
           finalizada_em = case when p_status = 'finalizada' then coalesce(finalizada_em, now()) else null end
     where id = v_id returning versao into v_versao;
  end if;
  insert into public.escala_semanas_versoes (semana_id, versao, status, dados, salvo_por)
  values (v_id, v_versao, p_status, p_dados, (select auth.uid()));
  delete from public.escala_semanas_versoes where semana_id = v_id and versao <= v_versao - 30;
  perform eo_private.escala_auditar('escala.semana.salvar', v_id::text,
    jsonb_build_object('loja', p_loja, 'semana', p_semana, 'status', p_status, 'versao', v_versao, 'bytes', pg_column_size(p_dados)));
  return jsonb_build_object('id', v_id, 'versao', v_versao);
end $$;

create or replace function public.escala_listar_semanas(p_loja uuid, p_limite int default 20)
returns jsonb language plpgsql stable security definer set search_path to '' as $$
begin
  perform eo_private.escala_exigir_leitura(p_loja);
  return coalesce((select jsonb_agg(x) from (
    select jsonb_build_object('id', s.id, 'semana_inicio', s.semana_inicio, 'modelo', s.modelo, 'status', s.status,
             'versao', s.versao, 'atualizado_em', s.atualizado_em) x
      from public.escala_semanas s where s.loja_id = p_loja
     order by s.semana_inicio desc limit least(greatest(coalesce(p_limite,20),1),100)) q), '[]'::jsonb);
end $$;

create or replace function public.escala_versoes_semana(p_semana_id uuid)
returns jsonb language plpgsql stable security definer set search_path to '' as $$
declare v_loja uuid;
begin
  select loja_id into v_loja from public.escala_semanas where id = p_semana_id;
  perform eo_private.escala_exigir_leitura(v_loja);
  return coalesce((select jsonb_agg(jsonb_build_object('versao', v.versao, 'status', v.status, 'salvo_em', v.salvo_em,
            'salvo_por', (select p.display_name from public.perfis p where p.id = v.salvo_por), 'dados', v.dados) order by v.versao desc)
            from public.escala_semanas_versoes v where v.semana_id = p_semana_id), '[]'::jsonb);
end $$;

-- Feedback com limite de 20 por hora por pessoa
create or replace function public.escala_enviar_feedback(p_loja uuid, p_mensagem text, p_contexto jsonb default '{}'::jsonb)
returns void language plpgsql security definer set search_path to '' as $$
begin
  perform eo_private.escala_exigir_leitura(p_loja);
  if (select count(*) from public.escala_feedbacks where autor = (select auth.uid()) and criado_em > now() - interval '1 hour') >= 20 then
    raise exception 'Muitos envios. Tente mais tarde.' using errcode = '54000';
  end if;
  insert into public.escala_feedbacks (loja_id, autor, mensagem, contexto) values (p_loja, (select auth.uid()), p_mensagem, coalesce(p_contexto,'{}'::jsonb));
end $$;

-- Carga da base de colaboradores (somente admin). Linhas: [{loja_codigo, chapa, nome, cargo, departamento, jornada_diaria_min, situacao}]
-- Quem não vier no lote, nas lojas presentes no lote, é desativado (nunca apagado).
create or replace function public.colaboradores_importar(p_linhas jsonb)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_lote uuid := gen_random_uuid(); v_up int; v_off int; v_sem_loja int;
begin
  if eo_private.role_of_actor() is distinct from 'admin' then raise exception 'Somente administração' using errcode = '42501'; end if;
  if jsonb_typeof(p_linhas) <> 'array' or jsonb_array_length(p_linhas) > 20000 then raise exception 'Lote inválido (máximo 20000 linhas)'; end if;
  with imp as (
    select trim(i->>'chapa') chapa, trim(i->>'nome') nome, nullif(trim(i->>'cargo'),'') cargo, nullif(trim(i->>'departamento'),'') departamento,
           nullif(i->>'jornada_diaria_min','')::int jornada, nullif(trim(i->>'situacao'),'') situacao, l.id loja_id
      from jsonb_array_elements(p_linhas) i left join public.lojas l on ltrim(l.code, '0') = ltrim(trim(i->>'loja_codigo'), '0')
  ), ins as (
    insert into public.colaboradores as c (chapa, nome, cargo, departamento, jornada_diaria_min, situacao, loja_id, ativo, lote_importacao)
    select distinct on (chapa) chapa, nome, cargo, departamento, jornada, situacao, loja_id, true, v_lote from imp where loja_id is not null
    on conflict (chapa) do update set nome = excluded.nome, cargo = excluded.cargo, departamento = excluded.departamento,
       jornada_diaria_min = excluded.jornada_diaria_min, situacao = excluded.situacao, loja_id = excluded.loja_id,
       ativo = true, lote_importacao = v_lote, atualizado_em = now()
    returning 1
  )
  select (select count(*) from ins), (select count(*) from imp where loja_id is null) into v_up, v_sem_loja;
  update public.colaboradores set ativo = false, atualizado_em = now()
   where ativo and lote_importacao is distinct from v_lote
     and loja_id in (select l.id from jsonb_array_elements(p_linhas) i join public.lojas l on ltrim(l.code, '0') = ltrim(trim(i->>'loja_codigo'), '0'));
  get diagnostics v_off = row_count;
  perform eo_private.escala_auditar('colaboradores.importar', v_lote::text, jsonb_build_object('gravados', v_up, 'desativados', v_off, 'sem_loja', v_sem_loja));
  return jsonb_build_object('lote', v_lote, 'gravados', v_up, 'desativados', v_off, 'sem_loja', v_sem_loja);
end $$;

do $$
declare f text;
begin
  foreach f in array array[
    'public.escala_lojas_disponiveis(text,int,int)', 'public.escala_contexto(uuid)',
    'public.escala_salvar_config(uuid,text,boolean,boolean,jsonb,int)', 'public.escala_salvar_ajustes(uuid,jsonb)',
    'public.escala_obter_semana(uuid,date)', 'public.escala_salvar_semana(uuid,date,text,text,jsonb,int)',
    'public.escala_listar_semanas(uuid,int)', 'public.escala_versoes_semana(uuid)',
    'public.escala_enviar_feedback(uuid,text,jsonb)', 'public.colaboradores_importar(jsonb)'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;

insert into eo_private.schema_migrations(version) values ('202611110002_escala_modulo') on conflict do nothing;

commit;

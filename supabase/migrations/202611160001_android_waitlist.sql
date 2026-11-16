begin;

-- Lista pública de interesse, independente de contas e permissões do EO.
create table public.eo_android_waitlist (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 120),
  chapa text not null check (chapa ~ '^[0-9]{6}$'),
  email text not null check (
    char_length(email) between 3 and 254
    and email = lower(btrim(email))
    and email ~ '^[^[:space:]@]+@[^[:space:]@.]+([.][^[:space:]@.]+)+$'
  ),
  created_at timestamptz not null default now(),
  constraint eo_android_waitlist_contact_unique unique (chapa, email)
);

create index eo_android_waitlist_created_at_idx
  on public.eo_android_waitlist (created_at desc, id desc);

alter table public.eo_android_waitlist enable row level security;
revoke all on public.eo_android_waitlist from public, anon, authenticated;

comment on table public.eo_android_waitlist is
  'Interesse no Android, autodeclarado e sem validação de identidade. Acesso de clientes somente pelas RPCs.';

create function public.eo_android_waitlist_register(
  p_name text, p_chapa text, p_email text
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_name text;
  v_chapa text;
  v_email text;
begin
  -- Limitar também as entradas brutas antes de normalizar.
  if p_name is null or char_length(p_name) > 256
    or p_chapa is null or char_length(p_chapa) > 32
    or p_email is null or char_length(p_email) > 320 then
    raise exception 'Preencha nome, chapa e e-mail válidos.' using errcode = '22023';
  end if;

  v_name := btrim(regexp_replace(p_name, '[[:space:]]+', ' ', 'g'));
  v_chapa := btrim(p_chapa);
  v_email := lower(btrim(p_email));

  if char_length(v_name) not between 2 and 120 then
    raise exception 'Informe seu nome, entre 2 e 120 caracteres.' using errcode = '22023';
  end if;
  if v_chapa !~ '^[0-9]{6}$' then
    raise exception 'Informe a chapa com seis números.' using errcode = '22023';
  end if;
  if char_length(v_email) not between 3 and 254
    or v_email !~ '^[^[:space:]@]+@[^[:space:]@.]+([.][^[:space:]@.]+)+$' then
    raise exception 'Informe um e-mail válido.' using errcode = '22023';
  end if;

  -- Reenvios são idempotentes. Um visitante nunca sobrescreve dados existentes.
  -- O par permite corrigir o contato sem dar a terceiros posse exclusiva da chapa.
  insert into public.eo_android_waitlist (name, chapa, email)
  values (v_name, v_chapa, v_email)
  on conflict (chapa, email) do nothing;

  -- A resposta não revela se o contato já estava cadastrado.
  return jsonb_build_object('ok', true, 'status', 'received');
end;
$$;

create function public.eo_admin_android_waitlist(
  p_search text default '', p_limit integer default 30, p_offset integer default 0
) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_search text := left(btrim(coalesce(p_search, '')), 120);
  v_limit integer := greatest(1, least(coalesce(p_limit, 30), 100));
  v_offset integer := greatest(0, coalesce(p_offset, 0));
  v_result jsonb;
begin
  if auth.uid() is null or eo_private.role_of_actor() is distinct from 'admin' then
    raise exception 'Acesso administrativo necessário' using errcode = '42501';
  end if;

  with filtered as (
    select w.id, w.name, w.chapa, w.email, w.created_at, 'pending'::text as status
    from public.eo_android_waitlist w
    where v_search = ''
      or strpos(lower(concat_ws(' ', w.name, w.chapa, w.email)), lower(v_search)) > 0
  ), paged as (
    select * from filtered
    order by created_at desc, id desc
    limit v_limit offset v_offset
  )
  select jsonb_build_object(
    'items', coalesce((select jsonb_agg(to_jsonb(p) order by p.created_at desc, p.id desc) from paged p), '[]'::jsonb),
    'total', (select count(*) from filtered),
    'limit', v_limit,
    'offset', v_offset
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.eo_android_waitlist_register(text, text, text) from public, anon, authenticated;
grant execute on function public.eo_android_waitlist_register(text, text, text) to anon, authenticated;
revoke all on function public.eo_admin_android_waitlist(text, integer, integer) from public, anon, authenticated;
grant execute on function public.eo_admin_android_waitlist(text, integer, integer) to authenticated;

insert into eo_private.schema_migrations (version)
values ('202611160001_android_waitlist') on conflict do nothing;
notify pgrst, 'reload schema';
commit;

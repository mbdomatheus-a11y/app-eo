-- 202611110005_contas_loja_automaticas
-- Cria sozinho a conta gerNNN de toda loja ativa sem conta (inclusive lojas novas).
-- pg_cron a cada 5 minutos chama a Edge Function acesso-loja (ação provisionar, até 40 lojas por vez)
-- somente quando existe loja pendente. A ação provisionar-pendentes não precisa de segredo: só cria a
-- conta padrão de loja ativa sem conta e devolve contagens.
begin;

create or replace function eo_private.acesso_loja_provisionar_pendentes()
returns void language plpgsql security definer set search_path to '' as $$
begin
  if not exists (select 1 from public.lojas l where l.active and l.code ~ '^[0-9]{1,4}$'
                   and not exists (select 1 from public.acesso_contas_loja c where c.loja_id = l.id)) then
    return;
  end if;
  perform net.http_post(
    url := 'https://mfsnzrrqlyixqwsrcqyo.supabase.co/functions/v1/acesso-loja',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := jsonb_build_object('acao', 'provisionar-pendentes'),
    timeout_milliseconds := 120000);
end $$;
revoke all on function eo_private.acesso_loja_provisionar_pendentes() from public, anon, authenticated;

select cron.unschedule('acesso-loja-provisionar') where exists (select 1 from cron.job where jobname = 'acesso-loja-provisionar');
select cron.schedule('acesso-loja-provisionar', '*/5 * * * *', 'select eo_private.acesso_loja_provisionar_pendentes();');

insert into eo_private.schema_migrations(version) values ('202611110005_contas_loja_automaticas') on conflict do nothing;
commit;

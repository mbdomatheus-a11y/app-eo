-- 202611110009_teste_push_todos
-- Qualquer pessoa ativa pode enviar a notificação de teste para os PRÓPRIOS aparelhos (antes só admin).
-- A Edge Function send-test-push já limita o envio aos aparelhos de quem chamou.
begin;
create or replace function public.eo_test_push_metadata()
returns jsonb language plpgsql stable security definer set search_path to '' as $$
begin
  if eo_private.role_of_actor() is null then raise exception 'Acesso não liberado' using errcode = '42501'; end if;
  return jsonb_build_object('user_id', auth.uid(), 'sound', (select push_sound from public.eo_settings where id));
end $$;
insert into eo_private.schema_migrations(version) values ('202611110009_teste_push_todos') on conflict do nothing;
commit;

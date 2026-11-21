-- 21/11/2026: espaços de foto do novo visual (login, início, vazio e capa de cada módulo).
-- Aditiva. As fotos padrão ficam no app; esta tabela guarda só as trocas feitas pelo administrador.
begin;
create table public.eo_aparencia_fotos (
 espaco text primary key,
 caminho text not null,
 posicao text not null default 'center',
 updated_by uuid references public.perfis(id),
 updated_at timestamptz not null default now(),
 constraint eo_aparencia_espaco_valido check (espaco = any (array['login','inicio','vazio','notices','sales','product','assortment','diary','mood','checklists','reports','agenda','escala'])),
 constraint eo_aparencia_caminho_valido check (caminho ~ '^[a-z]+/[A-Za-z0-9._-]{1,120}$' and split_part(caminho,'/',1) = espaco),
 constraint eo_aparencia_posicao_valida check (posicao = any (array['top','center','bottom']))
);
alter table public.eo_aparencia_fotos enable row level security;
revoke all on public.eo_aparencia_fotos from public, anon, authenticated;

create function public.eo_aparencia_fotos() returns jsonb
language sql stable security definer set search_path = '' as $$
 select coalesce(jsonb_object_agg(espaco, jsonb_build_object('caminho', caminho, 'posicao', posicao, 'atualizado', updated_at)), '{}'::jsonb)
 from public.eo_aparencia_fotos;
$$;

create function public.eo_admin_set_aparencia_foto(p_espaco text, p_caminho text default null, p_posicao text default 'center') returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
 if eo_private.role_of_actor() is distinct from 'admin' then raise exception 'Somente administradores' using errcode = '42501'; end if;
 if p_espaco is null or not (p_espaco = any (array['login','inicio','vazio','notices','sales','product','assortment','diary','mood','checklists','reports','agenda','escala'])) then raise exception 'Espaço de foto inválido'; end if;
 if p_caminho is null then
  delete from public.eo_aparencia_fotos where espaco = p_espaco;
 else
  if not exists (select 1 from storage.objects where bucket_id = 'eo-aparencia' and name = p_caminho) then raise exception 'Envie a foto antes de salvar'; end if;
  insert into public.eo_aparencia_fotos (espaco, caminho, posicao, updated_by) values (p_espaco, p_caminho, coalesce(p_posicao, 'center'), auth.uid())
  on conflict (espaco) do update set caminho = excluded.caminho, posicao = excluded.posicao, updated_by = excluded.updated_by, updated_at = now();
 end if;
 insert into public.auditoria (actor, action, entity_id, detail, modulo) values (auth.uid(), 'aparencia.foto.changed', p_espaco, jsonb_build_object('caminho', p_caminho, 'posicao', p_posicao), 'eo');
 return public.eo_aparencia_fotos();
end;
$$;

revoke all on function public.eo_aparencia_fotos() from public;
revoke all on function public.eo_admin_set_aparencia_foto(text, text, text) from public, anon;
grant execute on function public.eo_aparencia_fotos() to anon, authenticated;
grant execute on function public.eo_admin_set_aparencia_foto(text, text, text) to authenticated;

-- Fotos de aparência não são sensíveis e aparecem antes do login: bucket público, escrita só do admin.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('eo-aparencia', 'eo-aparencia', true, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;
create policy "EO admin envia fotos de aparencia" on storage.objects for insert to authenticated
 with check (bucket_id = 'eo-aparencia' and eo_private.role_of_actor() = 'admin');
create policy "EO admin atualiza fotos de aparencia" on storage.objects for update to authenticated
 using (bucket_id = 'eo-aparencia' and eo_private.role_of_actor() = 'admin');
create policy "EO admin apaga fotos de aparencia" on storage.objects for delete to authenticated
 using (bucket_id = 'eo-aparencia' and eo_private.role_of_actor() = 'admin');
create policy "EO admin le fotos de aparencia" on storage.objects for select to authenticated
 using (bucket_id = 'eo-aparencia' and eo_private.role_of_actor() = 'admin');

insert into eo_private.schema_migrations (version) values ('202611210001_aparencia_fotos') on conflict do nothing;
notify pgrst, 'reload schema';
commit;

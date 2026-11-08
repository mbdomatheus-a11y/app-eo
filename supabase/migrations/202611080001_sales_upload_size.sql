-- EO: relatórios sem limite artificial de tamanho, preservando limites do provedor.
begin;
update storage.buckets set file_size_limit=null where id='eo-sales-html';
create or replace function eo_private.require_operational_object(p_bucket text,p_path text) returns void
language plpgsql stable security definer set search_path='' as $$
begin
  if not coalesce(public.eo_operational_upload_allowed(p_bucket,p_path),false) then
    raise exception 'Arquivo fora do caminho ou tipo autorizado' using errcode='42501';
  end if;
  if not exists(select 1 from storage.objects o where o.bucket_id=p_bucket and o.name=p_path
    and case when coalesce(o.metadata->>'size','') ~ '^[0-9]+$'
      then (o.metadata->>'size')::numeric > 0 and (p_bucket='eo-sales-html' or (o.metadata->>'size')::numeric <= 10485760) else false end
    and ((p_bucket='eo-sales-html' and split_part(lower(o.metadata->>'mimetype'),';',1)='text/html')
      or (p_bucket='eo-day-audio' and split_part(lower(o.metadata->>'mimetype'),';',1)=any(
        array['audio/webm','audio/mp4','audio/mpeg','audio/ogg','audio/wav','audio/x-wav','audio/x-m4a','audio/aac'])))) then
    raise exception 'Envie um arquivo válido antes de salvar (áudio: até 10 MB)';
  end if;
end; $$;
commit;

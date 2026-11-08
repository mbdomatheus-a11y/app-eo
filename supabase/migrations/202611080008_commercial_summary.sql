begin;
create or replace function public.eo_commercial_page(p_kind text,p_from date,p_to date,p_store uuid default null,p_limit integer default 30,p_offset integer default 0) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if eo_private.role_of_actor() is null then raise exception 'Acesso não autorizado' using errcode='42501'; end if;
 if p_kind not in ('product','assortment') or p_from is null or p_to is null or p_to<p_from or p_to-p_from>366 then raise exception 'Período inválido'; end if;
 with all_rows as (
  select r.id,r.store_id,r.person_id,r.created_at,'product' kind,jsonb_build_object('note',r.note,'details',r.details,'audio_path',r.audio_path,'transcript',r.transcript) payload from public.eo_product_requests r where p_kind='product'
  union all select r.id,r.store_id,r.person_id,r.created_at,'assortment',jsonb_build_object('barcode',r.barcode,'sizes',r.sizes,'status',r.status) from public.eo_assortment_scans r where p_kind='assortment'
 ), scoped as materialized (
  select r.*,s.code store_code,s.name store_name,s.region,p.display_name person_name from all_rows r join public.eo_stores s on s.id=r.store_id join public.eo_profiles p on p.id=r.person_id
  where (r.person_id=auth.uid() or (eo_private.role_of_actor() in ('admin','diretor') and eo_private.has_store(s.id)))
   and (p_store is null or r.store_id=p_store) and r.created_at>=p_from::timestamp at time zone 'America/Sao_Paulo' and r.created_at<(p_to+1)::timestamp at time zone 'America/Sao_Paulo'
 ), page as (select * from scoped order by created_at desc,id limit greatest(1,least(coalesce(p_limit,30),100)) offset greatest(0,coalesce(p_offset,0)))
 select jsonb_build_object('items',(select coalesce(jsonb_agg(to_jsonb(page) order by created_at desc,id),'[]') from page),'total',(select count(*) from scoped),
 'top_products',(select coalesce(jsonb_agg(to_jsonb(top) order by requests desc),'[]') from (select region,payload->'details'->>'category' category,payload->'details'->>'product' product,payload->'details'->>'color' color,payload->'details'->>'size' size,count(*) requests from scoped where kind='product' group by 1,2,3,4,5 order by count(*) desc,region limit 20) top),
 'groups',(select coalesce(jsonb_agg(to_jsonb(g) order by total desc),'[]') from (select region,count(*) total from scoped group by region) g)) into result;
 return result;
end; $$;
commit;

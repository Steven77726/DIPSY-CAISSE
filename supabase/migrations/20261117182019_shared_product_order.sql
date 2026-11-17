-- Caisse only: preserve all products, prices, VAT and historical order lines.
-- Includes the category constraint already expanded on the hosted project.
alter table public.caisse_products drop constraint caisse_products_category_check;
alter table public.caisse_products add constraint caisse_products_category_check
 check(category in ('entrees','plats','desserts','boissons','alcool','vins','cocktails'));

create table public.caisse_product_order (
 id uuid primary key default gen_random_uuid(),
 category text not null unique check(category in ('plats','vins','cocktails','boissons','alcool')),
 product_ids uuid[] not null default '{}',
 version integer not null default 0 check(version>=0),
 updated_at timestamptz not null default now(),
 updated_by uuid references auth.users(id),
 check(cardinality(product_ids)<=5000)
);
insert into public.caisse_product_order(category) values('plats'),('vins'),('cocktails'),('boissons'),('alcool');
create index caisse_product_order_actor_idx on public.caisse_product_order(updated_by);
alter table public.caisse_product_order enable row level security;
revoke all on public.caisse_product_order from public,anon,authenticated;
grant select on public.caisse_product_order to anon,authenticated;
create policy caisse_read on public.caisse_product_order for select to anon,authenticated
 using ((select caisse_private.my_role()) is not null);

create function caisse_private.reorder_products(op jsonb) returns jsonb
 language plpgsql security definer set search_path='' as $$
declare
 actor uuid:=coalesce(auth.uid(),caisse_private.public_actor());
 opid uuid:=(op->>'id')::uuid; entity uuid:=(op->>'entityId')::uuid;
 expected integer:=(op->>'baseVersion')::integer;
 previous public.caisse_product_order; changed public.caisse_product_order;
 existing public.caisse_operations; ids uuid[]; current_ids uuid[]; result_value jsonb;
begin
 if actor is null or caisse_private.my_role() is null then raise exception 'ACCESS_DENIED' using errcode='42501'; end if;
 if caisse_private.my_role()<>'admin' then raise exception 'ADMIN_REQUIRED' using errcode='42501'; end if;
 if opid is null or entity is null or (op->>'kind') is distinct from 'reorder_products'
  or jsonb_typeof(op->'payload'->'product_ids') is distinct from 'array'
  or jsonb_array_length(op->'payload'->'product_ids')>5000 then raise exception 'INVALID_PRODUCT_ORDER'; end if;
 perform pg_advisory_xact_lock(hashtextextended(opid::text,0));
 select * into existing from public.caisse_operations where id=opid;
 if found then
  if existing.actor_id<>actor or existing.body<>op then raise exception 'IDEMPOTENCY_KEY_REUSED'; end if;
  return existing.result;
 end if;
 perform pg_advisory_xact_lock(hashtextextended(entity::text,13));
 select * into previous from public.caisse_product_order where id=entity for update;
 if not found then raise exception 'PRODUCT_ORDER_NOT_FOUND'; end if;
 if expected is distinct from previous.version then raise exception 'VERSION_CONFLICT'; end if;
 select coalesce(array_agg(value::uuid order by position),'{}') into ids
  from jsonb_array_elements_text(op->'payload'->'product_ids') with ordinality a(value,position);
 if array_position(ids,null) is not null or cardinality(ids)<>(select count(distinct x) from unnest(ids)x) then raise exception 'INVALID_PRODUCT_ORDER'; end if;
 select coalesce(array_agg(id order by id),'{}') into current_ids from public.caisse_products
  where case when category in ('entrees','desserts') then 'plats' else category end=previous.category;
 if (select coalesce(array_agg(x order by x),'{}') from unnest(ids)x) is distinct from current_ids then raise exception 'PRODUCT_LIST_CHANGED'; end if;
 update public.caisse_product_order set product_ids=ids,version=version+1,updated_at=now(),updated_by=actor
  where id=entity returning * into changed;
 result_value:=jsonb_build_object('id',entity,'version',changed.version);
 insert into public.caisse_operations(id,actor_id,body,result) values(opid,actor,op,result_value);
 insert into public.caisse_events(operation_id,actor_id,kind,before_state,after_state)
  values(opid,actor,'reorder_products',to_jsonb(previous),to_jsonb(changed));
 return result_value;
end $$;
revoke all on function caisse_private.reorder_products(jsonb) from public;
grant execute on function caisse_private.reorder_products(jsonb) to anon,authenticated;

create or replace function public.caisse_apply_operation(op jsonb) returns jsonb
 language sql security invoker set search_path='' as $$
 select case when op->>'kind'='reorder_products' then caisse_private.reorder_products(op)
  else caisse_private.apply_operation(op) end
$$;

create or replace function public.caisse_snapshot() returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object(
 'products',(select coalesce(jsonb_agg(p order by name),'[]') from public.caisse_products p),
 'product_order',(select coalesce(jsonb_agg(p order by category),'[]') from public.caisse_product_order p),
 'tables',(select coalesce(jsonb_agg(t order by label),'[]') from public.caisse_tables t),
 'clients',(select coalesce(jsonb_agg(c order by name),'[]') from public.caisse_clients c),
 'orders',(select coalesce(jsonb_agg(o order by created_at desc),'[]') from public.caisse_orders o),
 'lines',(select coalesce(jsonb_agg(l),'[]') from public.caisse_order_lines l),
 'payments',(select coalesce(jsonb_agg(p order by created_at desc),'[]') from public.caisse_payments p),
 'events',(select coalesce(jsonb_agg(e order by created_at desc),'[]') from public.caisse_events e),
 'access',(select coalesce(jsonb_agg(a order by email),'[]') from public.caisse_access a),
 'table_sessions',(select coalesce(jsonb_agg(s order by created_at desc),'[]') from public.caisse_table_sessions s),
 'server_time',now()) where (select caisse_private.my_role()) is not null
$$;
alter publication supabase_realtime add table public.caisse_product_order;

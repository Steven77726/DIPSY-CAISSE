-- DIPSY CAISSE — isolated, additive schema. No Dipsy Tables relation is modified.
create schema if not exists caisse_private;
revoke all on schema caisse_private from public, anon;
grant usage on schema caisse_private to authenticated;

create table public.caisse_access (
 email text primary key check(email=lower(trim(email)) and position('@' in email)>1),
 name text not null default '', role text not null check(role in ('admin','staff')),
 active boolean not null default true, version integer not null default 1,
 updated_at timestamptz not null default now()
);
create table public.caisse_products (
 id uuid primary key, name text not null check(length(trim(name)) between 1 and 120),
 category text not null check(category in ('entrees','plats','desserts','boissons','alcool')),
 price_cents integer not null check(price_cents between 1 and 1000000),
 vat_bps integer not null check(vat_bps between 0 and 10000),
 accounting_group text not null check(accounting_group in ('food','non_alcohol','alcohol')),
 active boolean not null default true, version integer not null default 1,
 updated_at timestamptz not null default now()
);
create table public.caisse_tables (
 id uuid primary key, label text not null unique check(length(trim(label)) between 1 and 60),
 seats integer not null default 4 check(seats between 1 and 100),
 active boolean not null default true, version integer not null default 1,
 external_table_id text unique, updated_at timestamptz not null default now()
);
create table public.caisse_clients (
 id uuid primary key, name text not null check(length(trim(name)) between 1 and 120),
 phone text not null default '' check(length(phone)<=40), version integer not null default 1,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index caisse_clients_name_idx on public.caisse_clients(lower(name));
create index caisse_clients_phone_idx on public.caisse_clients(phone);
create table public.caisse_orders (
 id uuid primary key, number bigint generated always as identity unique,
 table_id uuid references public.caisse_tables(id), client_id uuid references public.caisse_clients(id),
 label text not null default '' check(length(label)<=120),
 status text not null default 'open' check(status in ('open','due','paid','cancelled')),
 version integer not null default 1, created_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 external_reservation_id text unique
);
create index caisse_orders_created_idx on public.caisse_orders(created_at desc);
create index caisse_orders_status_idx on public.caisse_orders(status,updated_at desc);
create index caisse_orders_table_idx on public.caisse_orders(table_id);
create index caisse_orders_client_idx on public.caisse_orders(client_id);
create index caisse_orders_actor_idx on public.caisse_orders(created_by);
create table public.caisse_order_lines (
 id uuid primary key, order_id uuid not null references public.caisse_orders(id),
 product_id uuid not null references public.caisse_products(id),
 name text not null, quantity integer not null check(quantity between 1 and 999),
 unit_price_cents integer not null check(unit_price_cents between 1 and 1000000),
 vat_bps integer not null check(vat_bps between 0 and 10000),
 accounting_group text not null check(accounting_group in ('food','non_alcohol','alcohol')),
 total_cents integer generated always as (unit_price_cents*quantity) stored,
 net_cents integer generated always as (round(unit_price_cents*quantity*10000::numeric/(10000+vat_bps))::integer) stored
);
create index caisse_lines_order_idx on public.caisse_order_lines(order_id);
create index caisse_lines_product_idx on public.caisse_order_lines(product_id);
create table public.caisse_operations (
 id uuid primary key, actor_id uuid not null references auth.users(id),
 body jsonb not null, result jsonb not null, created_at timestamptz not null default now()
);
create index caisse_operations_actor_idx on public.caisse_operations(actor_id);
create table public.caisse_payments (
 id uuid primary key, order_id uuid not null references public.caisse_orders(id),
 operation_id uuid not null references public.caisse_operations(id) deferrable initially deferred,
 method text not null check(method in ('card','cash')),
 amount_cents integer not null check(amount_cents between 1 and 1000000000),
 created_by uuid not null references auth.users(id), created_at timestamptz not null default now()
);
create index caisse_payments_order_idx on public.caisse_payments(order_id);
create index caisse_payments_date_idx on public.caisse_payments(created_at);
create index caisse_payments_operation_idx on public.caisse_payments(operation_id);
create index caisse_payments_actor_idx on public.caisse_payments(created_by);
create table public.caisse_events (
 id uuid primary key default gen_random_uuid(), operation_id uuid not null unique references public.caisse_operations(id) deferrable initially deferred,
 order_id uuid references public.caisse_orders(id), actor_id uuid not null references auth.users(id),
 kind text not null, before_state jsonb, after_state jsonb, created_at timestamptz not null default now()
);
create index caisse_events_order_idx on public.caisse_events(order_id,created_at desc);
create index caisse_events_actor_idx on public.caisse_events(actor_id);

-- Private, fresh authorization against verified Auth email + restaurant allowlist.
-- No user_metadata claim is used. Authorization revocations take effect immediately.
create function caisse_private.my_role() returns text language sql stable security definer set search_path='' as $$
 select a.role from public.caisse_access a join auth.users u on lower(u.email)=a.email
 where u.id=(select auth.uid()) and u.email_confirmed_at is not null and a.active
$$;
revoke all on function caisse_private.my_role() from public,anon;
grant execute on function caisse_private.my_role() to authenticated;
create function public.caisse_my_role() returns text language sql stable security invoker set search_path='' as $$
 select caisse_private.my_role()
$$;
revoke all on function public.caisse_my_role() from public,anon;
grant execute on function public.caisse_my_role() to authenticated;

do $$ declare t text; begin
 foreach t in array array['caisse_access','caisse_products','caisse_tables','caisse_clients','caisse_orders','caisse_order_lines','caisse_operations','caisse_payments','caisse_events'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from anon,authenticated',t);
  execute format('grant select on public.%I to authenticated',t);
  if t in ('caisse_access','caisse_operations') then
   execute format('create policy caisse_read on public.%I for select to authenticated using ((select caisse_private.my_role())=''admin'')',t);
  elsif t='caisse_events' then
   execute format('create policy caisse_read on public.%I for select to authenticated using ((select caisse_private.my_role())=''admin'' or ((select caisse_private.my_role()) is not null and kind<>''save_access''))',t);
  else
   execute format('create policy caisse_read on public.%I for select to authenticated using ((select caisse_private.my_role()) is not null)',t);
  end if;
 end loop;
end $$;

-- All writes pass through this transaction. Direct REST writes are prohibited.
-- Security definer is confined to a private, non-exposed schema and checks membership.
create function caisse_private.apply_operation(op jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare
 actor uuid := auth.uid(); role_name text; op_id uuid := (op->>'id')::uuid;
 kind text := op->>'kind'; entity uuid := (op->>'entityId')::uuid;
 expected integer := coalesce((op->>'baseVersion')::integer,0); p jsonb := op->'payload';
 existing public.caisse_operations; o public.caisse_orders; prod public.caisse_products;
 ln jsonb; pay jsonb; old_line public.caisse_order_lines; previous jsonb; after_value jsonb; result_value jsonb;
 total bigint; paid bigint; added bigint; current_version integer; email_value text;
begin
 role_name:=caisse_private.my_role();
 if actor is null or role_name is null then raise exception 'ACCESS_DENIED' using errcode='42501'; end if;
 if op_id is null or entity is null or kind is null or p is null then raise exception 'INVALID_OPERATION'; end if;
 perform pg_advisory_xact_lock(hashtextextended(op_id::text,0));
 select * into existing from public.caisse_operations where id=op_id;
 if found then
  if existing.actor_id<>actor or existing.body<>op then raise exception 'IDEMPOTENCY_KEY_REUSED'; end if;
  return existing.result;
 end if;
 if kind in ('save_order','pay','cancel_order') then
  -- Serialize creation and mutations of the same order, including simultaneous devices.
  perform pg_advisory_xact_lock(hashtextextended(entity::text,1));
  select * into o from public.caisse_orders where id=entity for update;
  if found then
   if o.version<>expected then raise exception 'VERSION_CONFLICT'; end if;
   previous:=jsonb_build_object('order',to_jsonb(o),'lines',(select coalesce(jsonb_agg(to_jsonb(l)),'[]') from public.caisse_order_lines l where order_id=entity),'payments',(select coalesce(jsonb_agg(to_jsonb(x)),'[]') from public.caisse_payments x where order_id=entity));
  elsif kind<>'save_order' or expected<>0 then raise exception 'ORDER_NOT_FOUND';
  end if;
  if kind='save_order' then
   if o.status in ('paid','cancelled') then raise exception 'ORDER_LOCKED'; end if;
   if exists(select 1 from public.caisse_payments where order_id=entity) then raise exception 'ORDER_HAS_PAYMENTS'; end if;
   if coalesce(jsonb_typeof(p->'lines'),'')<>'array' or jsonb_array_length(p->'lines') not between 1 and 100 then raise exception 'EMPTY_OR_OVERSIZED_ORDER'; end if;
   if coalesce(p->>'status','open') not in ('open','due') then raise exception 'INVALID_STATUS'; end if;
   if o.id is null then
    insert into public.caisse_orders(id,table_id,client_id,label,status,created_by)
    values(entity,nullif(p->>'table_id','')::uuid,nullif(p->>'client_id','')::uuid,coalesce(p->>'label',''),coalesce(p->>'status','open'),actor);
   else
    update public.caisse_orders set table_id=nullif(p->>'table_id','')::uuid,client_id=nullif(p->>'client_id','')::uuid,label=coalesce(p->>'label',''),status=coalesce(p->>'status','open'),version=version+1,updated_at=now() where id=entity;
   end if;
   -- Preserve the price and VAT already agreed on each existing line.
   for ln in select value from jsonb_array_elements(p->'lines') loop
    select * into prod from public.caisse_products where id=(ln->>'product_id')::uuid and active;
    select * into old_line from public.caisse_order_lines where id=(ln->>'id')::uuid and order_id=entity;
    if old_line.id is null then
     if prod.id is null then raise exception 'PRODUCT_UNAVAILABLE'; end if;
     insert into public.caisse_order_lines(id,order_id,product_id,name,quantity,unit_price_cents,vat_bps,accounting_group)
     values((ln->>'id')::uuid,entity,prod.id,prod.name,(ln->>'quantity')::integer,prod.price_cents,prod.vat_bps,prod.accounting_group);
    else
     if old_line.product_id<>(ln->>'product_id')::uuid then raise exception 'LINE_PRODUCT_CHANGED'; end if;
     update public.caisse_order_lines set quantity=(ln->>'quantity')::integer where id=old_line.id;
    end if;
   end loop;
   if (select count(*) from jsonb_array_elements(p->'lines'))<>(select count(distinct value->>'id') from jsonb_array_elements(p->'lines')) then raise exception 'DUPLICATE_LINE'; end if;
   delete from public.caisse_order_lines where order_id=entity and id not in (select (value->>'id')::uuid from jsonb_array_elements(p->'lines'));
  elsif kind='pay' then
   if o.status in ('paid','cancelled') then raise exception 'ORDER_LOCKED'; end if;
   select coalesce(sum(total_cents),0) into total from public.caisse_order_lines where order_id=entity;
   select coalesce(sum(amount_cents),0) into paid from public.caisse_payments where order_id=entity;
   if coalesce(jsonb_typeof(p->'payments'),'')<>'array' or jsonb_array_length(p->'payments') not between 1 and 2 then raise exception 'INVALID_PAYMENT'; end if;
   select sum((value->>'amount_cents')::bigint) into added from jsonb_array_elements(p->'payments');
   if added is null or added<=0 or added>total-paid then raise exception 'PAYMENT_EXCEEDS_BALANCE'; end if;
   for pay in select value from jsonb_array_elements(p->'payments') loop
    insert into public.caisse_payments(id,order_id,operation_id,method,amount_cents,created_by)
    values((pay->>'id')::uuid,entity,op_id,pay->>'method',(pay->>'amount_cents')::integer,actor);
   end loop;
   update public.caisse_orders set status=case when paid+added=total then 'paid' else 'due' end,version=version+1,updated_at=now() where id=entity;
  elsif kind='cancel_order' then
   if o.status in ('paid','cancelled') then raise exception 'ORDER_LOCKED'; end if;
   if exists(select 1 from public.caisse_payments where order_id=entity) then raise exception 'ORDER_HAS_PAYMENTS'; end if;
   update public.caisse_orders set status='cancelled',version=version+1,updated_at=now() where id=entity;
  end if;
  select jsonb_build_object('order',to_jsonb(x),'lines',(select coalesce(jsonb_agg(to_jsonb(l)),'[]') from public.caisse_order_lines l where order_id=entity),'payments',(select coalesce(jsonb_agg(to_jsonb(z)),'[]') from public.caisse_payments z where order_id=entity)) into after_value from public.caisse_orders x where id=entity;
  result_value:=jsonb_build_object('id',entity,'version',after_value->'order'->'version');
 elsif kind='save_client' then
  perform pg_advisory_xact_lock(hashtextextended(entity::text,2));
  select version,to_jsonb(c) into current_version,previous from public.caisse_clients c where id=entity for update;
  if coalesce(current_version,0)<>expected then raise exception 'VERSION_CONFLICT'; end if;
  insert into public.caisse_clients(id,name,phone) values(entity,trim(p->>'name'),coalesce(p->>'phone',''))
  on conflict(id) do update set name=excluded.name,phone=excluded.phone,version=caisse_clients.version+1,updated_at=now();
  select to_jsonb(c) into after_value from public.caisse_clients c where id=entity;
  result_value:=jsonb_build_object('id',entity,'version',after_value->'version');
 elsif kind='save_product' then
  if role_name<>'admin' then raise exception 'ADMIN_REQUIRED' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(entity::text,3));
  select version,to_jsonb(c) into current_version,previous from public.caisse_products c where id=entity for update;
  if coalesce(current_version,0)<>expected then raise exception 'VERSION_CONFLICT'; end if;
  insert into public.caisse_products(id,name,category,price_cents,vat_bps,accounting_group,active)
  values(entity,trim(p->>'name'),p->>'category',(p->>'price_cents')::integer,(p->>'vat_bps')::integer,p->>'accounting_group',coalesce((p->>'active')::boolean,true))
  on conflict(id) do update set name=excluded.name,category=excluded.category,price_cents=excluded.price_cents,vat_bps=excluded.vat_bps,accounting_group=excluded.accounting_group,active=excluded.active,version=caisse_products.version+1,updated_at=now();
  select to_jsonb(c) into after_value from public.caisse_products c where id=entity;
  result_value:=jsonb_build_object('id',entity,'version',after_value->'version');
 elsif kind='save_table' then
  if role_name<>'admin' then raise exception 'ADMIN_REQUIRED' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(entity::text,4));
  select version,to_jsonb(c) into current_version,previous from public.caisse_tables c where id=entity for update;
  if coalesce(current_version,0)<>expected then raise exception 'VERSION_CONFLICT'; end if;
  insert into public.caisse_tables(id,label,seats,active) values(entity,trim(p->>'label'),(p->>'seats')::integer,coalesce((p->>'active')::boolean,true))
  on conflict(id) do update set label=excluded.label,seats=excluded.seats,active=excluded.active,version=caisse_tables.version+1,updated_at=now();
  select to_jsonb(c) into after_value from public.caisse_tables c where id=entity;
  result_value:=jsonb_build_object('id',entity,'version',after_value->'version');
 elsif kind='save_access' then
  if role_name<>'admin' then raise exception 'ADMIN_REQUIRED' using errcode='42501'; end if;
  email_value:=lower(trim(p->>'email'));
  -- Serialize access changes to preserve the final active administrator.
  perform pg_advisory_xact_lock(4135271);
  select version,to_jsonb(a) into current_version,previous from public.caisse_access a where email=email_value for update;
  if coalesce(current_version,0)<>expected then raise exception 'VERSION_CONFLICT'; end if;
  if previous->>'role'='admin' and (p->>'role'<>'admin' or not coalesce((p->>'active')::boolean,true)) and not exists(select 1 from public.caisse_access where role='admin' and active and email<>email_value) then raise exception 'LAST_ADMIN'; end if;
  insert into public.caisse_access(email,name,role,active) values(email_value,coalesce(p->>'name',''),p->>'role',coalesce((p->>'active')::boolean,true))
  on conflict(email) do update set name=excluded.name,role=excluded.role,active=excluded.active,version=caisse_access.version+1,updated_at=now();
  select to_jsonb(a) into after_value from public.caisse_access a where email=email_value;
  result_value:=jsonb_build_object('id',entity,'version',after_value->'version');
 else raise exception 'UNKNOWN_OPERATION';
 end if;
 insert into public.caisse_operations(id,actor_id,body,result) values(op_id,actor,op,result_value);
 insert into public.caisse_events(operation_id,order_id,actor_id,kind,before_state,after_state)
 values(op_id,case when kind in ('save_order','pay','cancel_order') then entity else null end,actor,kind,previous,after_value);
 return result_value;
end $$;
revoke all on function caisse_private.apply_operation(jsonb) from public,anon;
grant execute on function caisse_private.apply_operation(jsonb) to authenticated;
create function public.caisse_apply_operation(op jsonb) returns jsonb language sql security invoker set search_path='' as $$
 select caisse_private.apply_operation(op)
$$;
revoke all on function public.caisse_apply_operation(jsonb) from public,anon;
grant execute on function public.caisse_apply_operation(jsonb) to authenticated;

-- Bootstrap the first administrator separately in the SQL editor; do not publish their email in this repository.
-- Do not insert invented menu items, clients or sales into the production database.

do $$ declare t text; begin
 foreach t in array array['caisse_access','caisse_products','caisse_tables','caisse_clients','caisse_orders','caisse_order_lines','caisse_payments','caisse_events'] loop
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=t) then
   execute format('alter publication supabase_realtime add table public.%I',t);
  end if;
 end loop;
end $$;

-- One SQL statement gives all devices a consistent MVCC snapshot.
create function public.caisse_snapshot() returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object(
  'products',(select coalesce(jsonb_agg(p order by name),'[]') from public.caisse_products p),
  'tables',(select coalesce(jsonb_agg(t order by label),'[]') from public.caisse_tables t),
  'clients',(select coalesce(jsonb_agg(c order by name),'[]') from public.caisse_clients c),
  'orders',(select coalesce(jsonb_agg(o order by created_at desc),'[]') from public.caisse_orders o),
  'lines',(select coalesce(jsonb_agg(l),'[]') from public.caisse_order_lines l),
  'payments',(select coalesce(jsonb_agg(p order by created_at desc),'[]') from public.caisse_payments p),
  'events',(select coalesce(jsonb_agg(e order by created_at desc),'[]') from public.caisse_events e),
  'access',(select coalesce(jsonb_agg(a order by email),'[]') from public.caisse_access a),
  'server_time',now()) where (select caisse_private.my_role()) is not null
$$;
revoke all on function public.caisse_snapshot() from public,anon;
grant execute on function public.caisse_snapshot() to authenticated;

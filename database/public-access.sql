-- Explicitly enabled, passwordless access to DIPSY CAISSE only.
-- Base schema stays protected. The activation block at the end is a deliberate opt-in.
create table public.caisse_runtime (
 id boolean primary key default true check(id),
 public_access boolean not null default false,
 public_actor uuid references auth.users(id),
 updated_at timestamptz not null default now(),
 check(not public_access or public_actor is not null)
);
alter table public.caisse_runtime enable row level security;
revoke all on public.caisse_runtime from public,anon,authenticated;
grant select on public.caisse_runtime to authenticated;
create policy caisse_runtime_admin_read on public.caisse_runtime for select to authenticated
 using ((select auth.uid()) is not null and (select caisse_private.my_role())='admin');

create function caisse_private.public_actor() returns uuid language sql stable security definer set search_path='' as $$
 select public_actor from public.caisse_runtime where id and public_access
$$;
revoke all on function caisse_private.public_actor() from public;
grant usage on schema caisse_private to anon;
grant execute on function caisse_private.public_actor() to anon,authenticated;

create or replace function caisse_private.my_role() returns text language sql stable security definer set search_path='' as $$
 select case when (select auth.uid()) is null then
  case when caisse_private.public_actor() is not null then 'admin'::text end
 else (
  select a.role from public.caisse_access a join auth.users u on lower(u.email)=a.email
  where u.id=(select auth.uid()) and u.email_confirmed_at is not null and a.active
 ) end
$$;
grant execute on function caisse_private.my_role() to anon;
grant execute on function public.caisse_my_role() to anon;

create function public.caisse_public_access() returns boolean language sql stable security invoker set search_path='' as $$
 select caisse_private.public_actor() is not null
$$;
revoke all on function public.caisse_public_access() from public;
grant execute on function public.caisse_public_access() to anon,authenticated;

-- Keep RLS and deny all direct writes. Public writes still use the validated transaction.
do $$ declare t text; begin
 foreach t in array array['caisse_products','caisse_tables','caisse_clients','caisse_orders','caisse_order_lines','caisse_payments','caisse_events'] loop
  execute format('grant select on public.%I to anon',t);
  execute format('alter policy caisse_read on public.%I to anon,authenticated',t);
 end loop;
end $$;
-- The snapshot queries access, but guest users receive no membership rows.
grant select on public.caisse_access to anon;
alter policy caisse_read on public.caisse_access to anon,authenticated
 using ((select auth.uid()) is not null and (select caisse_private.my_role())='admin');
alter policy caisse_read on public.caisse_operations to authenticated
 using ((select auth.uid()) is not null and (select caisse_private.my_role())='admin');
alter policy caisse_read on public.caisse_events to anon,authenticated
 using (((select auth.uid()) is not null and (select caisse_private.my_role())='admin')
  or ((select caisse_private.my_role()) is not null and kind<>'save_access'));
grant execute on function public.caisse_snapshot() to anon;

create or replace function caisse_private.apply_operation(op jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare
 actor uuid := coalesce(auth.uid(),caisse_private.public_actor()); role_name text; op_id uuid := (op->>'id')::uuid;
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
  if auth.uid() is null then raise exception 'AUTHENTICATED_ADMIN_REQUIRED' using errcode='42501'; end if;
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

grant execute on function caisse_private.apply_operation(jsonb) to anon;
grant execute on function public.caisse_apply_operation(jsonb) to anon;

-- ACTIVATE_PUBLIC_ACCESS: one-time opt-in on the real project, after explicit owner approval.
-- This creates a credentialless technical actor for the financial ledger, not a login account.
do $$ declare actor uuid; begin
 select public_actor into actor from public.caisse_runtime where id;
 if actor is null then
  actor:=gen_random_uuid();
  insert into auth.users(id,aud,role,is_anonymous,created_at,updated_at)
   values(actor,'authenticated','authenticated',true,now(),now());
 end if;
 insert into public.caisse_runtime(id,public_access,public_actor) values(true,true,actor)
 on conflict(id) do update set public_access=true,public_actor=excluded.public_actor,updated_at=now();
end $$;

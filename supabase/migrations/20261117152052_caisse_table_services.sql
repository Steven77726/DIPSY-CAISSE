-- Dipsy Caisse only. No dipsy_* data or reservation function is changed.
create table public.caisse_table_sessions (
 id uuid primary key default gen_random_uuid(),
 table_id uuid not null references public.caisse_tables(id),
 order_id uuid not null unique references public.caisse_orders(id),
 launched_at timestamptz, released_at timestamptz,
 version integer not null default 1,
 created_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create unique index caisse_one_active_session on public.caisse_table_sessions(table_id) where released_at is null;
create index caisse_sessions_actor_idx on public.caisse_table_sessions(created_by);
alter table public.caisse_table_sessions enable row level security;
revoke all on public.caisse_table_sessions from public,anon,authenticated;
grant select on public.caisse_table_sessions to anon,authenticated;
create policy caisse_read on public.caisse_table_sessions for select to anon,authenticated
 using ((select caisse_private.my_role()) is not null and exists(select 1 from public.caisse_orders o where o.id=order_id));
-- Preserve existing independent table orders; no order or payment is changed.
insert into public.caisse_table_sessions(table_id,order_id,launched_at,created_by)
 select table_id,id,created_at,created_by from (
  select distinct on (o.table_id) o.* from public.caisse_orders o join public.caisse_tables t on t.id=o.table_id
  where o.reservation_id is null and coalesce(t.external_table_id,'') not like 'dipsy-tables:%'
  order by o.table_id,o.created_at desc,o.id
 ) latest where status<>'cancelled';

alter function caisse_private.apply_operation(jsonb) rename to apply_operation_before_room;
revoke all on function caisse_private.apply_operation_before_room(jsonb) from public,anon,authenticated;
create function caisse_private.apply_operation(op jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare
 actor uuid:=coalesce(auth.uid(),caisse_private.public_actor());
 opid uuid:=(op->>'id')::uuid; kind text:=op->>'kind'; entity uuid:=(op->>'entityId')::uuid;
 p jsonb:=op->'payload'; expected integer:=(op->>'baseVersion')::integer;
 existing public.caisse_operations; o public.caisse_orders; t public.caisse_tables; s public.caisse_table_sessions;
 tid uuid; own_table boolean:=false; before_value jsonb; after_value jsonb; result_value jsonb;
 total bigint; paid bigint;
begin
 if actor is null or caisse_private.my_role() is null then raise exception 'ACCESS_DENIED' using errcode='42501'; end if;
 if opid is null or entity is null or kind is null or p is null then raise exception 'INVALID_OPERATION'; end if;
 if kind not in ('save_table','save_order','pay','cancel_order','correct_line','launch_service','release_table') then return caisse_private.apply_operation_before_room(op); end if;
 perform pg_advisory_xact_lock(hashtextextended(opid::text,0));
 select * into existing from public.caisse_operations where id=opid;
 if found then
  if existing.actor_id<>actor or existing.body<>op then raise exception 'IDEMPOTENCY_KEY_REUSED'; end if;
  return existing.result;
 end if;
 if kind='release_table' then
  select * into s from public.caisse_table_sessions where id=entity;
  if not found then raise exception 'TABLE_SESSION_NOT_FOUND'; end if;
  tid:=s.table_id;
 elsif kind='save_table' then tid:=entity;
 else
  select * into o from public.caisse_orders where id=entity;
  tid:=case when kind='save_order' then nullif(p->>'table_id','')::uuid else o.table_id end;
  if kind='save_order' and o.id is not null and o.table_id is distinct from tid
   and exists(select 1 from public.caisse_table_sessions where order_id=o.id) then raise exception 'TABLE_ORDER_MOVE_BLOCKED'; end if;
 end if;
 if tid is not null then
  perform pg_advisory_xact_lock(hashtextextended(tid::text,9));
  select * into t from public.caisse_tables where id=tid;
  own_table:=t.id is not null and coalesce(t.external_table_id,'') not like 'dipsy-tables:%';
 end if;
 if kind='save_table' then
  if p->>'active'='false' and exists(select 1 from public.caisse_table_sessions where table_id=tid and released_at is null) then raise exception 'TABLE_OCCUPIED'; end if;
  return caisse_private.apply_operation_before_room(op);
 end if;
 if kind='release_table' then
  perform pg_advisory_xact_lock(hashtextextended(s.order_id::text,1));
  select * into s from public.caisse_table_sessions where id=entity for update;
  select * into o from public.caisse_orders where id=s.order_id for update;
  if expected is distinct from s.version or (p->>'order_version')::integer is distinct from o.version then raise exception 'VERSION_CONFLICT'; end if;
  if s.released_at is not null then raise exception 'TABLE_ALREADY_RELEASED'; end if;
  select coalesce(sum(total_cents),0) into total from public.caisse_order_lines where order_id=o.id;
  select coalesce(sum(amount_cents),0) into paid from public.caisse_payments where order_id=o.id;
  if o.status<>'paid' or total<=0 or paid<>total then raise exception 'TABLE_NOT_SETTLED'; end if;
  before_value:=to_jsonb(s);
  update public.caisse_table_sessions set released_at=now(),version=version+1,updated_at=now() where id=s.id returning to_jsonb(caisse_table_sessions) into after_value;
  result_value:=jsonb_build_object('id',s.id,'version',after_value->'version');
 elsif kind='launch_service' then
  if not own_table then raise exception 'INDEPENDENT_TABLE_REQUIRED'; end if;
  perform pg_advisory_xact_lock(hashtextextended(entity::text,1));
  select * into o from public.caisse_orders where id=entity for update;
  select * into s from public.caisse_table_sessions where order_id=entity and released_at is null for update;
  if s.id is null then raise exception 'TABLE_SESSION_NOT_FOUND'; end if;
  if expected is distinct from o.version then raise exception 'VERSION_CONFLICT'; end if;
  if o.status in ('paid','cancelled') then raise exception 'ORDER_LOCKED'; end if;
  if not exists(select 1 from public.caisse_order_lines where order_id=entity) then raise exception 'EMPTY_ORDER'; end if;
  before_value:=jsonb_build_object('order',to_jsonb(o),'session',to_jsonb(s));
  update public.caisse_orders set status='due',version=version+1,updated_at=now() where id=entity;
  update public.caisse_table_sessions set launched_at=coalesce(launched_at,now()),version=version+1,updated_at=now() where id=s.id;
  select jsonb_build_object('order',to_jsonb(x),'session',(select to_jsonb(z) from public.caisse_table_sessions z where z.id=s.id)) into after_value from public.caisse_orders x where x.id=entity;
  result_value:=jsonb_build_object('id',entity,'version',after_value->'order'->'version');
 else
  if own_table and kind='save_order' and o.reservation_id is null then
   if not t.active then raise exception 'TABLE_UNAVAILABLE'; end if;
   select * into s from public.caisse_table_sessions where table_id=tid and released_at is null;
   if s.id is not null and s.order_id<>entity then raise exception 'TABLE_BUSY'; end if;
   if exists(select 1 from public.caisse_table_sessions where order_id=entity and released_at is not null) then raise exception 'TABLE_ALREADY_RELEASED'; end if;
  end if;
  -- Removing the final article is a valid automatic save of an unpaid draft.
  if kind='save_order' and o.id is not null and o.reservation_id is null and jsonb_typeof(p->'lines')='array' and jsonb_array_length(p->'lines')=0 then
   perform pg_advisory_xact_lock(hashtextextended(entity::text,1));
   select * into o from public.caisse_orders where id=entity for update;
   if expected is distinct from o.version then raise exception 'VERSION_CONFLICT'; end if;
   if o.status in ('paid','cancelled') then raise exception 'ORDER_LOCKED'; end if;
   if exists(select 1 from public.caisse_payments where order_id=entity) then raise exception 'ORDER_HAS_PAYMENTS'; end if;
   if coalesce(p->>'status','open') not in ('open','due') then raise exception 'INVALID_STATUS'; end if;
   if tid is not null and not own_table then raise exception 'RESERVATION_USE_BRIDGE'; end if;
   if exists(select 1 from public.caisse_clients where id=nullif(p->>'client_id','')::uuid and reservation_id is not null) then raise exception 'RESERVATION_USE_BRIDGE'; end if;
   before_value:=jsonb_build_object('order',to_jsonb(o),'lines',(select jsonb_agg(l) from public.caisse_order_lines l where order_id=entity));
   delete from public.caisse_order_lines where order_id=entity;
   update public.caisse_orders set table_id=tid,client_id=nullif(p->>'client_id','')::uuid,label=coalesce(p->>'label',''),status=p->>'status',version=version+1,updated_at=now() where id=entity;
   select jsonb_build_object('order',to_jsonb(x),'lines','[]'::jsonb) into after_value from public.caisse_orders x where id=entity;
   result_value:=jsonb_build_object('id',entity,'version',after_value->'order'->'version');
  else
   result_value:=caisse_private.apply_operation_before_room(op);
  end if;
  if own_table and kind='save_order' and o.reservation_id is null and s.id is null then
   insert into public.caisse_table_sessions(table_id,order_id,created_by,launched_at)
    values(tid,entity,actor,case when p->>'status'='due' then now() end);
  elsif own_table and kind='save_order' and p->>'status'='due' then
   update public.caisse_table_sessions set launched_at=coalesce(launched_at,now()),updated_at=now() where order_id=entity and released_at is null;
  elsif own_table and kind='cancel_order' then
   update public.caisse_table_sessions set released_at=now(),version=version+1,updated_at=now() where order_id=entity and released_at is null;
  end if;
  -- Delegated financial operations have already stored their immutable journal.
  if before_value is null then return result_value; end if;
 end if;
 insert into public.caisse_operations(id,actor_id,body,result) values(opid,actor,op,result_value);
 insert into public.caisse_events(operation_id,order_id,actor_id,kind,before_state,after_state)
  values(opid,case when kind='release_table' then s.order_id else entity end,actor,kind,before_value,after_value);
 return result_value;
end $$;
revoke all on function caisse_private.apply_operation(jsonb) from public;
grant execute on function caisse_private.apply_operation(jsonb) to anon,authenticated;

create or replace function public.caisse_apply_operation(op jsonb) returns jsonb language sql security invoker set search_path='' as $$ select caisse_private.apply_operation(op) $$;

create or replace function public.caisse_snapshot() returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object(
 'products',(select coalesce(jsonb_agg(p order by name),'[]') from public.caisse_products p),
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
alter publication supabase_realtime add table public.caisse_table_sessions;

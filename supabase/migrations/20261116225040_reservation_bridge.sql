-- Additive bridge. No legacy browser reservation is removed or matched by name.
create table public.dipsy_tables_state (
 id boolean primary key default true check(id), version integer not null default 0,
 payload jsonb not null default '{"data":{},"history":{},"tableSettings":{},"_bridge":{"tables":{}}}',
 updated_at timestamptz not null default now()
);
insert into public.dipsy_tables_state(id) values(true);
create table public.dipsy_reservations (
 reservation_id uuid primary key, visit_date date not null, booking jsonb not null,
 table_label text not null, version integer not null default 1,
 deleted boolean not null default false, updated_at timestamptz not null default now(),
 check ((booking->>'id')::uuid=reservation_id),
 check ((booking->>'reservation_id')::uuid=reservation_id)
);
create index dipsy_reservations_date_idx on public.dipsy_reservations(visit_date);
create table public.dipsy_tables_imports (
 id uuid primary key, actor_id uuid not null references auth.users(id),
 original_snapshot jsonb not null, reservation_count integer not null,
 target_version integer not null, created_at timestamptz not null default now()
);
create index dipsy_tables_imports_actor_idx on public.dipsy_tables_imports(actor_id);
create table public.dipsy_bridge_operations (
 id uuid primary key, actor_id uuid not null references auth.users(id),
 body jsonb not null, result jsonb not null, created_at timestamptz not null default now()
);
create index dipsy_bridge_operations_actor_idx on public.dipsy_bridge_operations(actor_id);
alter table public.caisse_clients add column reservation_id uuid unique references public.dipsy_reservations(reservation_id);
alter table public.caisse_orders add column reservation_id uuid unique references public.dipsy_reservations(reservation_id);
alter table public.caisse_orders add column reservation_visit_date date;
alter table public.caisse_orders add constraint caisse_reservation_identity check(reservation_id is null or external_reservation_id=reservation_id::text);
alter table public.caisse_clients add constraint caisse_client_reservation_pair unique(reservation_id,id);
alter table public.caisse_orders add constraint caisse_order_reservation_pair unique(reservation_id,id);
alter table public.caisse_orders add constraint caisse_order_reservation_client foreign key(reservation_id,client_id) references public.caisse_clients(reservation_id,id);
create table public.caisse_reservation_cases (
 reservation_id uuid primary key references public.dipsy_reservations(reservation_id),
 client_id uuid not null unique references public.caisse_clients(id),
 order_id uuid not null unique references public.caisse_orders(id),
 created_by uuid not null references auth.users(id), created_at timestamptz not null default now(),
 foreign key(reservation_id,client_id) references public.caisse_clients(reservation_id,id),
 foreign key(reservation_id,order_id) references public.caisse_orders(reservation_id,id)
);
create index caisse_reservation_cases_actor_idx on public.caisse_reservation_cases(created_by);

create function caisse_private.bridge_member() returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and caisse_private.my_role() is not null
$$;
revoke all on function caisse_private.bridge_member() from public;
grant execute on function caisse_private.bridge_member() to anon,authenticated;
do $$ declare t text; begin
 foreach t in array array['dipsy_tables_state','dipsy_reservations','dipsy_tables_imports','dipsy_bridge_operations','caisse_reservation_cases'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated',t);
  execute format('grant select on public.%I to authenticated',t);
  execute format('create policy bridge_read on public.%I for select to authenticated using ((select caisse_private.bridge_member())%s)',t,case when t in ('dipsy_tables_imports','dipsy_bridge_operations') then ' and (select caisse_private.my_role())=''admin''' else '' end);
 end loop;
end $$;

-- Public caisse access never includes linked reservations, clients or financial rows.
alter policy caisse_read on public.caisse_clients using ((select caisse_private.my_role()) is not null and (reservation_id is null or (select caisse_private.bridge_member())));
alter policy caisse_read on public.caisse_orders using ((select caisse_private.my_role()) is not null and (reservation_id is null or (select caisse_private.bridge_member())));
alter policy caisse_read on public.caisse_tables using ((select caisse_private.my_role()) is not null and (external_table_id is null or external_table_id not like 'dipsy-tables:%' or (select caisse_private.bridge_member())));
alter policy caisse_read on public.caisse_order_lines using ((select caisse_private.my_role()) is not null and exists(select 1 from public.caisse_orders o where o.id=order_id));
alter policy caisse_read on public.caisse_payments using ((select caisse_private.my_role()) is not null and exists(select 1 from public.caisse_orders o where o.id=order_id));
alter policy caisse_read on public.caisse_events using (
 (select caisse_private.bridge_member()) and ((select caisse_private.my_role())='admin' or kind<>'save_access')
 or ((select auth.uid()) is null and (select caisse_private.my_role()) is not null and kind not like 'bridge_%' and kind<>'save_access'
  and (order_id is null or exists(select 1 from public.caisse_orders o where o.id=order_id)))
);

-- Strict validation also backfills the explicit alias while keeping every other field.
create function caisse_private.bridge_normalize(p jsonb) returns jsonb language plpgsql set search_path='' as $$
declare d text; a jsonb; b jsonb; items jsonb; result jsonb:=p; seen uuid[]:='{}'; rid uuid;
begin
 if jsonb_typeof(p)<>'object' or jsonb_typeof(p->'data')<>'object' then raise exception 'MIGRATION_INVALID_SNAPSHOT'; end if;
 if pg_column_size(p)>15000000 then raise exception 'MIGRATION_SNAPSHOT_TOO_LARGE'; end if;
 for d,a in select key,value from jsonb_each(p->'data') loop
  perform d::date;
  if jsonb_typeof(a)<>'array' then raise exception 'MIGRATION_INVALID_DAY'; end if;
  items:='[]';
  for b in select value from jsonb_array_elements(a) loop
   begin rid:=(b->>'id')::uuid; exception when invalid_text_representation then raise exception 'MIGRATION_ID_INVALID'; end;
   if rid is null then raise exception 'MIGRATION_ID_MISSING'; end if;
   if rid=any(seen) then raise exception 'MIGRATION_DUPLICATE_ID'; end if;
   seen:=array_append(seen,rid);
   if b ? 'reservation_id' and (b->>'reservation_id')::uuid<>rid then raise exception 'MIGRATION_ID_CHANGED'; end if;
   if coalesce(length(trim(b->>'name')),0) not between 1 and 120 or length(coalesce(b->>'phone',''))>40
    or coalesce(length(b->>'table'),0) not between 1 and 80 then raise exception 'MIGRATION_INVALID_RESERVATION'; end if;
   b:=b||jsonb_build_object('id',rid::text,'reservation_id',rid::text);
   items:=items||jsonb_build_array(b);
  end loop;
  result:=jsonb_set(result,array['data',d],items);
 end loop;
 return result;
end $$;
revoke all on function caisse_private.bridge_normalize(jsonb) from public;

create function caisse_private.bridge_table(ref text,label_value text) returns uuid language plpgsql security definer set search_path='' as $$
declare tid uuid; candidate text;
begin
 select id into tid from public.caisse_tables where external_table_id='dipsy-tables:'||ref;
 if tid is null then
  tid:=gen_random_uuid(); candidate:=left(label_value,60);
  if exists(select 1 from public.caisse_tables where label=candidate) then candidate:=left(label_value,43)||' [résa '||left(md5(ref),8)||']'; end if;
  insert into public.caisse_tables(id,label,external_table_id) values(tid,candidate,'dipsy-tables:'||ref);
 elsif not exists(select 1 from public.caisse_tables where id=tid and label=left(label_value,60)) then
  candidate:=left(label_value,60);
  if exists(select 1 from public.caisse_tables where label=candidate and id<>tid) then candidate:=left(label_value,43)||' [résa '||left(md5(ref),8)||']'; end if;
  update public.caisse_tables set label=candidate,version=version+1,updated_at=now() where id=tid;
 end if;
 return tid;
end $$;
revoke all on function caisse_private.bridge_table(text,text) from public;

-- Called only under the bridge transaction lock. State and UUID projection commit together.
create function caisse_private.bridge_write(p jsonb) returns integer language plpgsql security definer set search_path='' as $$
declare d text; a jsonb; b jsonb; r public.dipsy_reservations; rid uuid; present uuid[]:='{}'; label_value text; c public.caisse_reservation_cases; tid uuid; revision integer;
begin
 p:=caisse_private.bridge_normalize(p);
 for d,a in select key,value from jsonb_each(p->'data') loop
  for b in select value from jsonb_array_elements(a) loop
   rid:=(b->>'reservation_id')::uuid; present:=array_append(present,rid);
   label_value:=coalesce(p#>>array['_bridge','tables',b->>'table','label'],'Table '||(b->>'table'));
   select * into r from public.dipsy_reservations where reservation_id=rid for update;
   if r.reservation_id is null then
    insert into public.dipsy_reservations(reservation_id,visit_date,booking,table_label,deleted)
     values(rid,d::date,b,label_value,coalesce((b->>'deleted')::boolean,false));
   elsif r.booking is distinct from b or r.visit_date<>d::date or r.table_label<>label_value or r.deleted<>coalesce((b->>'deleted')::boolean,false) then
    update public.dipsy_reservations set visit_date=d::date,booking=b,table_label=label_value,deleted=coalesce((b->>'deleted')::boolean,false),version=version+1,updated_at=now() where reservation_id=rid;
   else continue;
   end if;
   select * into c from public.caisse_reservation_cases where reservation_id=rid;
   if c.reservation_id is not null then
    perform pg_advisory_xact_lock(hashtextextended(c.order_id::text,1));
    tid:=caisse_private.bridge_table(b->>'table',label_value);
    update public.caisse_clients set name=trim(b->>'name'),phone=coalesce(b->>'phone',''),version=version+1,updated_at=now() where id=c.client_id;
    update public.caisse_orders set table_id=tid,label=left(b->>'name',120),reservation_visit_date=d::date,version=version+1,updated_at=now() where id=c.order_id;
   end if;
  end loop;
 end loop;
 update public.dipsy_reservations set deleted=true,booking=booking||'{"deleted":true}',version=version+1,updated_at=now() where not(reservation_id=any(present)) and not deleted;
 update public.dipsy_tables_state set payload=p,version=version+1,updated_at=now() where id returning version into revision;
 return revision;
end $$;
revoke all on function caisse_private.bridge_write(jsonb) from public;

create function caisse_private.bridge_operation(op jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); opid uuid:=(op->>'id')::uuid; kind text:=op->>'kind'; existing public.dipsy_bridge_operations;
 s public.dipsy_tables_state; r public.dipsy_reservations; c public.caisse_reservation_cases;
 p jsonb:=op->'payload'; original jsonb; merged jsonb; result_value jsonb; d text; a jsonb; b jsonb;
 rid uuid; cid uuid; oid uuid; tid uuid; count_value integer:=0; new_version integer; new_booking jsonb; new_date text; old_date text;
begin
 if actor is null or not caisse_private.bridge_member() then raise exception 'BRIDGE_AUTH_REQUIRED' using errcode='42501'; end if;
 if kind='import' and caisse_private.my_role()<>'admin' then raise exception 'ADMIN_REQUIRED' using errcode='42501'; end if;
 if opid is null or kind is null or p is null then raise exception 'INVALID_OPERATION'; end if;
 if kind in ('import','save','correct') and (op->>'baseVersion' is null or (op->>'baseVersion')::integer<0) then raise exception 'INVALID_VERSION'; end if;
 perform pg_advisory_xact_lock(hashtextextended(opid::text,7));
 select * into existing from public.dipsy_bridge_operations where id=opid;
 if found then
  if existing.actor_id<>actor or existing.body<>op then raise exception 'IDEMPOTENCY_KEY_REUSED'; end if;
  return existing.result;
 end if;
 perform pg_advisory_xact_lock(914782731);
 select * into s from public.dipsy_tables_state where id for update;
 if kind in ('import','save') then
  if (op->>'baseVersion')::integer<>s.version then raise exception 'VERSION_CONFLICT'; end if;
  if kind='import' then
   if caisse_private.my_role()<>'admin' then raise exception 'ADMIN_REQUIRED' using errcode='42501'; end if;
   original:=caisse_private.bridge_normalize(p->'snapshot'); merged:=caisse_private.bridge_normalize(p->'merged');
   if exists(select 1 from public.dipsy_reservations deleted_res where deleted_res.deleted and not(coalesce(p->'revive_ids','[]') ? deleted_res.reservation_id::text)
    and exists(select 1 from jsonb_each(merged->'data') days cross join lateral jsonb_array_elements(days.value) entries where (entries.value->>'id')::uuid=deleted_res.reservation_id and not coalesce((entries.value->>'deleted')::boolean,false))) then raise exception 'MIGRATION_DELETED_CONFLICT'; end if;
   -- The merged snapshot must include every source UUID. Conflicting variants remain in the immutable original backup.
   for d,a in select key,value from jsonb_each(original->'data') union all select key,value from jsonb_each(s.payload->'data') loop
    for b in select value from jsonb_array_elements(a) loop
     if not exists(select 1 from jsonb_each(merged->'data') days cross join lateral jsonb_array_elements(days.value) entries where (entries.value->>'id')::uuid=(b->>'id')::uuid) then raise exception 'MIGRATION_RESERVATION_LOST'; end if;
    end loop;
   end loop;
   new_version:=caisse_private.bridge_write(merged);
   select coalesce(sum(jsonb_array_length(value)),0)::integer into count_value from jsonb_each(original->'data');
   insert into public.dipsy_tables_imports(id,actor_id,original_snapshot,reservation_count,target_version) values(opid,actor,p->'snapshot',count_value,new_version);
  else
   if s.version=0 then raise exception 'MIGRATION_REQUIRED'; end if;
   new_version:=caisse_private.bridge_write(p->'state');
  end if;
  result_value:=jsonb_build_object('version',new_version,'import_id',case when kind='import' then opid end,'count',count_value);
 elsif kind in ('open','correct') then
  rid:=(p->>'reservation_id')::uuid;
  select * into r from public.dipsy_reservations where reservation_id=rid for update;
  if r.reservation_id is null then raise exception 'RESERVATION_NOT_FOUND'; end if;
  if kind='correct' then
   if (op->>'baseVersion')::integer<>r.version then raise exception 'VERSION_CONFLICT'; end if;
   new_date:=p->>'visit_date';perform new_date::date; old_date:=r.visit_date::text;
   new_booking:=r.booking||jsonb_build_object('name',trim(p->>'name'),'phone',coalesce(p->>'phone',''),'table',p->>'table_ref');
   merged:=s.payload;
   a:=(select coalesce(jsonb_agg(value),'[]') from jsonb_array_elements(merged#>array['data',old_date]) where (value->>'id')::uuid<>rid);
   merged:=jsonb_set(merged,array['data',old_date],a);
   a:=coalesce(merged#>array['data',new_date],'[]')||jsonb_build_array(new_booking);
   merged:=jsonb_set(merged,array['data',new_date],a);
   new_version:=caisse_private.bridge_write(merged);
   select * into r from public.dipsy_reservations where reservation_id=rid;
  end if;
  select * into c from public.caisse_reservation_cases where reservation_id=rid;
  if c.reservation_id is null then
   if r.deleted then raise exception 'RESERVATION_DELETED'; end if;
   cid:=gen_random_uuid();oid:=gen_random_uuid();tid:=caisse_private.bridge_table(r.booking->>'table',r.table_label);
   insert into public.caisse_clients(id,name,phone,reservation_id) values(cid,trim(r.booking->>'name'),coalesce(r.booking->>'phone',''),rid);
   insert into public.caisse_orders(id,table_id,client_id,label,created_by,external_reservation_id,reservation_id,reservation_visit_date)
    values(oid,tid,cid,left(r.booking->>'name',120),actor,rid::text,rid,r.visit_date);
   insert into public.caisse_reservation_cases(reservation_id,client_id,order_id,created_by) values(rid,cid,oid,actor) returning * into c;
  end if;
  result_value:=jsonb_build_object('reservation',to_jsonb(r),'case',to_jsonb(c),'state_version',coalesce(new_version,s.version));
 else raise exception 'UNKNOWN_OPERATION'; end if;
 insert into public.dipsy_bridge_operations(id,actor_id,body,result) values(opid,actor,op,result_value);
 return result_value;
end $$;
revoke all on function caisse_private.bridge_operation(jsonb) from public,anon;
grant execute on function caisse_private.bridge_operation(jsonb) to authenticated;
create function public.dipsy_bridge_operation(op jsonb) returns jsonb language sql security invoker set search_path='' as $$ select caisse_private.bridge_operation(op) $$;
revoke all on function public.dipsy_bridge_operation(jsonb) from public,anon;
grant execute on function public.dipsy_bridge_operation(jsonb) to authenticated;
create function public.dipsy_tables_snapshot() returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('version',version,'payload',payload,'updated_at',updated_at,
 'tombstones',(select coalesce(jsonb_agg(jsonb_build_object('reservation_id',r.reservation_id,'visit_date',r.visit_date,'booking',r.booking)),'[]') from public.dipsy_reservations r where r.deleted))
 from public.dipsy_tables_state where id and (select caisse_private.bridge_member())
$$;
revoke all on function public.dipsy_tables_snapshot() from public,anon;
grant execute on function public.dipsy_tables_snapshot() to authenticated;

-- The old financial transaction is preserved, wrapped with bridge-specific authorization.
alter function caisse_private.apply_operation(jsonb) rename to apply_operation_base;
revoke all on function caisse_private.apply_operation_base(jsonb) from public,anon,authenticated;
create function caisse_private.apply_operation(op jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare kind text:=op->>'kind'; entity uuid:=(op->>'entityId')::uuid; o public.caisse_orders; p jsonb:=op->'payload';
begin
 if kind='correct_reservation' then return caisse_private.bridge_operation(op||jsonb_build_object('kind','correct')); end if;
 if exists(select 1 from public.caisse_operations where id=(op->>'id')::uuid) then return caisse_private.apply_operation_base(op); end if;
 if kind='save_client' and exists(select 1 from public.caisse_clients where id=entity and reservation_id is not null) then raise exception 'RESERVATION_USE_BRIDGE'; end if;
 if kind='save_table' and exists(select 1 from public.caisse_tables where id=entity and external_table_id like 'dipsy-tables:%') then raise exception 'RESERVATION_USE_BRIDGE'; end if;
 if kind in ('save_order','pay','cancel_order') then
  select * into o from public.caisse_orders where id=entity;
  if o.reservation_id is not null then
   if not caisse_private.bridge_member() then raise exception 'BRIDGE_AUTH_REQUIRED' using errcode='42501'; end if;
   if o.version<>(op->>'baseVersion')::integer then raise exception 'VERSION_CONFLICT'; end if;
   if kind='save_order' and (nullif(p->>'client_id','')::uuid is distinct from o.client_id or nullif(p->>'table_id','')::uuid is distinct from o.table_id or coalesce(p->>'label','')<>o.label) then raise exception 'RESERVATION_USE_BRIDGE'; end if;
  end if;
  if o.reservation_id is null and (exists(select 1 from public.caisse_clients where id=nullif(p->>'client_id','')::uuid and reservation_id is not null) or exists(select 1 from public.caisse_tables where id=nullif(p->>'table_id','')::uuid and external_table_id like 'dipsy-tables:%')) then raise exception 'RESERVATION_USE_BRIDGE'; end if;
 end if;
 return caisse_private.apply_operation_base(op);
end $$;
revoke all on function caisse_private.apply_operation(jsonb) from public;
grant execute on function caisse_private.apply_operation(jsonb) to anon,authenticated;
create or replace function public.caisse_apply_operation(op jsonb) returns jsonb language sql security invoker set search_path='' as $$ select caisse_private.apply_operation(op) $$;

-- RLS-gated changes reach authenticated devices; anonymous readers receive no linked rows.
alter publication supabase_realtime add table public.dipsy_reservations,public.dipsy_tables_state,public.caisse_reservation_cases;

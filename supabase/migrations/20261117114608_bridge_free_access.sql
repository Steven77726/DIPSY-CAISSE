-- Owner-requested free access, independently switchable; no anonymous direct writes.
alter table public.caisse_runtime add column bridge_public_access boolean not null default false;
create function caisse_private.bridge_public() returns boolean language sql stable security definer set search_path='' as $$
 select coalesce((select public_access and bridge_public_access from public.caisse_runtime where id),false)
$$;
revoke all on function caisse_private.bridge_public() from public;
grant execute on function caisse_private.bridge_public() to anon,authenticated;
create function public.dipsy_bridge_public_access() returns boolean language sql stable security invoker set search_path='' as $$select caisse_private.bridge_public()$$;
revoke all on function public.dipsy_bridge_public_access() from public;
grant execute on function public.dipsy_bridge_public_access() to anon,authenticated;
create or replace function caisse_private.bridge_member() returns boolean language sql stable security definer set search_path='' as $$
 select (auth.uid() is not null and caisse_private.my_role() is not null)
 or (auth.uid() is null and caisse_private.public_actor() is not null and caisse_private.bridge_public())
$$;
do $$ declare t text; begin
 foreach t in array array['dipsy_tables_state','dipsy_reservations','dipsy_tables_imports','dipsy_bridge_operations','caisse_reservation_cases'] loop
  execute format('grant select on public.%I to anon',t);
  execute format('alter policy bridge_read on public.%I to anon,authenticated',t);
 end loop;
end $$;
create or replace function caisse_private.bridge_operation(op jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=coalesce(auth.uid(),caisse_private.public_actor()); opid uuid:=(op->>'id')::uuid; kind text:=op->>'kind'; existing public.dipsy_bridge_operations;
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

grant execute on function caisse_private.bridge_operation(jsonb) to anon;
grant execute on function public.dipsy_bridge_operation(jsonb),public.dipsy_tables_snapshot() to anon;

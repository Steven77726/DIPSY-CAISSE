-- Removing a square never deletes a table, order, payment, line or journal entry.
-- Archived labels can be reused for a new table without changing old receipts.
alter table public.caisse_tables drop constraint caisse_tables_label_key;
create unique index caisse_tables_label_key on public.caisse_tables(label) where active;

create function caisse_private.table_visibility_operation(op jsonb) returns jsonb
 language plpgsql security definer set search_path='' as $$
declare
 actor uuid:=coalesce(auth.uid(),caisse_private.public_actor());
 opid uuid:=(op->>'id')::uuid; kind text:=op->>'kind'; entity uuid:=(op->>'entityId')::uuid;
 p jsonb:=op->'payload'; expected integer:=(op->>'baseVersion')::integer;
 existing public.caisse_operations; t public.caisse_tables; changed public.caisse_tables;
 s public.caisse_table_sessions; o public.caisse_orders; result_value jsonb; before_value jsonb;
 tid uuid;
begin
 if actor is null or caisse_private.my_role() is null then raise exception 'ACCESS_DENIED' using errcode='42501'; end if;
 if opid is null or entity is null or kind is null or p is null then raise exception 'INVALID_OPERATION'; end if;
 perform pg_advisory_xact_lock(hashtextextended(opid::text,0));
 select * into existing from public.caisse_operations where id=opid;
 if found then
  if existing.actor_id<>actor or existing.body<>op then raise exception 'IDEMPOTENCY_KEY_REUSED'; end if;
  return existing.result;
 end if;
 if kind='release_table' then
  select table_id into tid from public.caisse_table_sessions where id=entity;
 else tid:=entity; end if;
 if tid is null then raise exception 'TABLE_SESSION_NOT_FOUND'; end if;
 perform pg_advisory_xact_lock(hashtextextended(tid::text,9));
 select * into t from public.caisse_tables where id=tid for update;
 if kind='save_table' then
  if t.active and p->>'active'='false' then raise exception 'TABLE_USE_REMOVE_ACTION'; end if;
  return caisse_private.apply_operation(op);
 end if;
 if t.id is null then raise exception 'TABLE_NOT_FOUND'; end if;
 if coalesce(t.external_table_id,'') like 'dipsy-tables:%' then raise exception 'INDEPENDENT_TABLE_REQUIRED'; end if;
 if kind='release_table' then
  -- The existing release validates payment and versions and writes its journal.
  result_value:=caisse_private.apply_operation(op);
  update public.caisse_tables set active=false,version=version+1,updated_at=now() where id=tid returning * into changed;
  result_value:=result_value||jsonb_build_object('table_id',tid,'table_version',changed.version);
  update public.caisse_operations set result=result_value where id=opid;
  update public.caisse_events set before_state=before_state||jsonb_build_object('table',to_jsonb(t)),
   after_state=after_state||jsonb_build_object('table',to_jsonb(changed)) where operation_id=opid;
  return result_value;
 end if;
 if kind<>'archive_table' then raise exception 'INVALID_OPERATION'; end if;
 if caisse_private.my_role()<>'admin' then raise exception 'ADMIN_REQUIRED' using errcode='42501'; end if;
 if lower(trim(coalesce(p->>'confirmation','')))<>'supprimer' then raise exception 'TABLE_CONFIRMATION_REQUIRED'; end if;
 if not t.active then raise exception 'TABLE_ALREADY_REMOVED'; end if;
 if expected is distinct from t.version then raise exception 'VERSION_CONFLICT'; end if;
 select * into s from public.caisse_table_sessions where table_id=tid and released_at is null;
 if s.id is not null then
  perform pg_advisory_xact_lock(hashtextextended(s.order_id::text,1));
  select * into s from public.caisse_table_sessions where id=s.id for update;
  select * into o from public.caisse_orders where id=s.order_id for update;
 end if;
 if nullif(p->>'session_id','')::uuid is distinct from s.id
  or (p->>'session_version')::integer is distinct from s.version
  or nullif(p->>'order_id','')::uuid is distinct from o.id
  or (p->>'order_version')::integer is distinct from o.version then raise exception 'VERSION_CONFLICT'; end if;
 before_value:=jsonb_build_object('table',to_jsonb(t),'session',case when s.id is not null then to_jsonb(s) end,'order',case when o.id is not null then to_jsonb(o) end);
 if s.id is not null then
  update public.caisse_table_sessions set released_at=now(),version=version+1,updated_at=now() where id=s.id returning * into s;
 end if;
 update public.caisse_tables set active=false,version=version+1,updated_at=now() where id=tid returning * into changed;
 result_value:=jsonb_build_object('id',tid,'version',changed.version);
 insert into public.caisse_operations(id,actor_id,body,result) values(opid,actor,op,result_value);
 insert into public.caisse_events(operation_id,order_id,actor_id,kind,before_state,after_state)
  values(opid,o.id,actor,kind,before_value,jsonb_build_object('table',to_jsonb(changed),'session',case when s.id is not null then to_jsonb(s) end,'order',case when o.id is not null then to_jsonb(o) end));
 return result_value;
end $$;
revoke all on function caisse_private.table_visibility_operation(jsonb) from public;
grant execute on function caisse_private.table_visibility_operation(jsonb) to anon,authenticated;

create or replace function public.caisse_apply_operation(op jsonb) returns jsonb
 language sql security invoker set search_path='' as $$
 select case when op->>'kind'='reorder_products' then caisse_private.reorder_products(op)
  when op->>'kind' in ('release_table','archive_table','save_table') then caisse_private.table_visibility_operation(op)
  else caisse_private.apply_operation(op) end
$$;

-- Previously released, fully paid services disappear too; cancellations stay unchanged.
update public.caisse_tables t set active=false,version=version+1,updated_at=now()
 where t.active and coalesce(t.external_table_id,'') not like 'dipsy-tables:%'
 and not exists(select 1 from public.caisse_table_sessions s where s.table_id=t.id and s.released_at is null)
 and exists(select 1 from public.caisse_table_sessions s join public.caisse_orders o on o.id=s.order_id
  where s.table_id=t.id and s.released_at is not null and o.status='paid'
  and not exists(select 1 from public.caisse_table_sessions newer where newer.table_id=t.id and newer.created_at>s.created_at));

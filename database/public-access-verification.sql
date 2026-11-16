-- Real anonymous-role transaction, entirely rolled back. Run as the database owner.
begin;
set local role anon;
select set_config('request.jwt.claim.sub','',true);
select set_config('request.jwt.claims','{}',true);
do $test$
declare product uuid:=gen_random_uuid(); ticket uuid:=gen_random_uuid(); line_id uuid:=gen_random_uuid(); pay_key uuid:=gen_random_uuid(); body jsonb; n integer;
begin
 if not public.caisse_public_access() or auth.uid() is not null then raise exception 'FAILED_PUBLIC_MODE'; end if;
 if (select count(*) from public.caisse_access)<>0 then raise exception 'FAILED_MEMBERSHIP_EXPOSED'; end if;
 perform public.caisse_apply_operation(jsonb_build_object('id',gen_random_uuid(),'kind','save_product','entityId',product,'baseVersion',0,'payload',jsonb_build_object('name','__TEST_ROLLBACK','category','plats','price_cents',1100,'vat_bps',1000,'accounting_group','food')));
 perform public.caisse_apply_operation(jsonb_build_object('id',gen_random_uuid(),'kind','save_order','entityId',ticket,'baseVersion',0,'payload',jsonb_build_object('status','due','lines',jsonb_build_array(jsonb_build_object('id',line_id,'product_id',product,'quantity',2)))));
 body:=jsonb_build_object('id',pay_key,'kind','pay','entityId',ticket,'baseVersion',1,'payload',jsonb_build_object('payments',jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'method','cash','amount_cents',700),jsonb_build_object('id',gen_random_uuid(),'method','card','amount_cents',300))));
 perform public.caisse_apply_operation(body);
 perform public.caisse_apply_operation(body);
 select sum(amount_cents) into n from public.caisse_payments where order_id=ticket;
 if n<>1000 then raise exception 'FAILED_DUPLICATE_PAYMENT'; end if;
 begin
  perform public.caisse_apply_operation(jsonb_set(body,'{id}',to_jsonb(gen_random_uuid())));
  raise exception 'FAILED_CONCURRENT_WRITE_ACCEPTED';
 exception when raise_exception then if sqlerrm<>'VERSION_CONFLICT' then raise; end if;
 end;
 begin
  perform public.caisse_apply_operation(jsonb_build_object('id',gen_random_uuid(),'kind','pay','entityId',ticket,'baseVersion',2,'payload',jsonb_build_object('payments',jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'method','card','amount_cents',1201)))));
  raise exception 'FAILED_OVERPAYMENT_ACCEPTED';
 exception when raise_exception then if sqlerrm<>'PAYMENT_EXCEEDS_BALANCE' then raise; end if;
 end;
 if public.caisse_snapshot() is null then raise exception 'FAILED_SNAPSHOT'; end if;
 if (select net_cents from public.caisse_order_lines where id=line_id)<>2000 then raise exception 'FAILED_VAT'; end if;
 if has_table_privilege(current_user,'public.caisse_payments','INSERT') then raise exception 'FAILED_DIRECT_WRITE_ALLOWED'; end if;
 if has_table_privilege(current_user,'public.caisse_runtime','UPDATE') then raise exception 'FAILED_RUNTIME_WRITE_ALLOWED'; end if;
end $test$;
rollback;
select 'PASS — public access, anonymous order and mixed payment, replay, conflict, overpayment, VAT and snapshot; all fixtures rolled back' as verification;

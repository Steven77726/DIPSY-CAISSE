-- Read-only checks against the real project. No business data is created.
select jsonb_build_object(
 'tables', (select jsonb_agg(jsonb_build_object('name',c.relname,'rls',c.relrowsecurity)) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname like 'caisse_%' and c.relkind='r'),
 'realtime_tables', (select jsonb_agg(tablename) from pg_publication_tables where pubname='supabase_realtime' and tablename like 'caisse_%'),
 'anonymous_table_write', has_table_privilege('anon','public.caisse_payments','INSERT'),
 'staff_direct_payment_write', has_table_privilege('authenticated','public.caisse_payments','INSERT'),
 'anonymous_rpc', has_function_privilege('anon','public.caisse_apply_operation(jsonb)','EXECUTE'),
 'initial_admin_count', (select count(*) from public.caisse_access where role='admin' and active)
);

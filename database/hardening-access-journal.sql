alter policy caisse_read on public.caisse_operations to authenticated using ((select caisse_private.my_role())='admin');
alter policy caisse_read on public.caisse_events to authenticated using ((select caisse_private.my_role())='admin' or ((select caisse_private.my_role()) is not null and kind<>'save_access'));

-- The runtime must not modify the migration ledger.
REVOKE ALL ON schema_migrations FROM schiild_app;

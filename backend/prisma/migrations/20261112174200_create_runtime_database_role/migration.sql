CREATE ROLE balancevault_runtime NOLOGIN;

GRANT USAGE ON SCHEMA public TO balancevault_runtime;

GRANT SELECT, INSERT, UPDATE
ON TABLE "User", "Account"
TO balancevault_runtime;

GRANT SELECT, INSERT
ON TABLE "LedgerEntry", "AuditLog"
TO balancevault_runtime;

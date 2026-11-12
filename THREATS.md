# BalanceVault threat notes

## Scope and limits

This is a demo ledger, not a financial service. Treat every account and amount as synthetic. The controls below are application protections, not a claim of regulatory or production certification.

## Assets and trust boundaries

- Password hashes, signed-in identities, role/status values, account ownership, balances, ledger rows, and audit events.
- Browser input is untrusted. The API revalidates identity, permissions, ownership, account state, and amount format on every protected operation.
- PostgreSQL is the source of truth. Redis is required in production for shared authentication rate-limit counters.
- The frontend is a convenience layer only; hiding a button does not grant or deny permission.

## Threats, controls, and regression checks

| Threat | Control | Test/evidence |
| --- | --- | --- |
| Anonymous caller invokes a protected account endpoint | Bearer JWT required; signature and expiry verified; active account loaded from the database | `backend/test/api.test.js`: unauthenticated account request returns 401 |
| Account holder invokes administrator endpoints | Role is loaded from the database for every request, then checked by `adminOnly`; a token claim alone is not trusted | `backend/test/api.test.js`: account-holder request returns 403 |
| User reads another user's ledger by changing an account ID | Ledger lookup scopes account ID and authenticated owner ID in the same query | `backend/test/api.test.js`: missing owned account returns 404 without querying ledger entries |
| Transfer overdraft or races with another debit | Integer minor units, conditional `balance >= amount` update, serializable transaction, and no success ledger/audit writes on insufficient funds | `backend/test/api.test.js`: insufficient-funds transfer returns 409 and ledger/audit writes are not reached |
| Transfer writes only one side or an incomplete audit event | Debit, credit, paired ledger entries, and audit event share one database transaction | `backend/routes/accounts.js`: transfer transaction |
| Runtime service credential tampers with ledger or audit history | Runtime login inherits a non-login role that has no update/delete permission on ledger or audit tables | `backend/prisma/migrations/20261112174200_create_runtime_database_role/migration.sql`; PostgreSQL integration test |
| Invalid negative balance or zero/negative ledger amount is stored | Database check constraints enforce nonnegative balances and positive ledger amounts | `backend/prisma/migrations/20261112173800_enforce_ledger_invariants/migration.sql`; PostgreSQL integration test verifies constraint violations |
| Admin or suspended/frozen account bypasses account controls | Database role/status checked on each request; transfers require both accounts and the recipient user to be active | `backend/test/api.test.js`: suspended destination cannot be credited; `backend/middleware/authMiddleware.js`, `backend/routes/accounts.js` |
| Brute-force login or registration abuse | Authentication endpoints rate-limited; production requires Redis-backed shared counters | `backend/middleware/rateLimit.js`; test Redis connectivity through `/ready` |
| Cross-site frontend calls or oversized JSON payload | Production CORS allowlist, 10 KB JSON limit, and one trusted reverse-proxy hop | `backend/server.js` configuration |
| Secrets committed in source control | `.env` excluded by ignore files; deployment secrets are supplied as private environment values | `backend/.gitignore`, `.gitignore`, `render.yaml` |
| Privileged action lacks accountability | Registration, login, approval, suspension, account opening, transfer, and admin adjustment create audit records; ledger changes have references | `backend/routes/auth.js`, `backend/routes/admin.js`, `backend/routes/accounts.js` |

## Residual risks to verify before any real deployment

- The challenge statement supplied for this project is high-level and does not enumerate individual functional acceptance checks.
- The public frontend responds, but its configured API host returned HTTP 403 and the host in `render.yaml` returned HTTP 404 on 2026-11-12; a full browser end-to-end session has not been verified.
- The database runtime and migration roles are configured and locally verified; deployment still requires supplying both corresponding connection strings to Render.
- Production database migrations, Redis service behavior, and administrator bootstrap have not been verified against the live deployment.
- This demo has no transfer idempotency key, fraud controls, user-driven recovery, or independent tamper-evident audit storage. Repeated client submissions may create multiple valid transfers.
- The API does not model currency conversion, fees, limits, dispute handling, or regulatory requirements.
- Run the complete tests against a disposable PostgreSQL database and test deployment behavior before inviting external users.

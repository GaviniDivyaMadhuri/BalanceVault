# BalanceVault

BalanceVault is a demonstration account-management app built with React, Express, Prisma, and PostgreSQL. It models account onboarding, authenticated transfers, a paired ledger, and administrator audit operations. It is not a banking product and must only be used with synthetic data.

## What is implemented

- Account-holder registration with password hashing, login, one-hour JWTs, and pending-account login denial.
- Database-backed role and account-status checks on protected API requests.
- Admin review of account holders, approval/suspension, account listing, account adjustments, and recent audit events.
- Account opening for signed-in users and automatic initial account creation when an administrator approves a new account holder.
- Transfers between active accounts. The source debit, destination credit, two ledger entries, and audit event are committed in one serializable database transaction. Balances are stored in integer paise; API amounts are decimal INR strings with no floating-point arithmetic.
- A Redis-backed authentication rate limit when `REDIS_URL` is configured. Production startup requires Redis; development can use the process-local limiter.
- Production CORS allowlisting and one-hop reverse-proxy configuration for accurate client IP rate limiting.
- Liveness (`/health`) and dependency readiness (`/ready`) endpoints.

The supplied challenge statement describes the project at a high level and gives a six-step work plan; it does not list ten separate functional acceptance criteria. This README describes what is implemented in this repository and distinguishes code-level checks from live-service verification.

Database migrations create `balancevault_runtime` as a non-login role. The API connection should use a dedicated login granted membership in that role; it can read/insert/update users and accounts and read/insert ledger and audit rows, but cannot update/delete ledger or audit history. `MIGRATION_DATABASE_URL` must use a separate owner/migration login. The runtime login itself is provisioned outside Prisma migrations because login credentials are secrets.

See [THREATS.md](./THREATS.md) for the threat model, controls, test mapping, and residual risks.

## Requirements

- Node.js 20 or newer
- PostgreSQL with separate runtime and migration connections
- Redis for production deployments

## Local setup

1. Copy `backend/.env.example` to `backend/.env`. Set `DATABASE_URL` to the least-privileged runtime login and `MIGRATION_DATABASE_URL` to the migration/owner connection. Set a long random `JWT_SECRET`. For local development, Redis can be omitted; add `REDIS_URL` to use Redis locally.
2. Install dependencies:

   ```sh
   npm --prefix backend ci
   npm --prefix frontend ci
   ```

3. Generate the Prisma client, apply migrations with the owner connection, and provision a dedicated runtime login:

   ```sh
   npm run db:generate
   npm run db:migrate
   npm --prefix backend run db:provision-runtime
   ```

The provisioning command creates a random runtime password and stores the resulting runtime `DATABASE_URL` and owner `MIGRATION_DATABASE_URL` in the ignored `backend/.env`. It refuses to rotate an existing runtime role. Never commit or share this file. For deployment, configure both URLs as separate private environment variables.

### Resetting a forgotten administrator password

There is no public password-reset endpoint. To reset the existing administrator locally, set `ADMIN_RESET_EMAIL` (or use the existing `ADMIN_BOOTSTRAP_EMAIL`) in the ignored `backend/.env`, then run `npm run admin:reset-password` from the repository root in an interactive terminal. The command verifies that the target is an active administrator, requires an explicit `RESET` confirmation, prompts for a new password without echoing it, and records an audit event. It uses the configured local `DATABASE_URL`; do not run it against a database unless you are authorized to administer that database. Never share `.env` or the new password.

4. Start the API and frontend in separate terminals:

   ```sh
   npm --prefix backend run dev
   npm --prefix frontend run dev
   ```

The frontend uses `http://localhost:5000` by default. Set `VITE_API_URL` in the frontend build environment when the API is elsewhere.

## First administrator

1. Register the administrator's email through the app.
2. Set `ADMIN_BOOTSTRAP_EMAIL` to that exact email in the backend environment.
3. Run `npm --prefix backend run bootstrap-admin` once. The command refuses to proceed if an administrator already exists and records its action in the audit log.

Do not expose bootstrap credentials or database URLs in source control. The repository ignores `.env` files; use the example file only as a template.

## API

| Method | Path | Access | Purpose |
| --- | --- | --- | --- |
| `POST` | `/api/auth/register` | Public, rate-limited | Register a pending account holder |
| `POST` | `/api/auth/login` | Public, rate-limited | Sign in and receive a bearer token |
| `GET` | `/api/accounts` | Active user | List owned accounts |
| `POST` | `/api/accounts` | Active user | Open an account |
| `GET` | `/api/accounts/:id/ledger` | Account owner | Read up to 100 newest entries |
| `POST` | `/api/accounts/:id/transfers` | Account owner | Transfer to another active account |
| `GET` | `/api/admin/users` | Admin | List account holders |
| `PATCH` | `/api/admin/users/:id/approve` | Admin | Approve a pending user and open an account |
| `PATCH` | `/api/admin/users/:id/suspend` | Admin | Suspend an active user |
| `GET` | `/api/admin/accounts` | Admin | List accounts and balances |
| `POST` | `/api/admin/accounts/:id/adjustments` | Admin | Record a credit or debit with a reason |
| `GET` | `/api/admin/audit-logs` | Admin | Read the latest 100 audit events |

Send money as a string, such as `{ "amount": "12.50" }`; the server rejects numeric JSON amounts, negative amounts, more than two decimal places, and overdrafts. Protected requests use `Authorization: Bearer <token>`.

## Verification

```sh
npm test
npm run lint
npm run build
```

The backend tests include exact decimal conversion, unauthenticated access denial, account-holder/admin separation, owner-only ledger access, and rejection of an overdraft before ledger or success-audit writes. Tests use Node's built-in runner and do not require a live database.

The PostgreSQL integration test uses a transaction that is intentionally rolled back and checks that no fixture user remains. Run it explicitly against the configured database with `DATABASE_INTEGRATION_TESTS=1 npm --prefix backend run test:db`.

## Deployment status

The current public frontend is [balancevault-frontend-v2.onrender.com](https://balancevault-frontend-v2.onrender.com); it loaded and displayed “API Connected” on 2026-11-12. The API is [balancevault-api-v2.onrender.com](https://balancevault-api-v2.onrender.com); `/health` and `/ready` returned HTTP 200, and a CORS preflight from the frontend returned HTTP 204. The first API deployment built and migrated successfully but exited because the Redis rate-limit store sent its initial commands before the Redis client connected. The startup path was corrected and the new revision deployed.

The previous `balancevault-frontend.onrender.com` service was not present in the Render workspace used for the API. A new free static site was deployed instead, configured with `VITE_API_URL=https://balancevault-api-v2.onrender.com`. The UI's API health connection is verified; registration, login, account, transfer, and admin workflows still need end-to-end verification with a test account.

## Render deployment configuration

`render.yaml` describes the frontend static site and API service. In Render, configure the runtime `DATABASE_URL`, privileged `MIGRATION_DATABASE_URL`, and Redis URL as private environment values; the blueprint deliberately does not contain credentials or provision paid infrastructure. Set a generated `JWT_SECRET`, and verify `/ready` returns HTTP 200 after migration deployment. The API service's build command generates Prisma Client; its start command applies migrations with the migration connection and starts the server with the runtime connection.

If Render assigns a different frontend hostname, update `FRONTEND_ORIGIN` to that exact origin. The first admin must be bootstrapped from an authorized deployment shell after an account is registered.

The source is pushed to [GaviniDivyaMadhuri/BalanceVault](https://github.com/GaviniDivyaMadhuri/BalanceVault). The repository is public; the challenge instructions provided earlier recommended keeping it private until the deadline.

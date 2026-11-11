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

The challenge's ten detailed acceptance criteria were not available from the public page during this work. The logged-in problem statement redirected to the challenge login page, so this README describes only the functionality present in this repository; confirm it against the official criteria before submission.

See [THREATS.md](./THREATS.md) for the threat model, controls, test mapping, and residual risks.

## Requirements

- Node.js 20 or newer
- PostgreSQL
- Redis for production deployments

## Local setup

1. Copy `backend/.env.example` to `backend/.env` and set `DATABASE_URL` and a long random `JWT_SECRET`. For local development, Redis can be omitted. Add `REDIS_URL` to use Redis locally.
2. Install dependencies:

   ```sh
   npm --prefix backend ci
   npm --prefix frontend ci
   ```

3. Generate the Prisma client and apply migrations to your development database:

   ```sh
   npm run db:generate
   npm run db:migrate
   ```

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

## Render deployment

`render.yaml` describes the frontend static site and API service. In Render, configure the external PostgreSQL connection string and Redis URL as private environment values; the blueprint deliberately does not contain credentials or provision paid infrastructure. Set a generated `JWT_SECRET`, and verify `/ready` returns HTTP 200 after migration deployment. The API service's build command generates Prisma Client; its start command applies migrations and starts the server.

If Render assigns a different frontend hostname, update `FRONTEND_ORIGIN` to that exact origin. The first admin must be bootstrapped from an authorized deployment shell after an account is registered.

The source is committed locally, but no GitHub repository or Render account has been connected in this environment. No remote repository or live deployment URL has been created.

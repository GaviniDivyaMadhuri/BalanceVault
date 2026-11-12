# AI Development Log

## Entry 1 — 2026-11-11: Initial application setup

**Prompt used:**
Help me create a React frontend and Node.js Express backend for BalanceVault and connect them through a health-check API.

**AI-generated output:**
- React application created using Vite.
- Express backend with `/` and `/health` endpoints.
- Frontend fetch request to check backend connectivity.

**What needed improvement:**
The initial implementation only verified server connectivity. It did not implement authentication, account management, authorization, or ledger functionality.

**What I did:**
Created the frontend and backend, replaced the Vite starter screen, started both servers, and verified that the frontend displayed the backend connection as Connected.

**Commit:** `1c99969`

## Entry 2 — 2026-11-11: Adding authentication and admin onboarding

**Prompt used:**
Continue beyond the health-check starter by implementing the BalanceVault account-holder registration/login and administrator onboarding flow.

**AI-generated output:**
- Added password hashing, bearer-token authentication, database-backed roles, registration audit events, admin approval/suspension routes, and first-admin CLI bootstrap.

**What needed improvement:**
- The first implementation needed verification that account status and roles come from the database, and that approval itself provisions the account rather than only changing a status field.

**What I did:**
- Inspected the middleware and route behavior, expanded approval to create an account in the same transaction, limited the admin user list to account holders, and added regression tests for admin authorization.

**Commit:** `c11c201` — authenticated ledger and account workflows (local commit; GitHub remote not created yet).

## Entry 3 — 2026-11-11: Checking authorization and transfer integrity

**Prompt used:**
Review the finance workflows for the user-data boundary and make transfers safe to audit.

**AI-generated output:**
- Added integer-paise amount handling, account-owner checks, conditional debits, serializable transfer transactions, paired entries sharing a reference, audit events, and rate-limited auth endpoints.

**What needed improvement:**
- Early tests had a mismatched Prisma proxy mock and an incorrect expected error class for zero amounts; a destination-user status check was also needed so an active account owned by a suspended user could not receive funds.

**What I did:**
- Corrected the test stubs and assertions; added explicit regression coverage for suspended recipients, overdrafts, admin denial, cross-account ledger access, rate limiting, and paired ledger/audit writes.

**Commit:** `c11c201` — backend workflow and authorization tests (local commit; GitHub remote not created yet).

## Entry 4 — 2026-11-11: Building the account-holder and admin dashboard

**Prompt used:**
Replace the connectivity-only page with usable registration, account, transfer, administrator, and audit views connected to the API.

**AI-generated output:**
- Built a responsive React interface for account holders and administrators with transfer and audit screens.

**What needed improvement:**
- The starter stylesheet was still imposing Vite layout constraints and form interactions needed clear pending/error states and fresh server-owned data after operations.

**What I did:**
- Replaced the starter global styles, made error/status messaging accessible, added refresh behavior, and connected the UI to the authenticated API actions.

**Commit:** `88e045a` — account and admin dashboard (local commit; GitHub remote not created yet).

## Entry 5 — 2026-11-11: Preparing threat and deployment documentation

**Prompt used:**
Document only behavior that exists, add threat thinking tied to test evidence, and prepare a deployment definition without exposing credentials.

**AI-generated output:**
- Prepared a threat model, Render Blueprint, API/setup documentation, and AI-development notes.

**What needed improvement:**
- At this point, the challenge statement had not been supplied in the conversation. GitHub sign-in and Render account access were also unavailable.

**What I did:**
- Prepared a blueprint with secrets unset and documented which deployment actions remained unverified.

**Commit:** `66d4eba` — threat model, deployment blueprint, and setup docs.

## Entry 6 — 2026-11-12: Correcting scope and checking the live frontend/API

**Prompt used:**
Use the challenge statement that was provided to determine whether the six stated work areas are actually complete, and don't assume there are ten hidden requirements.

**What the AI produced:**
- Compared the submitted six-step work plan against the repository and public deployment endpoints.
- Confirmed the repository is pushed and the frontend serves, but found the frontend's configured API host returns HTTP 503 and differs from the host in `render.yaml`.

**What needed improvement:**
- Previous README/threat notes incorrectly described ten inaccessible criteria and claimed no deployment existed. The submission draft also mentions separate PostgreSQL roles that are not configured in this repository.

**What I did:**
- Corrected the docs to distinguish implemented code from verified live behavior, document the API-host mismatch and 503, and state clearly that database role separation is not implemented here.

**Commit:** `071cc14` - database and documentation hardening.

## Entry 7 - 2026-11-12: Enforcing database invariants and runtime least privilege

**Prompt used:**
Complete the database work without starting deployment. Enforce ledger invariants in PostgreSQL, separate the API runtime role from the migration owner, and verify database constraints, ledger transactions, and audit writes without leaving test data.

**AI-generated output:**
- Added database constraints for nonnegative balances and positive ledger amounts, an account-owner index, a non-login runtime privilege role, and a provisioning script for a dedicated runtime login.
- Added an opt-in PostgreSQL integration test that checks rejected invalid values, a balanced ledger transfer, an audit event, and transaction rollback.

**What needed improvement:**
- The first integration test verified safe conditional overdraft handling, but did not directly exercise PostgreSQL's check constraints. A successful application-level guard alone would not prove the database rejects invalid values.
- The threat model still described database role separation as unimplemented after the role setup was added.

**What I did:**
- Added savepoint-isolated negative-balance and zero-ledger-amount attempts and asserted PostgreSQL's check-violation error, then continued the transaction test and verified rollback left no fixture user.
- Provisioned a random-password runtime login locally without printing or committing its credential, verified it can run the integration test, corrected the threat model, and confirmed all migrations are applied.

**Verification:** `npm test` passed (12 passed; opt-in database test skipped by default), `DATABASE_INTEGRATION_TESTS=1 npm --prefix backend run test:db` passed against PostgreSQL, frontend lint/build passed, Prisma validation passed, and migration status reported up to date. The live Render API remains unavailable and deployment is intentionally not part of this work.

**Commit:** `071cc14` - database hardening, integration coverage, and documentation.

**Deployment status recheck (2026-11-12):** The public frontend returned HTTP 200. Its configured API host returned HTTP 403 at `/health`, while the API hostname in `render.yaml` returned HTTP 404 at `/health` and `/ready`. No deployment changes were made.

## Entry 8 - 2026-11-12: Deploying the API on Render's free tier

**Prompt used:**
Use my Render account to complete the API deployment, but avoid paid compute and do not share database credentials in chat.

**AI-generated output:**
- Created a free Singapore Render Key Value instance for the API's Redis-compatible rate limiter and prepared a free API web service from the public GitHub repository.
- The first deployment failed during the npm build step before the API started.

**What needed improvement:**
- The configured `npm ci` build command failed in Render and emitted npm usage output. The same lockfile-backed `npm ci --dry-run` passed locally, so the remote failure was not fully explained by the available logs.

**What I did:**
- Confirmed the API service is on the $0/month plan, the runtime and migration database environment variables remain secret, and the Redis-compatible service is available. I am changing the blueprint install command to a lockfile-aware `npm install` fallback and will verify the next Render build before reporting the API as deployed.

**Commit:** `ff8e2e3` — Render build command fallback.

## Entry 9 - 2026-11-12: Fixing Redis rate-limit startup

**Prompt used:**
Investigate why the next Render deployment failed after the build and database migrations succeeded, then fix and verify the startup failure without exposing credentials.

**AI-generated output:**
- Read the Render runtime logs and traced the `ClientClosedError` to the Redis-backed rate-limit store issuing its initial script-load commands before the Redis client connected.

**What needed improvement:**
- The Redis client was connected only later in `startServer()`, after the rate-limit store constructor had already sent commands. This ordering caused the deployed process to exit before listening for requests.

**What I did:**
- Made Redis command dispatch await one shared connection attempt, so both the rate-limit store initialization and API startup wait for the client before sending commands.
- Ran the backend test suite; all 12 active tests passed and the opt-in PostgreSQL integration test remained skipped by default. Deployed the fix and verified that `/health` and `/ready` both returned HTTP 200.

**Commit:** `1f56978` — Redis rate-limit startup fix.

## Entry 10 - 2026-11-12: Deploying a frontend against the live API

**Prompt used:**
After the API is live, connect and deploy a public frontend that uses its actual API URL, while keeping the deployment on the free tier.

**AI-generated output:**
- Created a free Render static site from the public repository, configured its frontend root/build/publish settings and `VITE_API_URL`, and allowed its origin in the API CORS configuration.

**What needed improvement:**
- The earlier frontend service was not present in the accessible Render workspace, so its environment could not be updated. A new static site with its own URL was needed.

**What I did:**
- Deployed `balancevault-frontend-v2`, configured the API to allow both the previous frontend origin and the new one, and verified the new page displays “API Connected.” Also checked API `/health` and `/ready` (HTTP 200) and the new frontend's CORS preflight (HTTP 204). Account and ledger workflows remain unverified end to end.

**Commit:** `832ffbf` — API deployment URL configuration; the frontend was built from this repository revision.

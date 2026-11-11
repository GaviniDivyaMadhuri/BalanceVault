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
- The authenticated problem-statement content, GitHub sign-in, and Render account access are unavailable in this environment, so neither the ten official criteria nor a live deployment can be verified.

**What I did:**
- Marked those limitations explicitly rather than inventing acceptance criteria or claiming deployment success. Kept deployment credentials as unset environment variables and the repository unpublished.

**Commit:** `66d4eba` — threat model, deployment blueprint, and setup docs (local commit; GitHub remote not created yet).
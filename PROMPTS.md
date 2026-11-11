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
# نظام إدارة المستفيدين والدعم المالي (Church Welfare System)

React + Vite + TypeScript + Tailwind (RTL) / Express + TypeScript + Mongoose (MongoDB Atlas). The API is one serverless function (`api/index.ts`) so it deploys on Vercel with no standing server.

## Structure
- `src/` frontend: `pages`, `components`, `layouts`, `hooks`, `lib` (api client, formatting, export)
- `server/` backend: `models`, `modules` (routes + services), `middleware`, `lib`, `scripts`, `tests`
- `api/index.ts` Vercel entry, `vercel.json` routing

## Run locally (no Atlas needed)
```
npm install
cp .env.example .env     # set JWT_SECRET, ADMIN_PASSWORD, USE_MEMORY_DB=1
SEED_DEMO=1 npm run dev:server   # in-memory MongoDB + admin + demo data
npm run dev:client               # http://localhost:5173
npm test                         # financial logic + full API flow
```
Quote values containing `#` in `.env`.

## Deploy (Vercel + MongoDB Atlas free)
1. Atlas: create a free M0 cluster, a database user, allow network access `0.0.0.0/0`, copy the connection string.
2. Vercel: import the repo, set env vars `MONGODB_URI`, `JWT_SECRET` (32+ random chars), `ADMIN_USERNAME`, `ADMIN_PASSWORD`.
3. Create the first admin once: `MONGODB_URI=... ADMIN_PASSWORD=... npm run seed:admin` (optional demo data: `npm run seed:demo`).
4. Change the admin password from Settings after first login.

## Financial rules implemented
- Money is stored as integer piasters. No floats.
- Net monthly assistance = original - loan installment deduction (3,000 - 800 = 2,200). The three values are shown separately everywhere.
- Loan balances and installment status (paid / pending / partial / overdue) are computed from recorded repayments, never stored as manual totals.
- Repayments allocate to the oldest unpaid installment first. Overpayment is rejected. Repeat submissions are blocked (idempotency key + unique references). Everything runs in a DB transaction.
- Duplicate monthly assistance per beneficiary and per period is blocked by a unique index. One deduction repayment per assistance record.
- Paid assistance and recorded repayments are locked: no edit or delete. All changes go to the audit log.

## Rules the spec left open (decisions made, change if wrong)
1. First installment is due 1 month after the loan date (Settings: 0-3 months).
2. If amount is not divisible, the last installment takes the remainder. Installment x count must cover the loan and not exceed it by a full installment.
3. Only the installment due in the assistance month is deducted. Earlier unpaid installments stay overdue and are collected by cash repayment.
4. Deduction is capped at the original assistance so net is never negative.
5. Deduction is re-checked at the moment assistance is paid (if the installment was paid in cash meanwhile, the deduction shrinks).
6. Roles: `admin` (everything incl. users and settings) and `staff` (daily operations).
7. PDF export uses the browser print dialog (correct Arabic shaping); Excel export is real `.xlsx`.
8. Attachments are stored as links to external documents (no file storage on the free tier).

## QA status
See the final report from the build. Automated: `npm test` (money, schedule, deduction, allocation, auth, validation, full loan/assistance/repayment flow, duplicate and overpay protection, report totals reconcile).

Demo data is flagged `isDemo` and shown with a "تجريبي" badge.

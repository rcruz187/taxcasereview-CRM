# RomyLabs SaaS Billing & Collections

This subsystem bills RomyLabs customers for SaaS subscriptions. It is intentionally separate from invoices/payments that a CRM tenant creates for its own customers, patients, residents, or clients.

## Default collection policy

- Invoice automatically each billing cycle.
- Day 10 after invoice issuance: first past-due notice if unpaid.
- Day 15: second/final notice with the suspension deadline.
- Day 20: account becomes `suspended` when `auto_suspend=true` and balance is still unpaid.
- Successful full payment restores the account through a server-side payment/access adapter and records a `restored` event.
- Platform owner can disable auto-suspension or place a manual hold for exceptions.

The day values are per-account configuration, not hardcoded business logic, so RomyLabs can change the policy without rebuilding every CRM.

## Safety rules

1. Never put service-role keys or payment-provider secrets in browser code.
2. Never mix SaaS subscription invoices with tenant end-customer billing.
3. Suspension is an entitlement/access state, not deletion. Never delete tenant data for nonpayment.
4. Product adapters must preserve the tenant and its data while denying normal application access.
5. Restoration must be reversible, audited, and server-side.
6. Every notice, suspension, restoration, failed payment, and manual override is written to `romylabs_collection_events`.

## Tables

- `romylabs_billing_accounts`: one subscription account per RomyLabs product tenant.
- `romylabs_invoices`: recurring RomyLabs invoices.
- `romylabs_subscription_payments`: subscription payment ledger.
- `romylabs_collection_events`: collection and access-control audit trail.

## Automation

`romylabs-billing-cycle` is intended for a daily authenticated cron. It creates monthly invoices and advances unpaid invoices through the collection state machine. Email delivery and cross-product suspension/restoration require server-side adapters; the cycle never exposes product credentials.

## Product integration contract

Each commercial CRM should eventually implement a protected server-side entitlement endpoint accepting only RomyLabs-authorized requests and actions such as `suspend` and `restore`. The endpoint should change tenant subscription/access state only. It must not expose or mutate clinical, tax, financial, payroll, or other customer records.

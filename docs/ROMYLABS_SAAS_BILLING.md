# RomyLabs SaaS Billing & Collections

This subsystem bills RomyLabs customers for SaaS subscriptions. It is intentionally separate from invoices/payments that a CRM tenant creates for its own customers, patients, residents, or clients.

## Default collection policy

- Invoice automatically each billing cycle.
- Day 10 after invoice issuance: first past-due notice if unpaid.
- Day 15: second/final notice with the suspension deadline.
- Day 20: move to `suspension_pending`, call the product entitlement adapter, and mark `suspended` only after the CRM confirms access was denied.
- Successful full payment moves an enforced account to `restore_pending`, calls the product entitlement adapter, and marks `active` only after the CRM confirms access was restored.
- Failed suspend/restore enforcement remains pending with `enforcement_error` recorded and is retried by the daily billing cycle.
- Platform owner can disable auto-suspension or place a manual hold for exceptions.

The day values are per-account configuration, not hardcoded business logic, so RomyLabs can change the policy without rebuilding every CRM.

## Safety rules

1. Never put service-role keys or payment-provider secrets in browser code.
2. Never mix SaaS subscription invoices with tenant end-customer billing.
3. Suspension is an entitlement/access state, not deletion. Never delete tenant data for nonpayment.
4. Product adapters must preserve the tenant and its data while denying normal application access.
5. Restoration must be reversible, audited, server-side, and confirmed before the central account is marked active.
6. Every notice, suspension, restoration, failed payment, enforcement failure, and manual override is written to the RomyLabs billing/audit state.
7. The central enforcer accepts product keys/accounts only; arbitrary proxy URLs are never accepted.

## Tables

- `romylabs_billing_accounts`: one subscription account per RomyLabs product tenant.
- `romylabs_invoices`: recurring RomyLabs invoices.
- `romylabs_subscription_payments`: subscription payment ledger.
- `romylabs_collection_events`: collection and access-control audit trail.

## Automation

`romylabs-billing-cycle` is intended for a daily authenticated cron. It creates monthly invoices, advances unpaid invoices through collections, retries pending suspensions, and retries pending restorations.

`romylabs-billing-notify` delivers invoice/reminder email through the server-side mail provider.

`romylabs-billing-payment` records idempotent subscription payment events and initiates restoration after all overdue balances are cured.

`romylabs-billing-enforce` is the central server-side entitlement dispatcher. TaxRes tenants are enforced locally. Camvella, Arcvena, and BocaSync use protected product-side `romylabs-entitlement` endpoints.

## Product entitlement status

- **TaxRes CRM:** local `tenants.status` enforcement; existing app tenant-status gate blocks suspended/cancelled offices.
- **Camvella:** product adapter uses `saas_subscriptions.status` (`paused` / `active`) and the auth gate rejects paused subscriptions.
- **Arcvena:** product adapter uses tenant `SUSPENDED` / `ACTIVE` state and the auth gate rejects suspended/inactive tenants.
- **BocaSync:** product adapter uses a practice-level `billing_suspended` entitlement flag; patient billing and clinical data are not involved.
- **GroundIVO:** intentionally excluded from automatic entitlement enforcement while the CRM recovery/stabilization freeze is active. Any GroundIVO billing account must keep `auto_suspend=false` until that freeze is formally lifted and its product adapter is implemented/tested.

## Production prerequisites

Before enabling automatic suspension in production:

1. Apply both RomyLabs billing migrations.
2. Deploy `romylabs-billing-cycle`, `romylabs-billing-notify`, `romylabs-billing-payment`, and `romylabs-billing-enforce` in the RomyLabs/TaxRes Supabase project.
3. Deploy each product's `romylabs-entitlement` endpoint and auth-gate changes for Camvella, Arcvena, and BocaSync.
4. Configure the same strong `ROMYLABS_ENTITLEMENT_SECRET` in the central and product Supabase environments.
5. Configure `ROMYLABS_BILLING_CRON_SECRET`, `ROMYLABS_BILLING_WEBHOOK_SECRET`, `BREVO_API_KEY`, and the billing sender address server-side.
6. Wire a trusted payment-provider webhook/adapter into `romylabs-billing-payment`; do not expose the generic billing secret to clients.
7. Run an end-to-end non-production test: invoice → notice 1 → final notice → suspension confirmed → payment → restoration confirmed.
8. Only after that test should `auto_suspend=true` be enabled for live customer accounts.

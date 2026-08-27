# RomyLabs SaaS Billing & Collections

This subsystem bills RomyLabs customers for SaaS subscriptions. It is intentionally separate from invoices/payments that a CRM tenant creates for its own customers, patients, residents, or clients.

## Default collection policy

- Invoice automatically each billing cycle.
- Day 10 after invoice issuance: first past-due notice if unpaid.
- Day 15: second/final notice with the suspension deadline.
- Day 20: account becomes eligible for suspension only when `auto_suspend=true` and the balance is still unpaid.
- New billing accounts default to `auto_suspend=false`; suspension must be explicitly enabled after the product adapter has passed acceptance testing.
- Successful full payment restores the account through a server-side payment/access adapter and records a `restored` event.
- Platform owner can keep auto-suspension disabled for exceptions or products that have not completed entitlement testing.

The day values are per-account configuration, not hardcoded business logic, so RomyLabs can change the policy without rebuilding every CRM.

## Safety rules

1. Never put service-role keys or payment-provider secrets in browser code.
2. Never mix SaaS subscription invoices with tenant end-customer billing.
3. Suspension is an entitlement/access state, not deletion. Never delete tenant data for nonpayment.
4. Product adapters must preserve the tenant and its data while denying normal application access.
5. Restoration must be reversible, audited, and server-side.
6. Every notice, suspension, restoration, failed payment, and manual override is written to `romylabs_collection_events`.
7. Never mark an account `suspended` or restored to `active` until the product adapter confirms enforcement.

## Tables

- `romylabs_billing_accounts`: one subscription account per RomyLabs product tenant.
- `romylabs_invoices`: recurring RomyLabs invoices.
- `romylabs_subscription_payments`: subscription payment ledger.
- `romylabs_collection_events`: collection and access-control audit trail.

## Automation

The billing runtime creates monthly invoices and advances unpaid invoices through the collection state machine. It supports authenticated cycle, notification, payment and entitlement-enforcement operations. Email delivery uses Brevo server-side; payment events must arrive through a trusted provider adapter/webhook.

The TaxRes Supabase project is currently at its Edge Function slot limit. Rather than increasing spend or deleting a live function without approval, the already-closed `github-credential-check-temp` slot has been repurposed in production as the consolidated RomyLabs billing runtime. It is an internal deployment alias only. The dedicated `romylabs-billing-*` source functions remain the canonical implementation and can be deployed under their final names once function capacity is available.

The live runtime performs its own secret authentication and therefore has Supabase JWT verification disabled. Required server-side secrets are:

- `ROMYLABS_ENTITLEMENT_SECRET`
- `ROMYLABS_BILLING_CRON_SECRET`
- `ROMYLABS_BILLING_WEBHOOK_SECRET`
- `BREVO_API_KEY`
- optional `ROMYLABS_BILLING_FROM_EMAIL` (defaults to `billing@romylabs.com`)

Do not put any of these values in browser code or commit them to GitHub.

## Product integration contract

Each commercial CRM implements a protected server-side entitlement endpoint accepting only RomyLabs-authorized requests and actions such as `suspend` and `restore`. The endpoint changes tenant/practice subscription access only. It must not expose or mutate clinical, tax, financial, payroll, resident, patient, or other customer records.

Current product adapters:

- TaxRes CRM: local tenant status enforcement in the central runtime.
- Camvella: merged entitlement endpoint + authenticated org subscription gate; production migration/function deployment still requires Camvella Supabase access and the shared entitlement secret.
- Arcvena: merged entitlement endpoint + tenant-status auth gate; production function deployment still requires Arcvena Supabase access and the shared entitlement secret.
- BocaSync: merged practice-level entitlement migration + endpoint + auth gate; production migration/function deployment still requires BocaSync Supabase access and the shared entitlement secret.
- GroundIVO: intentionally excluded from entitlement enforcement while its recovery/stabilization freeze remains active.

## Production acceptance gate

Keep `auto_suspend=false` until all of the following are true for a product:

1. Its entitlement migration (if any) is installed in production.
2. Its `romylabs-entitlement` function is deployed with custom secret authentication.
3. `ROMYLABS_ENTITLEMENT_SECRET` matches the central runtime value.
4. A non-production tenant/practice has completed suspend -> login blocked -> restore -> login restored testing.
5. Payment processing has completed invoice -> payment -> confirmed restoration testing.
6. No customer, patient, resident, clinical, tax, payroll, document, or payment-card data changed during the test.

Only after the acceptance gate passes should `auto_suspend=true` be enabled for a live billing account.

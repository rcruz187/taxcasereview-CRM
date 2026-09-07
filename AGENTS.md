# ROMYLABS NON-NEGOTIABLE OPERATING RULES

These rules govern all work in this repository. Do not deviate from them unless Romy explicitly approves the specific deviation in the current conversation.

## Architecture
- GitHub is the source repository, version history, and source of truth.
- Normal frontend/site update flow is: edit source -> push to `main` -> Cloudflare automatically builds and deploys -> verify production.
- Cloudflare is the standard frontend/marketing-site/app deployment platform unless this repository already has an explicitly documented production exception.
- Supabase is the standard database/backend/Edge Functions/Storage/recurring-cron platform.
- GitHub Actions are manual QA or emergency fallback only. Do not add `push`, `pull_request`, or `schedule` deployment triggers.
- Do not spend GitHub Actions minutes for normal deployment work.
- Recurring backend jobs belong in Supabase Cron/Edge Functions, not GitHub Actions.

## Do Not Go Rogue
- Do not introduce Vercel, Netlify, Firebase, another database, another hosting provider, another CI/CD path, or another architecture because it seems convenient.
- Do not move a domain, application, database, deployment, DNS path, or source repository to a different platform without Romy's explicit approval.
- Do not replace an established RomyLabs pattern with a new pattern unless Romy explicitly requests the architectural change.
- Do not create temporary infrastructure that becomes a second production path.
- Do not hard-code a workaround when the existing registry/configuration/source-of-truth can solve the problem cleanly.

## RomyLabs Product Standard
- Public marketing site and CRM application must remain cleanly separated where that product uses the standard split:
  - product domain = marketing website
  - `app.product-domain` = CRM application
- Preserve existing product branding, tenant isolation, RLS, communications, Admin Portal integration, analytics, SEO, and deployment conventions.
- Before changing infrastructure, inspect the current repository and deployment contract first.

## Execution Behavior
- If the requested change is safe and tools permit it, make the change directly. Do not make Romy perform avoidable dashboard/manual steps.
- If access is genuinely unavailable, state the exact missing access or dependency. Do not guess, invent a platform, or claim a change was made.
- Never claim production verification unless production was actually verified.
- Distinguish clearly between source-ready, pushed, deployed, and live-verified.
- Do not ask for permission for routine implementation work already covered by the request.
- Do not weaken security, RLS, tenant isolation, authentication, auditability, or existing tests just to make a build/test pass.

## Preflight Before Every Infrastructure or Deployment Change
1. Read this file.
2. Inspect the existing repo/build/deployment configuration.
3. Confirm the change follows the architecture above.
4. If it would deviate, STOP and obtain Romy's explicit approval before making that deviation.

These rules are intentionally strict. Consistency across the RomyLabs portfolio takes priority over convenience.

# LinkedIn Full Autopilot — Production Acceptance

## Operating mode

TaxRes LinkedIn is intended to operate hands-off during normal operation:

`generate -> validate -> auto-approve safe content -> publish Tue/Thu 9 AM ET -> monitor -> alert only on exception -> replenish`

## Implemented in v3

- Monday 7 AM ET generation for the next Tuesday and Thursday slots.
- Curated publication-ready content library; no `[DRAFT]` placeholders.
- Automated validation blocks placeholder text, unsupported/guaranteed claims, malformed destinations, oversized/undersized posts, and recent duplicates.
- Only posts that pass validation are inserted as `approved` with `approved_at` and a scheduled slot.
- Failed validation is quarantined (not published) and sends an admin alert.
- Slot-level idempotency prevents duplicate rows for an already-populated Tuesday/Thursday slot.
- UTM attribution is added automatically.
- Existing DB `linkedin-publish-fire` / `linkedin-publish-process` jobs remain the only production publishing path; v3 does not reintroduce the retired pg_net -> Edge Function publishing path.
- Existing `get_linkedin_health` monitoring remains the health source.
- Weekly reporting remains available.
- Secrets/tokens are redacted from errors/logs.

## Safety rules

Autopilot must never publish:

- placeholder/draft text;
- guaranteed outcome claims;
- "settle for pennies" / "eliminate your tax debt" language;
- IRS affiliation/certification claims;
- unsupported fully-automated transcript claims;
- duplicate recent content;
- invalid destinations.

If content cannot pass validation, the correct behavior is to withhold it and alert the administrator rather than lower the validation standard.

## Publishing architecture

The database publisher repaired during the August 2026 incident remains authoritative:

1. Content generator inserts validated rows as `approved` with `scheduled_at`.
2. `linkedin-publish-fire` claims due approved rows.
3. Database HTTP publishing sends to LinkedIn.
4. `linkedin-publish-process` records the provider response/post ID.
5. `linkedin-monitor` / `get_linkedin_health()` detect scheduler, orphan, overdue, and failure conditions.

The Edge Function must not directly publish to LinkedIn; this prevents recurrence of the pg_net timeout/orphan-lock incident.

## Final production acceptance

A production deployment is accepted only when the deployed `linkedin-scheduler` is v3 and the existing DB publish/monitor jobs remain active. No manual Approve or Publish Now action is part of normal operation.
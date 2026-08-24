# LinkedIn Full-Autopilot Acceptance Criteria

Status: implementation work item. This document intentionally does **not** change production behavior by itself.

## Required normal flow

Monday generation -> complete publish-ready copy -> deterministic safety validation -> auto-approve only when validation passes -> Tuesday/Thursday 9:00 AM ET publisher -> response processing -> monitoring/retry/orphan recovery -> alert only on failure -> queue replenishment.

## Non-negotiable validation gates

A generated post MUST remain unapproved if any of the following is true:

- Contains `[DRAFT`, bracketed author instructions, placeholders, TODO/FIXME text, or empty sections.
- Contains prohibited or unsupported claims such as guaranteed outcomes, "settle for pennies", IRS-approved/certified claims, unverified performance statistics, or unsupported competitor claims.
- Claims full automated A2A transcript retrieval while production capability remains watched-folder transcript import.
- References a Tax Res CRM feature that is not verified as live production functionality.
- Uses an invalid/non-HTTPS destination URL or a destination outside the approved TaxRes domains.
- Duplicates a topic inside the established 30-day deduplication window.
- Violates category rotation rules (including demo/product frequency and founder-story cooldown).
- Is missing the expected LinkedIn UTM parameters.

## Approval rule

`approved` is an outcome of validation, never a default. A failed validation must remain `draft`/`needs_review` and create an actionable alert; it must never enter the publisher queue.

## Publisher protections to preserve

Do not weaken the existing status=`approved` publish gate, idempotent publishing lock, retries, orphan recovery, token-expiration handling, monitoring, alert deduplication, or response processing.

## Production proof required before declaring FULL AUTOPILOT

1. Monday generator cron is active and scheduled for 7:00 AM America/New_York.
2. Generator creates complete posts without author placeholders.
3. Passing posts are automatically approved and scheduled for the next Tue/Thu 9:00 AM ET slots.
4. Failing posts are quarantined and cannot publish.
5. `linkedin-publish-fire`, `linkedin-publish-process`, and `linkedin-monitor` are active and healthy.
6. Queue contains future approved posts and is replenished before it runs empty.
7. A controlled end-to-end test proves generation -> validation -> approval -> scheduler pickup -> response processing without a manual Approve/Publish Now click.
8. Controlled test data is cleaned up and no duplicate/test LinkedIn content remains.

Until all eight production checks are proven, the system must not be represented as fully hands-off autopilot.

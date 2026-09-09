# RomyLabs Phone System — Launch Certification

Branch: `sandbox/admin-romylabs-dialer-20260909`
Temporary RomyLabs DID: `+15614206999`
Production base remains untouched.

## Source / architecture certification

- PASS — Admin Portal has dedicated RomyLabs CallProvider.
- PASS — ActiveCallBar is mounted inside the RomyLabs provider and is visible across Admin Portal routes.
- PASS — RomyLabs calls do not attach to TaxRes clients/leads.
- PASS — RomyLabs phone state uses a platform-only server endpoint pinned to the RomyLabs control tenant.
- PASS — Cross-office Admin Portal tenant switching cannot redirect RomyLabs call polling/claim/log state.
- PASS — Outbound RomyLabs calls are pinned server-side to the RomyLabs control tenant.
- PASS — Hold, End, Transfer, and Add Caller carry explicit RomyLabs phone context.
- PASS — RomyLabs auto attendant:
  - 1 Sales
  - 2 Support
  - 3 Billing
  - 4 Romy
  - 0 Voicemail
- PASS — Business hours Monday–Friday, 9:00 AM–6:00 PM Eastern.
- PASS — After-hours calls route directly to RomyLabs voicemail.
- PASS — RomyLabs-branded hold prompt.
- PASS — Inbound browser bridge prioritizes claimed inbound calls before outbound and ignores unclaimed ringing calls.
- PASS — Voicemail stored under RomyLabs control tenant.
- PASS — Voicemail inbox supports playback, mark-read, delete, and storage cleanup.
- PASS — New voicemail email alert targets info@romylabs.com.
- PASS — RomyLabs voicemail API and phone-state API require authenticated platform-admin access.
- PASS — Required provider callback functions are registered in supabase/config.toml.
- PASS — Number cutover / rollback plan documented.
- PASS — TaxRes local voice +15614206665 remains untouched.
- PASS — TaxRes toll-free +18883345052 remains untouched.
- PASS — Production main branch was not modified by this work.

## Deployment / runtime gates

- PENDING — Full local Vite build. The current execution container cannot resolve github.com, so the complete repository cannot be cloned into the local sandbox for a package build.
- PENDING — Deploy RomyLabs Supabase phone functions.
- PENDING — Set production secret `ROMYLABS_PHONE_NUMBER=+15614206999`.
- PENDING — Point SignalWire +15614206999 voice webhook to `romylabs-receive-call`.
- PENDING — Live inbound IVR test for options 1, 2, 3, 4, and 0.
- PENDING — Live after-hours voicemail test.
- PENDING — Live voicemail email notification test.
- PENDING — Live outbound caller-ID test from Admin Portal.
- PENDING — Live hold / transfer / add-caller / hangup test.
- PENDING — Verify TaxRes voice and toll-free numbers remain unchanged after cutover.

No production merge or provider cutover should occur until the build gate is satisfied.

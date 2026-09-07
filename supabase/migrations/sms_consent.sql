-- SMS consent tracking — required to back up the opt-in claim made in the
-- SignalWire/TCR (The Campaign Registry) campaign registration: "Clients
-- opt in by providing their mobile number during intake... and verbally
-- or in writing consenting to receive text updates about their case."
-- Without an actual record of consent, that claim is just a policy
-- statement with nothing behind it if a carrier or TCR audit asks.
alter table leads   add column if not exists "smsConsent" boolean default false;
alter table leads   add column if not exists "smsConsentDate" timestamptz;
alter table clients add column if not exists "smsConsent" boolean default false;
alter table clients add column if not exists "smsConsentDate" timestamptz;

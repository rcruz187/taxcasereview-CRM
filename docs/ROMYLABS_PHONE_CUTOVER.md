# RomyLabs Phone Cutover — staged, not deployed

Temporary RomyLabs main DID: +1 561-420-6999
Current TaxRes local voice DID: +1 561-420-6665
Current TaxRes toll-free DID: +1 888-334-5052

## Production cutover order
1. Deploy RomyLabs phone edge functions.
2. Set `ROMYLABS_PHONE_NUMBER=+15614206999`.
3. Point SignalWire DID +15614206999 voice webhook to:
   `https://mpxgxfqdbquzkrvvejkh.supabase.co/functions/v1/romylabs-receive-call`
   Method: POST
4. Verify:
   - inbound greeting says RomyLabs
   - 1 Sales rings Admin Portal
   - 2 Support rings Admin Portal
   - 3 Billing rings Admin Portal
   - 4 Romy rings Admin Portal
   - 0 records RomyLabs voicemail
   - after-hours routes directly to RomyLabs voicemail
   - outbound Admin Portal call presents +15614206999
   - TaxRes +15614206665 remains unaffected
   - TaxRes toll-free +18883345052 remains unaffected
5. Only after all phone tests pass, merge the Admin Portal UI branch.

## Rollback
Restore +15614206999 to the previous fax webhook/configuration.
No TaxRes voice DID should be changed during this cutover.

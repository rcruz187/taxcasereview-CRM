# Per-tenant form templates

The blank IRS and state forms in this folder carry the **representative's own
details** — name, address, CAF number, PTIN, phone and fax — baked into the PDF
itself. That data belongs to the firm, not to the application, so it cannot be
white-labeled from code the way a letterhead can.

Templates are therefore resolved per tenant at fill time:

    /templates/<slug>/<file>        ← tried first
    /templates/<file>               ← shared fallback

    /state-forms/<slug>/<file>      ← tried first
    /state-forms/<file>             ← shared fallback

`<slug>` is the firm's name from their `settings` row, lowercased with
non-alphanumerics collapsed to hyphens — see `firmSlug()` in
`src/lib/firmBranding.js`. "Nashville Tax Solutions" becomes
`nashville-tax-solutions`.

A tenant with no folder of its own falls through to the shared originals, so
adding a firm can never affect an existing one.

## Adding a firm

1. Create `/templates/<their-slug>/` and, if they file in a state with its own
   POA, `/state-forms/<their-slug>/`.
2. Copy in the blanks they need and fill the representative section with their
   own name, address, CAF and PTIN. On the 2848 and 8821 that section is an
   AcroForm field. On some state forms (the Florida DR-835 among them) it is
   flattened page text and has to be redacted and redrawn.
3. Confirm the file still opens as a fillable form and that no other firm's
   details survive anywhere in the page text.

Only the files a firm actually overrides need to exist in their folder;
anything missing falls back.

## Files that carry representative details

    2848_Pers_RC.pdf     name + address (field), CAF/PTIN (flattened text)
    2848_RC_Biz.pdf      name, address, CAF, PTIN, phone, fax (all fields)
    8821_Pers_RC.pdf     name, address, CAF, PTIN, phone, fax (all fields)
    8821_Biz_RC.pdf      name, address, CAF, PTIN, phone, fax (all fields)
    state-forms/*.pdf    varies — most are flattened text

The 433 series and other blanks carry no representative details and never need
a per-tenant copy.

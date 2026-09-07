-- Seed Arcvena's initial LinkedIn content queue.
-- Idempotent by tenant_id + product_id + title.
-- Posts remain drafts until reviewed; publishing requires Arcvena's own LinkedIn connection.

INSERT INTO public.linkedin_posts
  (tenant_id, product_id, title, body, category, cta_type, status, retry_count)
SELECT
  'a0000000-0000-0000-0000-000000000001'::uuid,
  'arcvena',
  seed.title,
  seed.body,
  seed.category,
  'website',
  'draft',
  0
FROM (VALUES
  ('Why electrical contractors lose margin between estimate and invoice',
   'A profitable electrical job can still leak margin between the estimate, the field, and the final invoice. Scope changes get buried in texts. Materials are not tied back to the job. Photos and signatures arrive late. The invoice waits for someone to reconstruct what happened. Arcvena keeps the customer, estimate, dispatch, field documentation, job history, and invoice connected—so the office can close work with the full story in front of them. Learn more at https://arcvena.com',
   'pain-point'),
  ('The Property Passport: a permanent electrical history for every property',
   'Most systems organize work by customer or invoice. Electrical contractors also need the property itself to retain memory. Arcvena''s Property Passport keeps panels, circuits, equipment, permits, inspections, photos, documents, and completed work connected to the service address. When the next call comes in, the team starts with context instead of starting over. Explore Arcvena at https://arcvena.com',
   'product'),
  ('Dispatch should know more than who is available',
   'Good dispatching is not only about finding an open time slot. The office needs to match the right technician, job type, location, required skills, permit requirements, and expected duration. Arcvena gives electrical contractors one operational view from scheduling through closeout—without stitching together five disconnected tools. See how it works at https://arcvena.com/dispatch',
   'educational'),
  ('From lead to paid job without losing the handoff',
   'Every handoff creates risk: lead to estimate, estimate to job, office to technician, completed work to invoice. Arcvena was designed to keep those transitions inside one electrical-contractor workflow. The result is clearer ownership, fewer missing details, and faster closeout. Learn more at https://arcvena.com/electrician-crm',
   'workflow'),
  ('Permits and inspections should not live on a spreadsheet',
   'Permit numbers, submission dates, inspection windows, corrections, approvals, and supporting documents all affect when an electrical job can move forward. Arcvena keeps permit and inspection activity connected to the customer, property, and job so the office can see what is blocked and what is ready. Explore permit management at https://arcvena.com/permit-management',
   'compliance'),
  ('Give technicians the job context before they arrive',
   'A technician should not need to call the office for the customer''s history, scope, site notes, panel information, prior photos, or required documents. Arcvena''s mobile workflow brings the right job and property context into the field, while the office keeps visibility into progress. Learn more at https://arcvena.com/mobile',
   'mobile'),
  ('Job closeout is where cash flow begins',
   'The work may be finished, but the job is not closed until notes, photos, signatures, materials, inspection status, and billing details are complete. Arcvena turns closeout into a defined workflow so invoices do not wait on missing information. See the job closeout workflow at https://arcvena.com/job-closeout',
   'operations'),
  ('Built specifically for electrical contractors',
   'Arcvena is not a generic CRM with electrical labels added afterward. It connects estimating, scheduling, dispatch, field work, permits, inspections, property history, invoicing, automation, and customer communication around the way electrical contractors actually operate. Join the Arcvena launch list or request a demo at https://arcvena.com',
   'brand')
) AS seed(title, body, category)
WHERE NOT EXISTS (
  SELECT 1
  FROM public.linkedin_posts existing
  WHERE existing.tenant_id = 'a0000000-0000-0000-0000-000000000001'::uuid
    AND existing.product_id = 'arcvena'
    AND existing.title = seed.title
);

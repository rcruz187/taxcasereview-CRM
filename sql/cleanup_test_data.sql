-- ============================================================================
-- Cleanup: Find & Remove Leftover "TEST" Rows
-- ============================================================================
-- STEP 1: Run the SELECT queries first to PREVIEW what will be deleted.
-- STEP 2: Review the results. If they all look like junk test data,
--         uncomment and run the DELETE statements at the bottom.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- STEP 1: PREVIEW — Leads
-- ---------------------------------------------------------------------------
SELECT id, name, email, phone, status, source, created_at
FROM leads
WHERE name ILIKE '%test%'
   OR email ILIKE '%test%'
   OR email ILIKE '%example.com%'
   OR source ILIKE '%test%';

-- ---------------------------------------------------------------------------
-- STEP 1: PREVIEW — Cases
-- ---------------------------------------------------------------------------
SELECT id, "clientName", lead_id, status, created_at
FROM cases
WHERE "clientName" ILIKE '%test%';

-- ---------------------------------------------------------------------------
-- STEP 1: PREVIEW — Calendar Events (bookings)
-- ---------------------------------------------------------------------------
SELECT id, title, "clientName", "leadId", rep, "startTime", created_at
FROM calevents
WHERE title ILIKE '%test%'
   OR "clientName" ILIKE '%test%';

-- ---------------------------------------------------------------------------
-- STEP 1: PREVIEW — Chat Messages
-- ---------------------------------------------------------------------------
SELECT id, channel, sender, text, created_at
FROM chat_messages
WHERE text ILIKE '%test%'
   AND sender = '🔔 System';


-- ============================================================================
-- STEP 2: DELETE (run only after reviewing previews above)
-- Order matters: delete child rows (calevents, cases) before leads,
-- since cases/calevents may reference lead_id.
-- ============================================================================

-- DELETE FROM calevents
-- WHERE title ILIKE '%test%'
--    OR "clientName" ILIKE '%test%';

-- DELETE FROM cases
-- WHERE "clientName" ILIKE '%test%';

-- DELETE FROM leads
-- WHERE name ILIKE '%test%'
--    OR email ILIKE '%test%'
--    OR email ILIKE '%example.com%'
--    OR source ILIKE '%test%';

-- DELETE FROM chat_messages
-- WHERE text ILIKE '%test%'
--    AND sender = '🔔 System';

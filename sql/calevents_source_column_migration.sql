-- ============================================================================
-- calevents.source column
-- ============================================================================
-- BookingWidget.jsx (the internal Schedule Appointment flow used from Leads
-- and Clients) writes source: 'internal' on every insert, and Calendar.jsx's
-- realtime listener checks row.source === 'booking_widget' to decide whether
-- to fire the extra toast/browser-notification/team-chat-post for an
-- appointment booked through the external Tax Case Review booking widget
-- (cfoservicesnow) vs one booked internally (which already self-notifies).
-- The column was never actually added to the table, so every booking attempt
-- through BookingWidget.jsx failed with: "Could not find the 'source' column
-- of 'calevents' in the schema cache."
-- ============================================================================

ALTER TABLE calevents ADD COLUMN IF NOT EXISTS source text;

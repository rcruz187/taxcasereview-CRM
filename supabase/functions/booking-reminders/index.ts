// booking-reminders — cron-invoked sweep. Finds online bookings entering the
// 24h / 1h windows (Eastern), sends the reminder through the existing
// send-email function, and stamps the row so nothing double-sends.
// Deploy with JWT verification OFF; the cron job calls it every 10 minutes.
import { createClient } from "npm:@supabase/supabase-js@2";

const BOOK_MANAGE = "https://taxrescrm.app/book/manage/";

Deno.serve(async () => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // "Now" on the firm's clock (Eastern), as sortable strings.
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  });
  const g: Record<string, string> = {};
  fmt.formatToParts(new Date()).forEach((p) => { g[p.type] = p.value; });
  const nowMin = Date.UTC(+g.year, +g.month - 1, +g.day, +g.hour % 24, +g.minute); // ET wall time as UTC ms

  const { data: rows, error } = await supabase
    .from("calevents")
    .select('id, "clientName", "eventType", date, time, contact_email, booking_token, reminder_24_sent, reminder_1_sent, status, source')
    .eq("source", "online")
    .eq("status", "scheduled")
    .not("contact_email", "is", null)
    .gte("date", g.year + "-" + g.month + "-" + g.day);
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });

  let sent = 0;
  for (const r of rows ?? []) {
    if (!r.time || !r.contact_email) continue;
    const [y, m, d] = String(r.date).split("-").map(Number);
    const [hh, mm] = String(r.time).split(":").map(Number);
    const evtMin = Date.UTC(y, m - 1, d, hh, mm);
    const minsAway = (evtMin - nowMin) / 60000;

    let kind: "24h" | "1h" | null = null;
    if (!r.reminder_1_sent && minsAway > 0 && minsAway <= 65) kind = "1h";
    else if (!r.reminder_24_sent && minsAway > 65 && minsAway <= 24 * 60) kind = "24h";
    if (!kind) continue;

    const whenLabel = new Date(y, m - 1, d, hh, mm).toLocaleString("en-US", {
      weekday: "long", month: "long", day: "numeric",
      hour: "numeric", minute: "2-digit",
    }) + " (Eastern)";
    const first = (String(r.clientName || "").trim().split(" ")[0]) || "there";
    const manage = r.booking_token ? BOOK_MANAGE + r.booking_token : null;

    const resp = await fetch(Deno.env.get("SUPABASE_URL") + "/functions/v1/send-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        to: r.contact_email,
        subject: kind === "1h"
          ? `See you soon — ${r.eventType} at ${new Date(y, m - 1, d, hh, mm).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })} ET`
          : `Reminder — ${r.eventType} tomorrow`,
        html:
          `<p>Hi <strong>${first}</strong>,</p>` +
          `<p>${kind === "1h" ? "Your appointment is coming up within the hour:" : "A quick reminder about your appointment:"}</p>` +
          `<p style="line-height:1.9"><strong>${r.eventType}</strong><br>${whenLabel}</p>` +
          (manage
            ? `<p>Need to change it? <a href="${manage}">Reschedule</a> · <a href="${manage}?cancel=1">Cancel</a></p>`
            : `<p>Need to change it? Reply to this email or give us a call.</p>`) +
          `<p style="margin-top:20px"><strong>Tax Case Review</strong></p>`,
      }),
    });
    if (resp.ok) {
      await supabase.from("calevents")
        .update(kind === "1h" ? { reminder_1_sent: true } : { reminder_24_sent: true })
        .eq("id", r.id);
      sent++;
    }
  }
  return new Response(JSON.stringify({ ok: true, sent }), { headers: { "Content-Type": "application/json" } });
});

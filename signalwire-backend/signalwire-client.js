/**
 * SignalWire client helper — place in src/lib/signalwire.js
 * Add to CRM .env: VITE_SIGNALWIRE_BACKEND=https://your-backend.railway.app
 * Install: npm install @signalwire/js
 */
const BACKEND = import.meta.env.VITE_SIGNALWIRE_BACKEND || "http://localhost:3001"

// ── Dialer ────────────────────────────────────────────────────────────────────
export async function initDialer(agentName = "CRM_Agent") {
  const { SignalWire } = await import("@signalwire/js")
  const res = await fetch(`${BACKEND}/dialer/token`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ clientName: agentName })
  })
  const { token } = await res.json()
  return await SignalWire({ token })
}

export async function makeCall(client, to, from) {
  return await client.voice.dial({ to, from })
}

// ── SMS ───────────────────────────────────────────────────────────────────────
export async function sendSMS(to, body) {
  const res = await fetch(`${BACKEND}/sms/send`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ to, body })
  })
  return res.json()
}

export async function getSMSHistory(phone) {
  const res = await fetch(`${BACKEND}/sms/history?to=${encodeURIComponent(phone)}`)
  return res.json()
}

// ── eFax ──────────────────────────────────────────────────────────────────────
export async function sendFax(to, mediaUrl) {
  const res = await fetch(`${BACKEND}/fax/send`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ to, media_url: mediaUrl })
  })
  return res.json()
}

export async function getFaxHistory() {
  const res = await fetch(`${BACKEND}/fax/history`)
  return res.json()
}

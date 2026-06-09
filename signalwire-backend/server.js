require("dotenv").config()
const express = require("express")
const cors    = require("cors")
const axios   = require("axios")
const multer  = require("multer")
const app     = express()
const upload  = multer({ storage: multer.memoryStorage() })

app.use(cors({ origin: "*" }))
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

const SW_SPACE   = process.env.SIGNALWIRE_SPACE
const SW_PROJECT = process.env.SIGNALWIRE_PROJECT
const SW_TOKEN   = process.env.SIGNALWIRE_TOKEN
const SW_PHONE   = process.env.SIGNALWIRE_PHONE
const SW_BASE    = `https://${SW_SPACE}/api/laml/2010-04-01/Accounts/${SW_PROJECT}`
const SW_AUTH    = { username: SW_PROJECT, password: SW_TOKEN }

app.get("/health", (req, res) => res.json({
  status: "ok",
  service: "Tax Case Review — SignalWire Backend",
  features: ["dialer","sms","efax"],
  space: SW_SPACE, phone: SW_PHONE
}))

// ── DIALER ──────────────────────────────────────────────────────────────────
app.post("/dialer/token", async (req, res) => {
  try {
    const { clientName = "CRM_Agent" } = req.body
    const response = await axios.post(
      `https://${SW_SPACE}/api/relay/rest/jwt`,
      { expires_in: 3600, resource: clientName, channels: { "*": { read: true, write: true } } },
      { auth: SW_AUTH }
    )
    res.json({ token: response.data.jwt_token, expires_in: 3600, space: SW_SPACE })
  } catch (err) {
    console.error("Token error:", err.response?.data || err.message)
    res.status(500).json({ error: err.message })
  }
})

app.post("/dialer/inbound", (req, res) => {
  const { From, To } = req.body
  console.log(`Inbound call: ${From} -> ${To}`)
  res.set("Content-Type","text/xml")
  res.send(`<?xml version="1.0" encoding="UTF-8"?><Response><Dial callerId="${To}"><Client>CRM_Agent</Client></Dial></Response>`)
})

// ── SMS ─────────────────────────────────────────────────────────────────────
app.post("/sms/send", async (req, res) => {
  try {
    const { to, body, from = SW_PHONE } = req.body
    if (!to || !body) return res.status(400).json({ error: "to and body required" })
    const response = await axios.post(
      `${SW_BASE}/Messages.json`,
      new URLSearchParams({ From: from, To: to, Body: body }),
      { auth: SW_AUTH, headers: { "Content-Type": "application/x-www-form-urlencoded" } }
    )
    res.json({ success: true, sid: response.data.sid, status: response.data.status, to: response.data.to })
  } catch (err) {
    res.status(500).json({ error: err.response?.data?.message || err.message })
  }
})

app.post("/sms/inbound", (req, res) => {
  const { From, Body } = req.body
  console.log(`Inbound SMS from ${From}: ${Body}`)
  res.set("Content-Type","text/xml")
  res.send(`<?xml version="1.0" encoding="UTF-8"?><Response></Response>`)
})

app.get("/sms/history", async (req, res) => {
  try {
    const { to, limit = 20 } = req.query
    const params = { PageSize: limit }
    if (to) params.To = to
    const response = await axios.get(`${SW_BASE}/Messages.json`, { auth: SW_AUTH, params })
    res.json({
      messages: (response.data.messages || []).map(m => ({
        sid: m.sid, from: m.from, to: m.to, body: m.body, status: m.status, date: m.date_created
      }))
    })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// ── eFAX ────────────────────────────────────────────────────────────────────
app.post("/fax/send", upload.single("file"), async (req, res) => {
  try {
    const { to, from = SW_PHONE, media_url, quality = "standard" } = req.body
    if (!to) return res.status(400).json({ error: "to is required" })
    const formData = new URLSearchParams({ From: from, To: to, Quality: quality })
    if (media_url) {
      formData.append("MediaUrl", media_url)
    } else if (req.file) {
      const b64 = req.file.buffer.toString("base64")
      formData.append("MediaUrl", `data:${req.file.mimetype};base64,${b64}`)
    }
    const response = await axios.post(`${SW_BASE}/Faxes.json`, formData,
      { auth: SW_AUTH, headers: { "Content-Type": "application/x-www-form-urlencoded" } })
    res.json({ success: true, sid: response.data.sid, status: response.data.status,
               to: response.data.to, from: response.data.from, date: response.data.date_created })
  } catch (err) {
    console.error("Fax error:", err.response?.data || err.message)
    res.status(500).json({ error: err.response?.data?.message || err.message })
  }
})

app.post("/fax/inbound", (req, res) => {
  const { From, MediaUrl, NumPages, To } = req.body
  console.log(`Inbound fax: ${From} -> ${To} (${NumPages}p) ${MediaUrl}`)
  // TODO: save to Supabase fax_logs table
  res.set("Content-Type","text/xml")
  res.send(`<?xml version="1.0" encoding="UTF-8"?><Response></Response>`)
})

app.get("/fax/history", async (req, res) => {
  try {
    const response = await axios.get(`${SW_BASE}/Faxes.json`, { auth: SW_AUTH, params: { PageSize: 20 } })
    res.json({ faxes: response.data.faxes || [] })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

const PORT = process.env.PORT || 3001
app.listen(PORT, () => console.log(`SignalWire backend running on port ${PORT}`))

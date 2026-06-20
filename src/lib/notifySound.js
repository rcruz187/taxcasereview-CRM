// ─── Notification sounds ─────────────────────────────────────────────────────
// Generates short tones via the Web Audio API — no audio files to host/cache.

let ctx = null
function getCtx() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)()
  if (ctx.state === 'suspended') ctx.resume().catch(() => {})
  return ctx
}

function tone(freq, startTime, duration, gainCtx, type = 'sine', volume = 0.18) {
  const osc = gainCtx.createOscillator()
  const gain = gainCtx.createGain()
  osc.type = type
  osc.frequency.value = freq
  gain.gain.setValueAtTime(volume, startTime)
  gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration)
  osc.connect(gain)
  gain.connect(gainCtx.destination)
  osc.start(startTime)
  osc.stop(startTime + duration)
}

// Patterns per notification type
const PATTERNS = {
  message: [[880, 0, 0.10]],                                  // single soft blip — chat message
  lead:    [[660, 0, 0.12], [990, 0.13, 0.16]],               // two-note rising — new lead/appointment
  email:   [[740, 0, 0.10], [740, 0.14, 0.10]],               // double blip — new email
  huddle:  [[523, 0, 0.18], [659, 0.2, 0.18], [784, 0.4, 0.22]], // three-note rising — huddle invite
  call:    [[523, 0, 0.15], [392, 0.18, 0.15], [523, 0.36, 0.15], [392, 0.54, 0.15]], // ring pattern
  sms:     [[660, 0, 0.09], [880, 0.11, 0.09], [1046, 0.22, 0.12]], // three-note quick up-chirp — new SMS
  fax:     [[392, 0, 0.14], [392, 0.22, 0.14], [392, 0.44, 0.14]],  // three flat low blips — new fax
}

// ─── Autoplay-policy fix ─────────────────────────────────────────────────────
// Browsers refuse to start/resume an AudioContext until a real user gesture
// (click/keypress) has occurred on the page. Notification sounds are always
// triggered from background Supabase realtime events — never a click — so
// the very first time playSound() ran it would try to create+resume the
// context itself, get silently blocked by the browser's autoplay policy, and
// the rejected resume() promise was swallowed by getCtx()'s catch. Net
// effect: no sound, ever, regardless of the sound toggle being on. Priming
// the context on the first real click/keypress anywhere on the page (e.g.
// logging in, clicking a nav item) fixes this for the rest of the session.
let primed = false
function primeOnce() {
  if (primed) return
  primed = true
  try { getCtx() } catch (_) {}
  window.removeEventListener('pointerdown', primeOnce)
  window.removeEventListener('keydown', primeOnce)
}
if (typeof window !== 'undefined') {
  window.addEventListener('pointerdown', primeOnce)
  window.addEventListener('keydown', primeOnce)
}

export function isSoundEnabled() {
  return localStorage.getItem('tcr_sounds_enabled') !== 'off'
}

export function setSoundEnabled(on) {
  localStorage.setItem('tcr_sounds_enabled', on ? 'on' : 'off')
}

export function playSound(kind) {
  if (!isSoundEnabled()) return
  try {
    const audioCtx = getCtx()
    const pattern = PATTERNS[kind] || PATTERNS.message
    const now = audioCtx.currentTime
    pattern.forEach(([freq, offset, dur]) => tone(freq, now + offset, dur, audioCtx))
  } catch (_) {
    // Audio not available (e.g. before user interaction) — fail silently
  }
}

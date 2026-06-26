// PhoneNumber — smart phone display component.
// On mobile: taps open the native dialer (tel: link).
// On desktop: click copies the number to clipboard + shows a toast.
// Use this everywhere a raw phone number is displayed.

import { useState } from 'react'

const isMobile = () => /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)

export default function PhoneNumber({ val, style = {} }) {
  const [copied, setCopied] = useState(false)
  if (!val) return <span style={{ color: 'var(--t3)' }}>—</span>
  const digits = val.replace(/\D/g, '')

  const baseStyle = {
    color: 'var(--blue)', fontWeight: 600, fontFamily: 'monospace',
    textDecoration: 'none', cursor: 'pointer', ...style
  }

  if (isMobile()) {
    return <a href={`tel:${digits}`} style={baseStyle}>📞 {val}</a>
  }

  return (
    <span
      onClick={() => {
        navigator.clipboard?.writeText(val)
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
      }}
      style={baseStyle}
      title="Click to copy">
      📞 {copied ? '✓ Copied!' : val}
    </span>
  )
}

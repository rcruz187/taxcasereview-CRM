// ─── Money formatting ────────────────────────────────────────────────────────
// Amounts are read aloud to clients and copied onto IRS forms, so they get
// thousands separators everywhere they appear. 625000 and 625,000 carry the
// same value but not the same chance of being misread.
//
// The pairing matters: `formatMoneyInput` is what a person sees while typing,
// `parseMoney` is what gets stored. Nothing with a comma in it ever reaches the
// database — every value is parsed back to a plain number on the way in.

/** Strip formatting and return a plain number, or '' for empty input. */
export function parseMoney(value) {
  if (value === null || value === undefined || value === '') return ''
  const cleaned = String(value).replace(/[^0-9.\-]/g, '')
  if (cleaned === '' || cleaned === '-' || cleaned === '.') return cleaned
  return cleaned
}

/**
 * Format for display inside a text input while the person is still typing.
 * Keeps a trailing decimal point and any partial cents so the caret doesn't
 * fight the formatter mid-entry.
 */
export function formatMoneyInput(value) {
  if (value === null || value === undefined || value === '') return ''
  const raw = String(value).replace(/,/g, '')
  const negative = raw.startsWith('-')
  const body = negative ? raw.slice(1) : raw
  if (body === '') return negative ? '-' : ''

  const [whole, ...rest] = body.split('.')
  const decimals = rest.join('')
  const groupedWhole = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')

  let out = groupedWhole
  if (body.includes('.')) out += '.' + decimals
  return (negative ? '-' : '') + out
}

/**
 * Format a stored number for read-only display.
 * @param {number|string} value
 * @param {object} [opts]
 * @param {boolean} [opts.cents=false]  always show two decimal places
 * @param {string}  [opts.blank='']     what to render for an empty value
 */
export function formatMoney(value, opts = {}) {
  const { cents = false, blank = '' } = opts
  if (value === null || value === undefined || value === '') return blank
  const n = typeof value === 'number' ? value : parseFloat(String(value).replace(/[^0-9.\-]/g, ''))
  if (!isFinite(n)) return blank
  return n.toLocaleString('en-US', {
    minimumFractionDigits: cents ? 2 : 0,
    maximumFractionDigits: 2,
  })
}

/** As above, with a leading $. */
export function formatDollars(value, opts = {}) {
  const s = formatMoney(value, opts)
  return s === '' ? (opts.blank ?? '') : '$' + s
}

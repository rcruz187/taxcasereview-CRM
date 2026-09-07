// State income tax rates for auto-calculation in Financial Intake wizard.
// Uses a flat effective rate approximation for the average taxpayer.
// Source: 2025 state income tax schedules.
// States with no income tax = 0.

export const STATE_TAX_RATES = {
  'AL': 0.050, 'AK': 0.000, 'AZ': 0.025, 'AR': 0.047, 'CA': 0.093,
  'CO': 0.044, 'CT': 0.050, 'DE': 0.066, 'FL': 0.000, 'GA': 0.055,
  'HI': 0.110, 'ID': 0.058, 'IL': 0.049, 'IN': 0.030, 'IA': 0.057,
  'KS': 0.057, 'KY': 0.045, 'LA': 0.042, 'ME': 0.075, 'MD': 0.048,
  'MA': 0.050, 'MI': 0.043, 'MN': 0.070, 'MS': 0.047, 'MO': 0.048,
  'MT': 0.059, 'NE': 0.064, 'NV': 0.000, 'NH': 0.000, 'NJ': 0.063,
  'NM': 0.049, 'NY': 0.069, 'NC': 0.045, 'ND': 0.025, 'OH': 0.040,
  'OK': 0.047, 'OR': 0.099, 'PA': 0.031, 'RI': 0.060, 'SC': 0.064,
  'SD': 0.000, 'TN': 0.000, 'TX': 0.000, 'UT': 0.046, 'VT': 0.066,
  'VA': 0.057, 'WA': 0.000, 'WV': 0.065, 'WI': 0.053, 'WY': 0.000,
  'DC': 0.085,
}

// Map full state names to abbreviations
export const STATE_ABBR = {
  'Alabama':'AL','Alaska':'AK','Arizona':'AZ','Arkansas':'AR','California':'CA',
  'Colorado':'CO','Connecticut':'CT','Delaware':'DE','Florida':'FL','Georgia':'GA',
  'Hawaii':'HI','Idaho':'ID','Illinois':'IL','Indiana':'IN','Iowa':'IA',
  'Kansas':'KS','Kentucky':'KY','Louisiana':'LA','Maine':'ME','Maryland':'MD',
  'Massachusetts':'MA','Michigan':'MI','Minnesota':'MN','Mississippi':'MS','Missouri':'MO',
  'Montana':'MT','Nebraska':'NE','Nevada':'NV','New Hampshire':'NH','New Jersey':'NJ',
  'New Mexico':'NM','New York':'NY','North Carolina':'NC','North Dakota':'ND','Ohio':'OH',
  'Oklahoma':'OK','Oregon':'OR','Pennsylvania':'PA','Rhode Island':'RI','South Carolina':'SC',
  'South Dakota':'SD','Tennessee':'TN','Texas':'TX','Utah':'UT','Vermont':'VT',
  'Virginia':'VA','Washington':'WA','West Virginia':'WV','Wisconsin':'WI','Wyoming':'WY',
  'District of Columbia':'DC',
}

export function getStateTaxRate(stateInput) {
  if (!stateInput) return null
  const upper = stateInput.trim().toUpperCase()
  // Already an abbreviation
  if (STATE_TAX_RATES[upper] !== undefined) return STATE_TAX_RATES[upper]
  // Full name
  const abbr = STATE_ABBR[stateInput.trim()]
  if (abbr && STATE_TAX_RATES[abbr] !== undefined) return STATE_TAX_RATES[abbr]
  return null
}

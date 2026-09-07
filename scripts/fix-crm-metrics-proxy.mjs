import fs from 'node:fs'

const path = 'src/pages/AdminPortal.jsx'
let s = fs.readFileSync(path, 'utf8').replace(/\r\n/g, '\n')

if (!s.includes('const fetchCrmProductMetrics = React.useCallback')) {
  const old = `  const fetchCrmMetricsUrl = React.useCallback(async (url) => {
    if (!url) return null
    const { data: sessionData } = await supabase.auth.getSession()
    const token = sessionData?.session?.access_token
    if (!token) throw new Error('Admin session unavailable')
    const res = await fetch(url, { headers: { Authorization: \`Bearer \${token}\` } })
    const body = await res.json().catch(() => ({}))
    if (!res.ok || body?.ok === false) throw new Error(body?.error || \`Metrics request failed (\${res.status})\`)
    return body
  }, [])`

  const replacement = `  const fetchCrmProductMetrics = React.useCallback(async (productKey) => {
    if (!productKey) return null
    const { data: sessionData } = await supabase.auth.getSession()
    const token = sessionData?.session?.access_token
    if (!token) throw new Error('Admin session unavailable')
    const res = await fetch('https://mpxgxfqdbquzkrvvejkh.supabase.co/functions/v1/hub-proxy', {
      method: 'POST',
      headers: {
        Authorization: \`Bearer \${token}\`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ product: productKey }),
    })
    const body = await res.json().catch(() => ({}))
    if (!res.ok || body?.ok === false) throw new Error(body?.error || \`Metrics request failed (\${res.status})\`)
    return body
  }, [])`

  if (!s.includes(old)) throw new Error('Admin metrics helper anchor not found')
  s = s.replace(old, replacement)
}

s = s.replaceAll('fetchCrmMetricsUrl(product.metricsUrl)', 'fetchCrmProductMetrics(crmProduct)')
s = s.replaceAll('}, [crmProduct, fetchCrmMetricsUrl])', '}, [crmProduct, fetchCrmProductMetrics])')
s = s.replaceAll('fetchCrmMetricsUrl(tenantProduct.metricsUrl)', 'fetchCrmProductMetrics(key)')
s = s.replaceAll('}, [crmProduct, crmAccount, fetchCrmMetricsUrl])', '}, [crmProduct, crmAccount, fetchCrmProductMetrics])')

const forbidden = [
  'fetchCrmMetricsUrl(product.metricsUrl)',
  'fetchCrmMetricsUrl(tenantProduct.metricsUrl)',
]
for (const needle of forbidden) {
  if (s.includes(needle)) throw new Error(`Unsafe direct metrics fetch remains: ${needle}`)
}
for (const needle of [
  'const fetchCrmProductMetrics = React.useCallback',
  "functions/v1/hub-proxy",
  'fetchCrmProductMetrics(crmProduct)',
  'fetchCrmProductMetrics(key)',
]) {
  if (!s.includes(needle)) throw new Error(`Metrics proxy verification failed: ${needle}`)
}

fs.writeFileSync(path, s)
console.log('admin metrics: all cross-product metrics route through authenticated hub-proxy')

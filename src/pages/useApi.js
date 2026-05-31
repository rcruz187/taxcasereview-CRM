import { useState, useCallback } from 'react'

/**
 * useApi — thin wrapper around fetch for the Node.js backend
 *
 * Usage:
 *   const { data, loading, error, request } = useApi()
 *   await request('GET', '/api/data/clients')
 *   await request('POST', '/api/data/leads', { name: 'John' })
 */
export function useApi() {
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState(null)
  const [data,    setData]    = useState(null)

  const request = useCallback(async (method, url, body = null) => {
    setLoading(true)
    setError(null)
    try {
      const opts = {
        method,
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'x-firm-slug': 'taxcasereview',
        },
      }
      if (body) opts.body = JSON.stringify(body)
      const res = await fetch(url, opts)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`)
      setData(json)
      return json
    } catch (err) {
      setError(err.message)
      throw err
    } finally {
      setLoading(false)
    }
  }, [])

  return { data, loading, error, request }
}

/* ── Convenience helpers ── */
export const api = {
  get:    (url)         => apiFetch('GET',    url),
  post:   (url, body)   => apiFetch('POST',   url, body),
  put:    (url, body)   => apiFetch('PUT',    url, body),
  patch:  (url, body)   => apiFetch('PATCH',  url, body),
  delete: (url)         => apiFetch('DELETE', url),
}

async function apiFetch(method, url, body = null) {
  const opts = {
    method,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      'x-firm-slug': 'taxcasereview',
    },
  }
  if (body) opts.body = JSON.stringify(body)
  const res  = await fetch(url, opts)
  const json = await res.json()
  if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`)
  return json
}

/**
 * SignalWire webhook request validation
 * Implements the Twilio Compatibility API validateRequest algorithm
 *
 * Algorithm (per SW docs):
 * 1. Take the full webhook URL
 * 2. Sort all POST params alphabetically by key
 * 3. Append each key+value (concatenated, no separator) to the URL
 * 4. HMAC-SHA1 the resulting string with the signing key
 * 5. Base64-encode the digest
 * 6. Constant-time compare with x-signalwire-signature header value
 */
export async function validateSignalWireRequest(
  signingKey: string,
  url: string,
  params: Record<string, string>,
  signature: string
): Promise<boolean> {
  if (!signingKey || !signature) return false

  // Build signed string: URL + each sorted key+value appended with no separator
  const sortedKeys = Object.keys(params).sort()
  let stringToSign = url
  for (const key of sortedKeys) {
    stringToSign += key + (params[key] ?? '')
  }

  const enc = new TextEncoder()
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    enc.encode(signingKey),
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign']
  )
  const rawSig = await crypto.subtle.sign('HMAC', cryptoKey, enc.encode(stringToSign))
  const expected = btoa(String.fromCharCode(...new Uint8Array(rawSig)))

  // Constant-time compare to prevent timing attacks
  if (expected.length !== signature.length) return false
  let diff = 0
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i)
  }
  return diff === 0
}

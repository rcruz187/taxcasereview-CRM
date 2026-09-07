// ── Shared upload utilities ────────────────────────────────────────────────
// All file uploads in the CRM go through validateFile() before hitting
// Supabase storage. This keeps storage usage lean on the free tier.

// Converts a File to a plain base64 string (no data: prefix) — used by
// unauthenticated flows (Client Portal, standalone Tax Organizer link)
// that upload via an edge function instead of a direct anon storage call,
// since those no longer have anon-role storage/table access.
export function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result.split(',')[1])
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

const MAX_FILE_MB   = 10           // hard reject anything over 10 MB
const WARN_FILE_MB  = 5            // warn (but allow) 5–10 MB
const MAX_BYTES     = MAX_FILE_MB  * 1024 * 1024
const WARN_BYTES    = WARN_FILE_MB * 1024 * 1024

export function fmtSize(bytes) {
  if (bytes < 1024)        return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

/**
 * Validate a file before upload.
 * Returns { ok: true } or { ok: false, error: string }
 * Also returns { warn: string } for large-but-allowed files.
 */
export function validateFile(file) {
  if (!file) return { ok: false, error: 'No file selected.' }
  if (file.size > MAX_BYTES) {
    return {
      ok: false,
      error: `File too large — ${fmtSize(file.size)} exceeds the ${MAX_FILE_MB} MB limit. Please compress or split the file before uploading.`
    }
  }
  if (file.size > WARN_BYTES) {
    return { ok: true, warn: `Large file (${fmtSize(file.size)}) — uploading may take a moment.` }
  }
  return { ok: true }
}

/**
 * Compress a PDF Uint8Array using deflate-style stream compression.
 * In practice pdf-lib already produces fairly compressed output, so
 * we skip re-compression (re-encoding a PDF can increase size).
 * This function is a hook for future compression if needed.
 */
export async function maybeCompressPdf(bytes) {
  // PDFs are already internally compressed — return as-is.
  // If we add image-heavy PDFs in future, we can integrate a
  // compression library here without changing any callers.
  return bytes
}

/**
 * Compress an image File to a max dimension and quality before upload.
 * Returns a new Blob if the file is an image, otherwise returns original.
 */
export async function maybeCompressImage(file, { maxDim = 1920, quality = 0.82 } = {}) {
  if (!file.type.startsWith('image/')) return file
  return new Promise(resolve => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height))
      const w = Math.round(img.width  * scale)
      const h = Math.round(img.height * scale)
      const canvas = document.createElement('canvas')
      canvas.width = w; canvas.height = h
      canvas.getContext('2d').drawImage(img, 0, 0, w, h)
      canvas.toBlob(blob => resolve(blob || file), file.type === 'image/png' ? 'image/png' : 'image/jpeg', quality)
    }
    img.onerror = () => { URL.revokeObjectURL(url); resolve(file) }
    img.src = url
  })
}

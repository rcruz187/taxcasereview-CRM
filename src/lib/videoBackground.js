import { useRef, useState, useCallback, useEffect } from 'react'

export const PRESETS = [
  { id: 'blur',    label: 'Blur',      icon: '🌫️', img: null, gradient: null },
  { id: 'tcr',     label: 'TCR Brand', icon: '🏢', img: '/taxcasereview-CRM/tcr-bg.png', gradient: null },
  { id: 'office1', label: 'Office',    icon: '💼', img: 'https://images.unsplash.com/photo-1497366216548-37526070297c?w=1280&q=80', gradient: null },
  { id: 'office2', label: 'Modern',    icon: '🪟', img: 'https://images.unsplash.com/photo-1497366811353-6870744d04b2?w=1280&q=80', gradient: null },
  { id: 'library', label: 'Library',   icon: '📚', img: 'https://images.unsplash.com/photo-1507842217343-583bb7270b66?w=1280&q=80', gradient: null },
  { id: 'gradient',label: 'Blue',      icon: '🔵', img: null, gradient: ['#1e3a8a','#1d4ed8','#0ea5e9'] },
  { id: 'dark',    label: 'Dark',      icon: '🌑', img: null, gradient: ['#0f172a','#1e293b'] },
]

const imgCache = {}
async function loadImg(url) {
  if (imgCache[url]) return imgCache[url]
  return new Promise((res, rej) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload  = () => { imgCache[url] = img; res(img) }
    img.onerror = () => rej(new Error('img load failed: ' + url))
    img.src = url
  })
}

function drawGradient(ctx, w, h, colors) {
  const grad = ctx.createLinearGradient(0, 0, w, h)
  colors.forEach((c, i) => grad.addColorStop(i / (colors.length - 1), c))
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, w, h)
}

// Load MediaPipe Selfie Segmentation via CDN
let segmenterPromise = null
async function getSegmenter() {
  if (segmenterPromise) return segmenterPromise
  segmenterPromise = new Promise(async (resolve, reject) => {
    try {
      await loadScript('https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils/camera_utils.js')
      await loadScript('https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/selfie_segmentation.js')
      // eslint-disable-next-line no-undef
      const seg = new SelfieSegmentation({
        locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/${file}`
      })
      seg.setOptions({ modelSelection: 1 })
      await seg.initialize()
      resolve(seg)
    } catch(e) {
      segmenterPromise = null
      reject(e)
    }
  })
  return segmenterPromise
}

function loadScript(src) {
  return new Promise((res, rej) => {
    if (document.querySelector(`script[src="${src}"]`)) { res(); return }
    const s = document.createElement('script')
    s.src = src; s.crossOrigin = 'anonymous'
    s.onload = res; s.onerror = rej
    document.head.appendChild(s)
  })
}

export function useVideoBackground() {
  const [bgMode,    setBgMode]    = useState('none')
  const [bgPreset,  setBgPreset]  = useState(null)
  const [customBg,  setCustomBg]  = useState(null)
  const [segStatus, setSegStatus] = useState('idle')

  const canvasRef        = useRef(null)
  const canvasStreamRef  = useRef(null)
  const animFrameRef     = useRef(null)
  const videoElRef       = useRef(null)
  const activeRef        = useRef(false)
  const segRef           = useRef(null)
  const lastMaskRef      = useRef(null)

  function stopLoop() {
    activeRef.current = false
    if (animFrameRef.current) { cancelAnimationFrame(animFrameRef.current); animFrameRef.current = null }
  }

  const applyBackground = useCallback(async (rawStream, mode, presetId, customUrl) => {
    stopLoop()
    if (!rawStream) return rawStream
    if (mode === 'none') return rawStream

    // Set up hidden video element fed by raw camera stream
    let vid = videoElRef.current
    if (!vid) {
      vid = document.createElement('video')
      vid.autoplay = true; vid.playsInline = true; vid.muted = true
      videoElRef.current = vid
    }
    if (vid.srcObject !== rawStream) {
      vid.srcObject = rawStream
      await new Promise(r => { vid.onloadedmetadata = r; setTimeout(r, 1500) })
      await vid.play().catch(() => {})
      await new Promise(r => setTimeout(r, 300))
    }

    const W = vid.videoWidth  || 640
    const H = vid.videoHeight || 480

    // Always create a fresh canvas for each background selection
    const canvas = document.createElement('canvas')
    canvas.width = W; canvas.height = H
    canvasRef.current = canvas
    const ctx = canvas.getContext('2d')

    // Fresh canvas stream every time — fixes stale stream bug
    canvasStreamRef.current = canvas.captureStream(30)
    const combined = new MediaStream([
      ...canvasStreamRef.current.getVideoTracks(),
      ...rawStream.getAudioTracks(),
    ])

    // Pre-load background image
    const preset = PRESETS.find(p => p.id === presetId)
    const imgUrl = mode === 'custom' ? customUrl : preset?.img
    let bgImg = null
    if (imgUrl) {
      try { bgImg = await loadImg(imgUrl) } catch(_) {}
    }

    // Helper: draw the background layer (image, gradient, or solid)
    function drawBg() {
      if (bgImg) {
        const scale = Math.max(W / bgImg.naturalWidth, H / bgImg.naturalHeight)
        const sw = bgImg.naturalWidth * scale, sh = bgImg.naturalHeight * scale
        ctx.drawImage(bgImg, (W - sw) / 2, (H - sh) / 2, sw, sh)
      } else if (preset?.gradient) {
        drawGradient(ctx, W, H, preset.gradient)
      } else {
        ctx.fillStyle = '#1e293b'; ctx.fillRect(0, 0, W, H)
      }
    }

    activeRef.current = true

    if (mode === 'blur') {
      function drawBlur() {
        if (!activeRef.current) return
        try {
          ctx.filter = 'blur(22px) saturate(0.9) brightness(0.85)'
          ctx.drawImage(vid, 0, 0, W, H)
          ctx.filter = 'none'
          const cx = W / 2, cy = H / 2 + H * 0.04
          const offC = document.createElement('canvas')
          offC.width = W; offC.height = H
          const offX = offC.getContext('2d')
          offX.drawImage(vid, 0, 0, W, H)
          const mask = offX.createRadialGradient(cx, cy, W * 0.12, cx, cy, W * 0.38)
          mask.addColorStop(0,   'rgba(0,0,0,1)')
          mask.addColorStop(0.7, 'rgba(0,0,0,0.6)')
          mask.addColorStop(1,   'rgba(0,0,0,0)')
          offX.globalCompositeOperation = 'destination-in'
          offX.fillStyle = mask
          offX.fillRect(0, 0, W, H)
          ctx.drawImage(offC, 0, 0)
        } catch(_) {}
        animFrameRef.current = requestAnimationFrame(drawBlur)
      }
      drawBlur()
      return combined
    }

    // Try MediaPipe for proper background replacement
    setSegStatus('loading')
    try {
      const seg = await getSegmenter()
      segRef.current = seg
      setSegStatus('ready')
      seg.onResults = (results) => { lastMaskRef.current = results.segmentationMask }

      // Persistent offscreen canvas for person compositing
      const personCanvas = document.createElement('canvas')
      personCanvas.width = W; personCanvas.height = H
      const personCtx = personCanvas.getContext('2d')

      async function drawSegmented() {
        if (!activeRef.current) return
        try {
          await segRef.current.send({ image: vid })
          const mask = lastMaskRef.current
          if (mask) {
            // Step 1: draw background onto main canvas
            drawBg()

            // Step 2: draw person cutout on offscreen canvas
            // First draw the segmentation mask as alpha
            personCtx.clearRect(0, 0, W, H)
            personCtx.globalCompositeOperation = 'source-over'
            personCtx.drawImage(mask, 0, 0, W, H)
            // Clip to mask — only draw person where mask is white
            personCtx.globalCompositeOperation = 'source-in'
            personCtx.drawImage(vid, 0, 0, W, H)

            // Step 3: composite person over background
            ctx.globalCompositeOperation = 'source-over'
            ctx.drawImage(personCanvas, 0, 0)
          } else {
            ctx.globalCompositeOperation = 'source-over'
            ctx.drawImage(vid, 0, 0, W, H)
          }
        } catch(_) {
          ctx.globalCompositeOperation = 'source-over'
          ctx.drawImage(vid, 0, 0, W, H)
        }
        animFrameRef.current = requestAnimationFrame(drawSegmented)
      }
      drawSegmented()

    } catch(e) {
      console.warn('[VBG] MediaPipe unavailable, using background-behind fallback:', e)
      segRef.current = null
      setSegStatus('failed')

      // Fallback: background behind person with feathered oval cutout
      function drawFallback() {
        if (!activeRef.current) return
        try {
          // 1. Draw background full frame
          drawBg()
          // 2. Draw person on top with feathered oval mask (no segmentation)
          const cx = W / 2, cy = H / 2 + H * 0.04
          const off = document.createElement('canvas')
          off.width = W; off.height = H
          const offCtx = off.getContext('2d')
          offCtx.drawImage(vid, 0, 0, W, H)
          const feather = offCtx.createRadialGradient(cx, cy, W * 0.15, cx, cy, W * 0.40)
          feather.addColorStop(0,   'rgba(0,0,0,1)')
          feather.addColorStop(0.75,'rgba(0,0,0,0.5)')
          feather.addColorStop(1,   'rgba(0,0,0,0)')
          offCtx.globalCompositeOperation = 'destination-in'
          offCtx.fillStyle = feather
          offCtx.fillRect(0, 0, W, H)
          ctx.drawImage(off, 0, 0)
        } catch(_) {}
        animFrameRef.current = requestAnimationFrame(drawFallback)
      }
      drawFallback()
    }

    return combined
  }, [])

  const changeBackground = useCallback(async (rawStream, mode, presetId, customUrl) => {
    setBgMode(mode)
    setBgPreset(mode === 'none' ? null : presetId)
    if (mode === 'custom') setCustomBg(customUrl)
    if (mode === 'none') { stopLoop(); return rawStream }
    return applyBackground(rawStream, mode, presetId, customUrl)
  }, [applyBackground])

  useEffect(() => () => stopLoop(), [])

  return { bgMode, bgPreset, customBg, segStatus, changeBackground, stopLoop, PRESETS }
}

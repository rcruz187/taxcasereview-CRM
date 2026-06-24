import { useRef, useState, useCallback, useEffect } from 'react'

export const PRESETS = [
  { id: 'blur',    label: 'Blur',          icon: '🌫️', img: null,    gradient: null },
  { id: 'tcr',     label: 'TCR Brand',     icon: '🏢', img: '/taxcasereview-CRM/tcr-bg.png', gradient: null },
  { id: 'office1', label: 'Office',        icon: '💼', img: 'https://images.unsplash.com/photo-1497366216548-37526070297c?w=1280&q=80', gradient: null },
  { id: 'office2', label: 'Modern',        icon: '🪟', img: 'https://images.unsplash.com/photo-1497366811353-6870744d04b2?w=1280&q=80', gradient: null },
  { id: 'library', label: 'Library',       icon: '📚', img: 'https://images.unsplash.com/photo-1507842217343-583bb7270b66?w=1280&q=80', gradient: null },
  { id: 'gradient',label: 'Blue',          icon: '🔵', img: null,    gradient: ['#1e3a8a','#1d4ed8','#0ea5e9'] },
  { id: 'dark',    label: 'Dark',          icon: '🌑', img: null,    gradient: ['#0f172a','#1e293b'] },
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
      // Load MediaPipe scripts
      await loadScript('https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils/camera_utils.js')
      await loadScript('https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/selfie_segmentation.js')

      // eslint-disable-next-line no-undef
      const seg = new SelfieSegmentation({
        locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/${file}`
      })
      seg.setOptions({ modelSelection: 1 }) // 1 = landscape model, more accurate
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
    s.src = src
    s.crossOrigin = 'anonymous'
    s.onload = res
    s.onerror = rej
    document.head.appendChild(s)
  })
}

export function useVideoBackground() {
  const [bgMode,   setBgMode]   = useState('none')
  const [bgPreset, setBgPreset] = useState(null)
  const [customBg, setCustomBg] = useState(null)
  const [segStatus, setSegStatus] = useState('idle') // idle | loading | ready | failed

  const rawStreamRef    = useRef(null)
  const canvasRef       = useRef(null)
  const canvasStreamRef = useRef(null)
  const animFrameRef    = useRef(null)
  const videoElRef      = useRef(null)
  const bgImgRef        = useRef(null)
  const segRef          = useRef(null)
  const activeRef       = useRef(false)
  const lastSegMaskRef  = useRef(null)

  function stopLoop() {
    activeRef.current = false
    if (animFrameRef.current) { cancelAnimationFrame(animFrameRef.current); animFrameRef.current = null }
  }

  const applyBackground = useCallback(async (rawStream, mode, presetId, customUrl) => {
    stopLoop()
    if (!rawStream) return rawStream

    const videoTrack = rawStream.getVideoTracks()[0]
    if (!videoTrack || mode === 'none') {
      canvasStreamRef.current = null
      return rawStream
    }

    // Set up hidden video element
    let vid = videoElRef.current
    if (!vid) {
      vid = document.createElement('video')
      vid.autoplay = true; vid.playsInline = true; vid.muted = true
      videoElRef.current = vid
    }
    if (vid.srcObject !== rawStream) {
      vid.srcObject = rawStream
      await new Promise(r => { vid.onloadedmetadata = r; setTimeout(r, 1000) })
      await vid.play().catch(() => {})
      await new Promise(r => setTimeout(r, 200))
    }

    const W = vid.videoWidth  || 640
    const H = vid.videoHeight || 480

    let canvas = canvasRef.current
    if (!canvas) { canvas = document.createElement('canvas'); canvasRef.current = canvas }
    canvas.width = W; canvas.height = H
    const ctx = canvas.getContext('2d')

    // Pre-load background image
    const preset = PRESETS.find(p => p.id === presetId)
    const imgUrl = mode === 'custom' ? customUrl : preset?.img
    if (imgUrl) {
      try { bgImgRef.current = await loadImg(imgUrl) } catch(_) { bgImgRef.current = null }
    } else {
      bgImgRef.current = null
    }

    // Get canvas capture stream
    if (!canvasStreamRef.current) {
      canvasStreamRef.current = canvas.captureStream(30)
    }
    const audioTracks = rawStream.getAudioTracks()
    const combined = new MediaStream([...canvasStreamRef.current.getVideoTracks(), ...audioTracks])

    // Try to load MediaPipe segmentation for background replacement
    if (mode !== 'blur') {
      setSegStatus('loading')
      try {
        const seg = await getSegmenter()
        segRef.current = seg
        setSegStatus('ready')
        // Set up segmentation result callback
        seg.onResults = (results) => {
          lastSegMaskRef.current = results.segmentationMask
        }
      } catch(e) {
        console.warn('[VBG] MediaPipe failed, falling back to simple overlay:', e)
        segRef.current = null
        setSegStatus('failed')
      }
    }

    activeRef.current = true

    if (mode === 'blur') {
      // Simple blur — blur the whole frame. Clean and works well.
      function drawBlur() {
        if (!activeRef.current) return
        try {
          ctx.filter = 'blur(16px) saturate(1.1)'
          ctx.drawImage(vid, 0, 0, W, H)
          ctx.filter = 'none'
          // Draw sharp person in center ~60% region as a cheap approximation
          // This isn't segmentation but gives a better feel than full blur
          ctx.save()
          ctx.beginPath()
          const cx = W/2, cy = H/2, rx = W*0.32, ry = H*0.48
          ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI*2)
          ctx.clip()
          ctx.drawImage(vid, 0, 0, W, H)
          ctx.restore()
        } catch(_) {}
        animFrameRef.current = requestAnimationFrame(drawBlur)
      }
      drawBlur()

    } else if (segRef.current) {
      // MediaPipe segmentation — proper person cutout
      async function drawSegmented() {
        if (!activeRef.current) return
        try {
          await segRef.current.send({ image: vid })
          const mask = lastSegMaskRef.current
          if (mask) {
            // Draw background
            if (bgImgRef.current) {
              const img = bgImgRef.current
              const scale = Math.max(W/img.naturalWidth, H/img.naturalHeight)
              const sw = img.naturalWidth*scale, sh = img.naturalHeight*scale
              ctx.drawImage(img, (W-sw)/2, (H-sh)/2, sw, sh)
            } else if (preset?.gradient) {
              drawGradient(ctx, W, H, preset.gradient)
            } else {
              ctx.fillStyle = '#1e293b'; ctx.fillRect(0,0,W,H)
            }
            // Use segmentation mask to draw only person
            const offscreen = new OffscreenCanvas(W, H)
            const offCtx = offscreen.getContext('2d')
            offCtx.drawImage(mask, 0, 0, W, H)
            offCtx.globalCompositeOperation = 'source-in'
            offCtx.drawImage(vid, 0, 0, W, H)
            ctx.drawImage(offscreen, 0, 0)
          } else {
            ctx.drawImage(vid, 0, 0, W, H)
          }
        } catch(_) {
          ctx.drawImage(vid, 0, 0, W, H)
        }
        animFrameRef.current = requestAnimationFrame(drawSegmented)
      }
      drawSegmented()

    } else {
      // Fallback — no segmentation available, show background with soft vignette
      function drawFallback() {
        if (!activeRef.current) return
        try {
          if (bgImgRef.current) {
            const img = bgImgRef.current
            const scale = Math.max(W/img.naturalWidth, H/img.naturalHeight)
            const sw = img.naturalWidth*scale, sh = img.naturalHeight*scale
            ctx.drawImage(img, (W-sw)/2, (H-sh)/2, sw, sh)
          } else if (preset?.gradient) {
            drawGradient(ctx, W, H, preset.gradient)
          } else {
            ctx.fillStyle = '#1e293b'; ctx.fillRect(0,0,W,H)
          }
          // Soft center oval shows person clearly
          ctx.save()
          const grd = ctx.createRadialGradient(W/2, H/2, H*0.2, W/2, H/2, H*0.55)
          grd.addColorStop(0, 'rgba(0,0,0,0)')
          grd.addColorStop(1, 'rgba(0,0,0,0.85)')
          ctx.drawImage(vid, 0, 0, W, H)
          // Re-draw background edges only (vignette effect)
          ctx.restore()
          // Apply feathered mask: draw vid at center, bg at edges
          const offCanvas = document.createElement('canvas')
          offCanvas.width = W; offCanvas.height = H
          const offCtx = offCanvas.getContext('2d')
          offCtx.drawImage(vid, 0, 0, W, H)
          // Mask: clear edges
          const edgeMask = offCtx.createRadialGradient(W/2,H/2,H*0.22, W/2,H/2,H*0.58)
          edgeMask.addColorStop(0, 'rgba(0,0,0,1)')
          edgeMask.addColorStop(0.7, 'rgba(0,0,0,0.7)')
          edgeMask.addColorStop(1, 'rgba(0,0,0,0)')
          offCtx.globalCompositeOperation = 'destination-in'
          offCtx.fillStyle = edgeMask
          offCtx.fillRect(0,0,W,H)
          ctx.drawImage(offCanvas, 0, 0)
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
    rawStreamRef.current = rawStream
    return applyBackground(rawStream, mode, presetId, customUrl)
  }, [applyBackground])

  useEffect(() => () => stopLoop(), [])

  return { bgMode, bgPreset, customBg, segStatus, changeBackground, stopLoop, PRESETS }
}

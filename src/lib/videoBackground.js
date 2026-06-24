import { useRef, useState, useCallback, useEffect } from 'react'

export const PRESETS = [
  { id: 'blur',    label: 'Blur',          icon: '🌫️', img: null, gradient: null },
  { id: 'tcr',     label: 'TCR Brand',     icon: '🏢', img: '/taxcasereview-CRM/tcr-bg.png', gradient: null },
  { id: 'office1', label: 'Office',        icon: '💼', img: 'https://images.unsplash.com/photo-1497366216548-37526070297c?w=1280&q=80', gradient: null },
  { id: 'office2', label: 'Modern',        icon: '🪟', img: 'https://images.unsplash.com/photo-1497366811353-6870744d04b2?w=1280&q=80', gradient: null },
  { id: 'library', label: 'Library',       icon: '📚', img: 'https://images.unsplash.com/photo-1507842217343-583bb7270b66?w=1280&q=80', gradient: null },
  { id: 'gradient',label: 'Blue',          icon: '🔵', img: null, gradient: ['#1e3a8a', '#1d4ed8', '#0ea5e9'] },
  { id: 'dark',    label: 'Dark',          icon: '🌑', img: null, gradient: ['#0f172a', '#1e293b'] },
]

// Loads an image and returns it (cached)
const imgCache = {}
async function loadImg(url) {
  if (imgCache[url]) return imgCache[url]
  return new Promise((res, rej) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload  = () => { imgCache[url] = img; res(img) }
    img.onerror = () => rej(new Error('Failed to load: ' + url))
    img.src = url
  })
}

// Draws a gradient on a canvas context
function drawGradient(ctx, w, h, colors) {
  const grad = ctx.createLinearGradient(0, 0, w, h)
  colors.forEach((c, i) => grad.addColorStop(i / (colors.length - 1), c))
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, w, h)
}

export function useVideoBackground() {
  const [bgMode,   setBgMode]   = useState('none')  // 'none' | 'blur' | 'preset' | 'custom'
  const [bgPreset, setBgPreset] = useState(null)
  const [customBg, setCustomBg] = useState(null)

  const rawStreamRef    = useRef(null)
  const canvasRef       = useRef(null)
  const canvasStreamRef = useRef(null)
  const animFrameRef    = useRef(null)
  const videoElRef      = useRef(null)
  const bgImgRef        = useRef(null)
  const activeRef       = useRef(false)

  function stopLoop() {
    activeRef.current = false
    if (animFrameRef.current) { cancelAnimationFrame(animFrameRef.current); animFrameRef.current = null }
  }

  const applyBackground = useCallback(async (rawStream, mode, presetId, customUrl) => {
    stopLoop()
    if (!rawStream) return rawStream

    const videoTrack = rawStream.getVideoTracks()[0]
    if (!videoTrack || mode === 'none') {
      // Return the raw stream — no processing needed
      canvasStreamRef.current = null
      return rawStream
    }

    // Set up hidden video element
    let vid = videoElRef.current
    if (!vid) {
      vid = document.createElement('video')
      vid.autoplay = true
      vid.playsInline = true
      vid.muted = true
      videoElRef.current = vid
    }
    if (vid.srcObject !== rawStream) {
      vid.srcObject = rawStream
      await new Promise(r => { vid.onloadedmetadata = r; setTimeout(r, 500) })
      await vid.play().catch(() => {})
    }

    const W = vid.videoWidth  || 1280
    const H = vid.videoHeight || 720

    // Set up canvas
    let canvas = canvasRef.current
    if (!canvas) { canvas = document.createElement('canvas'); canvasRef.current = canvas }
    canvas.width  = W
    canvas.height = H
    const ctx = canvas.getContext('2d')

    // Pre-load background image
    const preset = PRESETS.find(p => p.id === presetId)
    const imgUrl = mode === 'custom' ? customUrl : preset?.img
    if (imgUrl) {
      try { bgImgRef.current = await loadImg(imgUrl) } catch(_) { bgImgRef.current = null }
    } else {
      bgImgRef.current = null
    }

    // Canvas capture stream
    let cs = canvasStreamRef.current
    if (!cs) {
      cs = canvas.captureStream(30)
      canvasStreamRef.current = cs
    }

    // Combine canvas video with original audio
    const audioTracks = rawStream.getAudioTracks()
    const combined = new MediaStream([...cs.getVideoTracks(), ...audioTracks])

    // Render loop
    activeRef.current = true
    function draw() {
      if (!activeRef.current) return
      try {
        if (mode === 'blur') {
          // Full-frame blur
          ctx.filter = 'blur(14px) saturate(1.2)'
          ctx.drawImage(vid, 0, 0, W, H)
          ctx.filter = 'none'
        } else {
          // Draw background
          if (bgImgRef.current) {
            // Scale-to-fill background image
            const imgW = bgImgRef.current.naturalWidth
            const imgH = bgImgRef.current.naturalHeight
            const scale = Math.max(W / imgW, H / imgH)
            const sw = imgW * scale, sh = imgH * scale
            const sx = (W - sw) / 2, sy = (H - sh) / 2
            ctx.drawImage(bgImgRef.current, sx, sy, sw, sh)
          } else if (preset?.gradient) {
            drawGradient(ctx, W, H, preset.gradient)
          } else {
            ctx.fillStyle = '#1e293b'
            ctx.fillRect(0, 0, W, H)
          }
          // Composite person over background at full opacity
          // (no segmentation — person + background blended)
          ctx.globalAlpha = 0.9
          ctx.drawImage(vid, 0, 0, W, H)
          ctx.globalAlpha = 1.0
        }
      } catch(_) {}
      animFrameRef.current = requestAnimationFrame(draw)
    }
    draw()

    return combined
  }, [])

  const changeBackground = useCallback(async (rawStream, mode, presetId, customUrl) => {
    setBgMode(mode)
    if (mode === 'none')   { setBgPreset(null) }
    if (mode === 'preset') { setBgPreset(presetId) }
    if (mode === 'custom') { setCustomBg(customUrl) }
    rawStreamRef.current = rawStream
    return applyBackground(rawStream, mode, presetId, customUrl)
  }, [applyBackground])

  useEffect(() => () => stopLoop(), [])

  return { bgMode, bgPreset, customBg, changeBackground, stopLoop, PRESETS }
}

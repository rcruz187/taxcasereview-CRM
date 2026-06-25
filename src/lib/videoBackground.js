import { useRef, useState, useCallback, useEffect } from 'react'

export const PRESETS = [
  { id: 'blur',     label: 'Blur',      icon: '🌫️', img: null, gradient: null },
  { id: 'tcr',      label: 'TCR Brand', icon: '🏢', img: '/taxcasereview-CRM/tcr-bg.png', gradient: null },
  { id: 'office1',  label: 'Office',    icon: '💼', img: 'https://images.unsplash.com/photo-1497366216548-37526070297c?w=1280&q=80', gradient: null },
  { id: 'office2',  label: 'Modern',    icon: '🪟', img: 'https://images.unsplash.com/photo-1497366811353-6870744d04b2?w=1280&q=80', gradient: null },
  { id: 'library',  label: 'Library',   icon: '📚', img: 'https://images.unsplash.com/photo-1507842217343-583bb7270b66?w=1280&q=80', gradient: null },
  { id: 'gradient', label: 'Blue',      icon: '🔵', img: null, gradient: ['#1e3a8a','#1d4ed8','#0ea5e9'] },
  { id: 'dark',     label: 'Dark',      icon: '🌑', img: null, gradient: ['#0f172a','#1e293b'] },
]

const imgCache = {}
async function loadImg(url) {
  if (imgCache[url]) return imgCache[url]
  return new Promise((res, rej) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload  = () => { imgCache[url] = img; res(img) }
    img.onerror = () => { const i2 = new Image(); i2.onload = () => { imgCache[url]=i2; res(i2) }; i2.onerror = () => rej(new Error('failed')); i2.src = url }
    img.src = url
  })
}

export function useVideoBackground() {
  const [bgMode,    setBgMode]    = useState('none')
  const [bgPreset,  setBgPreset]  = useState(null)
  const [segStatus, setSegStatus] = useState('idle')
  const animRef   = useRef(null)
  const activeRef = useRef(false)
  const vidElRef  = useRef(null)

  useEffect(() => {
    const vid = document.createElement('video')
    vid.autoplay = true; vid.playsInline = true; vid.muted = true
    vid.setAttribute('playsinline', '')
    vid.style.cssText = 'position:fixed;width:1px;height:1px;top:0;left:0;opacity:0.001;pointer-events:none;z-index:-1'
    document.body.appendChild(vid)
    vidElRef.current = vid
    return () => { vid.srcObject = null; if (vid.parentNode) vid.parentNode.removeChild(vid); vidElRef.current = null }
  }, [])

  function stopLoop() {
    activeRef.current = false
    if (animRef.current) { cancelAnimationFrame(animRef.current); animRef.current = null }
  }

  const applyBackground = useCallback(async (rawStream, mode, presetId, customUrl) => {
    stopLoop()
    if (!rawStream || mode === 'none') return rawStream
    const vid = vidElRef.current
    if (!vid) return rawStream
    vid.srcObject = rawStream
    await vid.play().catch(() => {})
    await new Promise(r => { const c = () => vid.readyState >= 2 && vid.videoWidth > 0 ? r() : setTimeout(c, 50); c(); setTimeout(r, 3000) })
    const W = vid.videoWidth || 640, H = vid.videoHeight || 480
    const outCvs = document.createElement('canvas'); outCvs.width = W; outCvs.height = H
    const outCtx = outCvs.getContext('2d')
    const combined = new MediaStream([...outCvs.captureStream(30).getVideoTracks(), ...rawStream.getAudioTracks()])
    const preset = PRESETS.find(p => p.id === presetId)
    const imgUrl = mode === 'custom' ? customUrl : preset?.img
    let bgImg = null
    if (imgUrl) { try { bgImg = await loadImg(imgUrl) } catch(e) { console.warn('[VBG]', e.message) } }
    function drawBg() {
      outCtx.clearRect(0, 0, W, H)
      if (bgImg) { const sc = Math.max(W/bgImg.naturalWidth, H/bgImg.naturalHeight); outCtx.drawImage(bgImg, (W-bgImg.naturalWidth*sc)/2, (H-bgImg.naturalHeight*sc)/2, bgImg.naturalWidth*sc, bgImg.naturalHeight*sc) }
      else if (preset?.gradient) { const g = outCtx.createLinearGradient(0,0,W,H); preset.gradient.forEach((c,i)=>g.addColorStop(i/(preset.gradient.length-1),c)); outCtx.fillStyle=g; outCtx.fillRect(0,0,W,H) }
      else { outCtx.fillStyle='#1e293b'; outCtx.fillRect(0,0,W,H) }
    }
    activeRef.current = true
    setSegStatus('ready')
    const tmp = document.createElement('canvas'); tmp.width = W; tmp.height = H
    const tCtx = tmp.getContext('2d')
    const cx = W/2, cy = H*0.48
    function loop() {
      if (!activeRef.current) return
      if (mode === 'blur') { outCtx.filter='blur(18px) brightness(0.75)'; outCtx.drawImage(vid,0,0,W,H); outCtx.filter='none' }
      else { drawBg() }
      tCtx.clearRect(0,0,W,H); tCtx.drawImage(vid,0,0,W,H)
      const innerR = mode === 'blur' ? W*0.09 : W*0.15
      const outerR = mode === 'blur' ? W*0.34 : W*0.27
      const gr = tCtx.createRadialGradient(cx,cy,innerR,cx,cy,outerR)
      gr.addColorStop(0,'rgba(0,0,0,1)'); gr.addColorStop(0.5,'rgba(0,0,0,0.95)'); gr.addColorStop(1,'rgba(0,0,0,0)')
      tCtx.globalCompositeOperation='destination-in'; tCtx.fillStyle=gr; tCtx.fillRect(0,0,W,H)
      tCtx.globalCompositeOperation='source-over'; outCtx.drawImage(tmp,0,0)
      animRef.current = requestAnimationFrame(loop)
    }
    loop()
    return combined
  }, [])

  const changeBackground = useCallback(async (rawStream, mode, presetId, customUrl) => {
    setBgMode(mode); setBgPreset(mode==='none'?null:presetId)
    if (mode==='none') { stopLoop(); return rawStream }
    return applyBackground(rawStream, mode, presetId, customUrl)
  }, [applyBackground])

  useEffect(() => () => stopLoop(), [])
  return { bgMode, bgPreset, segStatus, changeBackground, stopLoop, PRESETS }
}

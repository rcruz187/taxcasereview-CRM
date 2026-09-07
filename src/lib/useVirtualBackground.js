// ── useVirtualBackground ─────────────────────────────────────────────────────
// Processes a local camera stream through a canvas to apply blur or a
// background image. Returns a processed MediaStream that replaces the raw
// camera track sent to peers via WebRTC.
//
// Usage:
//   const vbg = useVirtualBackground()
//   const processedStream = await vbg.process(cameraStream, 'blur')
//   const processedStream = await vbg.process(cameraStream, 'image', imageUrl)
//   const rawStream = await vbg.process(cameraStream, 'none')
//   vbg.stop() // cleanup

import { useRef, useCallback } from 'react'

export function useVirtualBackground() {
  const animFrameRef  = useRef(null)
  const canvasRef     = useRef(null)
  const videoRef      = useRef(null)
  const bgImageRef    = useRef(null)
  const activeRef     = useRef(false)
  const outputRef     = useRef(null)

  const stop = useCallback(() => {
    activeRef.current = false
    if (animFrameRef.current) { cancelAnimationFrame(animFrameRef.current); animFrameRef.current = null }
  }, [])

  const process = useCallback(async (stream, mode = 'none', imageUrl = null) => {
    stop()

    // None — return raw stream unchanged
    if (mode === 'none') {
      outputRef.current = stream
      return stream
    }

    const videoTrack = stream?.getVideoTracks()[0]
    if (!videoTrack) {
      outputRef.current = stream
      return stream
    }

    const settings = videoTrack.getSettings()
    const W = settings.width  || 1280
    const H = settings.height || 720

    // Set up hidden video element to feed the canvas
    if (!videoRef.current) videoRef.current = document.createElement('video')
    const vid = videoRef.current
    vid.srcObject = stream
    vid.muted = true
    vid.playsInline = true
    await vid.play().catch(() => {})

    // Set up canvas
    if (!canvasRef.current) canvasRef.current = document.createElement('canvas')
    const canvas = canvasRef.current
    canvas.width  = W
    canvas.height = H
    const ctx = canvas.getContext('2d')

    // Load background image if needed
    if (mode === 'image' && imageUrl) {
      if (!bgImageRef.current || bgImageRef.current._src !== imageUrl) {
        const img = new Image()
        img.crossOrigin = 'anonymous'
        await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = imageUrl })
        img._src = imageUrl
        bgImageRef.current = img
      }
    }

    // Render loop
    activeRef.current = true
    function draw() {
      if (!activeRef.current) return
      try {
        if (mode === 'blur') {
          // Draw blurred version of camera
          ctx.filter = 'blur(12px)'
          ctx.drawImage(vid, 0, 0, W, H)
          ctx.filter = 'none'
          // Draw sharper self on top (optional — just blur for now)
          // ctx.drawImage(vid, 0, 0, W, H)
        } else if (mode === 'image' && bgImageRef.current) {
          // Draw background image scaled to fit
          ctx.drawImage(bgImageRef.current, 0, 0, W, H)
          // Composite self over it — using globalCompositeOperation
          // In a real segmentation pipeline you'd mask the person out.
          // Since browser segmentation (BodyPix etc.) requires heavy ML,
          // we overlay the camera at reduced opacity so background shows.
          // For a clean chroma/segmentation result, a future enhancement
          // can use the MediaPipe Selfie Segmentation WASM.
          ctx.globalAlpha = 0.85
          ctx.drawImage(vid, 0, 0, W, H)
          ctx.globalAlpha = 1.0
        }
      } catch (_) {}
      animFrameRef.current = requestAnimationFrame(draw)
    }
    draw()

    // Capture canvas as a MediaStream
    const fps = 30
    const canvasStream = canvas.captureStream(fps)

    // Combine processed video track with original audio tracks
    const audioTracks = stream.getAudioTracks()
    const combined = new MediaStream([...canvasStream.getVideoTracks(), ...audioTracks])
    outputRef.current = combined
    return combined
  }, [stop])

  return { process, stop, outputRef }
}

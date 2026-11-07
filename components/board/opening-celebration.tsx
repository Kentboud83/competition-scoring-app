'use client'

import { useEffect, useRef, useState } from 'react'

const SESSION_KEY = 'opening-celebration-played'
const SOUND_STORAGE_KEY = 'rankings-sound-on'

// Fanfare: C5 - E5 - G5, a short ascending arpeggio, ~0.9s total.
// Confetti colours: Team Red / Team Blue (globals.css --team-red /
// --team-blue), amber/gold and white.
const CONFETTI_COLORS = ['#e5484d', '#4a90e2', '#fbbf24', '#f59e0b', '#ffffff']
const CONFETTI_COUNT = 150
const CONFETTI_MS = 2600

function soundEnabled() {
  try {
    return window.localStorage.getItem(SOUND_STORAGE_KEY) !== 'false'
  } catch {
    return true
  }
}

// Schedule the three fanfare notes on a running context, then close it.
// Same guarded Web Audio approach as the Rankings click sound.
function playFanfareNotes(ctx: AudioContext) {
  const notes = [523.25, 659.25, 783.99]
  const now = ctx.currentTime
  notes.forEach((freq, i) => {
    const start = now + i * 0.16
    const oscillator = ctx.createOscillator()
    const gain = ctx.createGain()
    oscillator.type = 'triangle'
    oscillator.frequency.setValueAtTime(freq, start)
    gain.gain.setValueAtTime(0.0001, start)
    gain.gain.exponentialRampToValueAtTime(0.09, start + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.001, start + 0.32)
    oscillator.connect(gain)
    gain.connect(ctx.destination)
    oscillator.start(start)
    oscillator.stop(start + 0.34)
  })
  window.setTimeout(() => {
    ctx.close().catch(() => {})
  }, 1100)
}

// Try to play the fanfare now. Browsers block sound until the user has
// interacted with the page, so when the AudioContext is suspended the
// fanfare instead plays on the first tap/click/keypress anywhere in the
// app. The listeners are one-time and remove themselves, and they live on
// window (not the component) so a tap on another tab still counts as the
// first tap. Any failure is swallowed: sound must never break the Board.
function tryPlayFanfare() {
  if (!soundEnabled()) return
  try {
    const AudioContextCtor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AudioContextCtor) return
    const ctx = new AudioContextCtor()
    const resumed = ctx.resume?.()
    if (resumed && typeof resumed.catch === 'function') resumed.catch(() => {})
    if (ctx.state === 'running') {
      playFanfareNotes(ctx)
      return
    }
    let played = false
    const onFirstGesture = () => {
      if (played) return
      played = true
      window.removeEventListener('pointerdown', onFirstGesture)
      window.removeEventListener('keydown', onFirstGesture)
      const play = () => {
        try {
          playFanfareNotes(ctx)
        } catch {
          ctx.close().catch(() => {})
        }
      }
      try {
        const resumedAgain = ctx.resume()
        if (resumedAgain && typeof resumedAgain.then === 'function') {
          resumedAgain.then(play, play)
        } else {
          play()
        }
      } catch {
        play()
      }
    }
    window.addEventListener('pointerdown', onFirstGesture)
    window.addEventListener('keydown', onFirstGesture)
  } catch {
    // Sound must never break the Board.
  }
}

type Piece = {
  x: number
  y: number
  vx: number
  vy: number
  w: number
  h: number
  color: string
  rot: number
  vr: number
  circle: boolean
}

// Hand-rolled canvas confetti burst: ~150 pieces across the full screen,
// falling with gravity for about 2.6s, then fully gone. Returns a cleanup
// that cancels the animation frame.
function burstConfetti(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d')
  if (!ctx) return () => {}
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  const width = window.innerWidth
  const height = window.innerHeight
  canvas.width = Math.floor(width * dpr)
  canvas.height = Math.floor(height * dpr)
  ctx.scale(dpr, dpr)
  const pieces: Piece[] = Array.from({ length: CONFETTI_COUNT }, () => ({
    x: Math.random() * width,
    y: -20 - Math.random() * height * 0.25,
    vx: (Math.random() - 0.5) * 3,
    vy: 1.5 + Math.random() * 3.5,
    w: 6 + Math.random() * 6,
    h: 8 + Math.random() * 8,
    color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
    rot: Math.random() * Math.PI * 2,
    vr: (Math.random() - 0.5) * 0.3,
    circle: Math.random() < 0.2,
  }))
  const start = performance.now()
  let raf = 0
  const tick = (t: number) => {
    const elapsed = t - start
    const progress = elapsed / CONFETTI_MS
    if (progress >= 1) {
      ctx.clearRect(0, 0, width, height)
      return
    }
    ctx.clearRect(0, 0, width, height)
    ctx.globalAlpha = progress > 0.75 ? Math.max(0, 1 - (progress - 0.75) / 0.25) : 1
    for (const p of pieces) {
      p.vy += 0.05
      p.vx *= 0.99
      p.x += p.vx + Math.sin(t / 300 + p.rot) * 0.6
      p.y += p.vy
      p.rot += p.vr
      ctx.save()
      ctx.translate(p.x, p.y)
      ctx.rotate(p.rot)
      ctx.fillStyle = p.color
      if (p.circle) {
        ctx.beginPath()
        ctx.arc(0, 0, p.w / 2, 0, Math.PI * 2)
        ctx.fill()
      } else {
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h)
      }
      ctx.restore()
    }
    ctx.globalAlpha = 1
    raf = requestAnimationFrame(tick)
  }
  raf = requestAnimationFrame(tick)
  return () => cancelAnimationFrame(raf)
}

// Opening celebration: a champion fanfare plus a confetti burst, fired
// once per browser session when the Board (home) page first mounts.
// sessionStorage keeps it from re-firing on in-app tab switches or on
// reloads within the same session; a fresh session plays it again.
// Confetti is skipped entirely for users who prefer reduced motion.
// The canvas is fixed, pointer-events none and above the app content,
// so it never blocks taps or scrolling, and it is removed after ~2.6s.
export function OpeningCelebration() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [showConfetti, setShowConfetti] = useState(false)

  useEffect(() => {
    try {
      if (window.sessionStorage.getItem(SESSION_KEY)) return
      window.sessionStorage.setItem(SESSION_KEY, 'true')
    } catch {
      // Storage unavailable; still celebrate this mount only.
    }
    try {
      if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        setShowConfetti(true)
      }
    } catch {
      setShowConfetti(true)
    }
    tryPlayFanfare()
  }, [])

  useEffect(() => {
    if (!showConfetti) return
    const canvas = canvasRef.current
    if (!canvas) return
    const cancel = burstConfetti(canvas)
    const timer = window.setTimeout(() => setShowConfetti(false), CONFETTI_MS + 100)
    return () => {
      window.clearTimeout(timer)
      cancel()
    }
  }, [showConfetti])

  if (!showConfetti) return null
  return (
    <canvas
      ref={canvasRef}
      data-testid="opening-celebration-confetti"
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-[9999] h-full w-full"
    />
  )
}

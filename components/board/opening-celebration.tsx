'use client'

import { useEffect, useRef, useState } from 'react'
import { playFanfare, unlockAudioOnFirstGesture } from '@/lib/sound'

// The last celebration is stamped in sessionStorage so the fanfare does
// not fire on every in-app tab switch — but only for 30 minutes. A plain
// once-per-session flag failed on phones: a tab can stay alive for days,
// so after the very first open the tone never played again. A 30-minute
// cooldown means a fresh open after a while celebrates again, while
// flipping between Board and Leaders (seconds apart) stays quiet.
const SESSION_KEY = 'opening-celebration-at'
const CELEBRATION_COOLDOWN_MS = 30 * 60 * 1000

// Fanfare: C5 - E5 - G5, a short ascending arpeggio, ~0.9s total.
// Confetti colours: Team Red / Team Blue (globals.css --team-red /
// --team-blue), amber/gold and white.
const CONFETTI_COLORS = ['#e5484d', '#4a90e2', '#fbbf24', '#f59e0b', '#ffffff']
const CONFETTI_COUNT = 150
const CONFETTI_MS = 2600

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
// when the Board (home) page first mounts and the last celebration was
// more than 30 minutes ago (see SESSION_KEY above). In-app tab switches
// or reloads within the cooldown stay quiet; a fresh open after a while
// celebrates again.
// Reduced motion skips the CONFETTI only — the fanfare is sound, not
// motion, so it still plays. (Previously the whole celebration, tone
// included, was suppressed when reduced motion was on, which silenced
// the tone for anyone with "remove animations" turned on.)
//
// Sync: browsers block sound until the user has tapped, so the confetti
// does NOT burst on mount — it waits for the first tap, and the fanfare
// plays at the same moment. Passive viewers still see the confetti: if
// nobody taps within ~2s, it bursts silently on its own and the fanfare
// stays deferred to the first tap after that.
// The canvas is fixed, pointer-events none and above the app content,
// so it never blocks taps or scrolling, and it is removed after ~2.6s.
export function OpeningCelebration() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [showConfetti, setShowConfetti] = useState(false)

  useEffect(() => {
    try {
      const last = Number(window.sessionStorage.getItem(SESSION_KEY) || 0)
      if (last && Date.now() - last < CELEBRATION_COOLDOWN_MS) return
      window.sessionStorage.setItem(SESSION_KEY, String(Date.now()))
    } catch {
      // Storage unavailable; still celebrate this mount only.
    }
    let reducedMotion = false
    try {
      reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    } catch {
      // If the media query is unavailable, celebrate as normal.
    }

    let celebrated = false
    let fallbackTimer: number | null = null

    const stopListening = () => {
      window.removeEventListener('pointerdown', onFirstGesture)
      window.removeEventListener('keydown', onFirstGesture)
      if (fallbackTimer !== null) {
        window.clearTimeout(fallbackTimer)
        fallbackTimer = null
      }
    }

    // First tap anywhere in the app: fanfare and confetti together, at
    // the same moment (confetti skipped when reduced motion is on, the
    // fanfare still plays). playFanfare uses the shared AudioContext
    // (lib/sound) and awaits resume before scheduling the notes, and
    // the sound toggle gates it; a sound failure never breaks the Board.
    const onFirstGesture = () => {
      if (celebrated) return
      celebrated = true
      stopListening()
      if (!reducedMotion) setShowConfetti(true)
      void playFanfare()
    }
    window.addEventListener('pointerdown', onFirstGesture)
    window.addEventListener('keydown', onFirstGesture)

    // Fallback for passive viewers: after ~2s with no tap, burst the
    // confetti silently exactly as before. The fanfare stays deferred
    // to the first tap after that — playFanfare waits for a gesture
    // internally when autoplay is blocked.
    fallbackTimer = window.setTimeout(() => {
      if (celebrated) return
      celebrated = true
      stopListening()
      if (!reducedMotion) setShowConfetti(true)
      void playFanfare()
    }, 2000)

    unlockAudioOnFirstGesture()

    return stopListening
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

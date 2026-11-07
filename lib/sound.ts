// Shared Web Audio for the Board: ONE lazily-created AudioContext for the
// whole app, unlocked on the first user gesture, with tone helpers that
// await resume before scheduling any notes.
//
// Why one context: creating a fresh AudioContext on every tap is slow on a
// phone (it runs inside the tap handler, before the row expands) and a
// fresh context starts suspended on mobile browsers, so notes scheduled at
// currentTime while suspended never sound — and their onended handlers
// never fire, leaking the contexts. The shared context is created once and
// kept alive for the life of the page; it is never closed after a sound.
//
// Sound failures must never break the Board: every helper swallows errors
// and resolves to a status ('now' | 'deferred' | 'skipped') instead of
// throwing.

const SOUND_STORAGE_KEY = 'rankings-sound-on'

export type PlayResult = 'now' | 'deferred' | 'skipped'

// The Rankings header toggle gates ALL Board sounds (clicks, fanfare and
// chimes). Default ON; read from localStorage, the same key the toggle
// persists to.
export function isSoundEnabled(): boolean {
  try {
    return window.localStorage.getItem(SOUND_STORAGE_KEY) !== 'false'
  } catch {
    return true
  }
}

let sharedCtx: AudioContext | null = null
let gesturePromise: Promise<void> | null = null

function audioCtor(): typeof AudioContext | null {
  if (typeof window === 'undefined') return null
  return (
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext ??
    null
  )
}

// The one shared context, created lazily on first use and kept alive.
// Returns null when the browser has no Web Audio.
function getContext(): AudioContext | null {
  if (sharedCtx) return sharedCtx
  const Ctor = audioCtor()
  if (!Ctor) return null
  try {
    sharedCtx = new Ctor()
  } catch {
    return null
  }
  return sharedCtx
}

// Resolves on the first pointer/key gesture anywhere in the app. Installed
// once; later calls reuse the same (already-resolved) promise.
function waitForGesture(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve()
  if (!gesturePromise) {
    gesturePromise = new Promise<void>((resolve) => {
      const onGesture = () => {
        window.removeEventListener('pointerdown', onGesture)
        window.removeEventListener('keydown', onGesture)
        resolve()
      }
      window.addEventListener('pointerdown', onGesture)
      window.addEventListener('keydown', onGesture)
    })
  }
  return gesturePromise
}

// Resume the shared context and wait until it is actually running. Returns
// null when there is no Web Audio or the context stays suspended (autoplay
// is still blocked because the user hasn't interacted yet). The resume is
// raced against a short timeout so a context that never resumes cannot
// hang a caller.
// Small helper so the state check is never narrowed by earlier branches:
// resume() can change the state at runtime, so the check after awaiting
// it must always run.
function isRunning(ctx: AudioContext): boolean {
  return ctx.state === 'running'
}

async function ensureRunning(): Promise<AudioContext | null> {
  const ctx = getContext()
  if (!ctx) return null
  if (isRunning(ctx)) return ctx
  try {
    await Promise.race([ctx.resume(), new Promise((resolve) => window.setTimeout(resolve, 300))])
  } catch {
    // Resume failed; fall through to the state check below.
  }
  return isRunning(ctx) ? ctx : null
}

type Note = {
  freq: number
  at: number // seconds after the first note
  duration: number // seconds the note rings
  type?: OscillatorType
  peak?: number
  attack?: number // seconds to reach peak; 0 = start at peak (a blip)
}

function scheduleNotes(ctx: AudioContext, notes: Note[]) {
  const now = ctx.currentTime
  for (const note of notes) {
    const start = now + note.at
    const oscillator = ctx.createOscillator()
    const gain = ctx.createGain()
    oscillator.type = note.type ?? 'triangle'
    oscillator.frequency.setValueAtTime(note.freq, start)
    const peak = note.peak ?? 0.09
    const attack = note.attack ?? 0.02
    if (attack <= 0) {
      gain.gain.setValueAtTime(peak, start)
    } else {
      gain.gain.setValueAtTime(0.0001, start)
      gain.gain.exponentialRampToValueAtTime(peak, start + attack)
    }
    gain.gain.exponentialRampToValueAtTime(0.001, start + note.duration)
    oscillator.connect(gain)
    gain.connect(ctx.destination)
    oscillator.start(start)
    oscillator.stop(start + note.duration + 0.05)
  }
}

// Play notes now if the context is running, otherwise on the first user
// gesture (autoplay-blocked sound defers to the first tap, exactly like
// the old fanfare/chime behaviour). Never throws.
async function playNotes(notes: Note[]): Promise<PlayResult> {
  try {
    if (!isSoundEnabled()) return 'skipped'
    let ctx = await ensureRunning()
    if (ctx) {
      scheduleNotes(ctx, notes)
      return 'now'
    }
    // Still suspended: wait for the first gesture, then try once more.
    await waitForGesture()
    ctx = await ensureRunning()
    if (!ctx) return 'skipped'
    scheduleNotes(ctx, notes)
    return 'deferred'
  } catch {
    return 'skipped'
  }
}

// Short click for Rankings rows: a higher blip opening, a lower blip
// closing. Under ~100ms, same as before.
export function playClick(opening: boolean): Promise<PlayResult> {
  return playNotes([{ freq: opening ? 720 : 520, at: 0, duration: 0.07, type: 'sine', peak: 0.08, attack: 0 }])
}

// Opening fanfare: C5 - E5 - G5, a short ascending arpeggio, ~0.9s total.
export function playFanfare(): Promise<PlayResult> {
  return playNotes([
    { freq: 523.25, at: 0, duration: 0.32 },
    { freq: 659.25, at: 0.16, duration: 0.32 },
    { freq: 783.99, at: 0.32, duration: 0.32 },
  ])
}

// Team-score chime: two quick notes, ascending E5 -> A5 when gaining,
// descending C5 -> G4 when losing.
export function playChime(gaining: boolean): Promise<PlayResult> {
  const freqs = gaining ? [659.25, 880] : [523.25, 392]
  return playNotes(freqs.map((freq, i) => ({ freq, at: i * 0.18, duration: 0.3 })))
}

// Install the first-gesture unlock listener eagerly (e.g. when the Board
// mounts) so the shared context is already running by the time a sound is
// needed. Safe to call repeatedly.
export function unlockAudioOnFirstGesture(): void {
  if (typeof window === 'undefined') return
  void waitForGesture().then(() => {
    void ensureRunning()
  })
}

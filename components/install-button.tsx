'use client'

import { Download, Share, SquarePlus, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Button } from '@/components/ui/button'

type InstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> }

export function InstallButton() {
  const [promptEvent, setPromptEvent] = useState<InstallPromptEvent | null>(null)
  const [installed, setInstalled] = useState(false)
  const [showHelp, setShowHelp] = useState(false)

  useEffect(() => {
    setInstalled(window.matchMedia('(display-mode: standalone)').matches)
    const onPrompt = (e: Event) => {
      e.preventDefault()
      setPromptEvent(e as InstallPromptEvent)
    }
    const onInstalled = () => setInstalled(true)
    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  // Escape closes the help dialog.
  useEffect(() => {
    if (!showHelp) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowHelp(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [showHelp])

  if (installed) return null

  const handleClick = async () => {
    if (promptEvent) {
      await promptEvent.prompt()
      await promptEvent.userChoice
      setPromptEvent(null)
    } else {
      setShowHelp(true)
    }
  }

  // The dialog is portaled to document.body. It used to render inside the
  // app header, and the header's backdrop-blur traps position:fixed
  // descendants inside the header — so the dialog rendered cut off above
  // the screen with its heading and close button unreachable, and taps on
  // the dimmed area never reached it. Portaling keeps it over the real
  // viewport. It is centered (not bottom-anchored) with a capped height
  // and safe-area padding, so it can never sit under Safari's toolbar or
  // run off the top or bottom of a phone screen.
  const dialog = showHelp
    ? createPortal(
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="install-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))]"
          onClick={() => setShowHelp(false)}
        >
          <div
            className="max-h-[calc(100dvh-2rem)] w-full max-w-sm overflow-y-auto rounded-2xl border border-border bg-card p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <h2 id="install-title" className="font-display text-2xl font-bold uppercase">
                Add to your phone
              </h2>
              <button
                type="button"
                onClick={() => setShowHelp(false)}
                className="rounded-md p-1 text-muted-foreground hover:text-foreground"
                aria-label="Close"
              >
                <X className="size-5" />
              </button>
            </div>
            <div className="mt-4 space-y-4 text-sm">
              <section>
                <h3 className="font-semibold">iPhone (Safari)</h3>
                <ol className="mt-1.5 space-y-1.5 text-muted-foreground">
                  <li className="flex items-center gap-2">
                    1. Tap the Share button <Share className="size-4 text-foreground" aria-label="Share icon" />
                  </li>
                  <li className="flex items-center gap-2">
                    2. Choose Add to Home Screen <SquarePlus className="size-4 text-foreground" aria-label="Add icon" />
                  </li>
                  <li>3. Tap Add</li>
                </ol>
              </section>
              <section>
                <h3 className="font-semibold">Android (Chrome)</h3>
                <ol className="mt-1.5 space-y-1.5 text-muted-foreground">
                  <li>1. Tap the menu (three dots) in the top right</li>
                  <li>2. Choose Install app or Add to Home screen</li>
                </ol>
              </section>
              <p className="text-muted-foreground">
                The Showdown icon will appear on your home screen and opens full-screen like a regular app.
              </p>
            </div>
          </div>
        </div>,
        document.body,
      )
    : null

  return (
    <>
      <Button size="sm" onClick={handleClick} className="shrink-0 gap-1.5">
        <Download className="size-4" aria-hidden="true" />
        Get App
      </Button>
      {dialog}
    </>
  )
}

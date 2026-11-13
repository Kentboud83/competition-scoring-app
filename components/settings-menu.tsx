'use client'

import { Settings as SettingsIcon, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { PushToggle } from '@/components/board/push-toggle'

// Gear icon in the header (signed-in people only) that opens the Settings
// menu. The menu always shows the notifications switch — on or off — so
// anyone can turn push notifications on or off from inside the app without
// hunting for the Smack Talk toggle or digging into phone settings. The
// switch itself is the existing PushToggle with alwaysShow: it reads the
// real subscription state, subscribes on turn-on (permission prompt fires
// only from that tap) and unsubscribes on turn-off.
//
// The dialog is portalled to document.body: the header uses backdrop-blur,
// which makes it a containing block for fixed-position descendants —
// without the portal the dialog would position against the header instead
// of the viewport and render cut off at the top of the screen.
export function SettingsMenu() {
  const [open, setOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    panelRef.current?.focus()
    return () => document.removeEventListener('keydown', onKey)
  }, [open ])

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Settings"
        aria-haspopup="dialog"
        aria-expanded={open}
        title="Settings"
        className="flex size-8 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:text-foreground"
      >
        <SettingsIcon className="size-4" aria-hidden="true" />
      </button>
      {open &&
        mounted &&
        createPortal(
          <div
            className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center"
            onClick={() => setOpen(false)}
          >
            <div
              ref={panelRef}
              role="dialog"
              aria-modal="true"
              aria-label="Settings"
              tabIndex={-1}
              className="w-full max-w-md rounded-3xl bg-background p-5 shadow-xl outline-none"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between">
                <h2 className="font-display text-xl font-bold uppercase tracking-wide">Settings</h2>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="Close settings"
                  className="flex size-8 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:text-foreground"
                >
                  <X className="size-4" aria-hidden="true" />
                </button>
              </div>
              <div className="mt-4">
                <PushToggle alwaysShow />
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  )
}

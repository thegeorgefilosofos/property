'use client'
import { useState, useRef, useCallback, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

// Μικρό, ενιαίο ⓘ με premium popover που εμφανίζεται στο hover/focus. Portal →
// δεν κόβεται από overflow. Θεματικό (light/dark). Χρήση με μέτρο: μόνο εκεί που
// υπάρχει ουσιαστική εξήγηση να «ανοίξει έξυπνα», ώστε το UI να μένει καθαρό.
export function InfoHint({ children, size = 14, label = 'Περισσότερα' }: { children: ReactNode; size?: number; label?: string }) {
  const ref = useRef<HTMLButtonElement>(null)
  const [pos, setPos] = useState<{ top: number; left: number; place: 'top' | 'bottom' } | null>(null)

  const show = useCallback(() => {
    const el = ref.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const below = r.bottom + 12
    const place = below + 140 > window.innerHeight ? 'top' : 'bottom'
    const top = place === 'bottom' ? r.bottom + 8 : r.top - 8
    let left = r.left + r.width / 2
    left = Math.max(150, Math.min(left, window.innerWidth - 150))
    setPos({ top, left, place })
  }, [])
  const hide = useCallback(() => setPos(null), [])

  return (
    <>
      <button
        ref={ref} type="button" aria-label={label}
        onMouseEnter={show} onMouseLeave={hide} onFocus={show} onBlur={hide}
        onClick={(e) => { e.stopPropagation(); pos ? hide() : show() }}
        style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center', verticalAlign: 'middle',
          width: size, height: size, borderRadius: '50%', border: 'none', padding: 0, margin: '0 0 0 5px',
          background: 'transparent', color: 'var(--text-tertiary)', cursor: 'help', flexShrink: 0, lineHeight: 0,
          transition: 'color 0.13s',
        }}
        onMouseOver={(e) => (e.currentTarget.style.color = 'var(--accent)')}
        onMouseOut={(e) => (e.currentTarget.style.color = 'var(--text-tertiary)')}
      >
        <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
          <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.3" />
          <path d="M8 7.2v3.6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <circle cx="8" cy="5.1" r="0.85" fill="currentColor" />
        </svg>
      </button>
      {pos && typeof document !== 'undefined' && createPortal(
        <div
          role="tooltip"
          style={{
            position: 'fixed', top: pos.top, left: pos.left,
            transform: `translate(-50%, ${pos.place === 'bottom' ? '0' : '-100%'})`,
            zIndex: 9999, maxWidth: 280, width: 'max-content',
            background: 'var(--bg-elevated)', color: 'var(--text-secondary)',
            border: '1px solid var(--border-default)', borderRadius: 12,
            padding: '11px 13px', fontSize: 12, lineHeight: 1.55, fontFamily: "'Inter',sans-serif",
            boxShadow: '0 12px 32px -12px rgba(0,0,0,0.55)', pointerEvents: 'none',
          }}
        >
          {children}
        </div>,
        document.body,
      )}
    </>
  )
}

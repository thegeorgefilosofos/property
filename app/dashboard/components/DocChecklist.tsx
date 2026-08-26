'use client'
import { useEffect, useState } from 'react'
import type { LoanDoc } from './TabLoanData'
import { T } from '@/components/Theme'
import { useRemembered } from '@/components/useRememberedFlag'

// Επαγγελματική, ελεγχόμενη λίστα δικαιολογητικών: τικάρεις ό,τι έχεις μαζέψει,
// βλέπεις πρόοδο και η κατάσταση διατηρείται (ανά ακίνητο/τύπο δανείου).
// Σταθερή αναφορά για το «τίποτα τικαρισμένο».
const NONE: Set<number> = new Set()

export default function DocChecklist({ docs, storageKey, title = 'Δικαιολογητικά που θα χρειαστείς', compact = false }: {
  docs: LoanDoc[]; storageKey?: string; title?: string; compact?: boolean
}) {
  // Η ΛΙΣΤΑ ΘΥΜΑΤΑΙ ΣΤΟΝ ΠΕΡΙΗΓΗΤΗ, ΟΧΙ ΣΤΗ REACT. Ηταν άδειο σύνολο που ένα
  // effect γέμιζε μετά την πρώτη απόδοση: ο χρήστης που είχε τικάρει εννιά
  // δικαιολογητικά έβλεπε για ένα καρέ όλα άτικαρα και την πρόοδο στο μηδέν.
  const [done, setDone] = useRemembered<Set<number>>(
    'docchk:' + (storageKey || ''),
    raw => { try { return storageKey && raw ? new Set<number>(JSON.parse(raw) as number[]) : NONE } catch { return NONE } },
    v => JSON.stringify([...v]),
    NONE,
  )
  const toggle = (i: number) => {
    const n = new Set(done); n.has(i) ? n.delete(i) : n.add(i)
    if (storageKey) setDone(n)
  }
  const total = docs.length
  const count = [...done].filter(i => i < total).length
  const pct = total ? Math.round((count / total) * 100) : 0
  const complete = total > 0 && count === total
  const font = T.font.sans
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: compact ? 10 : 12 }}>
        <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', fontFamily: font, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{title}</p>
        <span style={{ fontSize: 11, fontWeight: 500, color: complete ? 'var(--accent)' : 'var(--text-tertiary)', fontFamily: font, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{count}/{total} έτοιμα</span>
      </div>
      <div style={{ height: 4, borderRadius: 3, background: 'var(--bg-surface)', overflow: 'hidden', marginBottom: compact ? 10 : 12 }}>
        <div style={{ width: `${pct}%`, height: '100%', borderRadius: 3, background: 'var(--accent)', transition: 'width 0.35s ease' }} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: compact ? 6 : 7 }}>
        {docs.map((d, i) => {
          const on = done.has(i)
          return (
            <button key={i} onClick={() => toggle(i)} aria-pressed={on} style={{
              display: 'flex', alignItems: 'center', gap: compact ? 10 : 12, width: '100%', textAlign: 'left', cursor: 'pointer',
              padding: compact ? '8px 12px' : '12px 12px', borderRadius: 10, transition: 'background 0.15s, border-color 0.15s',
              background: on ? 'var(--accent-dim)' : 'var(--bg-surface)', border: `1px solid ${on ? 'var(--border-accent)' : 'var(--border-subtle)'}`,
            }}>
              <span style={{
                width: compact ? 18 : 20, height: compact ? 18 : 20, flexShrink: 0, borderRadius: 6, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                background: on ? 'var(--accent)' : 'transparent', border: `1.5px solid ${on ? 'var(--accent)' : 'var(--border-default)'}`, transition: 'background 0.15s, border-color 0.15s',
              }}>
                {on && <svg width={compact ? 11 : 12} height={compact ? 11 : 12} viewBox="0 0 24 24" fill="none" stroke="var(--accent-text)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>}
              </span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ fontSize: compact ? 12 : 13, fontWeight: 500, fontFamily: font, color: on ? 'var(--text-tertiary)' : 'var(--text-primary)', textDecoration: on ? 'line-through' : 'none' }}>{d.name}</span>
                {d.where && <span style={{ display: 'block', fontSize: 11, color: 'var(--text-tertiary)', fontFamily: font, marginTop: 2 }}>Από: {d.where}</span>}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

'use client'
import { useEffect, useState } from 'react'
import type { LoanDoc } from './TabLoanData'

// Επαγγελματική, ελεγχόμενη λίστα δικαιολογητικών: τικάρεις ό,τι έχεις μαζέψει,
// βλέπεις πρόοδο, και η κατάσταση διατηρείται (ανά ακίνητο/τύπο δανείου).
export default function DocChecklist({ docs, storageKey, title = 'Δικαιολογητικά που θα χρειαστείς' }: {
  docs: LoanDoc[]; storageKey?: string; title?: string
}) {
  const [done, setDone] = useState<Set<number>>(new Set())
  useEffect(() => {
    if (!storageKey) { setDone(new Set()); return }
    try { const raw = localStorage.getItem('docchk:' + storageKey); setDone(raw ? new Set(JSON.parse(raw) as number[]) : new Set()) }
    catch { setDone(new Set()) }
  }, [storageKey])
  const toggle = (i: number) => setDone(prev => {
    const n = new Set(prev); n.has(i) ? n.delete(i) : n.add(i)
    if (storageKey) { try { localStorage.setItem('docchk:' + storageKey, JSON.stringify([...n])) } catch { /* ignore */ } }
    return n
  })
  const total = docs.length
  const count = [...done].filter(i => i < total).length
  const pct = total ? Math.round((count / total) * 100) : 0
  const complete = total > 0 && count === total
  const font = "'Inter',sans-serif"
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
        <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', fontFamily: font, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{title}</p>
        <span style={{ fontSize: 11.5, fontWeight: 600, color: complete ? 'var(--accent)' : 'var(--text-tertiary)', fontFamily: font, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{count}/{total} έτοιμα</span>
      </div>
      <div style={{ height: 4, borderRadius: 3, background: 'var(--bg-surface)', overflow: 'hidden', marginBottom: 12 }}>
        <div style={{ width: `${pct}%`, height: '100%', borderRadius: 3, background: 'var(--accent)', transition: 'width 0.35s ease' }} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
        {docs.map((d, i) => {
          const on = done.has(i)
          return (
            <button key={i} onClick={() => toggle(i)} aria-pressed={on} style={{
              display: 'flex', alignItems: 'center', gap: 12, width: '100%', textAlign: 'left', cursor: 'pointer',
              padding: '11px 13px', borderRadius: 10, transition: 'background 0.15s, border-color 0.15s',
              background: on ? 'var(--accent-dim)' : 'var(--bg-surface)', border: `1px solid ${on ? 'var(--border-accent)' : 'var(--border-subtle)'}`,
            }}>
              <span style={{
                width: 20, height: 20, flexShrink: 0, borderRadius: 6, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                background: on ? 'var(--accent)' : 'transparent', border: `1.5px solid ${on ? 'var(--accent)' : 'var(--border-default)'}`, transition: 'background 0.15s, border-color 0.15s',
              }}>
                {on && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--accent-text)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>}
              </span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ fontSize: 13, fontWeight: 500, fontFamily: font, color: on ? 'var(--text-tertiary)' : 'var(--text-primary)', textDecoration: on ? 'line-through' : 'none' }}>{d.name}</span>
                {d.where && <span style={{ display: 'block', fontSize: 11, color: 'var(--text-tertiary)', fontFamily: font, marginTop: 2 }}>Από: {d.where}</span>}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

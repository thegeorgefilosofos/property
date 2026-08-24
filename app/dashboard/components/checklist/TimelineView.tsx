'use client'
// ═══════════════════════════════════════════════════════════════════════════
// ΟΙ ΕΚΚΡΕΜΟΤΗΤΕΣ ΣΕ ΓΡΑΜΜΗ ΧΡΟΝΟΥ
// ─────────────────────────────────────────────────────────────────────────
// Η ίδια λίστα, ταξινομημένη κατά προθεσμία: απαντά στο «τι έρχεται», ενώ η
// λίστα απαντά στο «τι υπάρχει».
// ═══════════════════════════════════════════════════════════════════════════
import { T, pressable } from '@/components/Theme'
import { relDays, PriorityCue } from './Bits'
import { fmtDate, isOverdue, daysUntil, getCat } from './calc'
import type { ChecklistItem } from './model'


// ─── TimelineView ─────────────────────────────────────────────────────────────
export function TimelineView({ items, onEdit }: { items: ChecklistItem[]; onEdit: (item: ChecklistItem) => void }) {
  const withDates = [...items].filter(i => i.due_date).sort((a, b) => (a.due_date || '').localeCompare(b.due_date || ''))
  const noDates = items.filter(i => !i.due_date)
  return (
    <div>
      <div style={{ position: 'relative', paddingLeft: 32 }}>
        <div style={{ position: 'absolute', left: 10, top: 0, bottom: 0, width: 2, background: 'var(--border-subtle)' }} />
        {withDates.map(item => {
          const cat = getCat(item.category)
          const overdue = isOverdue(item.due_date, item.status); const done = item.status === 'done'; const due = daysUntil(item.due_date)
          return (
            <div key={item.id} style={{ marginBottom: 14, position: 'relative' }}>
              <div style={{ position: 'absolute', left: -26, top: 8, width: 14, height: 14, borderRadius: '50%', background: done ? 'var(--accent)' : overdue ? 'var(--negative)' : 'var(--text-tertiary)', border: '2px solid var(--bg-base)', zIndex: 1 }} />
              <div {...pressable(() => onEdit(item))} style={{ background: 'var(--bg-surface)', border: '1px solid ' + (overdue ? 'var(--negative-border)' : 'var(--border-subtle)'), borderRadius: T.radius.inner, padding: '10px 14px', cursor: 'pointer', transition: 'border-color 0.15s' }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--accent)')} onMouseLeave={e => (e.currentTarget.style.borderColor = overdue ? 'var(--negative-border)' : 'var(--border-subtle)')}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: done ? 'var(--text-secondary)' : 'var(--text-primary)', textDecoration: done ? 'line-through' : 'none', marginBottom: 4, fontFamily: T.font.sans }}>{item.description}</div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{cat.label}</span>
                      <PriorityCue priority={item.priority} />
                      {item.assigned_contact_name && <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{item.assigned_contact_name}</span>}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 12 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: overdue ? 'var(--negative)' : due !== null && due <= 3 && due >= 0 ? 'var(--warning)' : 'var(--text-secondary)', fontFamily: T.font.mono, fontVariantNumeric: 'tabular-nums' }}>{fmtDate(item.due_date)}</div>
                    {overdue && <div style={{ fontSize: 11, color: 'var(--negative)' }}>πριν {relDays(due || 0)}</div>}
                    {!overdue && due !== null && due <= 7 && due >= 0 && <div style={{ fontSize: 11, color: 'var(--warning)' }}>{due === 0 ? 'σήμερα' : 'σε ' + relDays(due)}</div>}
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>
      {noDates.length > 0 && (
        <div style={{ marginTop: 20 }}>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 10, fontWeight: 600, fontFamily: T.font.sans }}>Χωρίς προθεσμία ({noDates.length})</div>
          {noDates.map(item => {
            const cat = getCat(item.category)
            return (
              <div key={item.id} {...pressable(() => onEdit(item))} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: T.radius.inner, marginBottom: 6, cursor: 'pointer' }}>
                <span style={{ fontSize: 13, color: 'var(--text-primary)', flex: 1, fontFamily: T.font.sans }}>{item.description}</span>
                <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{cat.label}</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

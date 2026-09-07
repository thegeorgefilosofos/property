'use client'
import { useState } from 'react'
import { T } from '@/components/Theme'

// Γλωσσάρι με διακριτικό highlight: περνώντας τον κέρσορα ή το δάχτυλο πάνω από
// έναν όρο, ο τίτλος γίνεται γαλάζιος (accent). Καθαρό, ζωντανό, minimal.
export default function Glossary({ items }: { items: { term: string; def: string }[] }) {
  const [hi, setHi] = useState<number | null>(null)
  const font = T.font.sans
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {items.map((it, i) => {
        const on = hi === i
        return (
          <div key={it.term}
            onMouseEnter={() => setHi(i)} onMouseLeave={() => setHi(null)}
            onTouchStart={() => setHi(i)} onTouchEnd={() => setHi(null)}
            style={{
              padding: '12px 12px', margin: '0 -12px', borderRadius: 10,
              borderBottom: i < items.length - 1 ? '1px solid var(--border-subtle)' : 'none',
              background: on ? 'color-mix(in srgb, var(--text-primary) 5%, transparent)' : 'transparent', transition: 'background 0.15s',
            }}>
            <p style={{ fontSize: 'var(--fs-base)', fontWeight: 600, fontFamily: font, marginBottom: 4, color: on ? 'var(--accent)' : 'var(--text-primary)', transition: 'color 0.15s' }}>{it.term}</p>
            <p style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5, fontFamily: font }}>{it.def}</p>
          </div>
        )
      })}
    </div>
  )
}

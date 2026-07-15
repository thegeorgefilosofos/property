import type { CSSProperties } from 'react'

// ── Ενιαία tokens για ΟΛΟ το εργαλείο δανείου ────────────────────────────────
// Μία κλίμακα γωνιών και αποστάσεων, ώστε τα πεδία να είναι απόλυτα τυποποιημένα
// και στοιχισμένα (καμία τυχαία τιμή 9/11/14). Κάθε νέο στοιχείο αντλεί από εδώ.
//
//   chip   8  → badges, μικρές ετικέτες, τσιπς
//   field 10  → πεδία εισαγωγής, εσωτερικά πλακίδια/κουτιά, tooltip
//   box   12  → εσωτερικά κουτιά πληροφορίας, μικρές κάρτες
//   card  16  → κάρτες, ενότητες (MiniSection), πάνελ
//   pill  18  → κουμπιά-χάπια, CTA
export const RADII = { chip: 8, field: 10, box: 12, card: 16, pill: 18 } as const

// Κλίμακα αποστάσεων (gap/padding) — πολλαπλάσια του 4 για ομαλό ρυθμό.
export const SPACE = { xs: 6, sm: 8, md: 12, lg: 16, xl: 20 } as const

export const FONT = "'Inter',sans-serif"
export const MONO = "'Roboto Mono',monospace"

// Ενιαία eyebrow-ετικέτα (11px / 0.06em / 600) — ίδια σε όλες τις ενότητες.
export const labelStyle: CSSProperties = {
  fontSize: 11,
  color: 'var(--text-secondary)',
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  fontWeight: 600,
  fontFamily: FONT,
}

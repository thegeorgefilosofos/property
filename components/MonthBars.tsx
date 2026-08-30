'use client';

// ═══════════════════════════════════════════════════════════════════════════
// ΤΟ ΔΩΔΕΚΑΜΗΝΟ ΓΡΑΦΗΜΑ, ΓΡΑΜΜΕΝΟ ΜΙΑ ΦΟΡΑ
// ─────────────────────────────────────────────────────────────────────────
// ΗΤΑΝ ΔΥΟ ΦΟΡΕΣ, ΚΑΙ ΟΙ ΔΥΟ ΓΡΑΦΕΣ ΑΠΕΚΛΙΝΑΝ. Η κάρτα των δαπανών είχε στήλες
// που εστιάζονται με το πληκτρολόγιο, ανακοινώνουν το ποσό τους σε αναγνώστη
// οθόνης, ανάβουν στο πέρασμα του δείκτη και γράφουν τον μήνα και το ποσό σε
// γραμμή ανάγνωσης από πάνω. Η καρτέλα των επισκεπτών είχε δώδεκα ορθογώνια με
// `title`: κανένα όνομα, καμία εστίαση, καμία αντίδραση· και σε αφή το `title`
// δεν εμφανίζεται ΠΟΤΕ — δηλαδή στο κινητό το γράφημα δεν έλεγε κανένα νούμερο.
//
// Ιδιο ερώτημα, ίδιο σχήμα: δώδεκα μήνες, ένα ποσό ο καθένας. Μία γραφή.
//
// ── ΤΙ ΚΑΝΕΙ ΤΟ ΓΡΑΦΗΜΑ ΖΩΝΤΑΝΟ, ΚΑΙ ΓΙΑΤΙ ΔΕΝ ΕΙΝΑΙ ΔΙΑΚΟΣΜΗΣΗ ──────────
// 1. ΓΡΑΜΜΗ ΑΝΑΓΝΩΣΗΣ. Το ποσό δεν χωρά μέσα σε στήλη 14 εικονοστοιχείων και
//    το βομβίδιο του περιηγητή αργεί μισό δευτερόλεπτο, δεν διαβάζεται από
//    αναγνώστη οθόνης και δεν υπάρχει σε αφή. Η κεφαλίδα του γραφήματος γίνεται
//    η οθόνη του: όπου κι αν σταθεί ο δείκτης, το νούμερο εμφανίζεται εκεί.
// 2. ΕΣΤΙΑΣΗ ΜΕ TAB. Κάθε στήλη είναι `tabIndex={0}` με `aria-label`: το
//    γράφημα διαβάζεται ολόκληρο χωρίς ποντίκι.
// 3. Ο ΤΡΕΧΩΝ ΜΗΝΑΣ ΞΕΧΩΡΙΖΕΙ ΜΟΝΟΣ ΤΟΥ, με το χρώμα της εφαρμογής. Κανένα
//    δεύτερο χρώμα: οι υπόλοιπες στήλες είναι το ίδιο μελάνι σε δύο εντάσεις.
// 4. ΟΙ ΜΗΝΕΣ ΧΩΡΙΣ ΠΟΣΟ ΚΡΑΤΟΥΝ ΤΗ ΘΕΣΗ ΤΟΥΣ. Μια λεπτή γραμμή βάσης λέει
//    «εδώ ήταν ο Μάρτιος και ήταν μηδέν», αντί για κενό που μοιάζει με σφάλμα.
// ═══════════════════════════════════════════════════════════════════════════
import { useState, type ReactNode } from 'react';
import { T, TT } from './tokens';
import { MONTHS_SHORT } from '../lib/core/months';

export interface MonthPoint {
  /** «2026-07» */
  key: string;
  /** «Ιούλιος 2026» */
  label: string;
  total: number;
}

export default function MonthBars({
  points, currentKey, restLabel, right, readout, format, height = 116,
}: {
  points: readonly MonthPoint[];
  /** Ποιος μήνας φοράει το χρώμα της εφαρμογής. */
  currentKey?: string;
  /** Τι γράφει η γραμμή ανάγνωσης όσο δεν δείχνει κανείς τίποτα. */
  restLabel: string;
  /** Ο,τι κάθεται στο δεξί άκρο της κεφαλίδας: μέσος όρος, σύνολο, τίποτα. */
  right?: ReactNode;
  /** Τι γράφει η γραμμή ανάγνωσης πάνω από μια στήλη. Προεπιλογή: μήνας και ποσό. */
  readout?: (p: MonthPoint) => ReactNode;
  /** Πώς γράφεται το ποσό. Το ίδιο και στο `aria-label`. */
  format: (n: number) => string;
  height?: number;
}) {
  const [hover, setHover] = useState<string | null>(null);
  const sel = points.find(p => p.key === hover) ?? null;
  const max = Math.max(...points.map(p => p.total), 1);

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 12, minHeight: 20 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, minWidth: 0 }}>
          {sel
            ? (readout
              ? readout(sel)
              : <>
                  <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontFamily: T.font.sans, whiteSpace: 'nowrap' }}>{sel.label}</span>
                  <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', fontFamily: T.font.num, fontVariantNumeric: 'tabular-nums' }}>{format(sel.total)}</span>
                </>)
            : <span style={TT.label}>{restLabel}</span>}
        </div>
        {right}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${points.length}, 1fr)`, alignItems: 'end' }}>
        {points.map(p => {
          const isCur = p.key === currentKey;
          const isSel = p.key === hover;
          const h = p.total > 0 ? Math.max((p.total / max) * 100, 3) : 0;
          const m = Number(p.key.slice(5, 7)) - 1;
          return (
            /* Το `aria-label` δίνει όνομα σε εστιάσιμο στοιχείο που δεν είχε
               κανένα. Το `title` του περιηγητή ΔΕΝ χρησιμοποιείται: θα έγραφε
               δεύτερη φορά ό,τι λέει η γραμμή ανάγνωσης, με άλλη στίξη· και σε
               οθόνη αφής δεν εμφανίζεται ποτέ. */
            <div key={p.key}
              onMouseEnter={() => setHover(p.key)} onMouseLeave={() => setHover(null)}
              onFocus={() => setHover(p.key)} onBlur={() => setHover(null)}
              tabIndex={0} aria-label={`${p.label}: ${format(p.total)}`}
              className="exp-bar" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', cursor: 'default' }}>
              <span style={{ display: 'flex', alignItems: 'flex-end', height, width: '100%', justifyContent: 'center', borderBottom: '1px solid var(--border-subtle)' }}>
                <span style={{
                  display: 'block', width: 14, height: `${h}%`, minHeight: p.total > 0 ? 3 : 0,
                  borderRadius: '3px 3px 0 0',
                  background: isCur ? 'var(--accent)'
                    : isSel ? 'color-mix(in srgb, var(--text-primary) 42%, transparent)'
                    : 'color-mix(in srgb, var(--text-primary) 22%, transparent)',
                  transition: 'height 0.35s cubic-bezier(0.2,0,0,1), background 0.15s',
                }} />
              </span>
              <span style={{
                marginTop: 6, textAlign: 'center', fontSize: 11, fontFamily: T.font.sans,
                fontWeight: isSel ? 700 : 400,
                color: isSel ? 'var(--text-secondary)' : 'var(--text-tertiary)',
              }}>{MONTHS_SHORT[m]}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

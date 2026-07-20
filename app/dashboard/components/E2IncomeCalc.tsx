'use client';

// ═══════════════════════════════════════════════════════════════════════════
// E2IncomeCalc — Εκτίμηση φόρου εισοδήματος ακινήτων (Ε2).
// Αυτόνομο εργαλείο: ακαθάριστα μισθώματα, εκπιπτόμενες δαπάνες, κλιμακωτός
// φόρος, κωδικοί Ε2 (101/102/103/401), προθεσμίες ΑΑΔΕ και εξαγωγή CSV.
// Μονταρίστηκε χωριστά στην καρτέλα «Λογιστικά».
// ═══════════════════════════════════════════════════════════════════════════

import { useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { T, fe, Btn } from '@/components/Theme';
import { InfoHint } from './InfoHint';
import { runE2Export } from './e2Export';

// ── Κλίμακα ενοικίων 2026: νέος ενδιάμεσος 25% στα 12.000–24.000 ──────────────
const RENTAL_TAX = [
  { limit: 12_000, rate: 0.15 },
  { limit: 24_000, rate: 0.25 },
  { limit: 35_000, rate: 0.35 },
  { limit: Infinity, rate: 0.45 },
];
function calcRentalTax(gross: number, deductible: number) {
  const taxable = Math.max(0, gross - deductible);
  let rem = taxable, tax = 0, prev = 0;
  const breakdown: { label: string; taxable: number; tax: number }[] = [];
  for (const b of RENTAL_TAX) {
    if (rem <= 0) break;
    const t = b.limit === Infinity ? rem : Math.min(rem, b.limit - prev);
    const tx = t * b.rate;
    if (t > 0) breakdown.push({ label: `${b.rate * 100}%`, taxable: t, tax: tx });
    tax += tx; rem -= t; prev = b.limit;
  }
  const eff = taxable > 0 ? (tax / taxable) * 100 : 0;
  return { tax, taxable, effectiveRate: eff, netAfterTax: gross - tax, breakdown, advance: tax * 0.55 };
}

export default function E2IncomeCalc({ userId, propertyId }: { userId: string; propertyId?: string }) {
  void propertyId;
  const supabase = createClient();
  const [e2Rent, setE2Rent] = useState('');
  const [e2Deductible, setE2Deductible] = useState('');
  const [e2Year, setE2Year] = useState(String(new Date().getFullYear() - 1));

  const e2Result = useMemo(() => {
    const g = parseFloat(e2Rent) || 0;
    if (g <= 0) return null;
    return calcRentalTax(g, parseFloat(e2Deductible) || 0);
  }, [e2Rent, e2Deductible]);

  const lbl = { fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-secondary)', display: 'block', marginBottom: 7, fontFamily: T.font.sans } as const;
  const inp = { background: 'var(--bg-base)', border: '1px solid var(--border-default)', borderRadius: 10, height: 42, padding: '10px 14px', color: 'var(--text-primary)', fontSize: 14, letterSpacing: 0, width: '100%', outline: 'none', boxSizing: 'border-box', fontFamily: T.font.sans } as const;
  const card = { background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: T.radius.card, padding: 20 } as const;
  const cardGap = { ...card, marginBottom: 16 };
  const sectionTitle = (t: string) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, paddingBottom: 10, borderBottom: '1px solid var(--border-subtle)' }}>
      <div style={{ fontFamily: T.font.sans, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-secondary)', fontWeight: 700 }}>{t}</div>
    </div>
  );

  return (
    <div style={{ fontFamily: T.font.sans, color: 'var(--text-primary)' }}>
      <div style={cardGap}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          {sectionTitle('Εκτίμηση Φόρου Εισοδήματος Ακινήτων')}
          <select value={e2Year} onChange={e => setE2Year(e.target.value)}
            style={{ ...inp, width: 'auto', height: 36, padding: '0 12px', fontSize: 12 }}>
            {[new Date().getFullYear() - 1, new Date().getFullYear() - 2, new Date().getFullYear() - 3]
              .map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: 12, marginBottom: 16 }}>
          <div>
            <label style={lbl}>Ετήσια Μισθώματα {e2Year} (€)</label>
            <input type="number" style={inp} value={e2Rent} onChange={e => setE2Rent(e.target.value)}
              placeholder="π.χ. 8400 (700€/μήνα × 12)" />
          </div>
          <div>
            <label style={lbl}>Εκπιπτόμενες Δαπάνες (€)</label>
            <input type="number" style={inp} value={e2Deductible} onChange={e => setE2Deductible(e.target.value)}
              placeholder="από Δαπάνες" />
          </div>
        </div>

        {e2Result ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: 16 }}>
            {/* Left: KPIs */}
            <div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: 10, marginBottom: 14 }}>
                {[
                  { label: 'Ακαθάριστα', value: fe(e2Result.taxable + parseFloat(e2Deductible) || 0), color: 'var(--text-primary)' },
                  { label: 'Φορολογητέο', value: fe(e2Result.taxable), color: 'var(--text-primary)' },
                  { label: 'Φόρος', value: fe(e2Result.tax), color: 'var(--negative)' },
                  { label: 'Καθαρό/μήνα', value: fe(e2Result.netAfterTax / 12), color: 'var(--accent)' },
                ].map((k, i) => (
                  <div key={i} style={{ background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', borderRadius: 10, padding: '12px 14px' }}>
                    <div style={{ fontSize: 15, fontWeight: 700, color: k.color, fontFamily: T.font.num, fontVariantNumeric: 'tabular-nums', marginBottom: 3 }}>{k.value}</div>
                    <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-tertiary)' }}>{k.label}</div>
                  </div>
                ))}
              </div>
              {/* Bracket breakdown */}
              <div style={{ background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', borderRadius: 10, padding: 14 }}>
                {sectionTitle('Κλιμάκωση')}
                {e2Result.breakdown.map((b, i) => (
                  <div key={i} style={{ marginBottom: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                      <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{b.label}</span>
                      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', fontFamily: T.font.num, fontVariantNumeric: 'tabular-nums' }}>{fe(b.tax)}</span>
                    </div>
                    <div style={{ height: 4, background: 'var(--border-subtle)', borderRadius: 2 }}>
                      <div style={{ height: '100%', width: `${(b.taxable / (e2Result.taxable || 1)) * 100}%`, background: 'var(--text-secondary)', borderRadius: 2 }} />
                    </div>
                  </div>
                ))}
                <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 8, borderTop: '1px solid var(--border-subtle)' }}>
                  <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Πραγματικός Συντελεστής</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', fontFamily: T.font.num, fontVariantNumeric: 'tabular-nums' }}>
                    {e2Result.effectiveRate.toFixed(1)}%
                  </span>
                </div>
              </div>
            </div>

            {/* Right: E2 codes + deadlines */}
            <div>
              <div style={{ background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', borderRadius: 10, padding: 14, marginBottom: 14 }}>
                {sectionTitle('Κωδικοί Ε2, Τι να γράψεις')}
                {[
                  { code: 'Κωδ. 101', label: 'Ακαθάριστα Μισθώματα', value: fe(parseFloat(e2Rent) || 0), color: 'var(--text-primary)' },
                  { code: 'Κωδ. 102', label: 'Εκπιπτόμενες Δαπάνες', value: fe(parseFloat(e2Deductible) || 0), color: 'var(--text-primary)' },
                  { code: 'Κωδ. 103', label: 'Καθαρό Φορολογητέο', value: fe(e2Result.taxable), color: 'var(--text-primary)' },
                  { code: 'Κωδ. 401', label: 'Φόρος Εισοδήματος', value: fe(e2Result.tax), color: 'var(--text-primary)' },
                  { code: 'Προκαταβολή 55%', label: 'Επόμενο έτος', value: fe(e2Result.advance), color: 'var(--text-primary)' },
                ].map((row, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--border-subtle)' }}>
                    <div>
                      <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--accent)', fontFamily: T.font.sans, marginRight: 8 }}>{row.code}</span>
                      <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{row.label}</span>
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 600, color: row.color, fontFamily: T.font.num, fontVariantNumeric: 'tabular-nums' }}>{row.value}</span>
                  </div>
                ))}
              </div>

              <div style={{ background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', borderRadius: 10, padding: 14, marginBottom: 14 }}>
                {sectionTitle('Σημαντικές Προθεσμίες')}
                {[
                  { label: 'Υποβολή Ε1/Ε2', desc: '30 Ιουνίου κάθε χρόνο', color: 'var(--accent)' },
                  { label: 'Καταχώρηση Μισθωτηρίου', desc: 'Εντός 30 ημερών από υπογραφή', color: 'var(--text-primary)' },
                  { label: 'Ηλεκτρονική Πληρωμή', desc: 'Έκπτωση 5% αν πληρώσεις online', color: 'var(--text-primary)' },
                ].map((d, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border-subtle)' }}>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 500, color: d.color, fontFamily: T.font.sans }}>{d.label}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{d.desc}</div>
                    </div>
                  </div>
                ))}
              </div>

              <a href="https://www.aade.gr/polites/foroi/foros-eisodematos" target="_blank" rel="noopener noreferrer" title="ΑΑΔΕ — Ανεξάρτητη Αρχή Δημοσίων Εσόδων"
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 14px', background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: 8, textDecoration: 'none', color: 'var(--text-secondary)', fontSize: 12, fontFamily: T.font.sans, fontWeight: 500 }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" /></svg>
                AADE.gr, Φορολογία Ακινήτων
              </a>
            </div>
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: '32px', color: 'var(--text-tertiary)' }}>
            <div style={{ fontSize: 13, fontFamily: T.font.sans, marginBottom: 6 }}>
              Συμπλήρωσε τα ετήσια μισθώματα για υπολογισμό
            </div>
            <div style={{ fontSize: 11 }}>Φορολογική κλίμακα: 15% / 25% / 35% / 45%</div>
          </div>
        )}
      </div>

      <div style={cardGap}>
        {sectionTitle('Αναλυτική Κατάσταση Ε2 (για λογιστή)')}
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontFamily: T.font.sans, lineHeight: 1.6, marginBottom: 14 }}>
          Κατέβασε αρχείο CSV με μία γραμμή ανά ακίνητο (ΑΤΑΚ, διεύθυνση, ποσοστό συνιδιοκτησίας, είδος μίσθωσης, μήνες, ακαθάριστο εισόδημα) για το έτος {e2Year}. Έτοιμο για αποστολή στον λογιστή σου.
        </div>
        <Btn variant="primary" onClick={async () => { const n = await runE2Export(supabase, String(userId), Number(e2Year)); if (!n) alert('Δεν βρέθηκαν ακίνητα για εξαγωγή.'); }}>Εξαγωγή Ε2 (CSV)</Btn>
        <div style={{ marginTop: 12, fontSize: 11.5, color: 'var(--text-tertiary)', fontFamily: T.font.sans, display: 'inline-flex', alignItems: 'center', lineHeight: 1.5 }}>
          Ορισμένα πεδία συμπληρώνονται αυτόματα ως εκτίμηση. Έλεγξέ τα πριν την υποβολή.
          <InfoHint>Το «είδος μίσθωσης», η «κατηγορία εισοδήματος», οι «μήνες» και το «ακαθάριστο» συμπληρώνονται αυτόματα ως εκτίμηση από τα δεδομένα του ακινήτου. Το ΑΤΑΚ (Αριθμός Ταυτότητας Ακινήτου, από το Ε9) και το ΑΦΜ αντλούνται από όσα έχεις καταχωρήσει. Έλεγξέ τα πριν την υποβολή στην ΑΑΔΕ (Ανεξάρτητη Αρχή Δημοσίων Εσόδων).</InfoHint>
        </div>
      </div>

      <div style={{ fontSize: 11, color: 'var(--text-tertiary)', textAlign: 'center', fontFamily: T.font.sans, lineHeight: 1.6 }}>
        Εκτίμηση βάσει ισχύουσας νομοθεσίας. Δεν αποτελεί επίσημη φορολογική συμβουλή. Συμβουλευτείτε λογιστή.
      </div>
    </div>
  );
}

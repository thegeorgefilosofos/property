'use client';

// ═══════════════════════════════════════════════════════════════════════════
// E2IncomeCalc — Εκτίμηση φόρου εισοδήματος ακινήτων (Ε2).
// Αυτόνομο εργαλείο: ακαθάριστα μισθώματα, εκπιπτόμενες δαπάνες, κλιμακωτός
// φόρος, κωδικοί Ε2 (101/102/103/401), προθεσμίες ΑΑΔΕ και εξαγωγή CSV.
// Μονταρίστηκε χωριστά στην καρτέλα «Λογιστικά».
// ═══════════════════════════════════════════════════════════════════════════

import { useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { T, fe, Btn, EmptyState } from '@/components/Theme';
import { Calculator } from 'lucide-react';
import { InfoHint } from './InfoHint';
import { CustomSelect as Select } from './UIComponents';
import { runE2Export } from './e2Export';
import { notifyError } from '@/components/Toast';
import { rentalIncomeTax, RENTAL_TAX_BRACKETS_2026 } from '@/lib/billing/greekTax';
import { PRESUMPTIVE_DEDUCTION_RATE } from '@/lib/accounting/statement';

// ═══════════════════════════════════════════════════════════════════════════
// ΤΡΕΙΣ ΔΙΟΡΘΩΣΕΙΣ, ΚΑΙ ΟΙ ΤΡΕΙΣ ΗΤΑΝ ΛΑΘΟΣ ΝΟΥΜΕΡΟ ΣΤΗΝ ΟΘΟΝΗ
//
// 1. ΔΙΠΛΗ ΚΛΙΜΑΚΑ. Εδώ υπήρχε αντίγραφο της φορολογικής κλίμακας, ενώ το
//    lib/billing/greekTax.ts λέει ρητά στο σχόλιό του: «όλα τα εργαλεία ΠΡΕΠΕΙ να
//    καλούν αυτό, ώστε να μη διαφέρει ο φόρος από καρτέλα σε καρτέλα». Όταν
//    αλλάξει ο νόμος, το ένα από τα δύο θα έμενε πίσω — σιωπηλά.
//
// 2. ΠΡΟΚΑΤΑΒΟΛΗ 55%. Εμφανιζόταν γραμμή «Προκαταβολή 55% · Επόμενο έτος» ως
//    βεβαιότητα, για ΚΑΘΕ ιδιοκτήτη. Η προκαταβολή αφορά ΕΠΙΧΕΙΡΗΜΑΤΙΚΟ εισόδημα
//    (άρθρα 69-71) — το lib/accounting/statement.ts την εφαρμόζει σωστά μόνο όταν
//    `business`. Για παθητικό εισόδημα ενοικίων φυσικού προσώπου είναι μηδέν. Η
//    οθόνη έλεγε σε κάθε χρήστη ότι χρωστάει +55% φόρο που δεν χρωστάει.
//
// 3. ΑΝΑΛΥΤΙΚΗ ΕΚΠΤΩΣΗ ΔΑΠΑΝΩΝ. Ο υπολογισμός ήταν «ακαθάριστα − δαπάνες», ενώ το
//    ίδιο το app λέει αλλού «για ιδιώτη τα έξοδα δεν εκπίπτουν αναλυτικά»: ισχύει
//    τεκμαρτή έκπτωση 5%, και από 1/1/2026 μόνο με τραπεζική είσπραξη. Άρα το
//    πεδίο «Εκπιπτόμενες Δαπάνες» παρήγαγε μικρότερο φόρο από τον πραγματικό.
//
// Ό,τι αφορά φόρο έφυγε από εδώ. Ο φόρος ζει σε ΕΝΑ σημείο, στη Λογιστική, με
// ενοποίηση χαρτοφυλακίου — γιατί η κλίμακα είναι προοδευτική στο ΣΥΝΟΛΟ των
// ενοικίων (Ε1) και όχι ανά ακίνητο.
// ═══════════════════════════════════════════════════════════════════════════

export default function E2IncomeCalc({ userId, propertyId }: { userId: string; propertyId?: string }) {
  void propertyId;
  const supabase = createClient();
  const [e2Rent, setE2Rent] = useState('');
  const [e2Year, setE2Year] = useState(String(new Date().getFullYear() - 1));

  // Ο φόρος έρχεται από τη ΜΙΑ μηχανή (lib/billing/greekTax.ts), με τεκμαρτή
  // έκπτωση αντί για αναλυτικές δαπάνες — γιατί αυτό ισχύει για φυσικό πρόσωπο.
  // Η ανάλυση ανά κλιμάκιο βγαίνει από τα ΙΔΙΑ κλιμάκια που κάνουν τον υπολογισμό,
  // ώστε ο πίνακας να μη μπορεί να ξεσυγχρονιστεί από το ποσό.
  const e2Result = useMemo(() => {
    const gross = parseFloat(e2Rent) || 0;
    if (gross <= 0) return null;
    const taxable = gross * (1 - PRESUMPTIVE_DEDUCTION_RATE);
    const tax = rentalIncomeTax(taxable);
    const breakdown = RENTAL_TAX_BRACKETS_2026
      .map(b => {
        const slice = Math.min(taxable, b.to) - b.from;
        return slice > 0 ? { label: `${Math.round(b.rate * 100)}%`, taxable: slice, tax: slice * b.rate } : null;
      })
      .filter((x): x is { label: string; taxable: number; tax: number } => x !== null);
    return {
      tax, taxable,
      effectiveRate: taxable > 0 ? (tax / taxable) * 100 : 0,
      netAfterTax: gross - tax,
      breakdown,
    };
  }, [e2Rent]);

  const lbl = { fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-secondary)', display: 'block', marginBottom: 7, fontFamily: T.font.sans } as const;
  const inp = { background: 'var(--bg-base)', border: '1px solid var(--border-default)', borderRadius: 10, height: 40, padding: '0 14px', color: 'var(--text-primary)', fontSize: 14, letterSpacing: 0, width: '100%', outline: 'none', boxSizing: 'border-box', fontFamily: T.font.sans, transition: 'border-color 0.14s' } as const;
  // Κάρτα ίδια με το υπόλοιπο app: ανασηκωμένη επιφάνεια + σκιά, ΚΑΜΙΑ ορατή περίμετρος.
  const card = { position: 'relative', background: 'var(--surface-raised)', border: 'none', borderRadius: 14, padding: 16, boxShadow: 'var(--elev-1)' } as const;
  const cardGap = { ...card, marginBottom: 14 };
  // Εσωτερικά πάνελ: βαθουλωτά (bg-base), χωρίς περίγραμμα — καθαρό inset.
  const panel = { background: 'var(--bg-base)', borderRadius: 12, padding: 13 } as const;
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
          <div style={{ width: 104, flexShrink: 0 }}>
            <Select value={e2Year} onChange={setE2Year} options={[new Date().getFullYear() - 1, new Date().getFullYear() - 2, new Date().getFullYear() - 3].map(y => ({ value: String(y), label: String(y) }))} />
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: 12, marginBottom: 16 }}>
          <div>
            <label style={lbl}>Ετήσια Μισθώματα {e2Year} (€)</label>
            <input type="number" style={inp} value={e2Rent} onChange={e => setE2Rent(e.target.value)}
              placeholder="π.χ. 8400 (700€/μήνα × 12)" />
          </div>
        </div>

        {e2Result ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: 16 }}>
            {/* Left: KPIs */}
            <div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: 10, marginBottom: 14 }}>
                {[
                  { label: 'Ακαθάριστα', value: fe(parseFloat(e2Rent) || 0), tone: undefined as string | undefined },
                  { label: 'Φορολογητέο', value: fe(e2Result.taxable), tone: undefined },
                  { label: 'Φόρος', value: fe(e2Result.tax), tone: 'negative' },
                  { label: 'Καθαρό/μήνα', value: fe(e2Result.netAfterTax / 12), tone: 'accent' },
                ].map((k, i) => (
                  <div key={i} className="po-fig-card" tabIndex={0} style={{ ...panel, padding: '11px 13px' }}>
                    <div className="po-fig" data-tone={k.tone} style={{ fontSize: 15, fontWeight: 700, fontFamily: T.font.num, fontVariantNumeric: 'tabular-nums', marginBottom: 3 }}>{k.value}</div>
                    <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-tertiary)' }}>{k.label}</div>
                  </div>
                ))}
              </div>
              {/* Bracket breakdown */}
              <div style={panel}>
                {sectionTitle('Κλιμάκωση')}
                {e2Result.breakdown.map((b, i) => (
                  <div key={i} style={{ marginBottom: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                      <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{b.label}</span>
                      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', fontFamily: T.font.num, fontVariantNumeric: 'tabular-nums' }}>{fe(b.tax)}</span>
                    </div>
                    <div style={{ height: 4, background: 'var(--border-subtle)', borderRadius: 3 }}>
                      <div style={{ height: '100%', width: `${(b.taxable / (e2Result.taxable || 1)) * 100}%`, background: 'var(--text-secondary)', borderRadius: 3 }} />
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
              <div style={{ ...panel, marginBottom: 14 }}>
                {sectionTitle('Κωδικοί Ε2, Τι να γράψεις')}
                {[
                  { code: 'Κωδ. 101', label: 'Ακαθάριστα Μισθώματα', value: fe(parseFloat(e2Rent) || 0), color: 'var(--text-primary)' },
                  { code: 'Κωδ. 103', label: 'Ακαθάριστο από εκμίσθωση κατοικιών (Ε1)', value: fe(parseFloat(e2Rent) || 0), color: 'var(--text-primary)' },
                  { code: 'Φορολογητέο', label: 'Μετά την τεκμαρτή έκπτωση 5%', value: fe(e2Result.taxable), color: 'var(--text-primary)' },
                  { code: 'Φόρος', label: 'Εκτίμηση για αυτό το ακίνητο', value: fe(e2Result.tax), color: 'var(--text-primary)' },
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

              <div style={{ ...panel, marginBottom: 14 }}>
                {sectionTitle('Σημαντικές Προθεσμίες')}
                {[
                  { label: 'Υποβολή Ε1/Ε2', desc: 'Τα τελευταία έτη 15 Ιουλίου — επιβεβαίωσε στο myAADE', color: 'var(--text-primary)' },
                  { label: 'Καταχώρηση Μισθωτηρίου', desc: 'Εντός 30 ημερών από την υπογραφή', color: 'var(--text-primary)' },
                  { label: 'Είσπραξη μέσω τραπέζης', desc: 'Από 1/1/2026 απαραίτητη για την έκπτωση 5%', color: 'var(--text-primary)' },
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
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '11px 13px', background: 'var(--bg-base)', borderRadius: 12, textDecoration: 'none', color: 'var(--text-secondary)', fontSize: 12, fontFamily: T.font.sans, fontWeight: 500 }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" /></svg>
                AADE.gr, Φορολογία Ακινήτων
              </a>
            </div>
          </div>
        ) : (
          <EmptyState icon={<Calculator size={20} />} title="Συμπλήρωσε τα ετήσια μισθώματα" hint="Φορολογική κλίμακα εισοδήματος από ακίνητα: 15% / 25% / 35% / 45%." />
        )}
      </div>

      <div style={cardGap}>
        {sectionTitle('Αναλυτική Κατάσταση Ε2 (για λογιστή)')}
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontFamily: T.font.sans, lineHeight: 1.6, marginBottom: 14 }}>
          Κατέβασε προσυμπληρωμένο αρχείο Excel για το έτος {e2Year}, με τη δομή του επίσημου εντύπου Ε2 (Πίνακας I με την αρίθμηση στηλών της ΑΑΔΕ), μία γραμμή ανά ακίνητο, φύλλο «Οδηγίες συμπλήρωσης» και σύνοψη Ε1. Έτοιμο να το συμπληρώσει ο λογιστής στο myAADE.
        </div>
        <Btn variant="primary" onClick={async () => { const n = await runE2Export(supabase, String(userId), Number(e2Year)); if (!n) notifyError('Δεν βρέθηκαν ακίνητα για εξαγωγή.'); }}>Εξαγωγή Ε2 (Excel)</Btn>
        <div style={{ marginTop: 16, fontSize: 11.5, color: 'var(--text-tertiary)', fontFamily: T.font.sans, lineHeight: 1.5 }}>
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

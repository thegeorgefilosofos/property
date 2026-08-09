'use client';
// ═══════════════════════════════════════════════════════════════════════════
// ΔΩΡΕΑΝ ΥΠΟΛΟΓΙΣΤΗΣ ΦΟΡΟΥ ΕΝΟΙΚΙΩΝ — ο διαδραστικός πυρήνας
// ─────────────────────────────────────────────────────────────────────────
// ΓΙΑΤΙ ΥΠΑΡΧΕΙ ΑΥΤΗ Η ΣΕΛΙΔΑ
// Η εφαρμογή περιέχει ήδη σωστή, δοκιμασμένη φορολογική λογική για το 2026. Ήταν
// όμως ΟΛΗ κλειδωμένη πίσω από τη σύνδεση, οπότε κανείς δεν μπορούσε να δει την
// αξία της πριν εγγραφεί. Ο Έλληνας ιδιοκτήτης ψάχνει «πόσο φόρο θα πληρώσω για
// τα ενοίκια» πριν ψάξει «εφαρμογή διαχείρισης ακινήτων» — και δεν είχαμε τίποτα
// να του δώσουμε σε εκείνη τη στιγμή.
//
// ΤΙ ΤΟ ΚΑΝΕΙ ΕΝΤΙΜΟ
//   • Καμία εγγραφή, κανένα email, καμία παρακολούθηση. Απαντά και τελείωσε.
//   • Ο υπολογισμός γίνεται ΣΤΗ ΣΥΣΚΕΥΗ. Κανένα ποσό δεν φεύγει από τον browser.
//   • Λέει ΤΙ ΔΕΝ περιλαμβάνει. Ένας υπολογιστής που παρουσιάζει εκτίμηση ως
//     βεβαιότητα σε φορολογικό θέμα κάνει ζημιά, όχι εντύπωση.
//
// ΜΙΑ ΠΗΓΗ: καλεί το lib/billing/greekTax.ts, το ίδιο που καλεί ο πίνακας
// ελέγχου. Αν διαφωνούσε, ο επισκέπτης θα έβλεπε άλλο νούμερο εδώ και άλλο μετά
// την εγγραφή — που είναι ο γρηγορότερος τρόπος να χάσεις την εμπιστοσύνη του.
// ═══════════════════════════════════════════════════════════════════════════
import { useState, useMemo, useId } from 'react';
import Link from 'next/link';
import { T, fe, feAuto, fp, formGrid } from '@/components/tokens';
import {
  rentalIncomeTax, marginalRate, effectiveRentalRate, RENTAL_TAX_ROWS_2026,
} from '@/lib/billing/greekTax';
import { parseAmount } from '@/lib/core/greek';

/** Το 5% τεκμαρτής έκπτωσης δαπανών του άρθρου 39 — ισχύει χωρίς δικαιολογητικά. */
const STANDARD_DEDUCTION = 0.05;

// Η ανάγνωση ποσού έρχεται από το lib/core/greek.ts, που ξέρει και τις δύο
// ελληνικές γραφές («1.234,56» και «1,234.56») και τα αρνητικά με παρενθέσεις.
// Είχα γράψει δική μου εκδοχή· ο φύλακας guard-single-source την έκοψε, και
// σωστά: ακριβώς αυτή η διπλή υλοποίηση έκανε κάποτε το «1.234» να διαβάζεται
// άλλοτε ως 1,234 και άλλοτε ως 1234, ανάλογα με την οθόνη.
const amount = (s: string): number => Math.max(0, parseAmount(s) ?? 0);

export function RentTaxCalculator() {
  const [monthly, setMonthly] = useState('600');
  const [months, setMonths] = useState('12');
  const monthlyId = useId(), monthsId = useId();

  const r = useMemo(() => {
    const m = amount(monthly);
    const n = Math.min(12, Math.max(0, Math.round(amount(months))));
    const gross = m * n;
    // Τεκμαρτή έκπτωση 5%: ο νόμος τη δίνει χωρίς αποδείξεις, οπότε είναι το
    // ρεαλιστικό ελάχιστο για κάθε ιδιοκτήτη — και ο φόρος υπολογίζεται πάνω σε
    // αυτό, όχι στο μεικτό. Χωρίς αυτήν, το νούμερο θα έβγαινε σταθερά μεγαλύτερο
    // από το πραγματικό και ο υπολογιστής θα ήταν άχρηστος.
    const taxable = gross * (1 - STANDARD_DEDUCTION);
    const tax = rentalIncomeTax(taxable);
    return {
      gross, taxable, tax,
      net: gross - tax,
      marginal: marginalRate(taxable),
      effective: effectiveRentalRate(taxable),
      monthlyNet: n > 0 ? (gross - tax) / n : 0,
    };
  }, [monthly, months]);

  const field: React.CSSProperties = {
    width: '100%', height: T.h.lg, padding: '0 14px', borderRadius: T.radius.btn,
    border: '1px solid var(--border-default)', background: 'var(--bg-surface)',
    color: 'var(--text-primary)', fontSize: 16, fontFamily: T.font.num,
    fontVariantNumeric: 'tabular-nums', outline: 'none', boxSizing: 'border-box',
  };
  const label: React.CSSProperties = {
    display: 'block', fontSize: 11, fontWeight: 700, letterSpacing: '0.06em',
    textTransform: 'uppercase', color: 'var(--text-tertiary)', marginBottom: 7,
  };

  return (
    <div style={{ fontFamily: T.font.sans }}>
      {/* ── Είσοδος: δύο πεδία, τίποτα άλλο ────────────────────────────────
          Ο επισκέπτης δεν έχει λόγο να μας εμπιστευτεί ακόμη. Κάθε επιπλέον
          πεδίο είναι μια αφορμή να φύγει, οπότε ζητάμε το ελάχιστο που δίνει
          σωστή απάντηση. */}
      <div style={{ ...formGrid(180, 250), gap: 14 }}>
        <div>
          <label htmlFor={monthlyId} style={label}>Μηνιαίο ενοίκιο</label>
          <div style={{ position: 'relative' }}>
            <input id={monthlyId} inputMode="decimal" value={monthly}
              onChange={e => setMonthly(e.target.value)}
              style={{ ...field, paddingRight: 34 }} aria-describedby={`${monthlyId}-unit`}/>
            <span id={`${monthlyId}-unit`} aria-hidden style={{
              position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)',
              color: 'var(--text-tertiary)', fontSize: 15, pointerEvents: 'none' }}>€</span>
          </div>
        </div>
        <div>
          <label htmlFor={monthsId} style={label}>Μήνες που νοικιάζεται</label>
          <input id={monthsId} inputMode="numeric" value={months}
            onChange={e => setMonths(e.target.value)} style={field}/>
        </div>
      </div>

      {/* ── Το αποτέλεσμα ──────────────────────────────────────────────── */}
      <div style={{
        marginTop: 20, padding: 'clamp(18px, 4vw, 26px)', borderRadius: T.radius.card,
        background: 'var(--surface-raised)', border: '1px solid var(--border-raised)',
        boxShadow: 'var(--well-inset)',
      }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 'clamp(14px, 3vw, 24px)' }}>
          <Figure label="Ετήσιο ενοίκιο" value={feAuto(r.gross)} />
          <Figure label="Φόρος" value={feAuto(r.tax)} tone="negative" big />
          <Figure label="Σου μένουν" value={feAuto(r.net)} tone="positive" big />
        </div>

        <div style={{ height: 1, background: 'var(--border-subtle)', margin: '18px 0 14px' }}/>

        <dl style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '10px 24px', margin: 0 }}>
          <Row k="Φορολογητέο μετά την έκπτωση 5%" v={feAuto(r.taxable)} />
          <Row k="Πραγματικός συντελεστής" v={`${fp((r.effective * 100))}`} />
          <Row k="Συντελεστής στο επόμενο ευρώ" v={`${Math.round(r.marginal * 100)}%`} />
          <Row k="Καθαρά ανά μήνα" v={feAuto(r.monthlyNet)} />
        </dl>
      </div>

      {/* ── Η κλίμακα, ώστε να φαίνεται από πού βγήκε ο αριθμός ─────────── */}
      <div style={{ marginTop: 22 }}>
        <h2 style={{ fontSize: 13, fontWeight: 700, margin: '0 0 10px', color: 'var(--text-primary)' }}>
          Η κλίμακα του 2026
        </h2>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 300 }}>
            <thead>
              <tr>
                <th scope="col" style={th}>Εισόδημα</th>
                <th scope="col" style={{ ...th, textAlign: 'right' }}>Συντελεστής</th>
                <th scope="col" style={{ ...th, textAlign: 'right' }}>Φόρος σε αυτό το κλιμάκιο</th>
              </tr>
            </thead>
            <tbody>
              {RENTAL_TAX_ROWS_2026.map(row => {
                const slice = Math.max(0, Math.min(r.taxable, row.to) - row.from);
                const active = slice > 0;
                return (
                  <tr key={row.range} style={{ background: active ? 'var(--accent-soft)' : 'transparent' }}>
                    <td style={{ ...td, fontWeight: active ? 700 : 400 }}>{row.range}</td>
                    <td style={{ ...td, textAlign: 'right', fontFamily: T.font.mono }}>{row.rate}</td>
                    <td style={{ ...td, textAlign: 'right', fontFamily: T.font.num, fontVariantNumeric: 'tabular-nums',
                      color: active ? 'var(--text-primary)' : 'var(--text-tertiary)' }}>
                      {active ? feAuto(slice * (Number(row.rate.replace('%', '')) / 100)) : fe(0)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Τι ΔΕΝ περιλαμβάνει ────────────────────────────────────────────
          Αυτό το κουτί δεν είναι νομική κάλυψη· είναι ο λόγος που ο υπολογιστής
          αξίζει εμπιστοσύνη. Ένα εργαλείο που παρουσιάζει εκτίμηση ως βεβαιότητα
          σε φορολογικό θέμα κάνει ζημιά στον χρήστη και στη φήμη μας. */}
      <div style={{
        marginTop: 22, padding: '14px 16px', borderRadius: T.radius.inner,
        background: 'var(--warning-soft)', border: '1px solid var(--warning-border)',
      }}>
        <p style={{ margin: 0, fontSize: 13, lineHeight: 1.65, color: 'var(--text-secondary)' }}>
          <strong style={{ color: 'var(--text-primary)' }}>Τι δεν περιλαμβάνει.</strong>{' '}
          Ο υπολογισμός αφορά <strong>μόνο</strong> το εισόδημα από ενοίκια, με την τεκμαρτή
          έκπτωση 5% που δίνει ο νόμος χωρίς δικαιολογητικά. Δεν περιλαμβάνει άλλα
          εισοδήματά σου, ΕΝΦΙΑ, τέλος επιτηδεύματος, εισφορά αλληλεγγύης, ούτε
          ειδικές περιπτώσεις (βραχυχρόνια μίσθωση, συνιδιοκτησία, νομικό πρόσωπο,
          κενά διαστήματα, ανείσπρακτα). Είναι <strong>εκτίμηση</strong> για να ξέρεις
          την τάξη μεγέθους, όχι φορολογική συμβουλή.
        </p>
      </div>

      {/* ── Πρόσκληση, χωρίς πίεση ─────────────────────────────────────── */}
      <div style={{
        marginTop: 20, padding: 'clamp(16px, 4vw, 22px)', borderRadius: T.radius.card,
        border: '1px solid var(--border-subtle)', background: 'var(--bg-elevated)',
        display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 14,
      }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <p style={{ margin: 0, fontSize: 14, fontWeight: 650, color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>
            Θέλεις να μη χρειάζεται να το ξαναϋπολογίσεις;
          </p>
          <p style={{ margin: '5px 0 0', fontSize: 13, lineHeight: 1.6, color: 'var(--text-secondary)' }}>
            Το Property OS κρατά ενοίκια, λογαριασμούς και δαπάνες όλη τη χρονιά και
            βγάζει έτοιμα όσα ζητά ο λογιστής σου. Το πρώτο ακίνητο είναι δωρεάν για πάντα.
          </p>
        </div>
        <Link href="/signup" style={{
          display: 'inline-flex', alignItems: 'center', gap: 8, height: 44, padding: '0 22px',
          borderRadius: T.radius.pill, background: 'var(--accent)', color: 'var(--on-tone)',
          fontSize: 14, fontWeight: 700, textDecoration: 'none', whiteSpace: 'nowrap',
        }}>
          Ξεκίνα δωρεάν
        </Link>
      </div>
    </div>
  );
}

const th: React.CSSProperties = {
  textAlign: 'left', padding: '8px 10px', fontSize: 11, fontWeight: 700,
  letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-tertiary)',
  borderBottom: '1px solid var(--border-default)', whiteSpace: 'nowrap',
};
const td: React.CSSProperties = {
  padding: '9px 10px', borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-secondary)',
};

function Figure({ label, value, tone, big }: { label: string; value: string; tone?: 'positive' | 'negative'; big?: boolean }) {
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
        color: 'var(--text-tertiary)', marginBottom: 6 }}>{label}</div>
      <div style={{
        fontFamily: T.font.num, fontSize: big ? 'clamp(22px, 4.4vw, 30px)' : 'clamp(18px, 3.4vw, 22px)',
        fontWeight: 700, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums', lineHeight: 1.15,
        color: tone === 'negative' ? 'var(--negative)' : tone === 'positive' ? 'var(--positive)' : 'var(--text-primary)',
      }}>{value}</div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'baseline' }}>
      <dt style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{k}</dt>
      <dd style={{ margin: 0, fontSize: 14, fontWeight: 600, color: 'var(--text-primary)',
        fontFamily: T.font.num, fontVariantNumeric: 'tabular-nums' }}>{v}</dd>
    </div>
  );
}

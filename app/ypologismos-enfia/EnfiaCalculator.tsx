'use client';
import { CustomSelect } from '@/app/dashboard/components/UIComponents';
import { GSIS_OBJECTIVE_VALUES } from '@/lib/tax/aade';
// ═══════════════════════════════════════════════════════════════════════════
// ΔΩΡΕΑΝ ΥΠΟΛΟΓΙΣΤΗΣ ΕΝΦΙΑ — ο διαδραστικός πυρήνας
// ─────────────────────────────────────────────────────────────────────────
// Ίδια αρχή με τον υπολογιστή φόρου ενοικίων: η λογική υπάρχει ήδη δοκιμασμένη
// στο lib/billing/enfia.ts, με νομική παραπομπή ανά συντελεστή. Εδώ απλώς
// γίνεται προσβάσιμη χωρίς εγγραφή.
//
// ΤΙ ΖΗΤΑΜΕ, ΚΑΙ ΓΙΑΤΙ ΤΟΣΟ ΛΙΓΑ
// Ο πλήρης ΕΝΦΙΑ θέλει δεκάδες πεδία. Ο επισκέπτης όμως δεν έχει λόγο να μας
// αφιερώσει δέκα λεπτά πριν μας ξέρει, και τα τέσσερα πεδία εδώ καλύπτουν τη
// συντριπτική πλειονότητα των διαμερισμάτων: τετραγωνικά, τιμή ζώνης, όροφος,
// παλαιότητα. Το ποσοστό ιδιοκτησίας μπαίνει μόνο όταν δεν είναι 100%.
//
// Η ΤΙΜΗ ΖΩΝΗΣ ΕΙΝΑΙ ΤΟ ΜΟΝΟ ΔΥΣΚΟΛΟ. Δεν τη θυμάται κανείς απ' έξω, οπότε
// λέμε ΠΟΥ τη βρίσκει αντί να την απαιτήσουμε σιωπηλά.
//
// ΤΙ ΔΕΝ ΜΑΝΤΕΥΟΥΜΕ: η συνολική αξία της ακίνητης περιουσίας καθορίζει και τη
// μείωση και την προσαύξηση. Την υπολογίζουμε από το ΙΔΙΟ ακίνητο όταν ο
// χρήστης δεν πει άλλο — και το γράφουμε καθαρά, γιατί όποιος έχει και δεύτερο
// ακίνητο θα δει διαφορετικό ποσό στο εκκαθαριστικό.
// ═══════════════════════════════════════════════════════════════════════════
import { useState, useMemo, useId } from 'react';
import Link from 'next/link';
import { T, feAuto } from '@/components/tokens';
import { parseAmount } from '@/lib/core/greek';
import {
  estimateENFIA, zoneKeyFromPricePerSqm,
  ENFIA_FLOOR_COEF, ENFIA_AGE_COEF, ENFIA_AGE_BANDS,
} from '@/lib/billing/enfia';

const amount = (s: string): number => Math.max(0, parseAmount(s) ?? 0);

// Οι ετικέτες αντλούνται από τα ΚΛΕΙΔΙΑ του lib, ώστε αν προστεθεί συντελεστής
// να μη μείνει η οθόνη πίσω σιωπηλά.
const FLOORS: { key: keyof typeof ENFIA_FLOOR_COEF | string; label: string }[] = [
  { key: 'basement',   label: 'Υπόγειο' },
  { key: 'ground',     label: 'Ισόγειο' },
  { key: 'first',      label: '1ος όροφος' },
  { key: 'second',     label: '2ος όροφος' },
  { key: 'third',      label: '3ος όροφος' },
  { key: 'fourth',     label: '4ος όροφος' },
  { key: 'fifth_plus', label: '5ος και πάνω' },
];
// Τα κλιμάκια παλαιότητας ΔΕΝ ξαναγράφονται εδώ: έρχονται από το enfia.ts, μαζί
// με τις ετικέτες τους. Πριν, οι δύο οθόνες είχαν διαφορετικά λεκτικά για το
// ίδιο κλειδί — και καμία δεν είχε το κλιμάκιο 15-19 ετών.
const AGES = ENFIA_AGE_BANDS;

export function EnfiaCalculator() {
  const [sqm, setSqm] = useState('85');
  const [zonePrice, setZonePrice] = useState('1400');
  const [floor, setFloor] = useState('second');
  const [age, setAge] = useState('y26_plus');
  const [ownership, setOwnership] = useState('100');
  const ids = { sqm: useId(), zone: useId(), floor: useId(), age: useId(), own: useId() };

  const r = useMemo(() => {
    const m = amount(sqm);
    const price = amount(zonePrice);
    const zone = zoneKeyFromPricePerSqm(price);
    if (!m || !zone) return null;
    const own = Math.min(100, Math.max(1, amount(ownership) || 100));
    // Αντικειμενική αξία κατά προσέγγιση. Δεν είναι ο επίσημος τύπος (που έχει και
    // συντελεστές οικοπέδου/προσόψεων) — είναι η βάση που χρειάζεται ο υπολογισμός
    // για τη μείωση και την προσαύξηση, και το λέμε στην οθόνη.
    const value = m * price * (own / 100);
    const res = estimateENFIA({
      sqm: m, zone, floor, age, ownership: own,
      totalValue: value, propertyValue: value,
    });
    return res ? { ...res, value, zone } : null;
  }, [sqm, zonePrice, floor, age, ownership]);

  const field: React.CSSProperties = {
    width: '100%', height: T.h.lg, padding: '0 12px', borderRadius: T.radius.btn,
    border: '1px solid var(--border-default)', background: 'var(--bg-surface)',
    color: 'var(--text-primary)', fontSize: 15, fontFamily: T.font.sans,
    outline: 'none', boxSizing: 'border-box',
  };
  const numField: React.CSSProperties = { ...field, fontFamily: T.font.num, fontVariantNumeric: 'tabular-nums' };
  const label: React.CSSProperties = {
    display: 'block', fontSize: 11, fontWeight: 700, letterSpacing: '0.06em',
    textTransform: 'uppercase', color: 'var(--text-tertiary)', marginBottom: 7,
  };

  return (
    <div style={{ fontFamily: T.font.sans }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 14 }}>
        <div>
          <label htmlFor={ids.sqm} style={label}>Τετραγωνικά</label>
          <input id={ids.sqm} inputMode="decimal" value={sqm} onChange={e => setSqm(e.target.value)} style={numField}/>
        </div>
        <div>
          <label htmlFor={ids.zone} style={label}>Τιμή ζώνης (€/τ.μ.)</label>
          <input id={ids.zone} inputMode="decimal" value={zonePrice} onChange={e => setZonePrice(e.target.value)} style={numField}/>
        </div>
        <CustomSelect label="Όροφος" value={floor} onChange={setFloor}
          options={FLOORS.map(f => ({ value: f.key, label: f.label }))} />
        <CustomSelect label="Παλαιότητα" value={age} onChange={setAge}
          options={AGES.map(a => ({ value: a.key, label: a.label }))} />
        <div>
          <label htmlFor={ids.own} style={label}>Ποσοστό ιδιοκτησίας (%)</label>
          <input id={ids.own} inputMode="numeric" value={ownership} onChange={e => setOwnership(e.target.value)} style={numField}/>
        </div>
      </div>

      <p style={{ margin: '10px 0 0', fontSize: 12, lineHeight: 1.6, color: 'var(--text-tertiary)' }}>
        Την τιμή ζώνης τη βρίσκεις στο συμβόλαιο, στο Ε9 ή στον{' '}
        <a href={GSIS_OBJECTIVE_VALUES} target="_blank" rel="noopener noreferrer"
          style={{ color: 'var(--accent)' }}>χάρτη αντικειμενικών αξιών</a>.
      </p>

      {/* ── Το αποτέλεσμα ──────────────────────────────────────────────── */}
      <div style={{
        marginTop: 20, padding: 'clamp(18px, 4vw, 26px)', borderRadius: T.radius.card,
        background: 'var(--surface-raised)', border: '1px solid var(--border-raised)',
        boxShadow: 'var(--well-inset)',
      }}>
        {!r ? (
          <p style={{ margin: 0, fontSize: 14, color: 'var(--text-secondary)' }}>
            Συμπλήρωσε τετραγωνικά και τιμή ζώνης για να δεις την εκτίμηση.
          </p>
        ) : (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 'clamp(14px, 3vw, 24px)' }}>
              <Figure label="ΕΝΦΙΑ ετησίως" value={feAuto(r.annual)} big tone="negative"/>
              <Figure label="Ανά μήνα (12 δόσεις)" value={feAuto(r.installment)}/>
              <Figure label="Αντικειμενική αξία (εκτίμηση)" value={feAuto(r.value)}/>
            </div>

            <div style={{ height: 1, background: 'var(--border-subtle)', margin: '18px 0 14px' }}/>

            <dl style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px 24px', margin: 0 }}>
              <Row k="Κύριος φόρος κτίσματος" v={feAuto(r.basic)}/>
              {r.extra > 0 && <Row k="Πρόσθετος φόρος (αξία > 400.000 €)" v={feAuto(r.extra)}/>}
              {r.supplementary > 0 && <Row k="Προσαύξηση (περιουσία > 500.000 €)" v={feAuto(r.supplementary)}/>}
              {r.reductionPct > 0 && <Row k={`Μείωση ${r.reductionPct}%`} v={`− ${feAuto(r.reductionAmount)}`}/>}
            </dl>
          </>
        )}
      </div>

      {/* ── Τι ΔΕΝ περιλαμβάνει ──────────────────────────────────────────── */}
      <div style={{
        marginTop: 22, padding: '14px 16px', borderRadius: T.radius.inner,
        background: 'var(--warning-soft)', border: '1px solid var(--warning-border)',
      }}>
        <p style={{ margin: 0, fontSize: 13, lineHeight: 1.65, color: 'var(--text-secondary)' }}>
          <strong style={{ color: 'var(--text-primary)' }}>Τι δεν περιλαμβάνει.</strong>{' '}
          Η εκτίμηση αφορά <strong>ένα κτίσμα</strong> και υπολογίζει τη συνολική σου
          ακίνητη περιουσία <strong>ίση με αυτό</strong>. Αν έχεις κι άλλα ακίνητα, οικόπεδα
          ή αποθήκες, η μείωση και η προσαύξηση αλλάζουν — και το ποσό στο εκκαθαριστικό
          θα διαφέρει. Δεν περιλαμβάνει απαλλαγές με εισοδηματικά κριτήρια (χαμηλό
          εισόδημα, τρίτεκνοι, αναπηρία, ασφαλισμένη κατοικία), ούτε τους ειδικούς
          συντελεστές οικοπέδου και πρόσοψης. Είναι <strong>εκτίμηση</strong> για να ξέρεις
          την τάξη μεγέθους — όχι φορολογική συμβουλή.
        </p>
      </div>

      <div style={{
        marginTop: 20, padding: 'clamp(16px, 4vw, 22px)', borderRadius: T.radius.card,
        border: '1px solid var(--border-subtle)', background: 'var(--bg-elevated)',
        display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 14,
      }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <p style={{ margin: 0, fontSize: 14, fontWeight: 650, color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>
            Έχεις παραπάνω από ένα ακίνητο;
          </p>
          <p style={{ margin: '5px 0 0', fontSize: 13, lineHeight: 1.6, color: 'var(--text-secondary)' }}>
            Το Property OS υπολογίζει τον ΕΝΦΙΑ για όλο το χαρτοφυλάκιο μαζί, με τη σωστή
            μείωση, και σου θυμίζει τις δόσεις πριν λήξουν. Το πρώτο ακίνητο δωρεάν για πάντα.
          </p>
        </div>
        <Link href="/signup" style={{
          display: 'inline-flex', alignItems: 'center', gap: 8, height: 44, padding: '0 22px',
          borderRadius: T.radius.pill, background: 'var(--accent)', color: 'var(--on-tone)',
          fontSize: 14, fontWeight: 700, textDecoration: 'none', whiteSpace: 'nowrap',
        }}>
          Ξεκίνα δωρεάν →
        </Link>
      </div>
    </div>
  );
}

function Figure({ label, value, tone, big }: { label: string; value: string; tone?: 'negative'; big?: boolean }) {
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
        color: 'var(--text-tertiary)', marginBottom: 6 }}>{label}</div>
      <div style={{
        fontFamily: T.font.num, fontSize: big ? 'clamp(22px, 4.4vw, 30px)' : 'clamp(18px, 3.4vw, 22px)',
        fontWeight: 700, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums', lineHeight: 1.15,
        color: tone === 'negative' ? 'var(--negative)' : 'var(--text-primary)',
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

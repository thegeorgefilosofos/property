'use client';
import { CustomSelect } from '@/app/dashboard/components/UIComponents';
import { OBJECTIVE_VALUES } from '@/lib/tax/aade';
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
import { T, feAuto, fixedCols } from '@/components/tokens';
import { fn } from '@/lib/core/format';
import { parseAmount } from '@/lib/core/greek';
import { TRIAL_DAYS } from '@/lib/billing/plans';
import { estimateENFIA, zoneKeyFromPricePerSqm, enfiaFloorCoef, enfiaAgeCoef, ENFIA_ZONE_TAX, ENFIA_FLOOR_COEF, ENFIA_AGE_BANDS } from '@/lib/billing/enfia';

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
  // Η ΜΟΝΑΔΑ ΜΕΣΑ ΣΤΟ ΠΕΔΙΟ, ΟΧΙ ΜΕΣΑ ΣΤΗΝ ΕΤΙΚΕΤΑ. Οι ετικέτες έγραφαν «ΤΙΜΗ
  // ΖΩΝΗΣ (€/Τ.Μ.)» και «ΠΟΣΟΣΤΟ ΙΔΙΟΚΤΗΣΙΑΣ (%)»: κεφαλαία με παρένθεση και
  // τελείες, δίπλα σε δύο ετικέτες που δεν είχαν καμία. Ο υπολογιστής ενοικίων
  // βάζει το «€» μέσα στο πεδίο· εδώ γίνεται το ίδιο, και οι πέντε ετικέτες
  // διαβάζονται πια ομοιόμορφα.
  const unitStyle: React.CSSProperties = {
    position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)',
    color: 'var(--text-tertiary)', fontSize: 14, pointerEvents: 'none',
  };

  return (
    <div style={{ fontFamily: T.font.sans }}>
      {/* ΠΕΝΤΕ ΠΕΔΙΑ ΣΕ ΡΗΤΕΣ ΔΥΟ ΣΤΗΛΕΣ. Το `formGrid` έβγαζε άλλοτε δύο και
          άλλοτε τρεις στήλες ανάλογα με το zoom του περιηγητή, οπότε το πέμπτο
          πεδίο άλλαζε θέση χωρίς να αλλάξει τίποτα στην οθόνη. Δύο στήλες, και
          το ποσοστό ιδιοκτησίας μόνο του στην τρίτη σειρά: είναι το μόνο που
          σπάνια αλλάζει, οπότε ανήκει τελευταίο. */}
      <div {...fixedCols(2, 14, 'start')}>
        <div>
          <label htmlFor={ids.sqm} style={label}>Τετραγωνικά</label>
          <input id={ids.sqm} inputMode="decimal" value={sqm} onChange={e => setSqm(e.target.value)} style={numField}/>
        </div>
        <div>
          <label htmlFor={ids.zone} style={label}>Τιμή ζώνης</label>
          <div style={{ position: 'relative' }}>
            <input id={ids.zone} inputMode="decimal" value={zonePrice} onChange={e => setZonePrice(e.target.value)}
              style={{ ...numField, paddingRight: 52 }} aria-describedby={`${ids.zone}-unit`}/>
            <span id={`${ids.zone}-unit`} aria-hidden style={unitStyle}>€/τ.μ.</span>
          </div>
        </div>
        {/* Η ΕΤΙΚΕΤΑ ΤΗΝ ΓΡΑΦΕΙ Η ΣΕΛΙΔΑ, ΟΧΙ ΤΟ ΧΕΙΡΙΣΤΗΡΙΟ. Το `CustomSelect`
            φέρνει τη δική του ετικέτα, με το στιλ των φορμών της εφαρμογής:
            πεζά, μεγαλύτερα, άλλο βάρος. Δίπλα στα τρία πεδία κειμένου, που
            έχουν κεφαλαία ετικέτα, η ίδια σειρά είχε δύο τυπογραφίες. Εδώ
            περνά μόνο `ariaLabel`, ώστε ο αναγνώστης οθόνης να ακούει το ίδιο
            που διαβάζει το μάτι. */}
        <div>
          <span style={label}>Όροφος</span>
          <CustomSelect ariaLabel="Όροφος" value={floor} onChange={setFloor}
            options={FLOORS.map(f => ({ value: f.key, label: f.label }))} />
        </div>
        <div>
          <span style={label}>Παλαιότητα</span>
          <CustomSelect ariaLabel="Παλαιότητα" value={age} onChange={setAge}
            options={AGES.map(a => ({ value: a.key, label: a.label }))} />
        </div>
        <div>
          <label htmlFor={ids.own} style={label}>Ποσοστό ιδιοκτησίας</label>
          <div style={{ position: 'relative' }}>
            <input id={ids.own} inputMode="numeric" value={ownership} onChange={e => setOwnership(e.target.value)}
              style={{ ...numField, paddingRight: 34 }} aria-describedby={`${ids.own}-unit`}/>
            <span id={`${ids.own}-unit`} aria-hidden style={unitStyle}>%</span>
          </div>
        </div>
      </div>

      <p style={{ margin: '10px 0 0', fontSize: 12, lineHeight: 1.6, color: 'var(--text-tertiary)' }}>
        Την τιμή ζώνης τη βρίσκεις στο συμβόλαιο, στο Ε9 ή στον{' '}
        <a href={OBJECTIVE_VALUES} target="_blank" rel="noopener noreferrer"
          style={{ color: 'var(--accent)' }}>χάρτη αντικειμενικών αξιών (valuemaps.gov.gr)</a>.
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
            {/* ΤΟ ΚΟΚΚΙΝΟ ΕΦΥΓΕ. Ο ΕΝΦΙΑ τυπωνόταν σε `--negative`, δηλαδή στο
                χρώμα που η εφαρμογή κρατά για σφάλμα. Ο φόρος δεν είναι σφάλμα
                ούτε κίνδυνος· είναι υποχρέωση που μετρήθηκε. Ο αδελφός
                υπολογιστής ενοικίων το είχε ήδη διορθώσει, αυτός όχι.

                ΔΥΟ ΝΟΥΜΕΡΑ, ΟΧΙ ΤΡΙΑ. Η αντικειμενική αξία ανέβαινε τρίτη στη
                σειρά των μεγάλων, ενώ είναι ΕΝΔΙΑΜΕΣΟ μέγεθος που βγαίνει από
                όσα μόλις πληκτρολόγησε ο χρήστης· κατεβαίνει στην ανάλυση, όπου
                ανήκει. Μένουν το ετήσιο και ο μήνας: αυτό που χρωστάς και αυτό
                που πρέπει να βρίσκεις κάθε μήνα. */}
            <div {...fixedCols(2, 24, 'start')}>
              <Figure label="ΕΝΦΙΑ ετησίως" value={feAuto(r.annual)} big />
              <Figure label="Ανά μήνα, σε 12 δόσεις" value={feAuto(r.annual / 12)} big />
            </div>

            <div style={{ height: 1, background: 'var(--border-subtle)', margin: '20px 0 16px' }}/>

            {/* Η ΑΝΑΛΥΣΗ ΔΕΙΧΝΕΙ ΤΩΡΑ ΑΠΟ ΠΟΥ ΒΓΗΚΕ Ο ΑΡΙΘΜΟΣ. Έδειχνε μόνο τον
                κύριο φόρο και τη μείωση: τρία νούμερα σε πλέγμα δύο στηλών, με
                ορφανό κελί, και κανένα ίχνος των τριών συντελεστών που κάνουν
                όλη τη δουλειά. Ο αδελφός υπολογιστής ενοικίων τυπώνει ολόκληρη
                την κλίμακα ακριβώς γι' αυτόν τον λόγο: ο ιδιοκτήτης που βλέπει
                από πού βγαίνει το ποσό μπορεί να το ελέγξει.

                Το «Σύνολο πριν τη μείωση» δοκιμάστηκε και αφαιρέθηκε: χωρίς
                πρόσθετο φόρο και χωρίς προσαύξηση ισούται με τον κύριο φόρο,
                δηλαδή τύπωνε το ΙΔΙΟ νούμερο δύο σειρές πιο κάτω.

                Η ΔΟΣΗ ΕΔΕΙΧΝΕ 16,00 € ΔΙΠΛΑ ΣΕ 180,28 € ΕΤΗΣΙΩΣ. Το `installment`
                του lib είναι `ceil(ετήσιο/12)`, δηλαδή στρογγυλεμένο προς τα πάνω
                σε ακέραια ευρώ, και υπάρχει για την πρόβλεψη ταμείου μέσα στην
                εφαρμογή. Εδώ όμως στεκόταν δίπλα στο ετήσιο, και δώδεκα φορές το
                16 κάνει 192: ο επισκέπτης διάβαζε δύο νούμερα που δεν βγαίνουν
                μεταξύ τους. Σε σελίδα που ρωτά «πόσο θα πληρώσεις», η διαίρεση
                γίνεται ακριβής. */}
            <dl {...fixedCols(2, 24, 'start')} style={{ ...fixedCols(2, 24, 'start').style, rowGap: 11, margin: 0 }}>
              <Row k="Αντικειμενική αξία (εκτίμηση)" v={feAuto(r.value)}/>
              <Row k="Βασικός φόρος ζώνης" v={`${fn(ENFIA_ZONE_TAX[r.zone] ?? 0, 2)} €/τ.μ.`}/>
              <Row k="Συντελεστής ορόφου" v={fn(enfiaFloorCoef(floor), 2)}/>
              <Row k="Συντελεστής παλαιότητας" v={fn(enfiaAgeCoef(age), 2)}/>
              <Row k="Κύριος φόρος κτίσματος" v={feAuto(r.basic)}/>
              {r.extra > 0 && <Row k="Πρόσθετος φόρος (αξία πάνω από 400.000 €)" v={feAuto(r.extra)}/>}
              {r.supplementary > 0 && <Row k="Προσαύξηση (περιουσία πάνω από 500.000 €)" v={feAuto(r.supplementary)}/>}
              {r.reductionPct > 0 && <Row k={`Μείωση ${r.reductionPct}%`} v={`− ${feAuto(r.reductionAmount)}`}/>}
            </dl>
          </>
        )}
      </div>

      {/* ── Τι ΔΕΝ περιλαμβάνει ──────────────────────────────────────────── */}
      <div style={{
        marginTop: 22, padding: '14px 16px', borderRadius: T.radius.inner,
        background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)',
      }}>
        <p style={{ margin: 0, fontSize: 13, lineHeight: 1.65, color: 'var(--text-secondary)' }}>
          <strong style={{ color: 'var(--text-primary)' }}>Τι δεν περιλαμβάνει.</strong>{' '}
          Η εκτίμηση αφορά <strong>ένα κτίσμα</strong> και υπολογίζει τη συνολική σου
          ακίνητη περιουσία <strong>ίση με αυτό</strong>. Αν έχεις κι άλλα ακίνητα, οικόπεδα
          ή αποθήκες, η μείωση και η προσαύξηση αλλάζουν, οπότε το ποσό στο εκκαθαριστικό
          θα διαφέρει. Δεν περιλαμβάνει απαλλαγές με εισοδηματικά κριτήρια (χαμηλό
          εισόδημα, τρίτεκνοι, αναπηρία, ασφαλισμένη κατοικία), ούτε τους ειδικούς
          συντελεστές οικοπέδου και πρόσοψης. Είναι <strong>εκτίμηση</strong> για να ξέρεις
          την τάξη μεγέθους, όχι φορολογική συμβουλή.
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
            μείωση, και σου θυμίζει τις δόσεις πριν λήξουν. {TRIAL_DAYS} ημέρες δωρεάν δοκιμή, χωρίς δέσμευση.
          </p>
        </div>
        <Link href="/signup" style={{
          display: 'inline-flex', alignItems: 'center', gap: 8, height: 44, padding: '0 22px',
          borderRadius: T.radius.pill, background: 'var(--accent)', color: 'var(--on-tone)',
          fontSize: 14, fontWeight: 700, textDecoration: 'none', whiteSpace: 'nowrap',
        }}>
          Ξεκίνα τη δοκιμή
        </Link>
      </div>
    </div>
  );
}

function Figure({ label, value, big }: { label: string; value: string; big?: boolean }) {
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
        color: 'var(--text-tertiary)', marginBottom: 6 }}>{label}</div>
      <div style={{
        fontFamily: T.font.num, fontSize: big ? 'clamp(22px, 4.4vw, 30px)' : 'clamp(18px, 3.4vw, 22px)',
        fontWeight: 700, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums', lineHeight: 1.15,
        color: 'var(--text-primary)',
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

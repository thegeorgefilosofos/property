'use client';
// ═══════════════════════════════════════════════════════════════════════════
// ΚΑΘΑΡΗ ΑΠΟΔΟΣΗ ΑΚΙΝΗΤΟΥ — ο διαδραστικός πυρήνας
// ─────────────────────────────────────────────────────────────────────────
// ΤΙ ΔΙΟΡΘΩΝΕΙ ΑΥΤΗ Η ΣΕΛΙΔΑ. Κάθε αγγελία και κάθε δωρεάν υπολογιστής δείχνει
// τη ΜΕΙΚΤΗ απόδοση: ενοίκιο επί δώδεκα, διά την αξία. Είναι τα χρήματα πριν
// τη ΔΟΥ, πριν τον ΕΝΦΙΑ και πριν τον θερμοσίφωνα. Ο ιδιοκτήτης το συγκρίνει
// με μια προθεσμιακή κατάθεση —όπου το 2% είναι 2% καθαρά— και παίρνει
// απόφαση δεκαετίας πάνω σε δύο νούμερα που δεν συγκρίνονται.
//
// ΤΑ ΔΥΟ ΝΟΥΜΕΡΑ ΜΠΑΙΝΟΥΝ ΔΙΠΛΑ ΔΙΠΛΑ, ΚΑΙ ΑΥΤΟ ΕΙΝΑΙ ΟΛΗ Η ΣΕΛΙΔΑ. Δεν
// γράφεται πουθενά «προσοχή, η μεικτή παραπλανά»: φαίνεται.
//
// ΤΙΠΟΤΑ ΔΕΝ ΜΑΝΤΕΥΕΤΑΙ ΓΙΑ ΛΟΓΑΡΙΑΣΜΟ ΤΟΥ ΧΡΗΣΤΗ. Ο ΕΝΦΙΑ και οι δαπάνες
// ξεκινούν στο μηδέν και το αποτέλεσμα ΤΟ ΛΕΕΙ όσο μένουν εκεί. Μια
// προεπιλογή «τυπικού ΕΝΦΙΑ» θα ήταν νούμερο χωρίς πηγή, μέσα στο ίδιο
// αποτέλεσμα που υπόσχεται ακρίβεια.
//
// ΜΙΑ ΠΗΓΗ: ο υπολογισμός ζει στο lib/tools/apodosi.ts, που καλεί την ίδια
// φορολογική λογική με τον πίνακα ελέγχου. Η οθόνη δεν κάνει αριθμητική.
// ═══════════════════════════════════════════════════════════════════════════
import { useMemo, useId, useState } from 'react';
import Link from 'next/link';
import { T, feAuto, fixedCols } from '@/components/tokens';
import { fn, fp } from '@/lib/core/format';
import { parseAmount } from '@/lib/core/greek';
import { propertyYield } from '@/lib/tools/apodosi';
import { PRESUMPTIVE_DEDUCTION_RATE } from '@/lib/accounting/statement';
import { FIRST_YEAR_NEW_BRACKETS } from '@/lib/billing/greekTax';
import { useToolState, ToolActions, ToolPaper, ToolPaperFoot } from '@/app/ToolShare';
import { ToolCta } from '@/app/PublicChrome';

import LiveResult from '@/components/LiveResult';
/** Τα πεδία όπως ταξιδεύουν στη διεύθυνση, με τις προεπιλογές τους. */
const SPEC = {
  axia: '200000', enoikio: '700', mines: '12',
  enfia: '0', dapanes: '0', alla: '0',
} as const;
const PATH = '/kathari-apodosi';

const amount = (s: string): number => Math.max(0, parseAmount(s) ?? 0);

const LBL: React.CSSProperties = {
  display: 'block', fontSize: 11, fontWeight: 700, letterSpacing: '0.06em',
  textTransform: 'uppercase', color: 'var(--text-tertiary)', marginBottom: 7,
};
const FIELD: React.CSSProperties = {
  width: '100%', height: T.h.lg, padding: '0 14px', borderRadius: T.radius.btn,
  border: '1px solid var(--border-default)', background: 'var(--bg-surface)',
  color: 'var(--text-primary)', fontSize: 16, fontFamily: T.font.num,
    // ΚΑΜΙΑ ΑΠΕΝΕΡΓΟΠΟΙΗΣΗ ΤΟΥ ΔΑΧΤΥΛΙΔΙΟΥ ΕΣΤΙΑΣΗΣ. Το `outline: 'none'` εδώ
    // ήταν inline, άρα νικούσε το :focus-visible του globals.css — και δεν
    // έμπαινε τίποτα στη θέση του. Μετρημένο σε πραγματικό περιηγητή: με το
    // πεδίο εστιασμένο, outlineWidth 0px, boxShadow none, εικόνα ΤΑΥΤΟΣΗΜΗ με
    // την ανεστίαστη. Ο χρήστης πληκτρολογίου δεν έβλεπε πού βρίσκεται.
  fontVariantNumeric: 'tabular-nums', boxSizing: 'border-box',
};
const UNIT: React.CSSProperties = {
  position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)',
  color: 'var(--text-tertiary)', fontSize: 15, pointerEvents: 'none',
};
const HINT: React.CSSProperties = {
  margin: '7px 0 0', fontSize: 12.5, lineHeight: 1.55, color: 'var(--text-tertiary)',
};
const GROUP: React.CSSProperties = {
  fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
  color: 'var(--text-secondary)', margin: '0 0 12px',
};

/**
 * Ενα πεδίο ποσού με τη μονάδα του μέσα, ίδιο και στα έξι.
 *
 * ΟΡΙΣΜΕΝΟ ΕΞΩ ΑΠΟ ΤΟ ΣΩΜΑ ΤΟΥ ΥΠΟΛΟΓΙΣΤΗ, ΕΠΙΤΗΔΕΣ. Γραμμένο μέσα, η
 * ταυτότητα του τύπου αλλάζει σε κάθε απόδοση: το React αποσυναρμολογεί το
 * παλιό <input> και στήνει καινούριο, οπότε ο δρομέας φεύγει από το πεδίο σε
 * ΚΑΘΕ πληκτρολόγηση. Η φόρμα θα ήταν αδύνατο να συμπληρωθεί.
 */
function MoneyField({ id, name, value, onChange, mode = 'decimal', suffix = '€' }: {
  id: string; name: string; value: string; onChange: (v: string) => void;
  mode?: 'decimal' | 'numeric'; suffix?: string;
}) {
  return (
    <div>
      <label htmlFor={id} style={LBL}>{name}</label>
      <div style={{ position: 'relative' }}>
        <input id={id} inputMode={mode} value={value} onChange={e => onChange(e.target.value)}
          style={{ ...FIELD, paddingRight: suffix ? 34 : 14 }}
          aria-describedby={suffix ? `${id}-unit` : undefined}/>
        {suffix && <span id={`${id}-unit`} aria-hidden style={UNIT}>{suffix}</span>}
      </div>
    </div>
  );
}

export function ApodosiCalculator({ year, today }: { year: number; today: string }) {
  const [v, set] = useToolState(SPEC, PATH);
  const ids = {
    axia: useId(), enoikio: useId(), mines: useId(),
    enfia: useId(), dapanes: useId(), alla: useId(), name: useId(),
  };
  // ΤΟ ΟΝΟΜΑ ΤΟΥ ΑΚΙΝΗΤΟΥ ΔΕΝ ΜΠΑΙΝΕΙ ΣΤΗ ΔΙΕΥΘΥΝΣΗ. Ενα «Πατησίων 42, 3ος» σε
  // κοινοποιημένο σύνδεσμο ταξιδεύει σε ιστορικά περιήγησης και σε αρχεία
  // καταγραφής· η υπόσχεση «μένει στη συσκευή σου» θα έσπαγε για το μόνο πεδίο
  // που είναι πράγματι προσωπικό δεδομένο.
  const [name, setName] = useState('');

  const r = useMemo(() => propertyYield({
    value: amount(v.axia),
    monthlyRent: amount(v.enoikio),
    monthsRented: amount(v.mines),
    enfia: amount(v.enfia),
    expenses: amount(v.dapanes),
    otherRentalIncome: amount(v.alla),
    year,
    // Η ΤΡΑΠΕΖΙΚΗ ΕΙΣΠΡΑΞΗ ΔΕΝ ΕΙΝΑΙ ΕΡΩΤΗΣΗ, ΕΙΝΑΙ Ο ΝΟΜΟΣ. Από 1/1/2026 τα
    // μισθώματα κατοικίας εξοφλούνται με τραπεζικό ή ηλεκτρονικό μέσο
    // (ν.5246/2025). Ενας διακόπτης «μήπως εισπράττεις μετρητά;» θα ρωτούσε
    // τον χρήστη αν παρανομεί, για να του δείξει χειρότερο νούμερο. Η υπόθεση
    // γράφεται στην επιφύλαξη, όπου ανήκει.
    viaBank: true,
  }), [v.axia, v.enoikio, v.mines, v.enfia, v.dapanes, v.alla, year]);

  const hasValue = amount(v.axia) > 0;
  const presumed = r.gross * PRESUMPTIVE_DEDUCTION_RATE;
  const noCosts = r.enfia === 0 && r.expenses === 0;

  return (
    <div style={{ fontFamily: T.font.sans }}>
      {/* ── ΤΟ ΑΚΙΝΗΤΟ: ΤΑ ΤΡΙΑ ΠΟΥ ΞΕΡΕΙ ΑΠΕΞΩ Ο ΚΑΘΕΝΑΣ ──────────────────
          Αξία, ενοίκιο, μήνες. Ό,τι άλλο θελήσουμε να ρωτήσουμε πρώτο είναι
          μια αφορμή να φύγει κάποιος που μόλις μας βρήκε. */}
      <div className="po-tool-controls">
        <p style={GROUP}>Το ακίνητο</p>
        <div {...fixedCols(3, 14, 'start')}>
          <MoneyField id={ids.axia} name="Αξία ακινήτου" value={v.axia} onChange={x => set('axia', x)}/>
          <MoneyField id={ids.enoikio} name="Μηνιαίο ενοίκιο" value={v.enoikio} onChange={x => set('enoikio', x)}/>
          <MoneyField id={ids.mines} name="Μήνες που νοικιάζεται" value={v.mines}
            onChange={x => set('mines', x)} mode="numeric" suffix=""/>
        </div>
      </div>

      {/* ── ΤΙ ΤΟ ΒΑΡΑΙΝΕΙ ────────────────────────────────────────────────
          Τρία πεδία που ξεκινούν στο μηδέν, με τη βοήθεια από κάτω τους. Το
          μηδέν δεν κρύβεται: το αποτέλεσμα λέει ρητά τι δεν περιλαμβάνει όσο
          μένουν άδεια. */}
      <div className="po-tool-controls" style={{ marginTop: 22 }}>
        <p style={GROUP}>Τι το βαραίνει</p>
        <div {...fixedCols(3, 14, 'start')}>
          <div>
            <MoneyField id={ids.enfia} name="ΕΝΦΙΑ τον χρόνο" value={v.enfia} onChange={x => set('enfia', x)}/>
            <p style={HINT}>
              Φόρος κατοχής: τον πληρώνεις και άδειο.{' '}
              <Link href="/ypologismos-enfia" className="lp-link"
                style={{ color: 'var(--accent)', textDecoration: 'none', fontWeight: 600 }}>
                Υπολόγισέ τον
              </Link>.
            </p>
          </div>
          <div>
            <MoneyField id={ids.dapanes} name="Δαπάνες τον χρόνο" value={v.dapanes} onChange={x => set('dapanes', x)}/>
            {/* Η ΠΡΟΤΑΣΗ ΕΧΕΙ ΠΗΓΗ, ΚΑΙ ΓΙ' ΑΥΤΟ ΕΠΙΤΡΕΠΕΤΑΙ. Το 5% δεν είναι
                δικός μας εμπειρικός κανόνας: είναι η τεκμαρτή δαπάνη επισκευών
                που αναγνωρίζει ο νόμος χωρίς παραστατικά. Μπαίνει με ένα
                πάτημα, και ο χρήστης το αλλάζει. */}
            <p style={HINT}>
              Συντήρηση, ασφάλιση, κοινόχρηστα δικά σου. Ο νόμος τεκμαίρει{' '}
              <button type="button" onClick={() => set('dapanes', presumed.toFixed(2))}
                style={{
                  border: 'none', background: 'none', padding: 0, cursor: 'pointer',
                  color: 'var(--accent)', fontWeight: 600, fontSize: 12.5,
                  fontFamily: T.font.num, textDecoration: 'underline',
                }}>{feAuto(presumed)}</button>.
            </p>
          </div>
          <div>
            <MoneyField id={ids.alla} name="Άλλα ενοίκια που δηλώνεις" value={v.alla} onChange={x => set('alla', x)}/>
            <p style={HINT}>Ακαθάριστα, από τα υπόλοιπα ακίνητά σου. Ανεβάζουν το κλιμάκιο αυτού εδώ.</p>
          </div>
        </div>
      </div>

      <ToolPaper title={name.trim() ? `Καθαρή απόδοση · ${name.trim()}` : 'Καθαρή απόδοση ακινήτου'} on={today} inputs={[
        { k: 'Αξία', v: feAuto(amount(v.axia)) },
        { k: 'Μηνιαίο ενοίκιο', v: feAuto(amount(v.enoikio)) },
        { k: 'Μήνες', v: fn(Math.min(12, Math.round(amount(v.mines)))) },
        { k: 'ΕΝΦΙΑ', v: feAuto(r.enfia) },
        { k: 'Δαπάνες', v: feAuto(r.expenses) },
        { k: 'Άλλα ενοίκια', v: feAuto(amount(v.alla)) },
      ]}/>

      {/* ── Το αποτέλεσμα ─────────────────────────────────────────────── */}
      <div className="po-tool-result" style={{
        marginTop: 20, padding: 'clamp(18px, 4vw, 26px)', borderRadius: T.radius.card,
        background: 'var(--surface-raised)', border: '1px solid var(--border-raised)',
        boxShadow: 'var(--well-inset)',
      }}>
        {/* ΔΥΟ ΝΟΥΜΕΡΑ, ΚΑΙ Η ΚΑΘΑΡΗ ΠΡΩΤΗ. Είναι η απάντηση στην ερώτηση που
            έφερε εδώ τον επισκέπτη· η μεικτή είναι το νούμερο που ήξερε πριν
            έρθει και υπάρχει μόνο για τη σύγκριση. Ίδιο μέγεθος, ώστε η
            σύγκριση να είναι σύγκριση και όχι υπόδειξη. */}
        {hasValue ? (
          <div {...fixedCols(2, 24, 'start')}>
            <Figure label="Καθαρή απόδοση" value={fp((r.netYield ?? 0) * 100)}/>
            <Figure label="Μεικτή απόδοση" value={fp((r.grossYield ?? 0) * 100)}/>
            <LiveResult say={`Καθαρή απόδοση ${fp((r.netYield ?? 0) * 100)}. Μεικτή ${fp((r.grossYield ?? 0) * 100)}.`} />
          </div>
        ) : (
          <p style={{ margin: 0, fontSize: 15, lineHeight: 1.6, color: 'var(--text-secondary)' }}>
            Η απόδοση χρειάζεται αξία. Με το ποσό που αξίζει ή που θα δώσεις για το
            ακίνητο, τα υπόλοιπα βγαίνουν από μόνα τους.
          </p>
        )}

        <div style={{ height: 1, background: 'var(--border-subtle)', margin: '20px 0 16px' }}/>

        {/* ── ΠΟΥ ΠΑΕΙ ΤΟ ΕΝΟΙΚΙΟ ────────────────────────────────────────
            Μία γραμμή, τέσσερα κομμάτια. Δείχνει ΤΙ ΑΠΟΜΕΝΕΙ, που κανένας
            πίνακας αριθμών δεν δείχνει με μια ματιά. Τα ευρώ τα λέει ο πίνακας
            από κάτω, οπότε εδώ δεν γράφεται κανένα νούμερο και η γραμμή είναι
            διακοσμητική για τον αναγνώστη οθόνης.
            ΧΩΡΙΣ ΚΟΚΚΙΝΟ ΚΑΙ ΠΡΑΣΙΝΟ: το κρατούμενο παίρνει το χρώμα έμφασης,
            τα τρία βάρη διαβαθμίσεις του ίδιου ουδέτερου. Ο φόρος δεν είναι
            σφάλμα, είναι υποχρέωση που μετρήθηκε. */}
        {r.gross > 0 && (
          <div aria-hidden style={{ marginBottom: 18 }}>
            <div style={{
              display: 'flex', gap: 2, height: 10, borderRadius: T.radius.pill, overflow: 'hidden',
              background: 'var(--bg-elevated)',
            }}>
              {([
                ['keep', Math.max(0, r.net), 'var(--accent)', 1],
                ['tax', r.tax, 'var(--text-tertiary)', 0.7],
                ['enfia', r.enfia, 'var(--text-tertiary)', 0.45],
                ['costs', r.expenses, 'var(--text-tertiary)', 0.25],
              ] as const).filter(([, n]) => n > 0).map(([k, n, bg, op]) => (
                <span key={k} style={{ flex: n, background: bg, opacity: op, minWidth: 2 }}/>
              ))}
            </div>
            <p style={{ margin: '8px 0 0', fontSize: 11, fontWeight: 700, letterSpacing: '0.06em',
              textTransform: 'uppercase', color: 'var(--text-tertiary)' }}>
              Πού πάει το ενοίκιο
            </p>
          </div>
        )}

        <dl {...fixedCols(2, 24, 'start')} style={{ ...fixedCols(2, 24, 'start').style, rowGap: 11, margin: 0 }}>
          <Row k="Ετήσιο ενοίκιο" v={feAuto(r.gross)}/>
          <Row k="Φόρος εισοδήματος" v={feAuto(r.tax)}/>
          <Row k="ΕΝΦΙΑ" v={feAuto(r.enfia)}/>
          <Row k="Δαπάνες" v={feAuto(r.expenses)}/>
          <Row k="Σου μένουν τον χρόνο" v={feAuto(r.net)}/>
          <Row k="Καθαρά ανά μήνα" v={feAuto(r.netMonthly)}/>
          {/* ΟΤΑΝ ΤΟ ΑΚΙΝΗΤΟ ΔΕΝ ΕΠΙΣΤΡΕΦΕΙ, ΔΕΝ ΓΡΑΦΕΤΑΙ ΑΡΙΘΜΟΣ. Η διαίρεση
              με αρνητικά καθαρά δίνει αρνητικά χρόνια, που τυπώνονται μια χαρά
              και διαβάζονται ως απάντηση. */}
          <Row k="Χρόνια να επιστρέψει η αξία"
            v={r.paybackYears === null ? 'Δεν επιστρέφει' : fn(r.paybackYears, 1)}/>
          <Row k="Συντελεστής στο επόμενο ευρώ" v={fp(r.marginal * 100)}/>
        </dl>

        {/* ΤΟ ΜΗΔΕΝ ΠΟΥ ΔΕΝ ΔΗΛΩΘΗΚΕ ΤΟ ΛΕΕΙ Η ΙΔΙΑ Η ΚΑΡΤΑ. Χωρίς αυτό, η
            καθαρή απόδοση της πρώτης οθόνης θα ήταν η μεικτή μείον τον φόρο,
            παρουσιασμένη ως «καθαρή» — δηλαδή ακριβώς το λάθος που η σελίδα
            υπάρχει για να διορθώσει. */}
        {noCosts && (
          <p style={{ margin: '16px 0 0', fontSize: 12.5, lineHeight: 1.6, color: 'var(--text-tertiary)' }}>
            Δεν δηλώθηκε ΕΝΦΙΑ ούτε δαπάνες, οπότε η καθαρή απόδοση παραπάνω κρατά
            μόνο τον φόρο. Με τα δύο πεδία συμπληρωμένα πέφτει.
          </p>
        )}
      </div>

      <ToolActions path={PATH} spec={SPEC} values={v}/>

      {/* ── ΤΟ ΟΝΟΜΑ ΤΟΥ ΑΚΙΝΗΤΟΥ, ΜΟΝΟ ΓΙΑ ΤΟ ΧΑΡΤΙ ──────────────────────
          Οποιος συγκρίνει τρία ακίνητα τυπώνει τρεις σελίδες που μοιάζουν
          ίδιες. Το πεδίο γράφει τον τίτλο της εκτύπωσης και τίποτε άλλο. */}
      <div className="po-noprint" style={{ marginTop: 16 }}>
        <label htmlFor={ids.name} style={{ ...LBL, marginBottom: 6 }}>Όνομα για την εκτύπωση</label>
        <input id={ids.name} value={name} onChange={e => setName(e.target.value)}
          placeholder="Πατησίων 42, 3ος"
          style={{ ...FIELD, fontFamily: T.font.sans, maxWidth: 340 }}/>
      </div>

      {/* ── Τι ΔΕΝ περιλαμβάνει ───────────────────────────────────────── */}
      <div className="po-tool-note" style={{
        marginTop: 22, padding: 'clamp(14px,2.6vw,18px)', borderRadius: T.radius.inner,
        background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)',
      }}>
        <p style={{ margin: 0, fontSize: 13, lineHeight: 1.7, color: 'var(--text-secondary)' }}>
          <strong style={{ color: 'var(--text-primary)' }}>Τι δεν περιλαμβάνει.</strong>{' '}
          Ο φόρος υπολογίζεται με την κλίμακα ενοικίων του {year}
          {year >= FIRST_YEAR_NEW_BRACKETS ? ' (15 / 25 / 35 / 45%)' : ' (15 / 35 / 45%)'} και με
          την τεκμαρτή έκπτωση 5%, που από 1/1/2026 προϋποθέτει είσπραξη μέσω
          τραπέζης (ν.5246/2025): ο υπολογισμός την υποθέτει. Δεν περιλαμβάνει
          μεταβολή της αξίας του ακινήτου, δάνειο και τόκους, έξοδα αγοράς ή
          πώλησης, ανακαίνιση, ανείσπρακτα ενοίκια, βραχυχρόνια μίσθωση, νομικό
          πρόσωπο, ούτε άλλα εισοδήματά σου εκτός ενοικίων. Είναι{' '}
          <strong>εκτίμηση</strong> για να ξέρεις την τάξη μεγέθους, όχι
          επενδυτική ή φορολογική συμβουλή.
        </p>
      </div>

      <ToolPaperFoot path={PATH} spec={SPEC} values={v}/>

      <ToolCta
        title="Θέλεις να το βλέπεις για όλα σου τα ακίνητα, χωρίς να το ξαναϋπολογίσεις;"
        body="Το Property OS κρατά ενοίκια, ΕΝΦΙΑ και δαπάνες ανά ακίνητο όλη τη χρονιά, και δείχνει ποιο αποδίδει και ποιο σε βαραίνει."
      />
    </div>
  );
}

/**
 * Ένα μετρημένο νούμερο με την ετικέτα του. Χωρίς παράμετρο χρώματος: η έμφαση
 * δίνεται με μέγεθος και σειρά, που δουλεύουν και σε ασπρόμαυρη εκτύπωση.
 */
function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
        color: 'var(--text-tertiary)', marginBottom: 7 }}>{label}</div>
      <div style={{
        fontFamily: T.font.num, fontSize: 'clamp(24px, 4.4vw, 32px)',
        fontWeight: 680, letterSpacing: '-0.03em', fontVariantNumeric: 'tabular-nums', lineHeight: 1.1,
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

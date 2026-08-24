'use client';
// ═══════════════════════════════════════════════════════════════════════════
// ΒΡΑΧΥΧΡΟΝΙΑ Ή ΜΑΚΡΟΧΡΟΝΙΑ — ο διαδραστικός πυρήνας
// ─────────────────────────────────────────────────────────────────────────
// ΓΙΑΤΙ ΑΥΤΟΣ Ο ΤΡΙΤΟΣ ΥΠΟΛΟΓΙΣΤΗΣ ΚΑΙ ΟΧΙ ΚΑΠΟΙΟΣ ΑΛΛΟΣ. Είναι η ερώτηση που
// κάνει κάθε Έλληνας ιδιοκτήτης πριν βάλει ή βγάλει ενοικιαστή, η απάντηση
// υπάρχει ήδη δοκιμασμένη μέσα στην εφαρμογή, και κανείς δεν τη δίνει σωστά:
// τα εργαλεία που κυκλοφορούν πολλαπλασιάζουν τιμή επί νύχτες και σταματούν
// εκεί, αγνοώντας το τέλος ανθεκτικότητας, την προμήθεια που δεν εκπίπτει, τα
// λειτουργικά και το ανέβασμα κλιμακίου.
//
// Η ΟΘΟΝΗ ΕΧΕΙ ΤΡΙΑ ΕΠΙΠΕΔΑ, ΜΕ ΑΥΤΗ ΤΗ ΣΕΙΡΑ:
//   1. Η ΕΤΥΜΗΓΟΡΙΑ σε μία πρόταση, με το ποσό της διαφοράς.
//   2. Η ΠΛΗΡΟΤΗΤΑ ΙΣΟΡΡΟΠΙΑΣ, που είναι το νούμερο που πραγματικά αποφασίζει:
//      δεν εξαρτάται από το πόσο αισιόδοξος ήταν ο χρήστης στην πρόβλεψή του.
//   3. Ο ΠΙΝΑΚΑΣ, όπου φαίνεται πού πήγαν τα χρήματα σε κάθε πλευρά.
//
// ΧΩΡΙΣ ΧΡΩΜΑ ΣΤΗΝ ΕΤΥΜΗΓΟΡΙΑ. Ούτε η βραχυχρόνια είναι «σωστή» ούτε η
// μακροχρόνια «λάθος»· είναι δύο νόμιμες επιλογές με διαφορετικό ρίσκο και
// διαφορετική δουλειά. Η έμφαση βγαίνει από μέγεθος και θέση.
// ═══════════════════════════════════════════════════════════════════════════
import { useMemo, useId } from 'react';
import { T, feAuto, fp, fixedCols } from '@/components/tokens';
import { fn, feSigned } from '@/lib/core/format';
import { parseAmount } from '@/lib/core/greek';
import { compareShortVsLong, netByOccupancy, NIGHTS_PER_YEAR, HIGH_SEASON_NIGHTS, type SeasonSpread } from '@/lib/tools/shortVsLong';
import { climateLevyRates } from '@/lib/billing/greekTax';
import { REGULATORY_UPDATES_2026 } from '@/lib/accounting/updates2026';
import { CustomSelect } from '@/app/dashboard/components/UIComponents';
import { useToolState, ToolActions, ToolPaper, ToolPaperFoot } from '@/app/ToolShare';
import { ToolCta } from '@/app/PublicChrome';

import LiveResult from '@/components/LiveResult';
const amount = (s: string): number => Math.max(0, parseAmount(s) ?? 0);

/** Τα πεδία όπως ταξιδεύουν στη διεύθυνση, με τις προεπιλογές τους. */
const SPEC = {
  enoikio: '700', timi: '80', plirotita: '60', tm: '75', typos: 'flat',
  promitheia: '15', kostos: '12', pagia: '90', sezon: 'even',
} as const;

/** Ο κανόνας των «κόκκινων ζωνών», από τη μία πηγή κανόνων της εφαρμογής. */
const AMA_RULE = REGULATORY_UPDATES_2026.find(u => u.id === 'ama-red-zones');

/** Τα βήματα πληρότητας του πίνακα ευαισθησίας. */
const OCCUPANCY_STEPS = [30, 40, 50, 60, 70, 80, 90];
const PATH = '/vraxyxronia-i-makroxronia';

const TYPES = [
  { value: 'flat', label: 'Διαμέρισμα' },
  { value: 'house', label: 'Μονοκατοικία' },
];

export function ShortVsLongCalculator({ today }: { today: string }) {
  const [v, set] = useToolState(SPEC, PATH);
  const ids = {
    rent: useId(), price: useId(), occ: useId(), sqm: useId(),
    fee: useId(), cost: useId(), fixed: useId(),
  };

  // ΜΙΑ ΑΝΑΓΝΩΣΗ ΤΩΝ ΠΕΔΙΩΝ, ΤΡΕΙΣ ΧΡΗΣΕΙΣ. Η σύγκριση και ο πίνακας ευαισθησίας
  // πρέπει να τρέχουν πάνω στα ΙΔΙΑ δεδομένα· δύο αντίγραφα του ίδιου
  // αντικειμένου θα απέκλιναν με την πρώτη αλλαγή πεδίου.
  const input = useMemo(() => ({
    monthlyRent: amount(v.enoikio),
    nightlyPrice: amount(v.timi),
    occupancyPct: Math.min(100, amount(v.plirotita)),
    sqm: amount(v.tm),
    isHouse: v.typos === 'house',
    platformFeePct: Math.min(100, amount(v.promitheia)),
    costPerNight: amount(v.kostos),
    fixedPerMonth: amount(v.pagia),
    season: (v.sezon === 'high' ? 'high' : 'even') as SeasonSpread,
  }), [v]);
  const r = useMemo(() => compareShortVsLong(input), [input]);
  const curve = useMemo(() => netByOccupancy(input, OCCUPANCY_STEPS), [input]);
  const levyRates = climateLevyRates(amount(v.tm), v.typos === 'house');

  const field: React.CSSProperties = {
    width: '100%', height: T.h.lg, padding: '0 12px', borderRadius: T.radius.btn,
    border: '1px solid var(--border-default)', background: 'var(--bg-surface)',
    color: 'var(--text-primary)', fontSize: 15, fontFamily: T.font.num,
    // ΚΑΜΙΑ ΑΠΕΝΕΡΓΟΠΟΙΗΣΗ ΤΟΥ ΔΑΧΤΥΛΙΔΙΟΥ ΕΣΤΙΑΣΗΣ. Το `outline: 'none'` εδώ
    // ήταν inline, άρα νικούσε το :focus-visible του globals.css — και δεν
    // έμπαινε τίποτα στη θέση του. Μετρημένο σε πραγματικό περιηγητή: με το
    // πεδίο εστιασμένο, outlineWidth 0px, boxShadow none, εικόνα ΤΑΥΤΟΣΗΜΗ με
    // την ανεστίαστη. Ο χρήστης πληκτρολογίου δεν έβλεπε πού βρίσκεται.
    fontVariantNumeric: 'tabular-nums', boxSizing: 'border-box',
  };
  const label: React.CSSProperties = {
    display: 'block', fontSize: 11, fontWeight: 700, letterSpacing: '0.06em',
    textTransform: 'uppercase', color: 'var(--text-tertiary)', marginBottom: 7,
  };
  // Ίδιο σχήμα με τους επιλογείς της εφαρμογής: ενεργό γεμάτο, ανενεργό διάφανο.
  // Τα δύο κουμπιά της σεζόν είναι αυτοτελή χειριστήρια, όχι λέξεις σε πρόταση:
  // παίρνουν το κοινό ιδίωμα των 44 εικονοστοιχείων σε συσκευή αφής. Στα 40 που
  // είχαν, δύο κουμπιά κολλητά σε τηλέφωνο αστοχούν το ένα στο άλλο.
  const segStyle = (on: boolean): React.CSSProperties => ({
    height: T.h.sm, padding: '0 14px', borderRadius: T.radius.inner, border: 'none',
    background: on ? 'var(--accent)' : 'transparent',
    color: on ? 'var(--accent-text)' : 'var(--text-secondary)',
    fontSize: 12.5, fontWeight: 600, fontFamily: T.font.sans, cursor: 'pointer',
    whiteSpace: 'nowrap', transition: 'background-color 0.15s, color 0.15s',
  });

  const unit: React.CSSProperties = {
    position: 'absolute', right: 13, top: '50%', transform: 'translateY(-50%)',
    color: 'var(--text-tertiary)', fontSize: 14, pointerEvents: 'none',
  };

  /** Πεδίο με μονάδα μέσα του, όπως και στους δύο αδελφούς υπολογιστές. */
  const num = (id: string, key: keyof typeof SPEC, text: string, suffix: string, pad = 34) => (
    <div>
      <label htmlFor={id} style={label}>{text}</label>
      <div style={{ position: 'relative' }}>
        <input id={id} inputMode="decimal" value={v[key]} onChange={e => set(key, e.target.value)}
          style={{ ...field, paddingRight: pad }} aria-describedby={`${id}-u`}/>
        <span id={`${id}-u`} aria-hidden style={unit}>{suffix}</span>
      </div>
    </div>
  );

  const be = r.breakEvenPct;

  return (
    <div style={{ fontFamily: T.font.sans }}>
      {/* ── ΤΙ ΖΗΤΑΜΕ, ΚΑΙ ΓΙΑΤΙ ΤΟΣΑ ────────────────────────────────────────
             Οκτώ πεδία είναι περισσότερα από τους άλλους δύο υπολογιστές, και
             είναι τα ΛΙΓΟΤΕΡΑ που δίνουν τίμια απάντηση: χωρίς προμήθεια και
             λειτουργικά, η σύγκριση γέρνει ψευδώς προς τη βραχυχρόνια, που
             είναι ακριβώς το λάθος για το οποίο υπάρχει η σελίδα. */}
      <div {...fixedCols(2, 14, 'start', 'po-tool-controls')}>
        {num(ids.rent, 'enoikio', 'Μηνιαίο ενοίκιο', '€')}
        {num(ids.price, 'timi', 'Τιμή ανά διανυκτέρευση', '€')}
        {num(ids.occ, 'plirotita', 'Πληρότητα', '%')}
        {num(ids.sqm, 'tm', 'Τετραγωνικά', 'τ.μ.', 44)}
        <div>
          <span style={label}>Τύπος ακινήτου</span>
          <CustomSelect ariaLabel="Τύπος ακινήτου" value={v.typos}
            onChange={x => set('typos', x)} options={TYPES}/>
        </div>
        {num(ids.fee, 'promitheia', 'Προμήθεια πλατφόρμας', '%')}
        {num(ids.cost, 'kostos', 'Καθαριότητα ανά διανυκτέρευση', '€')}
        {num(ids.fixed, 'pagia', 'Πάγια ανά μήνα', '€')}
      </div>

      {/* ═══ Η ΤΙΜΗ ΤΗΣ ΑΙΧΜΗΣ ΕΙΝΑΙ Ο ΠΙΟ ΣΥΝΗΘΗΣ ΑΥΤΟΕΞΑΠΑΤΗΣΗ ═════════════════
          Η βραχυχρόνια δουλεύει με δυναμική τιμολόγηση: άλλη τιμή τον Αύγουστο,
          άλλη τον Νοέμβριο, άλλη το Σαββατοκύριακο. Ο ιδιοκτήτης θυμάται την
          ΚΑΛΥΤΕΡΗ του βραδιά και τη γράφει εδώ — και μετά τη διαβάζει
          πολλαπλασιασμένη επί τριακόσιες εξήντα πέντε. Το εργαλείο ζητά ρητά τον
          μέσο όρο, γιατί αλλιώς παράγει το ίδιο ακριβώς λάθος που υπάρχει για
          να διορθώσει. */}
      <p className="po-tool-controls" style={{ margin: '10px 0 0', fontSize: 12, lineHeight: 1.6, color: 'var(--text-tertiary)' }}>
        Η τιμή είναι η δική σου ανά διανυκτέρευση· ο επισκέπτης πληρώνει επιπλέον το τέλος
        ανθεκτικότητας, που εσύ το αποδίδεις. Στη βραχυχρόνια η τιμή αλλάζει με την εποχή και τη
        ζήτηση: βάλε τον μέσο όρο που πιάνεις, όχι την τιμή της αιχμής. Τα πάγια είναι ρεύμα, νερό
        και ίντερνετ, που στη μακροχρόνια τα πληρώνει ο ενοικιαστής.
      </p>

      {/* ═══ ΠΟΤΕ ΓΕΜΙΖΕΙ ΤΟ ΑΚΙΝΗΤΟ ══════════════════════════════════════════
          ΔΕΝ ΕΙΝΑΙ ΛΕΠΤΟΜΕΡΕΙΑ. Το τέλος ανθεκτικότητας είναι ΤΕΤΡΑΠΛΑΣΙΟ από
          Απρίλιο ώς Οκτώβριο. Με τις ίδιες ακριβώς νύχτες και την ίδια τιμή, το
          ελληνικό εξοχικό που γεμίζει μόνο το καλοκαίρι πληρώνει σχεδόν
          διπλάσιο τέλος από ένα διαμέρισμα πόλης που δουλεύει όλο τον χρόνο.
          Η πρώτη εκδοχή μοίραζε πάντα ισομερώς και το έγραφε ως παραδοχή· ήταν
          τίμιο, αλλά ήταν και λάθος για τα μισά ελληνικά ακίνητα.

          ΔΕΝ ΕΙΝΑΙ ΠΕΔΙΟ ΤΟΥ ΠΛΕΓΜΑΤΟΣ, ΓΙΑΤΙ ΔΕΝ ΕΙΝΑΙ ΠΟΣΟ. Τα οκτώ από πάνω
          είναι μεγέθη που πληκτρολογείς· αυτό είναι παραδοχή του μοντέλου, και
          χρειάζεται τη δική του σειρά για να εξηγηθεί. */}
      <div className="po-tool-controls" style={{
        marginTop: 14, padding: '12px 14px', borderRadius: T.radius.inner,
        border: '1px solid var(--border-subtle)', background: 'var(--bg-elevated)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: 16, flexWrap: 'wrap',
      }}>
        <div style={{ flex: 1, minWidth: 230 }}>
          <div style={{ fontSize: 14, fontWeight: 650, color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>
            Πότε γεμίζει
          </div>
          <p style={{ margin: '3px 0 0', fontSize: 12.5, lineHeight: 1.55, color: 'var(--text-tertiary)' }}>
            {input.season === 'high'
              ? `Οι κρατήσεις πέφτουν πρώτα στους επτά μήνες της υψηλής περιόδου, δηλαδή έως ${HIGH_SEASON_NIGHTS} διανυκτερεύσεις, όπου το τέλος είναι ${feAuto(levyRates.high)} τη διανυκτέρευση. Αλλάζει τι πληρώνει ο επισκέπτης, όχι τι κρατάς εσύ.`
              : `Οι κρατήσεις μοιράζονται ισομερώς στους δώδεκα μήνες. Το τέλος είναι ${feAuto(levyRates.high)} τη διανυκτέρευση από Απρίλιο ώς Οκτώβριο και ${feAuto(levyRates.low)} τους υπόλοιπους.`}
          </p>
        </div>
        {/* ── Η ΕΝΕΡΓΗ ΕΠΙΛΟΓΗ ΔΕΝ ΛΕΓΕΤΑΙ ΜΟΝΟ ΜΕ ΧΡΩΜΑ ─────────────────────
               Τα δύο κουμπιά δήλωναν ποιο είναι πατημένο αποκλειστικά με το
               φόντο που δίνει το segStyle. Μετρημένο σε πραγματικό Chromium,
               aria-pressed, aria-selected και aria-current ήταν και τα τρία
               κενά: ο αναγνώστης οθόνης άκουγε δύο ίδια κουμπιά και καμία
               κατάσταση, δηλαδή η παραδοχή που αλλάζει το τέλος ανθεκτικότητας
               ήταν αόρατη για όποιον δεν βλέπει το χρώμα.
               Ίδιο ιδίωμα με τον επιλογέα έτους στον φόρο ενοικίων: aria-pressed
               πάνω στο κουμπί, με την ΙΔΙΑ συνθήκη που δίνει και το χρώμα, ώστε
               τα δύο να μην μπορούν να ξεφύγουν το ένα από το άλλο. */}
        {/* ΤΑ ΔΥΟ ΛΕΚΤΙΚΑ ΔΕΝ ΧΩΡΑΝΕ ΔΙΠΛΑ ΣΤΑ 320. Μετρημένο σε πραγματικό
            Chromium: η σειρά πιάνει 286 μέσα σε κάρτα που της δίνει 250, και
            βγαίνει και ένα εικονοστοιχείο έξω από την οθόνη. Ούτε το λεκτικό
            κονταίνει ούτε το κουμπί σπάει σε δύο γραμμές: η σειρά αναδιπλώνεται,
            και κάτω από τα 380 το κάθε κουμπί πιάνει ολόκληρη τη γραμμή του.
            Πάνω από εκεί τα δύο χωράνε δίπλα και τίποτα δεν αλλάζει. */}
        <div className="po-seg" style={{ display: 'flex', flexWrap: 'wrap', gap: 3, padding: 3, background: 'var(--bg-surface)',
          border: '1px solid var(--border-subtle)', borderRadius: T.radius.inner }}>
          <button type="button" onClick={() => set('sezon', 'even')} aria-pressed={input.season === 'even'} className="po-tap" style={segStyle(input.season === 'even')}>Όλο τον χρόνο</button>
          <button type="button" onClick={() => set('sezon', 'high')} aria-pressed={input.season === 'high'} className="po-tap" style={segStyle(input.season === 'high')}>Κυρίως το καλοκαίρι</button>
        </div>
      </div>

      {/* ── Η κεφαλίδα του χαρτιού, πάνω από το αποτέλεσμα ─────────────── */}
      <ToolPaper title="Σύγκριση βραχυχρόνιας και μακροχρόνιας" on={today} inputs={[
        { k: 'Μηνιαίο ενοίκιο', v: feAuto(amount(v.enoikio)) },
        { k: 'Τιμή διανυκτέρευσης', v: feAuto(amount(v.timi)) },
        { k: 'Πληρότητα', v: fp(amount(v.plirotita)) },
        { k: 'Ακίνητο', v: `${TYPES.find(t => t.value === v.typos)?.label ?? v.typos}, ${fn(amount(v.tm), 2)} τ.μ.` },
        { k: 'Προμήθεια', v: fp(amount(v.promitheia)) },
        { k: 'Καθαριότητα', v: `${feAuto(amount(v.kostos))} τη διανυκτέρευση` },
        { k: 'Πάγια', v: `${feAuto(amount(v.pagia))} τον μήνα` },
        { k: 'Πότε γεμίζει', v: input.season === 'high' ? 'κυρίως το καλοκαίρι' : 'όλο τον χρόνο' },
      ]}/>

      {/* ── Το αποτέλεσμα ──────────────────────────────────────────────── */}
      <div className="po-tool-result" style={{
        marginTop: 20, padding: 'clamp(18px, 4vw, 26px)', borderRadius: T.radius.card,
        background: 'var(--surface-raised)', border: '1px solid var(--border-raised)',
        boxShadow: 'var(--well-inset)',
      }}>
        {/* Η ΕΤΥΜΗΓΟΡΙΑ ΣΕ ΜΙΑ ΠΡΟΤΑΣΗ. Χωρίς αυτήν, ο επισκέπτης βλέπει δύο
            ποσά και κάνει ο ίδιος την αφαίρεση — που είναι η μόνη πράξη για την
            οποία ήρθε. Η ισοπαλία λέγεται ισοπαλία, δεν στρογγυλοποιείται προς
            κάποια πλευρά. */}
        <p style={{
          margin: '0 0 18px', fontSize: 'clamp(16px, 2.2vw, 20px)', lineHeight: 1.4,
          fontWeight: 650, letterSpacing: '-0.02em', color: 'var(--text-primary)', textWrap: 'balance',
        }}>
          {Math.abs(r.difference) < 1
            ? 'Οι δύο επιλογές αφήνουν ουσιαστικά τα ίδια.'
            : `Η ${r.difference > 0 ? 'βραχυχρόνια' : 'μακροχρόνια'} αφήνει ${feAuto(Math.abs(r.difference))} περισσότερα τον χρόνο.`}
        </p>

        <div {...fixedCols(2, 24, 'start')}>
          <Figure label="Μακροχρόνια, καθαρά" value={feAuto(r.long.net)} />
          <Figure label="Βραχυχρόνια, καθαρά" value={feAuto(r.short.net)} />
          <LiveResult say={`Μακροχρόνια ${feAuto(r.long.net)} καθαρά. Βραχυχρόνια ${feAuto(r.short.net)} καθαρά.`} />
        </div>

        <div style={{ height: 1, background: 'var(--border-subtle)', margin: '20px 0 16px' }}/>

        {/* ═══ ΤΟ ΝΟΥΜΕΡΟ ΠΟΥ ΑΠΟΦΑΣΙΖΕΙ ═══════════════════════════════════════
            Τα δύο ποσά από πάνω απαντούν για την πληρότητα που ΜΑΝΤΕΨΕ ο
            χρήστης — και ακριβώς αυτήν δεν την ξέρει· είναι η πιο αβέβαιη
            είσοδος ολόκληρης της σελίδας. Το κατώφλι δεν εξαρτάται από την
            πρόβλεψή του: το συγκρίνει με ό,τι ξέρει για τη γειτονιά του και
            απαντά μόνος του. */}
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
            color: 'var(--text-tertiary)', marginBottom: 7 }}>
            Πληρότητα ισορροπίας
          </div>
          <p style={{ margin: 0, fontSize: 14, lineHeight: 1.65, color: 'var(--text-secondary)' }}>
            {be === null
              ? 'Ούτε με πλήρη πληρότητα η βραχυχρόνια δεν φτάνει τη μακροχρόνια, με αυτά τα δεδομένα.'
              : be === 0
                ? 'Η βραχυχρόνια βγαίνει μπροστά από την πρώτη κιόλας κράτηση.'
                : <>Από <strong style={{ color: 'var(--text-primary)', fontFamily: T.font.num,
                    fontVariantNumeric: 'tabular-nums' }}>{fp(be)}</strong> πληρότητα και πάνω η
                    βραχυχρόνια αφήνει περισσότερα, δηλαδή από{' '}
                    <strong style={{ color: 'var(--text-primary)', fontFamily: T.font.num,
                      fontVariantNumeric: 'tabular-nums' }}>{fn(Math.ceil(be / 100 * NIGHTS_PER_YEAR))}</strong>{' '}
                    διανυκτερεύσεις τον χρόνο.</>}
          </p>
        </div>
      </div>

      {/* ── Πού πήγαν τα χρήματα, στις δύο πλευρές ──────────────────────────
             Κάθε γραμμή εκτός από την τελευταία είναι χρήμα που ΦΕΥΓΕΙ, οπότε ο
             πίνακας διαβάζεται ως αφαίρεση που κλείνει: εισπράξεις μείον τα
             τέσσερα δίνουν ακριβώς τα καθαρά. Ένας πίνακας που δεν κλείνει
             μπροστά στον αναγνώστη είναι χειρότερος από κανέναν πίνακα. */}
      <div style={{ marginTop: 26 }}>
        <div className="po-scroll-x" style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 340 }}>
            <caption style={{ captionSide: 'top', textAlign: 'left', fontSize: 11, fontWeight: 700,
              letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-tertiary)',
              paddingBottom: 10 }}>
              Πού πάνε τα χρήματα, τον χρόνο
            </caption>
            <thead>
              <tr>
                <th scope="col" style={th}> </th>
                <th scope="col" style={{ ...th, textAlign: 'right' }}>Μακροχρόνια</th>
                <th scope="col" style={{ ...th, textAlign: 'right' }}>Βραχυχρόνια</th>
              </tr>
            </thead>
            <tbody>
              <Line k="Πληρωμές επισκεπτών" a={r.long.gross} b={r.short.guestTotal} />
              <Line k="Τέλος ανθεκτικότητας" a={0} b={r.short.levy} />
              <Line k="Φόρος εισοδήματος" a={r.long.tax} b={r.short.tax} />
              <Line k="Προμήθεια πλατφόρμας" a={0} b={r.short.platformFee} />
              <Line k="Καθαριότητα και πάγια" a={0} b={r.short.running} />
              <Line k="Καθαρά" a={r.long.net} b={r.short.net} strong />
            </tbody>
          </table>
        </div>
      </div>

      {/* ═══ Η ΠΛΗΡΟΤΗΤΑ ΕΙΝΑΙ ΜΑΝΤΕΨΙΑ, ΚΑΙ Ο ΠΙΝΑΚΑΣ ΤΟ ΠΑΡΑΔΕΧΕΤΑΙ ══════════
          Ολόκληρο το αποτέλεσμα κρέμεται από ένα νούμερο που ο χρήστης δεν
          ξέρει και το μαντεύει. Ένα εργαλείο που δίνει ΕΝΑ ποσό για ΜΙΑ
          μαντεψιά, χωρίς να δείξει πόσο ευαίσθητο είναι, δίνει βεβαιότητα που
          δεν υπάρχει. Επτά γραμμές δείχνουν τι κοστίζει να πέσει έξω κατά δέκα
          μονάδες — και δεν ζητούν τίποτα παραπάνω από τον χρήστη.
          Η γραμμή που περνά το κατώφλι σημειώνεται με την ίδια απαλή επιφάνεια
          που χρησιμοποιεί ο υπολογιστής φόρου για το ενεργό κλιμάκιο. */}
      <div style={{ marginTop: 26 }}>
        <div className="po-scroll-x" style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 340 }}>
            <caption style={{ captionSide: 'top', textAlign: 'left', fontSize: 11, fontWeight: 700,
              letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-tertiary)',
              paddingBottom: 10 }}>
              Αν πέσεις έξω στην πληρότητα
            </caption>
            <thead>
              <tr>
                <th scope="col" style={th}>Πληρότητα</th>
                <th scope="col" style={{ ...th, textAlign: 'right' }}>Διανυκτερεύσεις</th>
                <th scope="col" style={{ ...th, textAlign: 'right' }}>Καθαρά βραχυχρόνιας</th>
                <th scope="col" style={{ ...th, textAlign: 'right' }}>Έναντι μακροχρόνιας</th>
              </tr>
            </thead>
            <tbody>
              {curve.map(row => {
                const ahead = row.net >= r.long.net;
                return (
                  <tr key={row.pct} style={{ background: ahead ? 'var(--accent-soft)' : 'transparent' }}>
                    <td style={{ ...td, fontFamily: T.font.num, fontVariantNumeric: 'tabular-nums',
                      fontWeight: ahead ? 650 : 400, color: ahead ? 'var(--text-primary)' : 'var(--text-secondary)' }}>{fp(row.pct)}</td>
                    <td style={numTd}>{fn(row.nights)}</td>
                    <td style={{ ...numTd, fontWeight: ahead ? 650 : 400,
                      color: ahead ? 'var(--text-primary)' : 'var(--text-secondary)' }}>{feAuto(row.net)}</td>
                    <td style={numTd}>{feSigned(row.net - r.long.net)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <ToolActions path={PATH} spec={SPEC} values={v}/>

      {/* ── Τι ΔΕΝ περιλαμβάνει ──────────────────────────────────────────── */}
      <div className="po-tool-note" style={{
        marginTop: 22, padding: 'clamp(14px,2.6vw,18px)', borderRadius: T.radius.inner,
        background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)',
      }}>
        <p style={{ margin: 0, fontSize: 13, lineHeight: 1.7, color: 'var(--text-secondary)' }}>
          <strong style={{ color: 'var(--text-primary)' }}>Τι δεν περιλαμβάνει.</strong>{' '}
          Θεωρεί <strong>φυσικό πρόσωπο με έως δύο ακίνητα</strong>, που δεν παρέχει υπηρεσίες
          πέρα από τα κλινοσκεπάσματα: γι’ αυτό ισχύει η τεκμαρτή έκπτωση 5% και το τέλος
          παρεπιδημούντων είναι μηδέν. Με <strong>τρία ακίνητα και πάνω</strong> η δραστηριότητα
          γίνεται επιχειρηματική, οπότε αλλάζει η κλίμακα, χάνεται η έκπτωση 5%, και προστίθενται
          τέλος παρεπιδημούντων 0,5%, ΦΠΑ 13% και βιβλία κατά τα ΕΛΠ. Οι συντελεστές του τέλους ανθεκτικότητας είναι οι{' '}
          <strong>ενδεικτικοί του 2025</strong>: τα ακριβή ποσά και οι μήνες ορίζονται από την ΑΑΔΕ.
          Δεν περιλαμβάνει ΕΝΦΙΑ, ασφάλιση, έπιπλα και εξοπλισμό, κενά διαστήματα λόγω ανακαίνισης,
          ούτε τον χρόνο που θα δώσεις εσύ στη διαχείριση. Είναι{' '}
          <strong>εκτίμηση</strong> για να ξέρεις την τάξη μεγέθους, όχι φορολογική συμβουλή.
        </p>
      </div>

      {/* ═══ Ο ΚΑΝΟΝΑΣ ΠΟΥ ΑΚΥΡΩΝΕΙ ΟΛΟΚΛΗΡΗ ΤΗ ΣΥΓΚΡΙΣΗ ═══════════════════════
          Ο υπολογισμός μπορεί να βγάζει τη βραχυχρόνια μπροστά κατά τρεις
          χιλιάδες ευρώ και να μην έχει καμία σημασία: αν το ακίνητο είναι σε
          περιοχή όπου δεν δίνεται νέος ΑΜΑ, η επιλογή δεν υπάρχει. Κανένα
          εργαλείο της αγοράς δεν το λέει αυτό δίπλα στο νούμερο, και είναι το
          πρώτο που πρέπει να ελέγξει ο ιδιοκτήτης.

          ΤΟ ΚΕΙΜΕΝΟ ΔΕΝ ΞΑΝΑΓΡΑΦΕΤΑΙ ΕΔΩ. Έρχεται από τον ίδιο πίνακα κανόνων
          που διαβάζει η Συμβουλευτική και ο βοηθός μέσα στην εφαρμογή, με τη
          νομική βάση και την πηγή του: αλλιώς η δημόσια σελίδα και η εφαρμογή
          θα έλεγαν διαφορετικά πράγματα για τον ίδιο νόμο. */}
      {AMA_RULE && (
        <div style={{
          marginTop: 20, padding: 'clamp(14px,2.6vw,18px)', borderRadius: T.radius.inner,
          background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)',
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
            color: 'var(--text-tertiary)', marginBottom: 7 }}>
            Πριν αποφασίσεις
          </div>
          <p style={{ margin: 0, fontSize: 13, lineHeight: 1.7, color: 'var(--text-secondary)' }}>
            <strong style={{ color: 'var(--text-primary)' }}>{AMA_RULE.title}</strong>{' '}
            {AMA_RULE.summary}
          </p>
          <p style={{ margin: '8px 0 0', fontSize: 12, color: 'var(--text-tertiary)' }}>
            {AMA_RULE.legalBasis} · ισχύς {AMA_RULE.effective}
            {AMA_RULE.sourceHref && <>{' · '}
              <a href={AMA_RULE.sourceHref} target="_blank" rel="noopener noreferrer"
                style={{ color: 'var(--accent)' }}>{AMA_RULE.sourceLabel}</a>
            </>}
          </p>
        </div>
      )}

      <ToolPaperFoot path={PATH} spec={SPEC} values={v}/>

      <ToolCta
        title="Η απόφαση παίρνεται μία φορά, η διαχείριση κάθε μέρα."
        body="Το PROPERWISE καταγράφει κρατήσεις, ενοίκια και δαπάνες στο ίδιο σημείο, υπολογίζει το τέλος ανθεκτικότητας ανά διανυκτέρευση και προετοιμάζει τη δήλωση με τα πραγματικά σου δεδομένα."
      />
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
const numTd: React.CSSProperties = {
  ...td, textAlign: 'right', fontFamily: T.font.num, fontVariantNumeric: 'tabular-nums',
};

function Line({ k, a, b, strong }: { k: string; a: number; b: number; strong?: boolean }) {
  const weight = strong ? 700 : 400;
  const ink = strong ? 'var(--text-primary)' : 'var(--text-secondary)';
  return (
    <tr>
      <td style={{ ...td, fontWeight: strong ? 650 : 400, color: ink }}>{k}</td>
      <td style={{ ...numTd, fontWeight: weight, color: ink }}>{feAuto(a)}</td>
      <td style={{ ...numTd, fontWeight: weight, color: ink }}>{feAuto(b)}</td>
    </tr>
  );
}

/**
 * Τα δύο καθαρά ποσά, ΙΣΟΜΕΓΕΘΗ.
 *
 * Ο υπολογιστής φόρου ενοικίων δίνει έμφαση στο ένα από τα δύο νούμερά του,
 * γιατί εκεί το ένα είναι η απάντηση και το άλλο το κόστος της. Εδώ τα δύο
 * ποσά είναι οι δύο υποψήφιες απαντήσεις: διαφορετικό μέγεθος θα ήταν υπόδειξη
 * πριν καν διαβάσει ο επισκέπτης τα ποσά.
 */
function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
        color: 'var(--text-tertiary)', marginBottom: 7 }}>{label}</div>
      <div style={{
        fontFamily: T.font.num, fontSize: 'clamp(24px, 4.4vw, 32px)', fontWeight: 680,
        letterSpacing: '-0.03em', fontVariantNumeric: 'tabular-nums', lineHeight: 1.1,
        color: 'var(--text-primary)',
      }}>{value}</div>
    </div>
  );
}

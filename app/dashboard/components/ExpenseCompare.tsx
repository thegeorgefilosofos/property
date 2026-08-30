'use client';

// ═══════════════════════════════════════════════════════════════════════════
// ΤΙ ΑΛΛΑΞΕ ΑΠΟ ΤΟΝ ΠΡΟΗΓΟΥΜΕΝΟ ΜΗΝΑ — Η ΟΘΟΝΗ.
//
// Η μηχανή (lib/expenses/compare.ts) ξέρει ήδη να λέει την αλήθεια: σημειώνει τον
// ημιτελή μήνα, αρνείται να βγάλει ποσοστό πάνω στο μηδέν και ξεχωρίζει την
// έκτακτη δαπάνη από την υπέρβαση. Εδώ δεν υπολογίζεται ΤΙΠΟΤΑ ξανά — ό,τι
// δείχνει αυτή η οθόνη το είπε η μηχανή. Αν εκείνη δεν έχει κάτι να πει
// (`meaningful === false`), η κάρτα δεν εμφανίζεται· δεν εφευρίσκουμε νούμερα.
//
// ΓΙΑΤΙ ΔΕΝ ΕΧΕΙ ΧΡΩΜΑ Η ΔΙΑΦΟΡΑ: η μηχανή δεν κρίνει. Το «ξόδεψες 25 € πάνω»
// δεν είναι κακό — μπορεί να άλλαξε ο θερμοσίφωνας. Κόκκινο και πράσινο θα
// έβαζαν κρίση εκεί που υπάρχει μόνο μέτρηση. Η κατεύθυνση φαίνεται από τη θέση
// της ράβδου γύρω από τον άξονα και από το πρόσημο, όχι από χρώμα.
// ═══════════════════════════════════════════════════════════════════════════

import { Fragment, useMemo, useState } from 'react';
import { T, TT, Card, fe, fn } from '@/components/Theme';
import { fpSigned } from '@/lib/core/format';
import MonthBars from '@/components/MonthBars';
import {
  compareMonth, history, lastCompleteMonth, monthPhrase,
  type Basis, type Comparison, type MonthPoint, type Spend,
} from '@/lib/expenses/compare';

interface Props {
  spends: readonly Spend[];
  /** Περνιέται ως όρισμα, δεν διαβάζεται από το ρολόι — ίδιος κανόνας με τη μηχανή. */
  today?: Date;
}

// ── Ποσά ───────────────────────────────────────────────────────────────────
// Τα λεπτά μία απόχρωση πιο σβηστά από τα ευρώ: το μάτι διαβάζει πρώτα το ποσό
// που μετράει. Το `currentColor` κρατά τη σχέση σωστή σε κάθε συμφραζόμενο,
// φωτεινό ή σκοτεινό θέμα.
//
// ΚΑΙ ΔΕΝ ΕΦΑΡΜΟΖΕΤΑΙ ΠΑΝΩ ΣΕ Ο,ΤΙ ΕΙΝΑΙ ΗΔΗ ΤΟ ΠΙΟ ΣΒΗΣΤΟ. Μετρημένο στον
// περιηγητή, στο ίδιο στιγμιότυπο: πάνω σε `--text-primary` τα λεπτά βγάζουν
// αντίθεση 4,63 προς 1 και περνούν· πάνω σε `--text-tertiary`, στα ένδεκα
// εικονοστοιχεία της γραμμής «μέσος όρος», βγάζουν 3,44 προς 1 και κόβονται
// από το όριο του 4,50. Μια τρίτη βαθμίδα κάτω από την τρίτη δεν υπάρχει: εκεί
// το σβήσιμο απλώς σβήνει. Το `dim` λέει πού έχει νόημα η διάκριση.
const CENTS_DIM = 'color-mix(in srgb, currentColor 52%, transparent)';

function Eur({ value, sign = false, dim = true }: { value: number; sign?: boolean; dim?: boolean }) {
  const abs = Math.abs(value);
  // Τα λεπτά γράφονται πιο σβηστά από τα ευρώ — τυπογραφική επιλογή, όχι δεύτερη
  // μορφοποίηση: ο αριθμός παράγεται από τον κοινό `fn` και μετά χωρίζεται.
  const [int, dec] = fn(abs, 2).split(',');
  const pre = sign ? (value > 0 ? '+' : value < 0 ? '−' : '') : '';
  return (
    <span style={{ fontFamily: T.font.num, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.01em', whiteSpace: 'nowrap' }}>
      {pre}{int}<span style={dim ? { color: CENTS_DIM } : undefined}>,{dec}</span>{'\u00A0€'}
    </span>
  );
}

// ── Η εναλλαγή βάσης ───────────────────────────────────────────────────────
// Δύο επιλογές, όχι πέντε. Η βάση που δεν έχει δεδομένα μένει απενεργοποιημένη
// και το λέει στο tooltip: καλύτερα από μια καρτέλα που ανοίγει και είναι άδεια.
//
// ═══ ΤΑ ΠΛΗΚΤΡΑ ΟΝΟΜΑΖΟΥΝ ΤΟΝ ΜΗΝΑ, ΚΑΙ ΕΤΣΙ Η ΣΕΙΡΑ ΛΕΓΕΤΑΙ ΜΙΑ ΦΟΡΑ ══════
// Ελεγαν «Προηγούμενος μήνας» και «Ίδιος μήνας πέρσι», δηλαδή ΤΟ ΙΔΙΟ ΓΕΓΟΝΟΣ
// με την επικεφαλίδα δίπλα τους: «Τον Αύγουστο σε σχέση με τον Ιούλιο» και,
// δώδεκα εικονοστοιχεία δεξιά, «Προηγούμενος μήνας». Ο χρήστης διάβαζε δύο
// φορές ποια είναι η βάση πριν φτάσει στο νούμερο. Στη δεύτερη κατάσταση ήταν
// χειρότερο: «σε σχέση με τον Αύγουστο 2025» δίπλα σε «Ίδιος μήνας πέρσι».
//
// Τώρα η επικεφαλίδα τελειώνει στο «ΣΕ ΣΧΕΣΗ ΜΕ» και τα πλήκτρα τη συμπληρώνουν.
// Ολη η σειρά διαβάζεται ως μία πρόταση, αριστερά προς τα δεξιά· το όνομα
// του μήνα βάσης γράφεται εκεί ακριβώς που ο χρήστης τον αλλάζει.
//
// ΤΟ ΥΨΟΣ ΕΡΧΕΤΑΙ ΑΠΟ ΤΗΝ ΚΟΙΝΗ ΚΛΙΜΑΚΑ. Ηταν `padding: 5px 12px`, δηλαδή
// μετρημένα 23 εικονοστοιχεία: μισός στόχος αφής. Το `T.h.sm` είναι 32 με
// ποντίκι και 44 με δάχτυλο, από το ίδιο σημείο που το ξέρει κάθε άλλο
// χειριστήριο της εφαρμογής.
function BasisSwitch({ value, onChange, enabled, labels }: {
  value: Basis; onChange: (b: Basis) => void;
  enabled: Record<Basis, boolean>; labels: Record<Basis, string>;
}) {
  const opts: Basis[] = ['previous_month', 'same_month_last_year'];
  return (
    <div style={{ display: 'inline-flex', gap: 2, background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: T.radius.pill, padding: 3 }}>
      {opts.map(id => {
        const on = value === id;
        const can = enabled[id];
        return (
          <button key={id} type="button" disabled={!can} aria-pressed={on}
            onClick={() => can && onChange(id)}
            aria-label={`Σύγκριση με ${labels[id]}`}
            title={can ? undefined : 'Δεν υπάρχουν καταχωρημένες δαπάνες σε αυτή την περίοδο.'}
            style={{
              minHeight: T.h.sm, padding: '0 14px', borderRadius: T.radius.pill, border: 'none',
              cursor: can ? 'pointer' : 'not-allowed', opacity: can ? 1 : 0.45,
              fontSize: 12, fontWeight: on ? 700 : 500, fontFamily: T.font.sans,
              background: on ? 'var(--accent)' : 'transparent',
              color: on ? 'var(--accent-text)' : 'var(--text-secondary)',
              transition: 'background 0.15s, color 0.15s', whiteSpace: 'nowrap',
            }}>
            {labels[id]}
          </button>
        );
      })}
    </div>
  );
}

// ── Πού πήγε η διαφορά ─────────────────────────────────────────────────────
// Άξονας στη μέση: δεξιά ό,τι ανέβηκε, αριστερά ό,τι έπεσε. Καμία χρωματική
// κρίση — η θέση και το πρόσημο λένε την κατεύθυνση.
//
// ═══ ΕΝΑ ΠΛΕΓΜΑ ΓΙΑ ΟΛΕΣ ΤΙΣ ΣΕΙΡΕΣ, ΟΧΙ ΕΝΑ ΑΝΑ ΣΕΙΡΑ ═════════════════════
// Κάθε οδηγός ήταν ΔΙΚΟ ΤΟΥ πλέγμα μέσα σε στήλη flex, με τρίτη στήλη `auto`.
// Το `auto` υπολογίζεται μέσα στο πλέγμα που το ορίζει, οπότε τρεις σειρές
// έβγαζαν τρία διαφορετικά πλάτη και τρία διαφορετικά δεξιά άκρα: το «€» της
// μιας σειράς δεν έπεφτε ποτέ πάνω στο «€» της επόμενης. Το `tabular-nums` του
// `Eur` υπάρχει ακριβώς για αυτή την κάθετη στοίχιση και ακυρωνόταν από τη
// δομή που το περιέβαλλε.
//
// ΚΑΙ ΤΟ ΣΗΜΑ ΕΦΥΓΕ ΑΠΟ ΤΟ ΚΕΛΙ ΤΟΥ ΠΟΣΟΥ. Το «σταμάτησε» πιάνει περίπου
// πενήντα οκτώ εικονοστοιχεία, το «νέο» είκοσι τέσσερα: όσο κάθονταν δίπλα
// στον αριθμό μέσα στο ίδιο κελί, το ποσό μετακινούνταν κατά τη διαφορά τους.
// Δική του στήλη, που υπάρχει μόνο όταν κάποιος οδηγός έχει κάτι να πει: αλλιώς
// θα άφηνε κενό διάστημα δεξιά από κάθε ποσό.
function Drivers({ c }: { c: Comparison }) {
  const max = Math.max(...c.drivers.map(d => Math.abs(d.diff)), 1);
  const anyFlag = c.drivers.some(d => d.isNew || d.vanished);
  const flag: React.CSSProperties = { fontSize: 11, color: 'var(--text-tertiary)', fontFamily: T.font.sans, fontWeight: 400, whiteSpace: 'nowrap' };
  return (
    <div style={{
      display: 'grid', alignItems: 'center', columnGap: 12, rowGap: 10,
      gridTemplateColumns: `minmax(84px, 128px) minmax(60px, 1fr) auto${anyFlag ? ' auto' : ''}`,
    }}>
      {c.drivers.map(d => {
        const ratio = Math.min(Math.abs(d.diff) / max, 1);
        const up = d.diff > 0;
        return (
          <Fragment key={d.slug}>
            <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontFamily: T.font.sans, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {d.label}
            </span>
            <span style={{ position: 'relative', display: 'block', height: 8 }}>
              <span aria-hidden style={{ position: 'absolute', left: '50%', top: -2, width: 1, height: 12, background: 'var(--border-default)' }} />
              <span style={{
                position: 'absolute', top: 0, height: 8, borderRadius: 2,
                width: `${ratio * 50}%`,
                left: up ? '50%' : `${50 - ratio * 50}%`,
                background: 'color-mix(in srgb, var(--text-primary) 30%, transparent)',
              }} />
            </span>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', justifySelf: 'end' }}>
              <Eur value={d.diff} sign />
            </span>
            {anyFlag && <span style={flag}>{d.isNew ? 'νέο' : d.vanished ? 'σταμάτησε' : ''}</span>}
          </Fragment>
        );
      })}
    </div>
  );
}

// ── Το ιστορικό ────────────────────────────────────────────────────────────
// Ράβδοι με ΚΛΕΙΔΩΜΕΝΟ πλάτος και ελαστικό κενό: σε μεγάλη οθόνη οι ράβδοι δεν
// γίνονται μπλοκ, σε μικρή δεν στριμώχνονται μεταξύ τους. Η ανάγνωση του ποσού
// γίνεται σε σταθερή θέση πάνω από το γράφημα — τίποτα δεν αναπηδά στο hover.
// ΕΝΑ ΓΡΑΜΜΑ ΔΕΝ ΕΙΝΑΙ ΜΗΝΑΣ. Η σειρά έγραφε «Σ Ο Ν Δ Ι Φ Μ Α Μ Ι Ι Α»: τρία
// «Μ», δύο «Ι», δύο «Α» — δώδεκα ετικέτες από τις οποίες οι επτά δεν ξεχωρίζουν
// μεταξύ τους. Ο χρήστης δεν μπορούσε να πει σε ποιον μήνα δείχνει η ψηλή
// ράβδος. Οι συντομογραφίες των τριών γραμμάτων ζουν ήδη στο lib/core/months.
//
// Χωρούσαν πάντα: οι ράβδοι είναι δεκατέσσερα εικονοστοιχεία η καθεμιά, αλλά
// μοιράζονται ολόκληρο το πλάτος της κάρτας. Το πρόβλημα δεν ήταν ο χώρος·
// ήταν ότι η ετικέτα είχε καρφωμένο πλάτος ίσο με της ράβδου, σε ΞΕΧΩΡΙΣΤΗ
// σειρά. Ράβδος και ετικέτα είναι πλέον μία στήλη, άρα και στοιχισμένες.

// ═══ Η ΓΡΑΜΜΗ ΑΝΑΓΝΩΣΗΣ ΕΓΡΑΦΕ ΤΟΝ ΙΔΙΟ ΑΡΙΘΜΟ ΜΕ ΤΗΝ ΚΟΡΥΦΗ ΤΗΣ ΚΑΡΤΑΣ ═══════
// Χωρίς κέρσορα πάνω από ράβδο, ο «επιλεγμένος» μήνας ήταν ο ΤΡΕΧΩΝ: η κάρτα
// έγραφε «31,20 €» σε 28 εικονοστοιχεία στην κορυφή και «Αύγουστος 2026 31,20 €»
// εκατόν πενήντα πιο κάτω, με μια επικεφαλίδα «ΔΩΔΕΚΑ ΜΗΝΕΣ» ανάμεσά τους. Τρεις
// σειρές, δύο από τις οποίες έλεγαν ό,τι είχε ήδη ειπωθεί.
//
// ΜΙΑ ΣΕΙΡΑ, ΔΥΟ ΚΑΤΑΣΤΑΣΕΙΣ. Σε ηρεμία η σειρά είναι η επικεφαλίδα του
// γραφήματος· με τον κέρσορα πάνω σε ράβδο γίνεται η ανάγνωσή της. Η θέση, το
// ύψος και το δεξί άκρο δεν αλλάζουν, οπότε τίποτα δεν αναπηδά — αλλάζει μόνο
// τι λέει· το λέει μόνο όταν υπάρχει κάτι νέο να πει.
// ═══ ΤΟ ΓΡΑΦΗΜΑ ΕΦΥΓΕ ΣΕ ΚΟΙΝΟ ΣΤΟΙΧΕΙΟ ══════════════════════════════════════
// Ηταν γραμμένο ΚΑΙ εδώ ΚΑΙ στην καρτέλα των επισκεπτών, με τη δεύτερη γραφή να
// έχει χάσει τα πάντα: κανένα `aria-label`, καμία εστίαση, καμία γραμμή
// ανάγνωσης και ένα `title` που σε οθόνη αφής δεν εμφανίζεται ποτέ — δηλαδή στο
// κινητό δώδεκα ορθογώνια χωρίς ούτε έναν αριθμό. Δώδεκα μήνες με ένα ποσό ο
// καθένας είναι το ίδιο σχήμα και στις δύο οθόνες: components/MonthBars.tsx.
//
// Ο,τι είναι ΔΙΚΟ ΤΗΣ αυτής της κάρτας μένει εδώ και περνά ως ιδιότητα: ο μέσος
// όρος στο δεξί άκρο και η μεταβολή «από πέρσι» στη γραμμή ανάγνωσης.
function HistoryBars({ points, currentKey }: { points: MonthPoint[]; currentKey: string }) {
  const months = points.filter(p => p.total > 0).length;
  const avg = months > 0 ? points.reduce((s, p) => s + p.total, 0) / months : 0;
  const yoyOf = (key: string) => points.find(p => p.key === key)?.yoy ?? null;

  return (
    <MonthBars
      points={points}
      currentKey={currentKey}
      restLabel="Δώδεκα μήνες"
      format={fe}
      readout={p => {
        const yoy = yoyOf(p.key);
        return (
          <>
            <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontFamily: T.font.sans, whiteSpace: 'nowrap' }}>{p.label}</span>
            <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}><Eur value={p.total} /></span>
            {yoy !== null && Math.abs(yoy) >= 1 && (
              <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                <Eur value={yoy} sign dim={false} /> από πέρσι
              </span>
            )}
          </>
        );
      }}
      right={
        /* Ο ΜΕΣΟΣ ΟΡΟΣ ΔΕΝ ΕΙΝΑΙ ΔΩΔΕΚΑΜΗΝΟΣ, ΚΑΙ ΤΟ ΕΛΕΓΕ ΣΑΝ ΝΑ ΗΤΑΝ.
           Διαιρεί με τους μήνες που ΕΧΟΥΝ δαπάνες, όχι με τους δώδεκα — και
           σωστά: οι μήνες πριν από την πρώτη καταχώρηση δεν είναι μήνες με μηδέν
           έξοδα, είναι μήνες χωρίς στοιχεία. Κάτω όμως από την επικεφαλίδα
           «Δώδεκα μήνες», ένα σκέτο «μέσος όρος 751,00 €» διαβάζεται ως
           δωδεκάμηνος, δηλαδή δωδεκαπλάσιος από την αλήθεια: λέει σε πόσους.
           ΚΑΙ ΜΕ ΕΝΑΝ ΜΗΝΑ ΔΕΝ ΛΕΓΕΤΑΙ ΚΑΘΟΛΟΥ: ο «μέσος όρος» ΕΙΝΑΙ το ποσό
           του μήνα, δηλαδή το ίδιο νούμερο δύο φορές με το δεύτερο ντυμένο ως
           σύγκριση. Χρειάζονται δύο τιμές για να υπάρχει μέση τιμή. */
        avg > 0 && months >= 2 ? (
          <span style={{ fontSize: 11, color: 'var(--text-tertiary)', fontFamily: T.font.sans, whiteSpace: 'nowrap' }}>
            μέσος όρος <span style={{ color: 'var(--text-secondary)' }}><Eur value={avg} dim={false} /></span>
            {months < points.length && ` σε ${months === 1 ? 'έναν μήνα' : `${months} μήνες`} με δαπάνες`}
          </span>
        ) : undefined
      }
    />
  );
}

// ── Η κάρτα ────────────────────────────────────────────────────────────────
export default function ExpenseCompare({ spends, today }: Props) {
  const now = useMemo(() => today ?? new Date(), [today]);
  const [basis, setBasis] = useState<Basis>('previous_month');

  // ═══ Ο ΜΗΝΑΣ ΤΗΣ ΚΑΡΤΑΣ ΕΧΕΙ ΤΕΛΕΙΩΣΕΙ ══════════════════════════════════════
  // Η κάρτα έδειχνε τον μήνα ΠΟΥ ΤΡΕΧΕΙ και ο πυρήνας τον έκοβε στη σημερινή
  // ημέρα για να μη συγκρίνει μισό μήνα με ολόκληρο. Σωστός αριθμός, λάθος
  // ερώτηση: κανείς δεν σκέφτεται τα έξοδά του σε παράθυρα τριάντα ημερών και
  // το ίδιο παράθυρο άλλαζε κάθε μέρα. Πλέον η κάρτα απαντά για δύο ΟΛΟΚΛΗΡΟΥΣ
  // μήνες· ο μήνας που τρέχει ζει στο πλακίδιο «Δαπάνες μήνα» από πάνω.
  const currentKey = lastCompleteMonth(now);
  const prev = useMemo(() => compareMonth(spends, currentKey, { today: now, basis: 'previous_month' }), [spends, currentKey, now]);
  const year = useMemo(() => compareMonth(spends, currentKey, { today: now, basis: 'same_month_last_year' }), [spends, currentKey, now]);
  const points = useMemo(() => history(spends, now, 12), [spends, now]);

  // Αιτιατική, γιατί συνεχίζουν την επικεφαλίδα «Τον Αύγουστο σε σχέση με…».
  // Ο χρόνος μπαίνει μόνο όταν διαφέρει από τον τρέχοντα, όπως παντού αλλού.
  const basisLabels: Record<Basis, string> = {
    previous_month: `τον ${monthPhrase(prev.baseKey, Number(currentKey.slice(0, 4)))}`,
    same_month_last_year: `τον ${monthPhrase(year.baseKey, Number(currentKey.slice(0, 4)))}`,
  };

  const enabled: Record<Basis, boolean> = { previous_month: prev.meaningful, same_month_last_year: year.meaningful };
  const anyBasis = prev.meaningful || year.meaningful;
  // Η προεπιλογή πέφτει στη βάση που ΕΧΕΙ δεδομένα, χωρίς να το ζητήσει ο χρήστης.
  const active: Basis = enabled[basis] ? basis : (prev.meaningful ? 'previous_month' : 'same_month_last_year');
  const c = active === 'previous_month' ? prev : year;
  const hasHistory = points.some(p => p.total > 0);

  // Καμία μέτρηση, καμία κάρτα. Ο ιδιοκτήτης δεν χρειάζεται ένα πλαίσιο που του
  // λέει ότι δεν ξέρουμε τίποτα — η κενή κατάσταση των Δαπανών το λέει ήδη.
  if (!anyBasis && !hasHistory) return null;

  return (
    <Card pad="lg" style={{ marginBottom: 16 }}>
      {anyBasis && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
            <span style={TT.label}>Τον {monthPhrase(currentKey)} σε σχέση με</span>
            <BasisSwitch value={active} onChange={setBasis} enabled={enabled} labels={basisLabels} />
          </div>

          {/* ═══ Η ΚΑΡΤΑ ΤΗΣ ΣΥΓΚΡΙΣΗΣ ΟΔΗΓΟΥΣΕ ΜΕ ΝΟΥΜΕΡΟ ΠΟΥ ΔΕΝ ΕΙΝΑΙ ΣΥΓΚΡΙΣΗ
              Στα 28 εικονοστοιχεία, δηλαδή στο μεγαλύτερο νούμερο της κάρτας,
              καθόταν το ΣΥΝΟΛΟ του μήνα. Δύο πράγματα ταυτόχρονα λάθος:

              ΠΡΩΤΟ, δεν απαντά στην ερώτηση του τίτλου. Ο τίτλος ρωτά «τον
              Αύγουστο σε σχέση με τον Ιούλιο» και η απάντηση σε αυτό είναι η
              ΔΙΑΦΟΡΑ. Το σύνολο του Αυγούστου είναι η απάντηση σε άλλη ερώτηση.

              ΔΕΥΤΕΡΟ, ήταν ήδη γραμμένο δύο φορές πιο κάτω, στην ΙΔΙΑ οθόνη:
              μετρημένο στον πάγκο, «273,00 €» στα 28 εδώ, «273,00 €» στα 24 στο
              πλακίδιο «Μηνιαίες δαπάνες» τετρακόσια εξήντα εικονοστοιχεία πιο
              κάτω, «273,00 €» στα 13 στην κεφαλίδα «ΑΥΓΟΥΣΤΟΣ 2026» της λίστας.
              Τρεις φορές το ίδιο ποσό, σε τρία μεγέθη, σε μία οθόνη.

              Μένει η διαφορά, μόνη της, στο μέγεθος που της αξίζει. Το σύνολο το
              λέει το πλακίδιο που υπάρχει ακριβώς γι' αυτό. */}
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap', marginBottom: 10 }}>
            <span style={{ fontSize: 28, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.02em', lineHeight: 1.1 }}>
              <Eur value={c.diff} sign />
            </span>
            {/* Ποσοστό ΜΟΝΟ όταν ορίζεται. Στο μηδέν δεν υπάρχει «+∞%».
                ΚΑΙ ΓΡΑΦΕΤΑΙ ΟΠΩΣ ΚΑΘΕ ΠΟΣΟΣΤΟ ΤΗΣ ΕΦΑΡΜΟΓΗΣ. Εδώ ζούσε ο
                μοναδικός χειροποίητος μορφοποιητής ποσοστού του κώδικα:
                `Math.round` σε ακέραιο και σκέτο «%», δηλαδή «−76%» δίπλα σε
                «−99,20 €». Δύο συμβάσεις αριθμού σε απόσταση οκτώ
                εικονοστοιχείων. Το `fpSigned` δίνει δύο δεκαδικά με ελληνικό
                κόμμα και τυπογραφικό μείον, όπως παντού αλλού. */}
            {c.pct !== null && Math.abs(c.pct) >= 1 && (
              <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-tertiary)', fontFamily: T.font.num, fontVariantNumeric: 'tabular-nums' }}>
                {fpSigned(c.pct)}
              </span>
            )}
          </div>

          {/* ═══ Η ΓΡΑΜΜΗ ΚΑΤΩ ΑΠΟ ΤΟΝ ΑΡΙΘΜΟ ΛΕΕΙ ΜΟΝΟ Ο,ΤΙ ΔΕΝ ΦΑΙΝΕΤΑΙ ΑΛΛΟΥ
              Εδώ αποδιδόταν η φράση της μηχανής, «Ξόδεψες 99,20 € λιγότερα από
              τον Ιούλιο», πίσω από τον φύλακα `drivers.length === 0`. Και ο
              φύλακας ήταν ακριβώς αυτό που την άδειαζε: χωρίς οδηγούς, η
              `buildSentence` δεν έχει ουρά να προσθέσει («Κυρίως από…»), οπότε
              έμενε η κεφαλή της. Ποσό, κατεύθυνση και μήνας βάσης, δηλαδή τρία
              πράγματα που κάθονται ήδη μέσα σε τριάντα εικονοστοιχεία από πάνω.

              Ο ΦΥΛΑΚΑΣ ΕΚΡΥΒΕ ΚΑΙ ΔΥΟ ΔΙΑΦΟΡΕΤΙΚΕΣ ΚΑΤΑΣΤΑΣΕΙΣ ΣΕ ΜΙΑ. Το
              «καμία κατηγορία δεν ξεχωρίζει» σημαίνει είτε «δεν άλλαξε τίποτα»
              είτε «άλλαξαν πολλά, από λίγο το καθένα»: δύο εντελώς άλλα
              μηνύματα για τον ιδιοκτήτη. Τα ξεχωρίζει το `flat` της μηχανής.

              Η πλήρης φράση ΔΕΝ σβήνεται: ζει για τη μηνιαία ειδοποίηση, που
              φτάνει χωρίς κάρτα, χωρίς ράβδους και χωρίς επικεφαλίδα. */}
          {c.drivers.length === 0 && (
            <p style={{ fontSize: 13, lineHeight: 1.55, color: 'var(--text-secondary)', fontFamily: T.font.sans, margin: '0 0 12px' }}>
              {c.flat
                ? 'Χωρίς ουσιαστική αλλαγή.'
                : 'Η διαφορά είναι μοιρασμένη: καμία κατηγορία δεν ξεχωρίζει.'}
            </p>
          )}

          {c.caveats.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginBottom: c.drivers.length > 0 ? 16 : 0 }}>
              {c.caveats.map((t, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  <span aria-hidden style={{ width: 4, height: 4, borderRadius: '50%', background: 'var(--text-tertiary)', flexShrink: 0, marginTop: 7 }} />
                  <span style={{ fontSize: 12, lineHeight: 1.5, color: 'var(--text-tertiary)', fontFamily: T.font.sans }}>{t}</span>
                </div>
              ))}
            </div>
          )}

          {c.drivers.length > 0 && (
            <div style={{ marginTop: 14 }}>
              <div style={{ ...TT.label, marginBottom: 10 }}>Πού πήγε η διαφορά</div>
              <Drivers c={c} />
            </div>
          )}
        </>
      )}

      {anyBasis && hasHistory && (
        <div style={{ height: 1, background: 'var(--border-subtle)', margin: '20px 0' }} />
      )}

      {hasHistory && <HistoryBars points={points} currentKey={currentKey} />}
    </Card>
  );
}

'use client';

// ═══════════════════════════════════════════════════════════════════════════
// ΣΧΕΔΙΟ — η οθόνη που απαντά σε ΜΙΑ ερώτηση: «τι κάνω τώρα με αυτό το ακίνητο;»
//
// ΓΙΑΤΙ ΜΙΑ ΚΑΡΤΑ ΚΑΙ ΟΧΙ ΔΕΚΑ
// Ο χρήστης που ανοίγει αυτή την καρτέλα δεν έχει να καταχωρήσει κάτι — έχει να
// αποφασίσει. Δέκα ισοδύναμες κάρτες σε άνθρωπο που δεν ξέρει από πού να πιάσει
// είναι το ίδιο με μηδέν. Γι' αυτό υπάρχει ΜΙΑ επιφάνεια με περίγραμμα σε όλη
// την οθόνη — το επόμενο βήμα — και όλα τα υπόλοιπα ζουν ως τυπογραφία πάνω στο
// φόντο της σελίδας: ετικέτα ενότητας, τίτλος, κείμενο, λεπτή γραμμή.
//
// ΒΑΘΟΣ ΑΠΟ ΦΩΤΕΙΝΟΤΗΤΑ, ΟΧΙ ΑΠΟ ΣΚΙΑ. Η μόνη κάρτα χρησιμοποιεί το `Card` του
// Theme, που δουλεύει με ανασηκωμένη επιφάνεια και φωτισμένη πάνω ακμή
// (`--surface-raised` + `--highlight-inset`). Κανένα χειρόγραφο box-shadow,
// κανένα διακοσμητικό χρώμα: το μπλε εμφανίζεται ΜΟΝΟ στην κύρια ενέργεια, ώστε
// το μάτι να ξέρει πάντα πού να πάει.
//
// ΤΙ ΚΡΑΤΑΕΙ ΑΥΤΟ ΤΟ ΑΡΧΕΙΟ ΚΑΙ ΤΙ ΟΧΙ
// Καμία γνώση. Όλο το περιεχόμενο και όλη η λογική ζουν στο `lib/property/plan`
// με tests. Εδώ μένει η παρουσίαση και η μνήμη του χρήστη (τι έχει τσεκάρει, τι
// είδος εκκρεμότητας δήλωσε, τι νούμερα έβαλε) — τοπικά, ανά χρήστη και ανά
// ακίνητο, χωρίς να απαιτείται νέος πίνακας στη βάση.
// ═══════════════════════════════════════════════════════════════════════════

import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { T, TT, Card, SecHdr, Badge, Btn, settingsField, feAuto } from '@/components/Theme';
import { feSigned } from '@/lib/core/format';
import type { PropertyStatus } from '@/lib/property/status';
import {
  planFor, groupSteps, vacancyCost, renovationLoan, saleEstimate,
  ACTOR_LABEL, EFFORT_LABEL, RISK_LABEL, FUNDING_KIND_LABEL, DISPUTE_KINDS, PLAN_DISCLAIMER,
  type Step, type Option, type DisputeKind, type VacancyCostInput,
} from '@/lib/property/plan';

// Το ελάχιστο σχήμα ακινήτου που χρειάζεται η οθόνη. Μπαίνει ως παράμετρος τύπου
// ώστε να δέχεται και αντικείμενα με ΠΕΡΙΣΣΟΤΕΡΑ πεδία (η γραμμή της βάσης έχει
// δεκάδες) χωρίς μετατροπή στον καλούντα και χωρίς να αλλάζει το συμβόλαιο.
interface PlanProperty {
  id: string;
  name: string;
  address?: string | null;
  sqm?: number | null;
  value?: number | null;
  year_built?: number | null;
  postal_code?: string | null;
  prop_type?: string | null;
}

// Υποθέσεις ΜΟΝΟ για το μέγεθος της δόσης επισκευαστικού, δηλωμένες ρητά στην
// οθόνη δίπλα στον αριθμό. Δεν είναι προσφορά τράπεζας ούτε τρέχον επιτόκιο.
const ASSUMED_RATE_PCT = 6;
const ASSUMED_YEARS = 7;

// ── Μικρά δομικά στοιχεία της οθόνης ──────────────────────────────────────

/**
 * Ετικέτα ενότητας πάνω από τυπογραφικό περιεχόμενο, χωρίς πλαίσιο.
 *
 * Το `tight` μηδενίζει το πάνω περιθώριο, για τις ενότητες που ζουν μέσα σε
 * πλέγμα με δικό του gap: αλλιώς η δεύτερη στήλη ξεκινά τριάντα δύο
 * εικονοστοιχεία πιο κάτω από την πρώτη, χωρίς λόγο.
 */
function Section({ label, sub, right, tight, children }: {
  label: string; sub?: string; right?: ReactNode; tight?: boolean; children: ReactNode;
}) {
  return (
    <section style={{ marginTop: tight ? 0 : T.sp.section }}>
      <SecHdr label={label} sub={sub} right={right} />
      {children}
    </section>
  );
}

/** Γραμμή «ετικέτα: κείμενο», για τα μικρά μεταδεδομένα κάθε βήματος. */
function Meta({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: 8, marginTop: 6, alignItems: 'baseline', flexWrap: 'wrap' }}>
      <span style={{ ...TT.label, fontSize: 9, color: 'var(--text-tertiary)', flexShrink: 0, minWidth: 98 }}>{label}</span>
      <span style={{ ...TT.caption, color: 'var(--text-secondary)', flex: 1, minWidth: 220 }}>{children}</span>
    </div>
  );
}

const Check = ({ on }: { on: boolean }) => (
  <span aria-hidden style={{
    width: 20, height: 20, borderRadius: '50%', flexShrink: 0, marginTop: 1,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: on ? 'var(--positive)' : 'transparent',
    border: on ? 'none' : '1.5px solid var(--border-default)',
  }}>
    {on && (
      <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="var(--text-inverse)" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
    )}
  </span>
);

// ── Η ΜΝΗΜΗ ΤΟΥ ΧΡΗΣΤΗ ────────────────────────────────────────────────────
//
// Τι έχει τσεκάρει, τι είδος εκκρεμότητας δήλωσε, τι νούμερα έβαλε. Τοπικά, ανά
// χρήστη και ανά ακίνητο: σε κοινό υπολογιστή τα βήματα του ενός δεν
// εμφανίζονται στον άλλον. Χωρίς τοπική αποθήκευση (ιδιωτική περιήγηση) η οθόνη
// δουλεύει κανονικά — απλώς δεν θυμάται. Δεν είναι λόγος να μη φορτώσει.

function readLocal<V>(key: string, fallback: V, valid: (v: unknown) => boolean): V {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed: unknown = JSON.parse(raw);
    return valid(parsed) ? (parsed as V) : fallback;
  } catch {
    return fallback;
  }
}

const writeLocal = (key: string, value: unknown): void => {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* δες παραπάνω */ }
};

const isStringArray = (v: unknown): boolean => Array.isArray(v) && v.every(x => typeof x === 'string');
const isObject = (v: unknown): boolean => !!v && typeof v === 'object' && !Array.isArray(v);
const isKind = (v: unknown): boolean => DISPUTE_KINDS.some(k => k.key === v);

// ── Η καρτέλα ─────────────────────────────────────────────────────────────

/**
 * Το `key` δεν είναι διακοσμητικό: όταν αλλάξει χρήστης, ακίνητο ή κατάσταση,
 * ο πίνακας ξεκινά από την αρχή και ξαναδιαβάζει τη σωστή μνήμη, αντί να
 * κρατήσει τα τσεκαρισμένα του προηγούμενου ακινήτου.
 */
export default function TabPlan<P extends PlanProperty>(props: {
  propertyId: string;
  userId: string;
  status: PropertyStatus;
  property: P;
}) {
  return <PlanScreen key={`${props.userId}:${props.propertyId}:${props.status}`} {...props} />;
}

function PlanScreen<P extends PlanProperty>({ propertyId, userId, status, property }: {
  propertyId: string;
  userId: string;
  status: PropertyStatus;
  property: P;
}) {
  const base = `pos-plan-${userId}-${propertyId}`;
  const doneKey = `${base}-done-${status}`;
  const kindKey = `${base}-kind`;
  const costKey = `${base}-cost`;

  const [done, setDone] = useState<string[]>(() => readLocal<string[]>(doneKey, [], isStringArray));
  const [kind, setKind] = useState<DisputeKind>(() => readLocal<DisputeKind>(kindKey, 'unknown', isKind));
  const [costs, setCosts] = useState<VacancyCostInput>(() => readLocal<VacancyCostInput>(costKey, {}, isObject));
  const [loanAmount, setLoanAmount] = useState<number | null>(null);

  const write = useCallback((key: string, value: unknown) => { writeLocal(key, value); }, []);

  const toggle = useCallback((id: string) => {
    setDone(prev => {
      const next = prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id];
      write(doneKey, next);
      return next;
    });
  }, [doneKey, write]);

  const pickKind = useCallback((k: DisputeKind) => {
    setKind(k);
    write(kindKey, k);
  }, [kindKey, write]);

  const setCost = useCallback((field: keyof VacancyCostInput, v: number | undefined) => {
    setCosts(prev => {
      const next = { ...prev, [field]: v };
      write(costKey, next);
      return next;
    });
  }, [costKey, write]);

  const plan = useMemo(() => planFor({
    status, done, disputeKind: kind,
    sqm: property.sqm ?? null,
    value: property.value ?? null,
    yearBuilt: property.year_built ?? null,
  }), [status, done, kind, property.sqm, property.value, property.year_built]);

  const drain = useMemo(() => vacancyCost(costs), [costs]);
  const sale = useMemo(() => saleEstimate(property.value ?? 0), [property.value]);
  // Ενδεικτική δόση επισκευαστικού: το τοκοχρεολύσιο έρχεται από το lib/loans και
  // το επιτόκιο δηλώνεται ρητά ως υπόθεση, ακριβώς κάτω από τον αριθμό.
  const loan = useMemo(() => renovationLoan(loanAmount ?? 0, ASSUMED_RATE_PCT, ASSUMED_YEARS), [loanAmount]);

  // Καρτέλα που δεν αφορά αυτή την κατάσταση δεν πρέπει να είναι ορατή (το κρίνει
  // το lib/property/visibility). Αν παρ' όλα αυτά αποδοθεί, δεν σκάει και δεν
  // επινοεί περιεχόμενο.
  if (!plan) return null;

  const checked = new Set(done);
  const isDispute = plan.status === 'disputed';

  const stepRow = (s: Step, first: boolean) => {
    const on = checked.has(s.id);
    return (
      <div key={s.id} style={{
        display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 14,
        padding: '14px 2px', borderTop: first ? 'none' : '1px solid var(--border-subtle)',
      }}>
        <button onClick={() => toggle(s.id)} aria-pressed={on}
          aria-label={on ? `Αναίρεση: ${s.title}` : `Ολοκληρώθηκε: ${s.title}`}
          style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', alignSelf: 'start', lineHeight: 0 }}>
          <Check on={on} />
        </button>
        <div style={{ minWidth: 0, opacity: on ? 0.55 : 1 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ fontFamily: T.font.sans, fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', textDecoration: on ? 'line-through' : 'none' }}>{s.title}</span>
            <span style={{ ...TT.label, fontSize: 9, color: 'var(--text-tertiary)' }}>{ACTOR_LABEL[s.who]}</span>
          </div>
          <div style={{ ...TT.bodySm, color: 'var(--text-secondary)', marginTop: 3 }}>{s.detail}</div>
          {s.when && <Meta label="Πότε">{s.when}</Meta>}
          {s.cost && <Meta label="Αν παραλειφθεί">{s.cost}</Meta>}
        </div>
      </div>
    );
  };

  const optionRow = (o: Option, first: boolean) => (
    <div key={o.id} style={{ padding: '16px 2px', borderTop: first ? 'none' : '1px solid var(--border-subtle)' }}>
      <div style={{ fontFamily: T.font.sans, fontSize: 15, fontWeight: 700, letterSpacing: '-0.01em', color: 'var(--text-primary)' }}>{o.title}</div>
      <div style={{ ...TT.bodySm, color: 'var(--text-secondary)', marginTop: 4 }}>{o.payoff}</div>
      {/* ── Η ΣΥΓΚΡΙΣΗ ΠΟΥ ΔΕΝ ΜΠΟΡΟΥΣΕ ΝΑ ΓΙΝΕΙ ────────────────────────────
          Οι τρεις άξονες ήταν πλέγμα τριών στηλών ύψους σαράντα εικονοστοιχείων,
          με την ετικέτα πάνω και την τιμή από κάτω. Σε επτά επιλογές, η μία κάτω
          από την άλλη, το «Ρίσκο» της τρίτης απείχε πάνω από τετρακόσια
          εικονοστοιχεία από το «Ρίσκο» της δεύτερης. Δηλαδή μια οθόνη σύγκρισης
          όπου η σύγκριση απαιτούσε να θυμάσαι τρεις λέξεις ενώ κυλάς.

          Τώρα οι τρεις άξονες είναι ΜΙΑ γραμμή, στην ίδια θέση σε κάθε επιλογή,
          αμέσως κάτω από το όφελος. Το ίδιο σχήμα με τη γραμμή γεγονότων της
          κατάταξης τιμολογίων ρεύματος: μία γλώσσα για «τα μικρά στοιχεία που
          στοιχίζονται κατακόρυφα», σε όλη την εφαρμογή. */}
      <div style={{
        display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: '4px 14px',
        margin: '10px 0 2px', fontFamily: T.font.sans, fontSize: 12, color: 'var(--text-primary)',
      }}>
        {[
          { k: 'Κόπος', v: EFFORT_LABEL[o.effort] },
          { k: 'Ρίσκο', v: RISK_LABEL[o.risk] },
          { k: 'Χρόνος', v: o.speed },
        ].map(x => (
          <span key={x.k} style={{ display: 'inline-flex', alignItems: 'baseline', gap: 6 }}>
            <span style={{ ...TT.label, fontSize: 9, color: 'var(--text-tertiary)' }}>{x.k}</span>
            <span style={{ fontWeight: 600 }}>{x.v}</span>
          </span>
        ))}
      </div>
      <Meta label="Ταιριάζει αν">{o.fits}</Meta>
      <Meta label="Τι πληρώνεις">{o.cost}</Meta>
    </div>
  );

  const numField = (label: string, field: keyof VacancyCostInput, hint: string) => (
    <label style={{ display: 'block' }}>
      <span style={{ ...TT.label, fontSize: 9, color: 'var(--text-tertiary)' }}>{label}</span>
      {/* ΤΟ placeholder ΗΤΑΝ «0» ΚΑΙ ΤΑ ΤΕΣΣΕΡΑ ΠΕΔΙΑ ΔΙΑΒΑΖΟΝΤΑΝ ΩΣ ΜΗΔΕΝΙΚΑ.
          Ακριβώς το ίδιο σφάλμα είχε ήδη βρεθεί και διορθωθεί στο ιστορικό
          κατανάλωσης του ρεύματος: κενή φόρμα που δηλώνει «ΕΝΦΙΑ μηδέν,
          κοινόχρηστα μηδέν» δεν είναι κενή, είναι λάθος απάντηση. Το άγνωστο δεν
          γράφεται μηδέν — και η υπόδειξη από κάτω λέει ήδη τι μπαίνει εδώ. */}
      <input type="number" min={0} inputMode="decimal" className="po-field" placeholder=""
        value={costs[field] ?? ''}
        onChange={e => setCost(field, e.target.value === '' ? undefined : Number(e.target.value))}
        style={{ ...settingsField, height: T.h.md, fontSize: 13, marginTop: 5 }} />
      <span style={{ ...TT.caption, color: 'var(--text-tertiary)', display: 'block', marginTop: 4 }}>{hint}</span>
    </label>
  );

  return (
    <div style={{ fontFamily: T.font.sans, maxWidth: 900 }}>
      {/* ── Η ΚΕΦΑΛΙΔΑ: κατάσταση, μία πρόταση, μία εισαγωγή ─────────────── */}
      <div style={{ ...TT.label, color: 'var(--text-tertiary)', marginBottom: 8 }}>
        {plan.label} · {property.name}
      </div>
      <h1 style={{ ...TT.display, margin: 0 }}>{plan.headline}</h1>
      <p style={{ ...TT.body, color: 'var(--text-secondary)', margin: '10px 0 0' }}>{plan.lede}</p>

      {/* ── Η ΠΡΟΟΔΟΣ ΥΠΗΡΧΕ ΩΣ ΑΡΙΘΜΟΣ ΚΑΙ ΔΕΝ ΤΗΝ ΕΒΛΕΠΕ ΚΑΝΕΙΣ ──────────
          Το `plan.progress.pct` υπολογιζόταν στο `lib/property/plan` και δεν το
          διάβαζε ΚΑΜΙΑ γραμμή της εφαρμογής· το μόνο ίχνος προόδου ήταν μια
          λεζάντα δέκα εικονοστοιχείων μέσα στην κάρτα, δεξιά, εκεί που δεν
          κοιτά κανείς. Σε οθόνη που υπάρχει για να τελειώσει μια σειρά, το «πού
          είμαι» είναι δομή, όχι υποσημείωση.

          ΧΩΡΙΣ ΧΡΩΜΑ ΕΠΙΤΕΥΓΜΑΤΟΣ. Η μπάρα γεμίζει με το χρώμα του κειμένου
          πάνω στη γραμμή του περιγράμματος: η πρόοδος είναι μέτρηση, δεν είναι
          «καλά νέα». Το μπλε μένει αποκλειστικά στην κύρια ενέργεια. */}
      <div style={{ marginTop: T.sp.xl, maxWidth: 380 }}>
        <div style={{ height: 3, borderRadius: 2, background: 'var(--border-subtle)', overflow: 'hidden' }}>
          <div style={{
            width: `${plan.progress.pct}%`, height: '100%',
            background: 'var(--text-primary)', transition: `width .3s ${T.ease.standard}`,
          }} />
        </div>
        <div style={{ ...TT.caption, color: 'var(--text-tertiary)', marginTop: 8, fontVariantNumeric: 'tabular-nums' }}>
          {plan.progress.done} από {plan.progress.total} βήματα ολοκληρωμένα
        </div>
      </div>

      {/* ── ΤΙ ΕΙΔΟΥΣ ΕΚΚΡΕΜΟΤΗΤΑ: αλλάζει ΟΛΗ τη σειρά, άρα ρωτιέται πρώτο ── */}
      {isDispute && (
        <div style={{ marginTop: T.sp.xxl }}>
          <div style={{ ...TT.label, color: 'var(--text-secondary)', marginBottom: 10 }}>Τι είδους εκκρεμότητα είναι</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {DISPUTE_KINDS.map(k => {
              const on = k.key === kind;
              return (
                <button key={k.key} onClick={() => pickKind(k.key)} aria-pressed={on} title={k.hint}
                  style={{
                    appearance: 'none', cursor: 'pointer', height: T.h.md, padding: '0 16px',
                    borderRadius: T.radius.pill, fontFamily: T.font.sans, fontSize: 13,
                    fontWeight: on ? 700 : 500,
                    background: on ? 'var(--bg-surface)' : 'transparent',
                    border: `1px solid ${on ? 'var(--border-default)' : 'var(--border-subtle)'}`,
                    color: on ? 'var(--text-primary)' : 'var(--text-secondary)',
                    boxShadow: on ? 'var(--highlight-inset), var(--elev-1)' : 'none',
                    transition: 'background .15s, color .15s',
                  }}>
                  {k.label}
                </button>
              );
            })}
          </div>
          <div style={{ ...TT.caption, color: 'var(--text-tertiary)', marginTop: 8 }}>
            {DISPUTE_KINDS.find(k => k.key === kind)?.hint}
          </div>
        </div>
      )}

      {/* ── ΤΟ ΕΝΑ ΕΠΟΜΕΝΟ ΒΗΜΑ: η μόνη επιφάνεια με περίγραμμα στην οθόνη ── */}
      <Card pad="lg" style={{ marginTop: T.sp.xxl, marginBottom: 0 }}>
        {/* Η μέτρηση προόδου έφυγε από εδώ: λέγεται πλέον μία φορά, στην
            κεφαλίδα, όπου και φαίνεται. */}
        <div style={{ ...TT.label, color: 'var(--text-secondary)' }}>Το επόμενο βήμα</div>

        {plan.next ? (
          <>
            <div style={{ ...TT.h1, marginTop: 10 }}>{plan.next.title}</div>
            <div style={{ ...TT.body, color: 'var(--text-secondary)', marginTop: 8 }}>{plan.next.detail}</div>
            {plan.next.when && <Meta label="Πότε">{plan.next.when}</Meta>}
            {plan.next.cost && <Meta label="Αν παραλειφθεί">{plan.next.cost}</Meta>}
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: T.sp.xl, flexWrap: 'wrap' }}>
              <Btn variant="primary" onClick={() => { if (plan.next) toggle(plan.next.id); }}>Έγινε</Btn>
              <span style={{ ...TT.caption, color: 'var(--text-tertiary)' }}>{ACTOR_LABEL[plan.next.who]}</span>
            </div>
          </>
        ) : (
          <>
            <div style={{ ...TT.h1, marginTop: 10 }}>Δεν μένει κάτι ανοιχτό.</div>
            <div style={{ ...TT.body, color: 'var(--text-secondary)', marginTop: 8 }}>
              Πέρασες όλη τη σειρά. Αν άλλαξε κάτι στο ακίνητο, άλλαξε και την κατάστασή του: αυτή η καρτέλα
              υπάρχει για όσο διαρκεί η μεταβατική περίοδος, όχι για πάντα.
            </div>
          </>
        )}
      </Card>

      {/* ── ΤΟ ΝΟΥΜΕΡΟ ΤΟΥ ΚΕΝΟΥ: χωρίς αυτό, οι επιλογές μοιάζουν ίδιες ─── */}
      {plan.status === 'vacant' && (
        <Section label="Τι κοστίζει ο μήνας που περνάει"
          sub="Μόνο όσα φεύγουν από τον λογαριασμό σου. Το ενοίκιο που δεν εισπράττεις είναι άλλη συζήτηση.">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 170px), 1fr))', gap: 14 }}>
            {numField('ΕΝΦΙΑ (έτος)', 'enfiaYear', 'Από το εκκαθαριστικό')}
            {numField('Κοινόχρηστα (μήνας)', 'commonMonthly', 'Ό,τι πληρώνεις κλειστό')}
            {numField('Πάγια ρεύμα/νερό (μήνας)', 'utilitiesMonthly', 'Χωρίς κατανάλωση')}
            {numField('Ασφάλιστρο (έτος)', 'insuranceYear', 'Αν υπάρχει')}
          </div>
          {drain.monthly > 0 && (
            <div style={{ marginTop: T.sp.xl, paddingTop: T.sp.lg, borderTop: '1px solid var(--border-subtle)' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
                <span style={{ ...TT.kpi }}>{feAuto(drain.monthly)}</span>
                <span style={{ ...TT.bodySm, color: 'var(--text-secondary)' }}>
                  κάθε μήνα που μένει κενό · {feAuto(drain.yearly)} τον χρόνο
                </span>
              </div>
              <div style={{ ...TT.caption, color: 'var(--text-tertiary)', marginTop: 8 }}>
                {drain.parts.map(p => `${p.label} ${feAuto(p.monthly)}`).join(' · ')}
              </div>
            </div>
          )}
        </Section>
      )}

      {/* ── Η ΣΕΙΡΑ ──────────────────────────────────────────────────────── */}
      <Section
        label="Η σειρά"
        sub={isDispute
          ? 'Δεν είναι λίστα. Είναι ακολουθία, και η αντιστροφή δύο βημάτων κοστίζει χρήματα.'
          : 'Από πάνω προς κάτω. Ό,τι είναι πιο πάνω, εμποδίζει ό,τι είναι πιο κάτω.'}>
        {groupSteps(plan.steps).map((g, gi) => (
          <div key={g.group ?? `g${gi}`} style={{ marginTop: g.group && gi > 0 ? T.sp.xl : 0 }}>
            {g.group && (
              <div style={{ ...TT.label, fontSize: 9, color: 'var(--text-tertiary)', marginBottom: 4, paddingBottom: 6, borderBottom: '1px solid var(--border-subtle)' }}>
                {g.group}
              </div>
            )}
            {g.items.map((s, i) => stepRow(s, i === 0))}
          </div>
        ))}
      </Section>

      {/* ── Η ΣΥΓΚΡΙΣΗ ───────────────────────────────────────────────────── */}
      {plan.options.length > 0 && (
        <Section label={plan.optionsTitle} sub={plan.optionsSub}>
          {plan.options.map((o, i) => optionRow(o, i === 0))}
        </Section>
      )}

      {/* ── ΤΙ ΜΕΝΕΙ ΚΑΘΑΡΟ (πώληση, όταν υπάρχει καταχωρημένη αξία) ─────── */}
      {plan.status === 'for_sale' && sale && (
        <Section label="Τι μένει καθαρό"
          sub={`Ενδεικτικά, με βάση την αξία που έχεις καταχωρήσει (${feAuto(sale.price)}).`}>
          {sale.lines.map(l => (
            <div key={l.label} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '9px 2px', borderTop: '1px solid var(--border-subtle)' }}>
              <span style={{ ...TT.bodySm, color: 'var(--text-secondary)' }}>{l.label}</span>
              {/* Το λογιστικό μείον γραφόταν με το χέρι, δίπλα σε `feAuto`, ενώ το
                  `feSigned` υπάρχει στο `lib/core/format` ακριβώς γι' αυτό, με δικό
                  του test — και δεν το καλούσε ΚΑΝΕΝΑ σημείο της εφαρμογής. Μια
                  συνάρτηση που κανείς δεν χρησιμοποιεί δεν φυλάει τίποτα. */}
              <span style={{ ...TT.mono, fontSize: 13, color: 'var(--text-primary)' }}>{feSigned(-l.amount)}</span>
            </div>
          ))}
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '12px 2px 0', borderTop: '2px solid var(--border-subtle)', marginTop: 4 }}>
            <span style={{ fontFamily: T.font.sans, fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>Καθαρό έσοδο</span>
            <span style={{ ...TT.kpi, fontSize: 18 }}>{feAuto(sale.net)}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginTop: 12 }}>
            <Badge tone="warning">Προς επιβεβαίωση</Badge>
            <span style={{ ...TT.caption, color: 'var(--text-secondary)', flex: 1 }}>{sale.note}</span>
          </div>
        </Section>
      )}

      {/* ── ΠΟΙΟΣ ΜΠΟΡΕΙ ΝΑ ΠΛΗΡΩΣΕΙ ΤΙ (ανακαίνιση) ─────────────────────── */}
      {plan.funding.length > 0 && (
        <Section label="Ποιος μπορεί να πληρώσει τι"
          sub="Τα προγράμματα υπάρχουν. Οι όροι τους αλλάζουν σε κάθε κύκλο, γι' αυτό δεν γράφεται εδώ κανένα ποσοστό.">
          {plan.funding.map((f, i) => (
            <div key={f.id} style={{ padding: '16px 2px', borderTop: i === 0 ? 'none' : '1px solid var(--border-subtle)' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
                <span style={{ fontFamily: T.font.sans, fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>{f.title}</span>
                <span style={{ ...TT.label, fontSize: 9, color: 'var(--text-tertiary)' }}>{FUNDING_KIND_LABEL[f.kind]}</span>
              </div>
              <div style={{ ...TT.bodySm, color: 'var(--text-secondary)', marginTop: 4 }}>{f.what}</div>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginTop: 10 }}>
                <Badge tone="warning">Προς επιβεβαίωση</Badge>
                <span style={{ ...TT.caption, color: 'var(--text-secondary)', flex: 1 }}>{f.confirm}</span>
              </div>
              {/* ΔΥΟ ΜΠΛΕ ΣΤΗΝ ΙΔΙΑ ΟΘΟΝΗ, ΚΑΙ ΤΟ ΕΝΑ ΕΙΧΕ ΔΗΛΩΣΕΙ ΑΠΟΚΛΕΙΣΤΙΚΟΤΗΤΑ.
                  Το σχόλιο στην κορυφή αυτού του αρχείου γράφει: «το μπλε εμφανίζεται
                  ΜΟΝΟ στην κύρια ενέργεια, ώστε το μάτι να ξέρει πάντα πού να πάει».
                  Και τέσσερις γραμμές πιο κάτω, ο σύνδεσμος του προγράμματος ήταν
                  `var(--info)` — άλλο μπλε, ίδια ένταση, σε ενότητα που δεν είναι
                  ενέργεια. Ο κανόνας του αρχείου παραβιαζόταν από το ίδιο το αρχείο.
                  Εδώ γίνεται αυτό που είναι: ήσυχος σύνδεσμος κειμένου. */}
              {f.href && (
                <a href={f.href} target="_blank" rel="noopener noreferrer"
                  style={{
                    display: 'inline-block', marginTop: 10, fontFamily: T.font.sans,
                    fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)',
                    textDecoration: 'none', borderBottom: '1px solid var(--border-default)',
                  }}>
                  Επίσημη σελίδα προγράμματος
                </a>
              )}
            </div>
          ))}

          {/* Ενδεικτική δόση επισκευαστικού. Το τοκοχρεολύσιο δεν ξαναγράφεται:
              έρχεται από το lib/loans, που είναι η πηγή αλήθειας για κάθε δόση. */}
          <div style={{ marginTop: T.sp.xl, paddingTop: T.sp.lg, borderTop: '1px solid var(--border-subtle)' }}>
            <div style={{ ...TT.label, fontSize: 9, color: 'var(--text-tertiary)', marginBottom: 8 }}>Πόσο θα ήταν η δόση</div>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 18, flexWrap: 'wrap' }}>
              <label style={{ display: 'block', width: 190 }}>
                <span style={{ ...TT.caption, color: 'var(--text-tertiary)' }}>Ποσό ανακαίνισης</span>
                <input type="number" min={0} inputMode="decimal" className="po-field" placeholder="0"
                  value={loanAmount ?? ''}
                  onChange={e => setLoanAmount(e.target.value === '' ? null : Number(e.target.value))}
                  style={{ ...settingsField, height: T.h.md, fontSize: 13, marginTop: 5 }} />
              </label>
              {loan && (
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
                  <span style={{ ...TT.kpi, fontSize: 20 }}>{feAuto(loan.monthly)}</span>
                  <span style={{ ...TT.bodySm, color: 'var(--text-secondary)' }}>
                    τον μήνα για {ASSUMED_YEARS} έτη · συνολικοί τόκοι {feAuto(loan.interest)}
                  </span>
                </div>
              )}
            </div>
            <div style={{ ...TT.caption, color: 'var(--text-tertiary)', marginTop: 10 }}>
              Υπολογισμένο με υποθετικό επιτόκιο {ASSUMED_RATE_PCT}%, μόνο για να δεις το μέγεθος της δόσης.
              Τα πραγματικά επιτόκια και τα έξοδα τα συγκρίνεις στην καρτέλα Δάνεια, με τα σημερινά στοιχεία των τραπεζών.
            </div>
          </div>
        </Section>
      )}

      {/* ═══ ΑΝΑΦΟΡΑ ══════════════════════════════════════════════════════
          ΠΕΝΤΕ ΕΝΟΤΗΤΕΣ ΜΕ ΤΟ ΙΔΙΟ ΑΚΡΙΒΩΣ ΥΦΟΣ, Η ΜΙΑ ΚΑΤΩ ΑΠΟ ΤΗΝ ΑΛΛΗ.
          «Η σειρά», «Η σύγκριση», «Ποιος πληρώνει τι», «Οι κανόνες», «Προς
          επιβεβαίωση»: ίδια ετικέτα, ίδια λεπτή γραμμή, ίδιες σειρές κειμένου.
          Όταν όλα μοιάζουν εξίσου σημαντικά, τίποτα δεν είναι — και ο χρήστης
          κάνει το μόνο λογικό: κυλά μέχρι κάτω χωρίς να διαβάσει.

          Οι δύο τελευταίες ΔΕΝ ζητούν καμία ενέργεια. Είναι υλικό αναφοράς, και
          το λένε τώρα και οπτικά: μία γραμμή που δηλώνει πού τελειώνει η δουλειά
          και πού αρχίζει η γνώση, και δύο στήλες αντί για δύο ακόμη σκαλοπάτια
          κάθετης κύλισης. Τίποτα δεν κρύφτηκε — ό,τι κρύβεται δεν διαβάζεται
          ποτέ. Απλώς έπαψε να διεκδικεί την ίδια προσοχή. */}
      <div style={{ marginTop: T.sp.section, paddingTop: T.sp.xxl, borderTop: '1px solid var(--border-default)' }}>
        <div style={{ ...TT.label, color: 'var(--text-secondary)' }}>Αναφορά</div>
        <div style={{ ...TT.caption, color: 'var(--text-tertiary)', marginTop: 4, marginBottom: T.sp.xxl, maxWidth: 560 }}>
          Από εδώ και κάτω δεν υπάρχει κάτι να κάνεις. Είναι όσα καλό είναι να ξέρεις πριν αποφασίσεις.
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 330px), 1fr))', gap: T.sp.section }}>
          <Section tight label="Οι κανόνες που κοστίζουν χρήματα"
            sub="Λίγα πράγματα, και όλα τους τα έχει πληρώσει κάποιος που δεν τα ήξερε.">
            {plan.rules.map((r, i) => (
              <div key={r.id} style={{ padding: '14px 2px', borderTop: i === 0 ? 'none' : '1px solid var(--border-subtle)' }}>
                <div style={{ fontFamily: T.font.sans, fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>{r.title}</div>
                <div style={{ ...TT.bodySm, color: 'var(--text-secondary)', marginTop: 4 }}>{r.body}</div>
              </div>
            ))}
          </Section>

          <Section tight
            label="Προς επιβεβαίωση"
            sub="Ό,τι αλλάζει από χρονιά σε χρονιά δεν γράφεται εδώ ως βεβαιότητα. Γράφεται τι να ελέγξεις και πού."
            right={<Badge tone="warning">{plan.verify.length}</Badge>}>
            {plan.verify.map((v, i) => (
              <div key={v.id} style={{ padding: '14px 2px', borderTop: i === 0 ? 'none' : '1px solid var(--border-subtle)' }}>
                <div style={{ ...TT.body, color: 'var(--text-primary)' }}>{v.what}</div>
                <Meta label="Πού">{v.where}</Meta>
                <Meta label="Γιατί αλλάζει">{v.why}</Meta>
              </div>
            ))}
          </Section>
        </div>
      </div>

      <p style={{ ...TT.caption, color: 'var(--text-tertiary)', marginTop: T.sp.section, paddingTop: T.sp.lg, borderTop: '1px solid var(--border-subtle)' }}>
        {PLAN_DISCLAIMER}
      </p>
    </div>
  );
}

'use client';

// ═══════════════════════════════════════════════════════════════════════════
// «Η ΑΑΔΕ ΛΕΕΙ Χ. ΤΑ ΔΙΚΑ ΣΟΥ ΛΕΝΕ Υ.»
//
// ΤΙ ΑΝΤΙΚΑΘΙΣΤΑ ΚΑΙ ΓΙΑΤΙ
// Στη θέση αυτή καθόταν ένας χειροκίνητος υπολογιστής φόρου: ζητούσε από τον
// χρήστη να πληκτρολογήσει «Ετήσια Μισθώματα» — νούμερο που η εφαρμογή είχε ήδη
// μετρήσει δύο κάρτες πιο πάνω — και έβγαζε δικό του φόρο, διαφορετικό από τον
// φόρο της ίδιας οθόνης.
//
// Το χειρότερο όμως δεν ήταν το λάθος νούμερο: ήταν η ΘΕΣΗ. Η ΑΑΔΕ στέλνει
// πλέον το Ε2 προσυμπληρωμένο. Ένα εργαλείο που «σου συμπληρώνει το έντυπο»
// ανταγωνίζεται το myAADE στο έδαφος όπου το κράτος είναι δομικά καλύτερο, και
// χάνει λίγο περισσότερο κάθε χρόνο.
//
// Αυτή η κάρτα κάνει το αντίστροφο, και είναι το μόνο που το κράτος δεν μπορεί
// να αποκτήσει: ελέγχει το προσυμπληρωμένο του.
//
// ΤΙ ΖΗΤΑΜΕ ΑΠΟ ΤΟΝ ΧΡΗΣΤΗ: ένα νούμερο ανά ακίνητο, από το έντυπο που ήδη
// βλέπει στο myAADE. Τίποτε άλλο. Τα δικά μας τα ξέρουμε ήδη.
//
// ΤΙ ΔΕΝ ΚΑΝΟΥΜΕ: δεν λέμε ποιο νούμερο είναι σωστό. Αυτό είναι απόφαση του
// φορολογούμενου και του λογιστή του. Λέμε πού διαφέρουν και τι εξηγεί τη
// διαφορά — και όπου δεν μπορούμε να εξηγήσουμε, το λέμε.
// ═══════════════════════════════════════════════════════════════════════════

import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { T, TT, EmptyState, Btn, fe } from '@/components/Theme';
import { loadE2Rows, runE2Export } from './e2Export';
import { notify, notifyError } from '@/components/Toast';
import { reconcileE2, type DeclaredRow, type OurEvidence, type Line } from '@/lib/billing/e2Reconcile';
import { hasFeature } from '@/lib/billing/entitlements';
import type { PlanId } from '@/lib/billing/plans';
import { FeatureBtn } from './FeatureLock';
import type { E2Row } from '@/lib/billing/e2';
import { readStatus } from '@/lib/property/status';
import { shortTermYearSummary } from '@/lib/tax/shortTermTax';

// Χρώμα ΜΟΝΟ όπου υπάρχει κάτι να γίνει. Η συμφωνία δεν είναι επίτευγμα που
// θέλει πράσινο· είναι η αναμενόμενη κατάσταση και γράφεται με τον τόνο του
// κειμένου. Ό,τι χρειάζεται προσοχή ξεχωρίζει τότε από μόνο του.
function toneOf(l: Line): { color: string; label: string } {
  if (l.verdict === 'match') return { color: 'var(--text-secondary)', label: 'Συμφωνούν' };
  if (l.verdict === 'only_theirs') return { color: 'var(--negative)', label: 'Μόνο στο έντυπο' };
  if (l.verdict === 'only_ours') return { color: 'var(--warning)', label: 'Μόνο στα δικά σου' };
  const unexplained = Math.abs(l.unexplained ?? 0) > 1;
  return unexplained
    ? { color: 'var(--warning)', label: 'Διαφορά χωρίς εξήγηση' }
    : { color: 'var(--text-secondary)', label: 'Διαφορά που εξηγείται' };
}

export default function E2ReconcileCard({ userId, year, plan = 'free', onUpgrade }: {
  userId: string; year: number; plan?: PlanId; onUpgrade?: () => void;
}) {
  // Η εξαγωγή ξεκλειδώνει από το «Ένα ακίνητο» και πάνω. Ο έλεγχος του
  // προσυμπληρωμένου — η ίδια η κάρτα — μένει ανοιχτός σε όλους: είναι ο λόγος
  // που ο δοκιμαστής καταλαβαίνει τι αγοράζει.
  const canExport = hasFeature({ plan }, 'e2_export');
  const supabase = useMemo(() => createClient(), []);
  const [rows, setRows] = useState<E2Row[]>([]);
  const [evidence, setEvidence] = useState<OurEvidence[]>([]);
  const [loading, setLoading] = useState(true);
  /** Τι έγραψε ο χρήστης από το έντυπο, ανά ΑΤΑΚ. Κενό = δεν το έχει δει ακόμη. */
  const [declared, setDeclared] = useState<Record<string, string>>({});
  const [exporting, setExporting] = useState(false);

  // ── ΤΟ ΑΡΧΕΙΟ ΠΟΥ ΠΟΥΛΙΕΤΑΙ ────────────────────────────────────────────
  // Η συνάρτηση που φτιάχνει το βιβλίο υπήρχε και δούλευε χωρίς να την καλεί
  // κανένα κουμπί· ο συνδρομητής πλήρωνε για έντυπο που δεν κατέβαινε. Όταν
  // μπήκε το κουμπί, μπήκε χωρίς κλειδαριά: το ίδιο έντυπο το έπαιρνε και ο
  // δωρεάν λογαριασμός. Τώρα το κουμπί υπάρχει ΚΑΙ φυλάγεται.
  const exportE2 = async () => {
    if (!canExport) return;
    setExporting(true);
    try {
      const n = await runE2Export(supabase, userId, year);
      if (n > 0) notify(`Το Ε2 ${year} κατέβηκε · ${n} ${n === 1 ? 'ακίνητο' : 'ακίνητα'}`);
      else notifyError('Δεν υπάρχει ακίνητο για εξαγωγή.');
    } catch {
      notifyError('Η εξαγωγή δεν ολοκληρώθηκε. Δοκίμασε ξανά.');
    } finally {
      setExporting(false);
    }
  };

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const { properties, rows: r, paymentsByProp, staysByProp } =
          await loadE2Rows(supabase, userId, year);
        if (!alive) return;
        setRows(r);
        // ── ΤΕΣΣΕΡΑ ΜΕΓΕΘΗ ΠΟΥ ΥΠΗΡΧΑΝ ΚΑΙ ΔΕΝ ΠΕΡΝΟΥΣΑΝ ────────────────────
        //
        // Η μηχανή συμφωνίας ξέρει επτά λόγους διαφοράς. Εδώ της δίνονταν
        // στοιχεία για δύο (μήνες, συνιδιοκτησία): οι τέσσερις λόγοι που
        // στηρίζονται σε προμήθεια πλατφόρμας, τέλος ανθεκτικότητας,
        // ανείσπρακτα και απροσδιόριστη βάση ποσού ΔΕΝ μπορούσαν να
        // ενεργοποιηθούν ποτέ, όσο σωστά κι αν ήταν τα δεδομένα. Ο χρήστης
        // διάβαζε «διαφορά χωρίς εξήγηση» για διαφορά που τα δικά του
        // δεδομένα εξηγούσαν, και την πήγαινε στον λογιστή του ως άγνωστη.
        //
        // Καμία νέα αριθμητική: τα τρία της βραχυχρόνιας βγαίνουν απο την ίδια
        // `shortTermYearSummary` που δίνει το ακαθάριστο στο `buildE2Row`, τα
        // ανείσπρακτα απο τις δόσεις του έτους που δεν έχουν σημανθεί ως
        // εισπραγμένες. Κόστος: μία στήλη παραπάνω στο ερώτημα των δόσεων.
        //
        // Η ΚΑΤΑΣΤΑΣΗ ΔΙΑΒΑΖΕΤΑΙ ΟΠΩΣ ΣΤΟ ΕΝΤΥΠΟ. Εδώ κρινόταν μόνο απο το
        // `status_detail === 'seasonal'`, ενώ το `buildE2Row` περνά απο το
        // `readStatus`: ακίνητο αποθηκευμένο «rented» με `rental_mode`
        // «short_term» έμπαινε στο έντυπο ως βραχυχρόνιο και ταυτόχρονα
        // έχανε εδώ τις δύο εξηγήσεις της βραχυχρόνιας.
        setEvidence(properties.map(p => {
          const shortTerm = readStatus(p) === 'rent_short';
          const stayYear = shortTerm ? shortTermYearSummary(staysByProp.get(p.id) || [], year) : null;
          // Στη βραχυχρόνια το ακαθάριστο βγαίνει απο τις διαμονές, όχι απο
          // δόσεις: εκεί τα ανείσπρακτα μισθώματα δεν έχουν νόημα, ακριβώς
          // όπως τα μηδενίζει και η Λογιστική.
          const due = shortTerm ? [] : (paymentsByProp.get(p.id) || []);
          const unpaid = due.reduce((s, x) => s + (x.paid ? 0 : (x.amount || 0)), 0);
          return {
            atak: p.atak,
            name: p.address || p.atak || 'Ακίνητο',
            shortTerm,
            platformFees: stayYear?.platformFees ?? null,
            climateLevy: stayYear?.collectedLevy ?? null,
            unresolvedAmounts: stayYear?.unresolvedAmount ?? null,
            unpaid: unpaid > 0 ? unpaid : null,
          };
        }));
      } finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
  }, [supabase, userId, year]);

  const declaredRows: DeclaredRow[] = useMemo(() =>
    Object.entries(declared)
      .filter(([, v]) => v.trim() !== '' && !isNaN(parseFloat(v)))
      .map(([atak, v]) => ({ atak, gross: parseFloat(v) })),
  [declared]);

  const result = useMemo(
    () => reconcileE2(rows, declaredRows, evidence),
    [rows, declaredRows, evidence],
  );

  // Πόσα ακίνητα περιμένουν ακόμη νούμερο από το έντυπο.
  const awaiting = rows.filter(r => !(declared[r.atak] || '').trim()).length;
  const started = declaredRows.length > 0;

  const card: React.CSSProperties = {
    background: 'var(--surface-raised)', border: '1px solid var(--border-raised)',
    borderRadius: T.radius.card, padding: 18,
    boxShadow: 'var(--highlight-inset), var(--elev-1)', marginBottom: 16,
  };
  const inp: React.CSSProperties = {
    background: 'var(--bg-base)', border: '1px solid var(--border-default)',
    borderRadius: T.radius.inner, height: T.h.md, padding: '0 12px', width: 130,
    color: 'var(--text-primary)', fontFamily: T.font.num, fontSize: 14,
    fontVariantNumeric: 'tabular-nums', textAlign: 'right', outline: 'none',
    boxSizing: 'border-box',
  };

  if (loading) return null;

  if (!rows.length) {
    return (
      <div style={card}>
        <EmptyState
          title="Έλεγχος του προσυμπληρωμένου Ε2"
          hint="Με ένα ακίνητο που έχει ΑΤΑΚ και καταχωρημένα μισθώματα, η σύγκριση με το προσυμπληρωμένο έντυπο γίνεται εδώ, πριν υπογράψεις."
        />
      </div>
    );
  }

  return (
    <div style={card}>
      <div style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <p style={{ ...TT.h2 }}>Έλεγχος του προσυμπληρωμένου Ε2 · {year}</p>
          <FeatureBtn locked={!canExport} onUpgrade={() => onUpgrade?.()} onClick={exportE2} disabled={exporting}>
            {exporting ? 'Σε εξέλιξη…' : 'Λήψη Ε2 σε Excel'}
          </FeatureBtn>
        </div>
        <p style={{ ...TT.bodySm, marginTop: 4 }}>
          Η ΑΑΔΕ στέλνει το Ε2 προσυμπληρωμένο και συχνά λανθασμένο. Γράψε το ακαθάριστο
          που δείχνει το myAADE για κάθε ακίνητο και θα δεις πού διαφέρει από τα δικά σου.
        </p>
      </div>

      {/* Η κεντρική φράση. Εμφανίζεται μόνο όταν υπάρχει κάτι να συγκριθεί. */}
      {started && result.headline && (
        <div style={{
          padding: '12px 14px', marginBottom: 14,
          background: 'var(--bg-elevated)', borderRadius: T.radius.inner,
          borderLeft: `2px solid ${result.needsAttention === 0 ? 'var(--border-default)' : 'var(--warning)'}`,
        }}>
          <span style={{ ...TT.body, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
            {result.headline}
          </span>
          {awaiting > 0 && (
            <p style={{ ...TT.caption, marginTop: 4 }}>
              {awaiting} {awaiting === 1 ? 'ακίνητο ακόμη χωρίς' : 'ακίνητα ακόμη χωρίς'} νούμερο από το έντυπο.
            </p>
          )}
        </div>
      )}

      {/* Μία γραμμή ανά ακίνητο: τι λέμε εμείς, τι λέει το έντυπο. */}
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {rows.map((r, i) => {
          const line = result.lines.find(l => (l.atak || '') === (r.atak || '') && l.ours != null);
          const tone = line ? toneOf(line) : null;
          const hasNumber = !!(declared[r.atak] || '').trim();
          return (
            <div key={r.atak || i} style={{
              padding: '14px 2px',
              borderTop: i === 0 ? 'none' : '1px solid var(--border-subtle)',
            }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div style={{ ...TT.body, fontWeight: 600 }}>{r.address || r.atak || 'Ακίνητο'}</div>
                  <div style={{ ...TT.caption, marginTop: 3, fontVariantNumeric: 'tabular-nums' }}>
                    {r.atak ? `ΑΤΑΚ ${r.atak} · ` : ''}Τα δικά σου: {fe(r.grossIncome)}
                    {r.months ? ` · ${r.months} μήνες` : ''}
                  </div>
                  {/* Ο ΑΤΑΚ είναι το μόνο κλειδί ταύτισης. Χωρίς αυτόν δεν συγκρίνουμε. */}
                  {!r.atak && (
                    <div style={{ ...TT.caption, marginTop: 4, color: 'var(--warning)' }}>
                      Χωρίς ΑΤΑΚ δεν γίνεται σύγκριση.
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <label style={{ ...TT.caption, whiteSpace: 'nowrap' }} htmlFor={`e2-${i}`}>
                    Το έντυπο λέει
                  </label>
                  <input
                    id={`e2-${i}`} type="number" min={0} inputMode="decimal" style={inp}
                    placeholder="" disabled={!r.atak}
                    value={declared[r.atak] ?? ''}
                    onChange={e => setDeclared(d => ({ ...d, [r.atak]: e.target.value }))}
                  />
                </div>
              </div>

              {hasNumber && line && tone && (
                <div style={{ marginTop: 10, paddingLeft: 12, borderLeft: `2px solid ${tone.color}` }}>
                  <div style={{ ...TT.bodySm, fontWeight: 600, color: tone.color }}>
                    {tone.label}
                    {line.diff != null && Math.abs(line.diff) > 1 &&
                      <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 500, color: 'var(--text-secondary)' }}>
                        {' · '}διαφορά {fe(Math.abs(line.diff))}
                      </span>}
                  </div>
                  {line.reasons.map(reason => (
                    <p key={reason.code} style={{ ...TT.caption, marginTop: 5 }}>
                      {reason.text}
                    </p>
                  ))}
                  <p style={{ ...TT.caption, marginTop: 6, color: 'var(--text-primary)' }}>
                    {line.action}
                  </p>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Γραμμές του εντύπου για ακίνητα που δεν έχουμε — το πιο επικίνδυνο εύρημα:
          το κράτος γνωρίζει εισόδημα που εσύ δεν κατέγραψες. */}
      {result.lines.filter(l => l.verdict === 'only_theirs').map(l => (
        <div key={`t-${l.atak}`} style={{
          marginTop: 12, padding: '12px 14px',
          background: 'var(--negative-soft)', border: '1px solid var(--negative-border)',
          borderRadius: T.radius.inner,
        }}>
          <div style={{ ...TT.bodySm, fontWeight: 600 }}>
            Το έντυπο έχει γραμμή για ΑΤΑΚ {l.atak} που δεν υπάρχει στα ακίνητά σου
            {l.theirs != null ? ` (${fe(l.theirs)})` : ''}.
          </div>
          <p style={{ ...TT.caption, marginTop: 4 }}>{l.action}</p>
        </div>
      ))}

      <p style={{ ...TT.caption, marginTop: 14 }}>
        Ποιο νούμερο είναι σωστό το αποφασίζεις εσύ με τον λογιστή σου. Εδώ φαίνεται πού
        διαφέρουν και τι εξηγεί τη διαφορά.
      </p>
    </div>
  );
}

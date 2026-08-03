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
import { T, TT, EmptyState } from '@/components/Theme';
import { loadE2Rows } from './e2Export';
import { reconcileE2, type DeclaredRow, type OurEvidence, type Line } from '@/lib/billing/e2Reconcile';
import type { E2Row } from '@/lib/billing/e2';

const eur = (n: number) =>
  `${Math.round(n).toLocaleString('el-GR')} €`;

/** Χρώμα ΜΟΝΟ όταν σημαίνει κάτι: συμφωνία, διαφορά, ή λείπει γραμμή. */
function toneOf(l: Line): { color: string; label: string } {
  if (l.verdict === 'match') return { color: 'var(--positive)', label: 'Συμφωνούν' };
  if (l.verdict === 'only_theirs') return { color: 'var(--negative)', label: 'Μόνο στο έντυπο' };
  if (l.verdict === 'only_ours') return { color: 'var(--warning)', label: 'Μόνο στα δικά σου' };
  const unexplained = Math.abs(l.unexplained ?? 0) > 1;
  return unexplained
    ? { color: 'var(--warning)', label: 'Διαφορά χωρίς εξήγηση' }
    : { color: 'var(--text-secondary)', label: 'Διαφορά που εξηγείται' };
}

export default function E2ReconcileCard({ userId, year }: { userId: string; year: number }) {
  const supabase = useMemo(() => createClient(), []);
  const [rows, setRows] = useState<E2Row[]>([]);
  const [evidence, setEvidence] = useState<OurEvidence[]>([]);
  const [loading, setLoading] = useState(true);
  /** Τι έγραψε ο χρήστης από το έντυπο, ανά ΑΤΑΚ. Κενό = δεν το έχει δει ακόμη. */
  const [declared, setDeclared] = useState<Record<string, string>>({});

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const { properties, rows: r } = await loadE2Rows(supabase, userId, year);
        if (!alive) return;
        setRows(r);
        // Ό,τι βοηθά να εξηγηθεί μια διαφορά, από δεδομένα που ΕΧΟΥΜΕ ήδη.
        // Δεν κάνουμε νέα ερωτήματα για να «εμπλουτίσουμε»: ό,τι δεν ξέρουμε,
        // η μηχανή το αφήνει ανεξήγητο, που είναι η σωστή απάντηση.
        setEvidence(properties.map(p => ({
          atak: p.atak,
          name: p.address || p.atak || 'Ακίνητο',
          shortTerm: p.status_detail === 'seasonal',
        })));
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
          hint="Μόλις προσθέσεις ακίνητο με ΑΤΑΚ και καταχωρήσεις μισθώματα, θα μπορείς να συγκρίνεις τι λέει η ΑΑΔΕ με τι λένε τα δικά σου στοιχεία — πριν υπογράψεις."
        />
      </div>
    );
  }

  return (
    <div style={card}>
      <div style={{ marginBottom: 14 }}>
        <p style={{ ...TT.h2 }}>Έλεγχος του προσυμπληρωμένου Ε2 · {year}</p>
        <p style={{ ...TT.bodySm, marginTop: 4, maxWidth: 640 }}>
          Η ΑΑΔΕ σου στέλνει το Ε2 συμπληρωμένο. Είναι συχνά λάθος — γι&apos; αυτό σου
          επιτρέπει να το διορθώσεις. Άνοιξε το myAADE, γράψε εδώ το ακαθάριστο που
          δείχνει για κάθε ακίνητο, και θα δεις πού διαφέρει από τα δικά σου στοιχεία.
        </p>
      </div>

      {/* Η κεντρική φράση. Εμφανίζεται μόνο όταν υπάρχει κάτι να συγκριθεί. */}
      {started && result.headline && (
        <div style={{
          padding: '12px 14px', marginBottom: 14,
          background: 'var(--bg-elevated)', borderRadius: T.radius.inner,
          borderLeft: `2px solid ${result.needsAttention === 0 ? 'var(--positive)' : 'var(--warning)'}`,
        }}>
          <span style={{ ...TT.body, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
            {result.headline}
          </span>
          {awaiting > 0 && (
            <p style={{ ...TT.caption, marginTop: 4 }}>
              {awaiting === 1 ? 'Ένα ακίνητο δεν έχει ακόμη νούμερο από το έντυπο.'
                              : `${awaiting} ακίνητα δεν έχουν ακόμη νούμερο από το έντυπο.`}
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
                    {r.atak ? `ΑΤΑΚ ${r.atak} · ` : ''}Τα δικά σου: {eur(r.grossIncome)}
                    {r.months ? ` · ${r.months} μήνες` : ''}
                  </div>
                  {/* Ο ΑΤΑΚ είναι το μόνο κλειδί ταύτισης. Χωρίς αυτόν δεν συγκρίνουμε. */}
                  {!r.atak && (
                    <div style={{ ...TT.caption, marginTop: 4, color: 'var(--warning)' }}>
                      Λείπει ο ΑΤΑΚ. Συμπλήρωσέ τον για να γίνει η σύγκριση.
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <label style={{ ...TT.caption, whiteSpace: 'nowrap' }} htmlFor={`e2-${i}`}>
                    Το έντυπο λέει
                  </label>
                  <input
                    id={`e2-${i}`} type="number" inputMode="decimal" style={inp}
                    placeholder="—" disabled={!r.atak}
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
                        {' · '}διαφορά {eur(Math.abs(line.diff))}
                      </span>}
                  </div>
                  {line.reasons.map(reason => (
                    <p key={reason.code} style={{ ...TT.caption, marginTop: 5, maxWidth: 620 }}>
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
            {l.theirs != null ? ` (${eur(l.theirs)})` : ''}.
          </div>
          <p style={{ ...TT.caption, marginTop: 4 }}>{l.action}</p>
        </div>
      ))}

      <p style={{ ...TT.caption, marginTop: 14, maxWidth: 640 }}>
        Δεν σου λέμε ποιο νούμερο είναι σωστό — αυτό είναι δική σου απόφαση, με τον
        λογιστή σου. Δείχνουμε πού διαφέρουν και τι εξηγεί τη διαφορά.
      </p>
    </div>
  );
}

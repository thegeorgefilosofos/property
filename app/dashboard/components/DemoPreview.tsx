'use client';

// ═══════════════════════════════════════════════════════════════════════════
// DemoPreview — μια ολόκληρη χρονιά, χωρίς να γραφτεί τίποτα
// ─────────────────────────────────────────────────────────────────────────
// ΤΙ ΑΝΤΙΚΑΘΙΣΤΑ. Το παλιό «demo» έφτιαχνε ΑΛΗΘΙΝΟ ακίνητο στον λογαριασμό του
// νέου χρήστη. Εδώ δεν γίνεται καμία εγγραφή: όλα τα δεδομένα ζουν στο
// lib/demo/sample.ts και οι αριθμοί βγαίνουν από τις ίδιες συναρτήσεις που
// υπολογίζουν τον φόρο του πληρωμένου χρήστη.
//
// ΓΙΑΤΙ ΑΥΤΕΣ ΟΙ ΤΡΕΙΣ ΕΝΟΤΗΤΕΣ ΚΑΙ ΟΧΙ ΠΕΡΙΣΣΟΤΕΡΕΣ. Το παράδειγμα δεν είναι
// ξενάγηση στα εργαλεία — είναι μία απάντηση: «τι μένει στην τσέπη και τι
// χρωστάω». Τα τρία ποσά της κορυφής το λένε, η κατάσταση αποτελεσμάτων δείχνει
// τον δρόμο ως εκεί, και το ισοζύγιο δείχνει ότι κάθε δαπάνη ξέρει τον
// λογαριασμό της. Ό,τι άλλο θα ήταν επίδειξη, όχι απόδειξη.
//
// ΤΟ ΣΗΜΕΙΟ ΠΟΥ ΔΙΔΑΣΚΕΙ. Ο ιδιοκτήτης νομίζει ότι οι δαπάνες του μειώνουν τον
// φόρο. Σε φυσικό πρόσωπο με μακροχρόνια ΔΕΝ τον μειώνουν: εκπίπτει τεκμαρτά
// 5% και τίποτε άλλο. Η κατάσταση το δείχνει με τη σειρά των γραμμών, χωρίς να
// το εξηγεί με παράγραφο.
// ═══════════════════════════════════════════════════════════════════════════

import { Modal, Btn, T, TT, fe, fp } from '@/components/Theme';
import { DEMO_PROPERTY, demoLedger, demoSummary } from '@/lib/demo/sample';
import { isoDate } from '@/lib/core/time';

const numStyle = { fontFamily: T.font.num, fontVariantNumeric: 'tabular-nums' as const };

function Figure({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ ...TT.label, fontSize: 10 }}>{label}</div>
      <div style={{ ...TT.kpi, marginTop: 6 }}>{value}</div>
      <div style={{ ...TT.caption, marginTop: 4 }}>{note}</div>
    </div>
  );
}

export default function DemoPreview({ open, onClose, onAddProperty }: {
  open: boolean;
  onClose: () => void;
  /** «Πρόσθεσε το ακίνητό σου»: κλείνει την προεπισκόπηση και ανοίγει τον οδηγό. */
  onAddProperty: () => void;
}) {
  const today = isoDate(new Date());
  const s = demoSummary(today);
  const ledger = demoLedger(s.year);

  // Οι γραμμές της κατάστασης έρχονται έτοιμες από το incomeStatement, με τη
  // σειρά και τα λεκτικά του νόμου. Δεν ξαναγράφονται εδώ — αλλιώς θα υπήρχαν
  // δύο εκδοχές της ίδιας κατάστασης, μία για την προεπισκόπηση και μία αληθινή.
  const lines = s.statement.lines;

  return (
    <Modal open={open} onClose={onClose} width={720}
      title="Παράδειγμα μιας ολόκληρης χρονιάς"
      subtitle={`${DEMO_PROPERTY.name} · ${DEMO_PROPERTY.sqm} τ.μ. · μακροχρόνια μίσθωση · ${s.year}`}
      footerInfo="Το παράδειγμα δεν αποθηκεύεται στον λογαριασμό σου."
      footer={<>
        <Btn onClick={onClose}>Κλείσιμο</Btn>
        <Btn variant="primary" onClick={onAddProperty}>Πρόσθεσε το ακίνητό σου</Btn>
      </>}>

      {/* ── ΤΑ ΤΡΙΑ ΠΟΣΑ ─────────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))', gap: T.sp.lg }}>
        <Figure label="Εισπράχθηκαν" value={fe(s.collected)}
          note={`${fe(DEMO_PROPERTY.monthlyRent)} τον μήνα, έντεκα μήνες μέσα στη χρονιά`} />
        <Figure label="Δαπάνες" value={fe(s.expenses)}
          note={`${ledger.length} κατηγορίες, μαζί με τον ΕΝΦΙΑ`} />
        <Figure label="Στο ταμείο" value={fe(s.statement.netCash)}
          note={`μετά από φόρο, ΕΝΦΙΑ και δαπάνες`} />
      </div>

      {/* ── Η ΚΑΤΑΣΤΑΣΗ ──────────────────────────────────────────────────── */}
      <div>
        <div style={{ ...TT.label, fontSize: 10, marginBottom: 10 }}>ΑΠΟ ΤΟ ΕΝΟΙΚΙΟ ΣΤΟ ΤΑΜΕΙΟ</div>
        <div style={{ border: '1px solid var(--border-subtle)', borderRadius: T.radius.inner, overflow: 'hidden' }}>
          {lines.map((l, i) => {
            const strong = l.kind === 'subtotal' || l.kind === 'result';
            return (
              <div key={l.key} style={{
                display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: T.sp.md,
                padding: '10px 14px',
                borderTop: i === 0 ? 'none' : '1px solid var(--border-subtle)',
                background: strong ? 'var(--bg-elevated)' : 'transparent',
              }}>
                <span style={{ ...TT.bodySm, color: strong ? 'var(--text-primary)' : 'var(--text-secondary)', fontWeight: strong ? 700 : 400 }}>{l.label}</span>
                <span style={{ ...numStyle, fontSize: 13, fontWeight: strong ? 700 : 500, color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>
                  {l.negative ? `− ${fe(l.amount)}` : fe(l.amount)}
                </span>
              </div>
            );
          })}
        </div>
        {/* ΔΥΟ ΑΛΗΘΕΙΕΣ ΠΟΥ ΔΕΝ ΦΑΙΝΟΝΤΑΙ ΣΤΟΥΣ ΑΡΙΘΜΟΥΣ, ΚΑΙ ΜΙΑ ΓΡΑΜΜΗ ΓΙΑ
            ΚΑΘΕ ΜΙΑ: ποιας χρονιάς κλίμακα εφαρμόστηκε, και πού πήγε ο
            δωδέκατος μήνας. Χωρίς τη δεύτερη, ο αναγνώστης μετρά έντεκα ενοίκια
            και υποθέτει ότι λείπει ένα. */}
        <div style={{ ...TT.caption, marginTop: 10 }}>
          Φόρος με {s.bracketsLabel}. Πραγματικός συντελεστής {fp(s.statement.effectiveRate * 100)}.
        </div>
        <div style={{ ...TT.caption, marginTop: 4 }}>
          Το ενοίκιο Δεκεμβρίου εισπράχθηκε στις 8 Ιανουαρίου, οπότε ανήκει στη χρήση {s.year + 1}: {fe(s.carriedOver)}.
        </div>
      </div>

      {/* ── ΤΟ ΙΣΟΖΥΓΙΟ ──────────────────────────────────────────────────── */}
      <div>
        <div style={{ ...TT.label, fontSize: 10, marginBottom: 10 }}>ΟΙ ΔΑΠΑΝΕΣ ΚΑΙ Ο ΛΟΓΑΡΙΑΣΜΟΣ ΤΟΥΣ</div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {ledger.map((r, i) => (
            <div key={r.category} style={{
              display: 'flex', alignItems: 'baseline', gap: T.sp.md, padding: '8px 0',
              borderTop: i === 0 ? 'none' : '1px solid var(--border-subtle)',
            }}>
              <span style={{ ...TT.bodySm, color: 'var(--text-primary)', flex: 1, minWidth: 0 }}>{r.label}</span>
              <span style={{ ...TT.caption, fontFamily: T.font.mono, whiteSpace: 'nowrap' }}>{r.account}</span>
              <span style={{ ...numStyle, fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', whiteSpace: 'nowrap', minWidth: 84, textAlign: 'right' }}>{fe(r.amount)}</span>
            </div>
          ))}
        </div>
        <div style={{ ...TT.caption, marginTop: 10 }}>
          Οι λογαριασμοί είναι του σχεδίου των ΕΛΠ, ν.4308/2014. Ο φάκελος του λογιστή βγαίνει με αυτούς.
        </div>
      </div>
    </Modal>
  );
}

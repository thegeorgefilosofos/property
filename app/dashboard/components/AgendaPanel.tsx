'use client';

// ═══════════════════════════════════════════════════════════════════════════
// ΤΙ ΧΡΕΙΑΖΕΤΑΙ ΤΩΡΑ — η πρώτη οθόνη της εφαρμογής.
// ─────────────────────────────────────────────────────────────────────────
// Αντικαθιστά, στην αρχική, το InsightsBoard, το ObligationsPanel και τη
// «Ρύθμιση ακινήτου» — τρεις κάρτες που έλεγαν εν μέρει τα ΙΔΙΑ πράγματα με
// διαφορετικά λόγια. Η συγχώνευση γίνεται στο `lib/home/agenda.ts`, με έλεγχο·
// εδώ μένει μόνο η εμφάνιση.
//
// ΓΙΑΤΙ ΞΑΝΑΓΡΑΦΤΗΚΕ
//
// Η προηγούμενη εκδοχή ήταν σωστή και βαρετή και το δεύτερο ακύρωνε το πρώτο:
//
//   · Η προθεσμία ήταν ΦΡΑΣΗ μέσα στη γραμμή («22 ημέρες πίσω», «σε 204
//     ημέρες»), σε 11,5px γκρι, με το ίδιο βάρος για όλα. Κάθε φράση είχε άλλο
//     μήκος, οπότε ο αριθμός καθόταν κάθε φορά αλλού και το μάτι δεν μπορούσε
//     να συγκρίνει κάθετα. Το εκπρόθεσμο δεν ξεχώριζε από το επτάμηνο.
//   · Η εξήγηση ήταν ΚΡΥΜΜΕΝΗ πίσω από κλικ. Σε οθόνη αφής δεν υπάρχει καν
//     υπόδειξη ότι υπάρχει κάτι να ανοίξει.
//   · Η μόνη «ζωντάνια» ήταν το χρώμα που εμφανιζόταν στο hover — δηλαδή
//     τίποτα σε κινητό και τίποτα πριν κουνήσεις τον δείκτη.
//
// ΤΙ ΑΛΛΑΞΕ
//
// Η προθεσμία έγινε ΣΤΗΛΗ: ο αριθμός σε δικό του, σταθερού πλάτους γκρίζωμα
// αριστερά, με ισοπλατή ψηφία και τη μονάδα από κάτω. Δέκα γραμμές στοιχίζονται
// σαν οικονομική κατάσταση και το «22» δίπλα στο «204» λέει μόνο του ποιο
// επείγει. Το `lib/home/agenda.ts` δίνει πλέον αριθμό και μονάδα ΧΩΡΙΣΤΑ
// (`dueParts`) ακριβώς γι' αυτό.
//
// Η εξήγηση φαίνεται χωρίς κλικ — αλλά μόνο όπου αλλάζει τι κάνεις: σε
// εκπρόθεσμο ή σε εκκρεμότητα χωρίς ημερομηνία. Για προθεσμία επτά μηνών ο
// τίτλος και ο αριθμός τα λένε όλα και οι πέντε επιπλέον σημειώσεις θα
// πρόσθεταν 250 εικονοστοιχεία στην πρώτη οθόνη της εφαρμογής.
//
// ΚΑΜΙΑ ΣΗΜΑΣΙΟΛΟΓΙΚΗ ΧΡΩΜΑΤΙΚΗ ΚΩΔΙΚΟΠΟΙΗΣΗ. Το επείγον λέγεται με ΘΕΣΗ (πρώτο),
// ΒΑΡΟΣ (εντονότερος αριθμός) και μια λεπτή κάθετη γραμμή στο χρώμα της μάρκας —
// όχι με κόκκινο. Το κόκκινο θα ήταν ετυμηγορία· η σειρά είναι πληροφορία.
// ═══════════════════════════════════════════════════════════════════════════

import { T, EmptyState } from '@/components/Theme';
import { CircleCheckBig } from 'lucide-react';
import { dueParts, overdueCount, type AgendaItem } from '@/lib/home/agenda';

export default function AgendaPanel({ items, total, onNavigate }: {
  items: AgendaItem[];
  /** Πόσα υπάρχουν συνολικά — η λίστα δείχνει τα πρώτα. */
  total: number;
  onNavigate: (tab: string) => void;
}) {
  const late = overdueCount(items);

  return (
    <div className="agenda" style={{ marginBottom: 20 }}>
      {/* Η κεφαλίδα ζει ΜΕΣΑ στην κάρτα: δύο ξεχωριστά στοιχεία (SecHdr από
          πάνω, κάρτα από κάτω) έσπαγαν τη συνοχή και πρόσθεταν 26px κενό. */}
      <div className="agenda-head">
        <span className="agenda-title">Τι χρειάζεται τώρα</span>
        {items.length > 0 && (
          <span className="agenda-count">
            {late > 0
              ? `${late} ${late === 1 ? 'εκπρόθεσμο' : 'εκπρόθεσμα'}`
              : `${items.length} σε σειρά προθεσμίας`}
          </span>
        )}
      </div>

      {items.length === 0 ? (
        <div style={{ padding: '4px 0 8px' }}>
          <EmptyState icon={<CircleCheckBig size={18} />} title="Δεν εκκρεμεί τίποτα"
            hint="Καμία προθεσμία δεν πλησιάζει και καμία εργασία δεν περιμένει ενέργεια." />
        </div>
      ) : (
        <ul className="agenda-list">
          {items.map(it => {
            const d = dueParts(it.daysLeft);
            return (
              <li key={it.key} className={`agenda-row${d.overdue ? ' is-late' : ''}`}>
                {/* Η ΣΤΗΛΗ ΤΟΥ ΧΡΟΝΟΥ. Σταθερό πλάτος ώστε οι αριθμοί όλων των
                    γραμμών να πέφτουν στον ίδιο άξονα, δεξιά στοιχισμένοι. */}
                <div className="agenda-when" aria-hidden={false}>
                  {d.value != null ? (
                    <>
                      <span className="agenda-num">{d.value}</span>
                      <span className="agenda-unit">{d.unit}</span>
                    </>
                  ) : (
                    <span className="agenda-word">{d.word || 'χωρίς προθεσμία'}</span>
                  )}
                </div>

                <div className="agenda-body">
                  <span className="agenda-item-title">{it.title}</span>
                  {/* Η ΕΞΗΓΗΣΗ ΦΑΙΝΕΤΑΙ — ΑΛΛΑ ΜΟΝΟ ΟΠΟΥ ΑΛΛΑΖΕΙ ΤΙ ΚΑΝΕΙΣ.
                      Ήταν πίσω από κλικ, που σε οθόνη αφής δεν ανακοινώνεται καν.
                      Το να ανοίξουν όμως ΟΛΕΣ πρόσθετε 250 εικονοστοιχεία στην
                      πρώτη οθόνη: για προθεσμία 204 ημερών ο τίτλος και ο
                      αριθμός τα λένε όλα. Μένει όπου επείγει (εκπρόθεσμο) ή όπου
                      δεν υπάρχει ημερομηνία — εκεί η σημείωση ΕΙΝΑΙ η οδηγία. */}
                  {it.note && (d.overdue || d.value == null) && (
                    <span className="agenda-note">{it.note}</span>
                  )}
                </div>

                {it.action && (
                  <button type="button" className="agenda-go" onClick={() => onNavigate(it.action!.tab)}>
                    {it.action.label}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {/* Το υπόλοιπο της λίστας ΔΕΝ ξαναγράφεται εδώ: ζει στις «Εκκρεμότητες»,
          που είναι η καρτέλα του. Η αρχική δείχνει τα πρώτα και λέει πόσα μένουν. */}
      <button type="button" className="agenda-more" onClick={() => onNavigate('checklist')}>
        {total > items.length ? `Δες και τα υπόλοιπα ${total - items.length}` : 'Όλες οι εκκρεμότητες'}
      </button>

      <style jsx>{`
        .agenda {
          border: 1px solid var(--border-subtle);
          border-radius: ${T.radius.card}px;
          /* ΒΑΘΟΣ ΠΟΥ ΦΑΙΝΕΤΑΙ ΠΑΝΤΑ, ΟΧΙ ΜΟΝΟ ΣΤΟ HOVER. Μια πολύ ήπια
             κλίση από πάνω δίνει στην επιφάνεια κατεύθυνση φωτός — η ίδια
             γλώσσα με την αρχική σελίδα, χωρίς να χρειάζεται δείκτης. */
          background:
            radial-gradient(120% 100% at 50% -20%, color-mix(in srgb, var(--accent) 5%, transparent) 0%, transparent 62%),
            var(--surface-raised);
          box-shadow: var(--highlight-inset), var(--elev-1);
          overflow: hidden;
        }
        .agenda-head {
          display: flex; align-items: baseline; justify-content: space-between;
          gap: 12px; padding: 14px 18px 12px;
          border-bottom: 1px solid var(--border-subtle);
        }
        .agenda-title {
          font-family: ${T.font.sans}; font-size: 11px; font-weight: 700;
          letter-spacing: 0.07em; text-transform: uppercase; color: var(--text-secondary);
        }
        .agenda-count {
          font-family: ${T.font.sans}; font-size: 12px; color: var(--text-tertiary);
          font-variant-numeric: tabular-nums; white-space: nowrap;
        }
        .agenda-list { list-style: none; margin: 0; padding: 0; }
        .agenda-row {
          display: grid;
          /* Η στήλη του χρόνου έχει ΣΤΑΘΕΡΟ πλάτος — εκεί στηρίζεται όλη η
             στοίχιση. Το περιεχόμενο παίρνει ό,τι περισσεύει, η ενέργεια όσο
             χρειάζεται. Σε στενή οθόνη ο χρόνος πάει πάνω από το κείμενο. */
          grid-template-columns: 72px minmax(0, 1fr) auto;
          align-items: start; gap: 16px;
          padding: 13px 18px;
          border-top: 1px solid var(--border-subtle);
          position: relative;
        }
        .agenda-row:first-child { border-top: none; }
        /* Το εκπρόθεσμο δηλώνεται με ΓΡΑΜΜΗ, όχι με κόκκινο φόντο. Μαζί της
           μια πολύ ήπια απόχρωση του ίδιου γαλάζιου: η γραμμή μόνη της
           φαινόταν μόνο αν την έψαχνες, ενώ ο λόγος να υπάρχει είναι να τη
           βρίσκει το μάτι χωρίς να ψάχνει. Ενα χρώμα, δύο εντάσεις. */
        .agenda-row.is-late::before {
          content: ''; position: absolute; left: 0; top: 0; bottom: 0; width: 3px;
          background: var(--accent);
        }
        .agenda-row.is-late { background: color-mix(in srgb, var(--accent) 4%, transparent); }
        .is-late .agenda-unit { color: var(--text-secondary); }
        .agenda-when {
          display: flex; flex-direction: column; align-items: flex-end;
          text-align: right; padding-top: 1px;
        }
        .agenda-num {
          font-family: ${T.font.sans}; font-size: 19px; font-weight: 600;
          line-height: 1.05; letter-spacing: -0.02em;
          font-variant-numeric: tabular-nums; color: var(--text-secondary);
        }
        .is-late .agenda-num { font-weight: 700; color: var(--text-primary); }
        .agenda-unit, .agenda-word {
          font-family: ${T.font.sans}; font-size: 11px; line-height: 1.3;
          color: var(--text-tertiary); margin-top: 2px;
        }
        .agenda-word { font-size: 12px; font-weight: 600; color: var(--text-secondary); margin-top: 0; }
        .agenda-body { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
        .agenda-item-title {
          font-family: ${T.font.sans}; font-size: 14px; font-weight: 600;
          line-height: 1.4; color: var(--text-primary);
        }
        .agenda-note {
          font-family: ${T.font.sans}; font-size: 12px; line-height: 1.55;
          color: var(--text-tertiary); text-wrap: pretty;
        }
        .agenda-go {
          align-self: center; flex-shrink: 0;
          height: 30px; padding: 0 14px; border-radius: 100px;
          border: 1px solid var(--border-default); background: var(--bg-elevated);
          color: var(--text-secondary);
          font-family: ${T.font.sans}; font-size: 12px; font-weight: 700;
          white-space: nowrap; cursor: pointer;
          transition: border-color .16s ${T.ease.standard}, color .16s ${T.ease.standard};
        }
        .agenda-go:hover { border-color: var(--accent); color: var(--accent); }
        .agenda-go:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
        .agenda-more {
          display: block; width: 100%; text-align: left;
          padding: 12px 18px; border: none; border-top: 1px solid var(--border-subtle);
          background: transparent; cursor: pointer;
          font-family: ${T.font.sans}; font-size: 12px; font-weight: 600;
          color: var(--text-secondary);
          transition: color .16s ${T.ease.standard}, background .16s ${T.ease.standard};
        }
        .agenda-more:hover { color: var(--text-primary); background: var(--bg-hover); }

        /* Η ΓΡΑΜΜΗ ΑΠΑΝΤΑ ΣΤΟΝ ΔΕΙΚΤΗ. Μόνο το κουμπί «πήγαινε» άλλαζε όψη,
           οπότε ολόκληρη η λίστα διαβαζόταν ως τυπωμένο χαρτί. Μία απόχρωση
           κάτω από τη γραμμή λέει ότι εδώ γίνονται πράγματα. Σε αφή δεν
           εφαρμόζεται: εκεί δεν υπάρχει δείκτης να αιωρείται. */
        .agenda-row { transition: background .16s ${T.ease.standard}; }
        @media (hover: hover) {
          .agenda-row:hover { background: var(--bg-hover); }
        }

        @media (max-width: 620px) {
          /* Σε στενή οθόνη η στήλη των 72px θα έστριβε τους τίτλους σε τέσσερις
             λέξεις ανά γραμμή. Ο χρόνος ανεβαίνει πάνω, οριζόντια. */
          .agenda-row { grid-template-columns: minmax(0, 1fr) auto; gap: 10px; }
          .agenda-when {
            grid-column: 1 / -1; flex-direction: row; align-items: baseline;
            gap: 6px; text-align: left;
          }
          .agenda-num { font-size: 15px; }
          .agenda-unit { margin-top: 0; font-size: 11px; }
        }
      `}</style>
    </div>
  );
}

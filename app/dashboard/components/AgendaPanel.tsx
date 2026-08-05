'use client';

// ═══════════════════════════════════════════════════════════════════════════
// ΤΙ ΧΡΕΙΑΖΕΤΑΙ ΤΩΡΑ — μία λίστα, στη θέση τεσσάρων.
// ─────────────────────────────────────────────────────────────────────────
// Αντικαθιστά, στην αρχική οθόνη, το InsightsBoard, το ObligationsPanel και τη
// «Ρύθμιση ακινήτου» — τρεις κάρτες που έλεγαν εν μέρει τα ΙΔΙΑ πράγματα με
// διαφορετικά λόγια (η λήξη μίσθωσης εμφανιζόταν τέσσερις φορές). Η συγχώνευση
// γίνεται στο `lib/home/agenda.ts`, με έλεγχο· εδώ μένει μόνο η εμφάνιση.
//
// ΜΙΑ ΓΡΑΜΜΗ = ΜΙΑ ΔΟΥΛΕΙΑ. Τίτλος, πότε, και πού πατάς. Η εξήγηση ανοίγει με
// κλικ αντί να καταλαμβάνει χώρο σε όλες τις γραμμές ταυτόχρονα: με τέσσερις
// ανοιχτές παραγράφους η λίστα έπαυε να διαβάζεται σε πέντε δευτερόλεπτα.
//
// ΚΑΜΙΑ ΧΡΩΜΑΤΙΚΗ ΚΩΔΙΚΟΠΟΙΗΣΗ. Το επείγον είναι Η ΣΕΙΡΑ και η λέξη («3 ημέρες
// πίσω»), όχι κόκκινη κουκκίδα. Ο μετρητής στην κεφαλίδα λέει πόσα έχουν ήδη
// περάσει την προθεσμία τους.
// ═══════════════════════════════════════════════════════════════════════════

import { useState } from 'react';
import { T, SecHdr, EmptyState } from '@/components/Theme';
import { CircleCheckBig } from 'lucide-react';
import { dueLabel, overdueCount, type AgendaItem } from '@/lib/home/agenda';

export default function AgendaPanel({ items, total, onNavigate }: {
  items: AgendaItem[];
  /** Πόσα υπάρχουν συνολικά — η λίστα δείχνει τα πρώτα. */
  total: number;
  onNavigate: (tab: string) => void;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const late = overdueCount(items);

  return (
    <>
      <SecHdr
        label="Τι χρειάζεται τώρα"
        sub={items.length === 0 ? 'Τίποτα δεν εκκρεμεί' : late > 0 ? `${late} ${late === 1 ? 'έχει περάσει την προθεσμία του' : 'έχουν περάσει την προθεσμία τους'}` : 'Σε σειρά προθεσμίας'}
      />
      <div className="card" style={{ marginBottom: 20, padding: items.length ? '4px 0' : undefined }}>
        {items.length === 0 ? (
          <EmptyState icon={<CircleCheckBig size={20} />} title="Είσαι εντάξει"
            hint="Δεν υπάρχει προθεσμία που να πλησιάζει ούτε εκκρεμότητα που να ζητά ενέργεια." />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {items.map((it, i) => {
              const when = dueLabel(it.daysLeft);
              const expanded = open === it.key;
              return (
                <div key={it.key} style={{ borderTop: i === 0 ? 'none' : '1px solid var(--border-subtle)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 18px' }}>
                    <button
                      type="button"
                      onClick={() => setOpen(o => (o === it.key ? null : it.key))}
                      aria-expanded={expanded}
                      style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap',
                               background: 'transparent', border: 'none', padding: 0, textAlign: 'left', cursor: 'pointer' }}
                    >
                      <span style={{ fontFamily: T.font.sans, fontSize: 13.5, fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.4 }}>
                        {it.title}
                      </span>
                      {when && (
                        <span style={{ fontFamily: T.font.sans, fontSize: 11.5, color: 'var(--text-tertiary)', whiteSpace: 'nowrap' }}>
                          {when}
                        </span>
                      )}
                    </button>
                    {it.action && (
                      <button
                        type="button"
                        onClick={() => onNavigate(it.action!.tab)}
                        style={{ flexShrink: 0, height: 28, padding: '0 12px', borderRadius: 100,
                                 border: '1px solid var(--border-default)', background: 'transparent',
                                 color: 'var(--text-secondary)', fontFamily: T.font.sans, fontSize: 11.5,
                                 fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}
                        onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-hover)'; e.currentTarget.style.color = 'var(--text-primary)'; }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-secondary)'; }}
                      >{it.action.label}</button>
                    )}
                  </div>
                  {expanded && it.note && (
                    <div style={{ padding: '0 18px 14px', fontFamily: T.font.sans, fontSize: 12.5,
                                  color: 'var(--text-secondary)', lineHeight: 1.6, maxWidth: 680 }}>
                      {it.note}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
      {/* Το υπόλοιπο της λίστας ΔΕΝ ξαναγράφεται εδώ: ζει στις «Εκκρεμότητες»,
          που είναι η καρτέλα του. Η αρχική δείχνει τα πρώτα και λέει πόσα μένουν. */}
      {total > items.length && (
        <div style={{ marginTop: -12, marginBottom: 20 }}>
          <button type="button" onClick={() => onNavigate('checklist')}
            style={{ background: 'transparent', border: 'none', padding: 0, cursor: 'pointer',
                     fontFamily: T.font.sans, fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}
            onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-primary)'; }}
            onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-secondary)'; }}>
            Δες και τα υπόλοιπα {total - items.length} →
          </button>
        </div>
      )}
    </>
  );
}

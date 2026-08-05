'use client';

// ═══════════════════════════════════════════════════════════════════════════
// ΡΥΘΜΙΣΗ ΑΚΙΝΗΤΟΥ — ΜΙΑ ΓΡΑΜΜΗ ΠΟΥ ΠΕΡΙΜΕΝΕΙ, ΟΧΙ ΜΙΑ ΚΑΡΤΑ ΠΟΥ ΦΩΝΑΖΕΙ
// ─────────────────────────────────────────────────────────────────────────
// ΤΙ ΑΛΛΑΞΕ ΚΑΙ ΓΙΑΤΙ
//
// 1. ΞΕΚΙΝΑ ΠΑΝΤΑ ΜΑΖΕΜΕΝΗ. Πριν άνοιγε ολόκληρη σε κάθε νέο ακίνητο και
//    έσπρωχνε κάτω από το πτυσσόμενο τα νούμερα για τα οποία μπήκε ο χρήστης.
//    Η ρύθμιση είναι δουλειά μιας φοράς· η οικονομική εικόνα είναι ο λόγος που
//    ανοίγει κανείς την εφαρμογή κάθε μέρα. Ό,τι ανοίγει από μόνο του πρέπει να
//    το δικαιολογεί, και αυτό δεν το δικαιολογούσε.
//
// 2. ΧΩΡΙΣ ΕΝΤΟΝΟ ΠΕΡΙΓΡΑΜΜΑ. Φορούσε `accent-border` + `accent-soft`, δηλαδή
//    το ίδιο χρωματικό βάρος με τα σφάλματα και τις προθεσμίες. Μια λίστα
//    εργασιών που δεν επείγει δεν δικαιούται τον τόνο του επείγοντος — αλλιώς
//    ο τόνος παύει να σημαίνει κάτι όταν χρειαστεί πραγματικά.
//
// 3. ΙΕΡΑΡΧΗΣΗ, ΟΧΙ ΣΕΙΡΑ ΓΡΑΨΙΜΑΤΟΣ. Τα βήματα εμφανίζονταν με τη σειρά που
//    τυχαίνει να είναι γραμμένα στον πίνακα. Τώρα μπροστά πάει ό,τι έχει
//    ΠΡΟΘΕΣΜΙΑ που πλησιάζει, μετά ό,τι ξεκλειδώνει τα περισσότερα, και τελευταία
//    τα προαιρετικά. Ό,τι έγινε φεύγει από τη μέση.
// ═══════════════════════════════════════════════════════════════════════════

import { useState } from 'react';
import { T } from '@/components/Theme';
import { daysUntil } from '@/lib/core/time';

export interface SetupStep {
  key: string; label: string; hint: string; done: boolean; nav: string;
  /** Πόσο ξεκλειδώνει αυτό το βήμα. 1 = χωρίς αυτό δεν δουλεύει τίποτα άλλο. */
  weight?: number;
  /** Προθεσμία (YYYY-MM-DD) όπου υπάρχει — π.χ. δήλωση μίσθωσης. */
  due?: string | null;
}

/**
 * Η σειρά που θα διάλεγε ο ίδιος ο ιδιοκτήτης αν ήξερε τι ξεκλειδώνει το καθένα:
 * πρώτα οι προθεσμίες (και πρώτα οι πιο κοντινές), μετά η βαρύτητα, και μόνο
 * τελευταία η αλφαβητική σειρά ώστε το αποτέλεσμα να είναι σταθερό ανάμεσα σε
 * δύο φορτώσεις — μια λίστα που αναδιατάσσεται μόνη της δεν εμπιστεύεται κανείς.
 */
export function orderSteps(steps: SetupStep[], now = new Date()): SetupStep[] {
  const rank = (s: SetupStep) => {
    const d = s.due ? daysUntil(s.due, now) : null;
    // Ληξιπρόθεσμο ή μέσα στον μήνα → μπροστά από όλα, με τη σειρά της προθεσμίας.
    if (d != null && d <= 30) return [0, d] as const;
    return [1, -(s.weight ?? 0)] as const;
  };
  return [...steps].sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1;   // ό,τι έγινε, στο τέλος
    const [ga, va] = rank(a), [gb, vb] = rank(b);
    return ga !== gb ? ga - gb : va !== vb ? va - vb : a.key.localeCompare(b.key);
  });
}

export default function OnboardingChecklist({ propertyId, steps, onNavigate }: {
  propertyId: string; steps: SetupStep[]; onNavigate: (tab: string) => void;
}) {
  const openKey = `pos-onboarding-open-${propertyId}`;
  // ΤΟ ΚΛΕΙΔΙ ΑΝΤΙΣΤΡΑΦΗΚΕ. Ήταν «θυμήσου ότι το μάζεψε»· τώρα «θυμήσου ότι το
  // άνοιξε». Έτσι η προεπιλογή είναι μαζεμένη χωρίς να χαθεί η επιλογή όποιου
  // το θέλει ανοιχτό.
  const [open, setOpen] = useState(() => { try { return !!localStorage.getItem(openKey); } catch { return false; } });

  const ordered = orderSteps(steps);
  const doneCount = ordered.filter(s => s.done).length;
  if (doneCount === ordered.length) return null;   // ολοκληρώθηκε → φεύγει μόνο του

  const setOpenPersist = (v: boolean) => {
    try { v ? localStorage.setItem(openKey, '1') : localStorage.removeItem(openKey); } catch {}
    setOpen(v);
  };
  const pct = Math.round((doneCount / ordered.length) * 100);
  const next = ordered.find(s => !s.done);

  return (
    <div style={{ marginBottom: 16, border: '1px solid var(--border-subtle)', borderRadius: 14, background: 'var(--bg-surface)', overflow: 'hidden' }}>
      {/* Η γραμμή-τίτλος είναι ΠΑΝΤΑ ορατή και λέει το επόμενο βήμα ονομαστικά.
          Ένα «3 από 6» χωρίς το «τι ακολουθεί» ζητά από τον χρήστη να ανοίξει
          για να μάθει — δηλαδή ένα κλικ για μια πληροφορία που χωρούσε εδώ. */}
      <button onClick={() => setOpenPersist(!open)} aria-expanded={open}
        style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '11px 14px', border: 'none', background: 'transparent', cursor: 'pointer', textAlign: 'left', fontFamily: T.font.sans }}>
        <div style={{ position: 'relative', width: 24, height: 24, flexShrink: 0 }}>
          <svg width={24} height={24} viewBox="0 0 24 24" style={{ transform: 'rotate(-90deg)' }}>
            <circle cx="12" cy="12" r="10" fill="none" stroke="var(--border-subtle)" strokeWidth="2.5" />
            <circle cx="12" cy="12" r="10" fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round" strokeDasharray={`${(pct / 100) * 62.8} 62.8`} />
          </svg>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)' }}>
            Ρύθμιση ακινήτου · {doneCount}/{ordered.length}
          </div>
          {next && <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Επόμενο: {next.label}</div>}
        </div>
        <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}><path d="m6 9 6 6 6-6" /></svg>
      </button>

      {open && (
        <div style={{ padding: '0 14px 14px', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {ordered.map(s => {
            const d = s.due ? daysUntil(s.due) : null;
            const urgent = !s.done && d != null && d <= 30;
            return (
              <button key={s.key} onClick={() => !s.done && onNavigate(s.nav)} className="po-onbstep" data-done={s.done ? 'true' : 'false'}
                style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '9px 11px', borderRadius: 10, border: '1px solid var(--border-subtle)', background: 'var(--bg-elevated)', cursor: s.done ? 'default' : 'pointer', textAlign: 'left', width: '100%' }}>
                <span style={{ width: 18, height: 18, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: s.done ? 'var(--positive)' : 'transparent', border: s.done ? 'none' : '1.5px solid var(--border-default)' }}>
                  {s.done && <svg width={10} height={10} viewBox="0 0 24 24" fill="none" stroke="var(--on-tone)" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: T.font.sans, fontSize: 12.5, fontWeight: 600, color: 'var(--text-primary)', opacity: s.done ? 0.5 : 1, textDecoration: s.done ? 'line-through' : 'none' }}>{s.label}</div>
                  {!s.done && <div style={{ fontFamily: T.font.sans, fontSize: 10.5, color: 'var(--text-tertiary)', marginTop: 1 }}>{s.hint}</div>}
                </div>
                {urgent && (
                  <span style={{ flexShrink: 0, fontSize: 9.5, fontWeight: 700, fontFamily: T.font.sans, color: d! < 0 ? 'var(--negative)' : 'var(--warning)', whiteSpace: 'nowrap' }}>
                    {d! < 0 ? 'έληξε' : d === 0 ? 'σήμερα' : `σε ${d} ημ.`}
                  </span>
                )}
                {!s.done && !urgent && <svg className="po-onbstep-chev" width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><path d="m9 18 6-6-6-6" /></svg>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

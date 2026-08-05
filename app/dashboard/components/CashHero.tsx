'use client';

// ═══════════════════════════════════════════════════════════════════════════
// ΤΟ ΤΑΜΕΙΟ — η πρώτη ματιά στην αρχική οθόνη του ακινήτου.
// ─────────────────────────────────────────────────────────────────────────
// Δύο αριθμοί, ίδιο μέγεθος, δίπλα-δίπλα: «μου χρωστάνε» και «χρωστάω». Είναι ο
// λόγος που ο ιδιοκτήτης ανοίγει την εφαρμογή, και μέχρι τώρα δεν υπήρχε πουθενά
// — η οθόνη άνοιγε με «Μεικτή απόδοση 4,2%», νούμερο που δεν αλλάζει και δεν
// ζητά τίποτα.
//
// ΓΙΑΤΙ ΚΑΝΕΝΑ ΧΡΩΜΑ
// Το «χρωστάω 400 €» ΔΕΝ είναι κακό — είναι ο ΕΝΦΙΑ, και πληρώνεται. Το κόκκινο
// θα το έκανε συναγερμό δώδεκα μήνες τον χρόνο, ώσπου να πάψει να σημαίνει
// οτιδήποτε. Η ιεραρχία εδώ είναι μέγεθος, θέση και κενό: ο αριθμός μεγάλος, η
// ετικέτα μικρή από πάνω, η εξήγηση μικρή από κάτω. Οι τόνοι μπαίνουν μόνο στην
// αλληλεπίδραση (hover), όπως παντού στο υπόλοιπο app.
//
// ΤΑ ΔΥΟ ΔΕΝ ΑΘΡΟΙΖΟΝΤΑΙ. Δεν υπάρχει «καθαρή θέση»: το ενοίκιο του Ιουλίου δεν
// πληρώνει τον ΕΝΦΙΑ, και ένα ακίνητο με 700 € να μπαίνουν και 700 € να βγαίνουν
// δεν είναι «στο μηδέν» — έχει δύο ανοιχτά μέτωπα.
// ═══════════════════════════════════════════════════════════════════════════

import { T, fe } from '@/components/Theme';
import { cashSideNote, type CashPosition, type CashSide } from '@/lib/home/cash';

function Side({ label, side, kind, onOpen, actionLabel }: {
  label: string; side: CashSide; kind: 'in' | 'out';
  onOpen: () => void; actionLabel: string;
}) {
  const note = cashSideNote(side, kind);
  return (
    <button
      type="button"
      onClick={onOpen}
      title={actionLabel}
      style={{
        display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-start',
        flex: '1 1 220px', minWidth: 0, padding: '18px 20px',
        background: 'transparent', border: 'none', borderRadius: T.radius.inner,
        textAlign: 'left', cursor: 'pointer', transition: 'background 0.15s',
      }}
      onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-hover)'; }}
      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
    >
      <span style={{
        fontFamily: T.font.sans, fontSize: 10.5, fontWeight: 700, letterSpacing: '0.08em',
        textTransform: 'uppercase', color: 'var(--text-tertiary)',
      }}>{label}</span>
      {/* Ο αριθμός κλιμακώνεται με το πλάτος του ΠΛΑΙΣΙΟΥ (container query), ώστε
          σε στενή οθόνη να μη σπάει σε δεύτερη γραμμή ούτε να ξεχειλίζει. */}
      <span className="cash-figure" style={{
        fontFamily: T.font.num, fontWeight: 700, color: 'var(--text-primary)',
        fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em', lineHeight: 1.05,
        maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis',
      }}>{fe(Math.round(side.total))}</span>
      <span style={{
        fontFamily: T.font.sans, fontSize: 11.5, color: 'var(--text-secondary)', lineHeight: 1.45,
      }}>{note}</span>
    </button>
  );
}

export default function CashHero({ cash, showIncome, onNavigate }: {
  cash: CashPosition;
  /**
   * Εκμισθώνεται το ακίνητο; ΣΕ ΚΕΝΟ Ή ΙΔΙΟΧΡΗΣΙΑ ΔΕΝ ΥΠΑΡΧΕΙ «ΜΟΥ ΧΡΩΣΤΑΝΕ».
   * Το «0 € · τίποτα σε καθυστέρηση» δεν είναι πληροφορία εκεί: είναι μια
   * ερώτηση που δεν τίθεται, να καταλαμβάνει τη μισή κορυφή της οθόνης. Όταν
   * λείπει, το «Χρωστάω» παίρνει όλο το πλάτος — που είναι και η αλήθεια:
   * ένα ακίνητο χωρίς έσοδο έχει μόνο κόστη.
   */
  showIncome: boolean;
  onNavigate: (tab: string) => void;
}) {
  return (
    <div className="card cash-hero" style={{ padding: 0, marginBottom: 20 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'stretch' }}>
        {showIncome && (
          <>
            <Side label="Μου χρωστάνε" side={cash.owedToMe} kind="in"
                  actionLabel="Άνοιγμα στον Ενοικιαστή" onOpen={() => onNavigate('tenant')} />
            {/* Ο διαχωριστής είναι η δήλωση ότι τα δύο ΔΕΝ αθροίζονται. */}
            <div aria-hidden style={{ width: 1, background: 'var(--border-subtle)', alignSelf: 'stretch', margin: '14px 0' }} />
          </>
        )}
        <Side label="Χρωστάω" side={cash.owedByMe} kind="out"
              actionLabel="Άνοιγμα στις Δαπάνες" onOpen={() => onNavigate('finances')} />
      </div>
    </div>
  );
}

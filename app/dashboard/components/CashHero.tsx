'use client';

// ═══════════════════════════════════════════════════════════════════════════
// ΤΟ ΤΑΜΕΙΟ — η πρώτη ματιά στην αρχική οθόνη του ακινήτου.
// ─────────────────────────────────────────────────────────────────────────
// Δύο αριθμοί, ίδιο μέγεθος, δίπλα-δίπλα: «μου χρωστάνε» και «χρωστάω». Είναι ο
// λόγος που ο ιδιοκτήτης ανοίγει την εφαρμογή και μέχρι τώρα δεν υπήρχε πουθενά
// — η οθόνη άνοιγε με «Μεικτή απόδοση 4,2%», νούμερο που δεν αλλάζει και δεν
// ζητά τίποτα.
//
// ΓΙΑΤΙ ΚΑΝΕΝΑ ΧΡΩΜΑ
// Το «χρωστάω 400 €» ΔΕΝ είναι κακό — είναι ο ΕΝΦΙΑ και πληρώνεται. Το κόκκινο
// θα το έκανε συναγερμό δώδεκα μήνες τον χρόνο, ώσπου να πάψει να σημαίνει
// οτιδήποτε. Η ιεραρχία εδώ είναι μέγεθος, θέση και κενό: ο αριθμός μεγάλος, η
// ετικέτα μικρή από πάνω, η εξήγηση μικρή από κάτω. Οι τόνοι μπαίνουν μόνο στην
// αλληλεπίδραση (hover), όπως παντού στο υπόλοιπο app.
//
// ΤΑ ΔΥΟ ΔΕΝ ΑΘΡΟΙΖΟΝΤΑΙ. Δεν υπάρχει «καθαρή θέση»: το ενοίκιο του Ιουλίου δεν
// πληρώνει τον ΕΝΦΙΑ και ένα ακίνητο με 700 € να μπαίνουν και 700 € να βγαίνουν
// δεν είναι «στο μηδέν» — έχει δύο ανοιχτά μέτωπα.
// ═══════════════════════════════════════════════════════════════════════════

import type { ReactNode } from 'react';
import { T, fe, Btn } from '@/components/Theme';
import { cashSideNote, type CashPosition, type CashSide } from '@/lib/home/cash';

function Side({ label, side, kind, onOpen, actionLabel, action }: {
  label: string; side: CashSide; kind: 'in' | 'out';
  onOpen: () => void; actionLabel: string;
  /**
   * Η ΕΝΕΡΓΕΙΑ ΕΙΝΑΙ ΑΔΕΛΦΟΣ ΤΟΥ ΑΡΙΘΜΟΥ, ΟΧΙ ΠΑΙΔΙ ΤΟΥ. Ολόκληρη η πλευρά
   * ήταν ένα κουμπί που πλοηγούσε· ένα δεύτερο κουμπί μέσα του δεν είναι
   * έγκυρο HTML και δίνει δύο ενέργειες στο ίδιο πάτημα. Ο αριθμός κρατά τη
   * δική του επιφάνεια, η ενέργεια παίρνει τη δική της από κάτω.
   */
  action?: ReactNode;
}) {
  const note = cashSideNote(side, kind);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: '1 1 220px', minWidth: 0 }}>
    <button
      type="button"
      onClick={onOpen}
      title={actionLabel}
      style={{
        display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-start',
        width: '100%', minWidth: 0, padding: action ? '18px 20px 12px' : '18px 20px',
        background: 'transparent', border: 'none', borderRadius: T.radius.inner,
        textAlign: 'left', cursor: 'pointer', transition: 'background 0.15s',
      }}
      onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-hover)'; }}
      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
    >
      <span style={{
        fontFamily: T.font.sans, fontSize: 11, fontWeight: 700, letterSpacing: '0.08em',
        textTransform: 'uppercase', color: 'var(--text-tertiary)',
      }}>{label}</span>
      {/* Ο αριθμός κλιμακώνεται με το πλάτος του ΠΛΑΙΣΙΟΥ (container query), ώστε
          σε στενή οθόνη να μη σπάει σε δεύτερη γραμμή ούτε να ξεχειλίζει.

          ΧΩΡΙΣ Math.round. Είχε μείνει από τότε που τα ακέραια ποσά γράφονταν
          χωρίς υποδιαστολή. Από τη στιγμή που το `fe` βάζει πάντα δύο δεκαδικά,
          το στρογγυλεμένο ποσό τυπωνόταν σαν να ήταν ακριβές: 97,45 € γινόταν
          «97,00 €», ενώ η γραμμή ακριβώς από κάτω έλεγε «84,55 € ληξιπρόθεσμα».
          Δύο ασυμβίβαστα νούμερα, στο ΠΡΩΤΟ πράγμα που βλέπει ο ιδιοκτήτης. */}
      <span className="cash-figure" style={{
        fontFamily: T.font.num, fontWeight: 700, color: 'var(--text-primary)',
        fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em', lineHeight: 1.05,
        maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis',
      }}>{fe(side.total)}</span>
      <span style={{
        fontFamily: T.font.sans, fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.45,
      }}>{note}</span>
    </button>
    {action && <div style={{ padding: '0 20px 18px' }}>{action}</div>}
    </div>
  );
}

export default function CashHero({ cash, showIncome, onNavigate, onRecordRent }: {
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
  /**
   * Η ΕΙΣΠΡΑΞΗ ΓΙΝΕΤΑΙ ΕΔΩ, ΟΧΙ ΤΡΕΙΣ ΟΘΟΝΕΣ ΠΙΟ ΠΕΡΑ. Η κάρτα ήξερε ήδη ποια
   * δόση χρωστιέται και το έλεγε με ποσό και ημέρες· η μόνη ενέργεια που
   * πρόσφερε ήταν να στείλει τον ιδιοκτήτη να την ξαναβρεί μόνος του.
   * `null` όταν καμία ληξιπρόθεσμη γραμμή δεν αντιστοιχεί σε δόση: κουμπί που
   * δεν έχει τι να γράψει δεν εμφανίζεται.
   */
  onRecordRent: (() => void) | null;
}) {
  return (
    <div className="card cash-hero" style={{ padding: 0, marginBottom: 20 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'stretch' }}>
        {showIncome && (
          <>
            <Side label="Μου χρωστάνε" side={cash.owedToMe} kind="in"
                  actionLabel="Άνοιγμα στον Ενοικιαστή" onOpen={() => onNavigate('tenant')}
                  action={onRecordRent && <Btn onClick={onRecordRent}>Μπήκε το ενοίκιο</Btn>} />
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

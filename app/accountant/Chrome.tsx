'use client';
// ═══════════════════════════════════════════════════════════════════════════
// Η ΠΥΛΗ ΤΟΥ ΛΟΓΙΣΤΗ ΕΧΕΙ ΕΝΑ ΠΕΡΙΓΡΑΜΜΑ, ΟΧΙ ΔΥΟ
// ─────────────────────────────────────────────────────────────────────────
// ΔΥΟ ΟΘΟΝΕΣ, ΕΝΑΣ ΑΝΘΡΩΠΟΣ, ΔΥΟ ΣΧΕΔΙΑ. Η κατάσταση ενός πελάτη
// (/accountant/[token]) είχε μπάρα με σήμα και τίτλο, πλάτος 760 και επιλογέα
// που έγραφε σκέτο «2025». Ο χώρος με όλους τους πελάτες (/accountant/workspace)
// δεν είχε μπάρα καθόλου, είχε πλάτος 960 και ο ίδιος επιλογέας έγραφε
// «Χρήση 2025». Ο λογιστής πηγαίνει από τη μία στην άλλη με ένα κλικ και
// νομίζει ότι άλλαξε προϊόν.
//
// ΚΑΙ ΔΥΟ ΟΝΟΜΑΤΑ: «Πύλη λογιστή» εδώ, «Χώρος λογιστή» εκεί. Το προϊόν έχει
// ΕΝΑ όνομα για αυτόν τον χώρο και είναι «Πύλη λογιστή». Ο,τι αλλάζει από
// σελίδα σε σελίδα είναι ο τίτλος του εγγράφου, όχι το όνομα του σπιτιού.
// ═══════════════════════════════════════════════════════════════════════════
import type { ReactNode } from 'react';
import BrandMark from '@/components/BrandMark';
import { T } from '@/components/Theme';
import { CustomSelect } from '@/app/dashboard/components/UIComponents';

/** Ενα πλάτος για τις δύο οθόνες του λογιστή. */
export const portalWrap: React.CSSProperties = {
  maxWidth: 880, margin: '0 auto', padding: '0 clamp(16px,5vw,24px)',
};

export const PORTAL_NAME = 'Πύλη λογιστή';

/** Πόσες χρήσεις πίσω προσφέρονται. Η φορολογική παραγραφή είναι πενταετής. */
const YEARS_BACK = 5;

export function portalYears(): number[] {
  const now = new Date().getFullYear();
  return Array.from({ length: YEARS_BACK }, (_, i) => now - i);
}

/**
 * Η μπάρα και των δύο οθόνων: σήμα, όνομα χώρου, επιλογή χρήσης.
 *
 * Ο ΕΠΙΛΟΓΕΑΣ ΛΕΕΙ «ΧΡΗΣΗ». Σκέτο «2025» δίπλα σε έγγραφο που έχει κι άλλες
 * χρονολογίες επάνω του (ημερομηνία έκδοσης, ημερομηνίες δαπανών) δεν λέει τι
 * αλλάζει αν το πειράξεις.
 */
export function PortalBar({ year, onYear, back }: {
  year?: number;
  onYear?: (y: number) => void;
  /** Πού γυρνά ο άνθρωπος από εδώ. Λείπει όταν δεν υπάρχει πουθενά να γυρίσει. */
  back?: { href: string; label: string };
}) {
  return (
    <header style={{ borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-surface)' }}>
      <div style={{ ...portalWrap, minHeight: 64, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          {/* Η ΕΞΟΔΟΣ ΠΡΩΤΗ, ΑΡΙΣΤΕΡΑ ΤΟΥ ΣΗΜΑΤΟΣ. Η κατάσταση ενός πελάτη
              ανοίγει σε δική της διεύθυνση και δεν είχε ΚΑΜΙΑ επιστροφή: ο
              λογιστής που ερχόταν από τη λίστα των πελατών του έμενε εκεί, με
              μόνο δρόμο το βελάκι του περιηγητή ή έναν σύνδεσμο θαμμένο στο
              υποσέλιδο. Το ύψος είναι 44, όσο θέλει ένα δάχτυλο. */}
          {back && (
            <a href={back.href} aria-label={back.label} style={{
              display: 'inline-flex', alignItems: 'center', gap: 8, height: 44, padding: '0 12px 0 8px',
              marginLeft: -8, borderRadius: T.radius.btn, color: 'var(--text-secondary)',
              textDecoration: 'none', fontSize: 13, fontWeight: 600, fontFamily: T.font.sans, whiteSpace: 'nowrap',
            }}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M19 12H5" /><path d="M12 19l-7-7 7-7" />
              </svg>
              {back.label}
            </a>
          )}
          <BrandMark />
          <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', fontFamily: T.font.sans, whiteSpace: 'nowrap' }}>
            {PORTAL_NAME}
          </span>
        </div>
        {year !== undefined && onYear && (
          <div style={{ minWidth: 138 }}>
            <CustomSelect value={String(year)} onChange={v => onYear(parseInt(v, 10))}
              options={portalYears().map(y => ({ value: String(y), label: `Χρήση ${y}` }))} />
          </div>
        )}
      </div>
    </header>
  );
}

/** Ο τίτλος του εγγράφου: πού είσαι, τι κοιτάς, από πότε ισχύει. */
export function PortalTitle({ over, title, meta, right }: {
  over: string; title: string; meta?: ReactNode; right?: ReactNode;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap', margin: '28px 0 22px' }}>
      <div style={{ minWidth: 0 }}>
        <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-tertiary)', margin: 0, fontFamily: T.font.sans }}>
          {over}
        </p>
        <h1 style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.4px', margin: '6px 0 0', color: 'var(--text-primary)', fontFamily: T.font.sans }}>
          {title}
        </h1>
        {meta && (
          <p style={{ fontSize: 12, color: 'var(--text-tertiary)', margin: '7px 0 0', lineHeight: 1.6, fontFamily: T.font.sans }}>
            {meta}
          </p>
        )}
      </div>
      {right}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// «ΟΛΑ ΗΡΘΑΝ, ΟΠΩΣ ΚΑΘΕ ΜΗΝΑ» — ΓΙΑ ΟΛΟ ΤΟ ΧΑΡΤΟΦΥΛΑΚΙΟ, ΜΕ ΕΝΑ ΠΑΤΗΜΑ
// ─────────────────────────────────────────────────────────────────────────
// Στις αρχές του μήνα μπαίνουν τα εμβάσματα. Οποιος έχει πέντε ακίνητα άνοιγε
// πέντε φορές το ίδιο ακίνητο, βρήκε πέντε φορές την ίδια δόση και πάτησε
// πέντε φορές το ίδιο κουμπί — για μια ενέργεια που είναι ΜΙΑ: «ήρθαν όλα».
//
// ── ΤΙ ΜΠΑΙΝΕΙ ΣΤΗ ΛΙΣΤΑ, ΚΑΙ ΓΙΑΤΙ ΟΧΙ ΤΟ ΙΔΙΟ ΜΕ ΤΗΝ ΚΑΡΤΑ ────────────
// Η κάρτα «Μου χρωστάνε» δείχνει ΜΟΝΟ ό,τι έχει ΞΕΠΕΡΑΣΕΙ την προθεσμία του:
// το ενοίκιο που λήγει σήμερα δεν είναι οφειλή, και ένας μετρητής που το μετρά
// δείχνει μόνιμα ένα ενοίκιο παραπάνω.
//
// ΕΔΩ Η ΕΡΩΤΗΣΗ ΕΙΝΑΙ ΑΛΛΗ: «τι μπορώ να καταχωρήσω σήμερα». Το ενοίκιο που
// λήγει ΣΗΜΕΡΑ και μόλις μπήκε στον λογαριασμό είναι ακριβώς αυτό. Γι' αυτό το
// όριο είναι «λήγει ώς και σήμερα», ενώ της κάρτας είναι «έληξε».
//
// ── ΤΙ ΔΕΝ ΜΠΑΙΝΕΙ ─────────────────────────────────────────────────────
// Δόσεις χωρίς ημερομηνία λήξης (δεν ξέρουμε αν ήρθε η ώρα τους), με μηδενικό
// ποσό, ή ήδη εισπραγμένες. Και ΤΙΠΟΤΑ του επόμενου μήνα: μια προεξόφληση
// γράφεται εκεί όπου συζητιέται, στον Ενοικιαστή.
// ═══════════════════════════════════════════════════════════════════════════

import { MONTHS_GEN } from '@/lib/core/months';
import type { CashLine } from '@/lib/home/cash';

/** Η δόση όπως έρχεται από τη βάση, με το ακίνητο και τη μίσθωσή της. */
export interface CollectableRent {
  id: string;
  property_id?: string | null;
  tenant_id?: string | null;
  amount?: number | null;
  due_date?: string | null;
  paid?: boolean | null;
  period_year?: number | null;
  period_month?: number | null;
}

/** Πόσες ημέρες πίσω είναι η δόση. Θετικό ποτέ: μπαίνουν μόνο όσες έληξαν. */
const daysBack = (due: string, today: string): number => {
  const a = Date.UTC(+due.slice(0, 4), +due.slice(5, 7) - 1, +due.slice(8, 10));
  const b = Date.UTC(+today.slice(0, 4), +today.slice(5, 7) - 1, +today.slice(8, 10));
  return Math.round((a - b) / 86_400_000);
};

const isDay = (v: unknown): v is string => /^\d{4}-\d{2}-\d{2}$/.test(String(v ?? ''));

/**
 * Οι δόσεις που μπορούν να καταχωρηθούν σήμερα, αρχαιότερη πρώτη.
 *
 * @param rows   Οι δόσεις όλων των ακινήτων.
 * @param nameOf Το όνομα του ακινήτου. Μπαίνει στην ετικέτα ΜΟΝΟ όταν τα
 *               ακίνητα είναι πολλά: με ένα, το «Αλεξάνδρας 12» σε κάθε γραμμή
 *               λέει δεκαπέντε φορές αυτό που λέει ήδη η κεφαλίδα.
 * @param today  Σήμερα σε ελληνική ώρα, «YYYY-MM-DD».
 */
export function collectableLines(
  rows: readonly CollectableRent[], nameOf: (propertyId: string) => string, today: string,
): CashLine[] {
  const many = new Set(rows.map(r => r.property_id || '')).size > 1;
  const lines: CashLine[] = [];
  for (const r of rows) {
    if (r.paid) continue;
    const amount = Number(r.amount) || 0;
    if (amount <= 0) continue;
    if (!isDay(r.due_date)) continue;
    const daysLeft = daysBack(String(r.due_date), today);
    if (daysLeft > 0) continue;
    const m = r.period_month;
    const period = m && m >= 1 && m <= 12
      ? `Ενοίκιο ${MONTHS_GEN[m - 1]}${r.period_year ? ` ${r.period_year}` : ''}`
      : 'Ενοίκιο';
    const name = many && r.property_id ? nameOf(r.property_id) : '';
    lines.push({
      label: name ? `${name} · ${period}` : period,
      amount,
      due: String(r.due_date),
      daysLeft,
      rent: {
        id: r.id, year: r.period_year ?? null, month: r.period_month ?? null,
        propertyId: r.property_id ?? null, tenantId: r.tenant_id ?? null,
      },
    });
  }
  // Αρχαιότερη πρώτη: η ίδια σειρά πίεσης με την κάρτα, ώστε μια καταχώρηση που
  // κόπηκε στη μέση να αφήνει ανοιχτές τις νεότερες και όχι τις παλιές.
  return lines.sort((a, b) => (a.daysLeft ?? 0) - (b.daysLeft ?? 0) || b.amount - a.amount);
}

/**
 * Συμφωνούν ΟΛΕΣ οι μισθώσεις της λίστας σε είσπραξη μέσω τραπέζης;
 *
 * ΓΙΑΤΙ «ΟΛΕΣ» ΚΑΙ ΟΧΙ «ΟΙ ΠΕΡΙΣΣΟΤΕΡΕΣ». Ο τρόπος είσπραξης αλλάζει τον φόρο:
 * από 1/1/2026 (ν.5246/2025) η τεκμαρτή έκπτωση 5% προϋποθέτει τραπεζικό ή
 * ηλεκτρονικό μέσο. Μια προεπιλογή «τράπεζα» επειδή έτσι είναι οι τρεις στις
 * πέντε θα ήταν η ΚΕΡΔΟΦΟΡΑ εκδοχή, γραμμένη χωρίς να το ξέρει ο ιδιοκτήτης.
 */
export function allViaBank(
  lines: readonly CashLine[], viaBank: (tenantId: string) => boolean,
): boolean {
  const ids = lines.map(l => l.rent?.tenantId).filter((t): t is string => !!t);
  return ids.length > 0 && ids.every(viaBank);
}

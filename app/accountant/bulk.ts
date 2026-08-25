// ═══════════════════════════════════════════════════════════════════════════
// ΟΛΟΙ ΟΙ ΠΕΛΑΤΕΣ ΜΑΖΙ: ΤΑ ΠΟΣΑ ΤΟΥΣ ΚΑΙ ΤΑ ΑΡΧΕΙΑ ΤΟΥΣ
// ─────────────────────────────────────────────────────────────────────────
// ΓΙΑΤΙ ΔΕΝ ΥΠΟΛΟΓΙΖΟΝΤΑΙ ΣΤΗ ΒΑΣΗ. Το έσοδο ενός ακινήτου δεν είναι άθροισμα
// στηλών: το ωμό `total` μιας διαμονής είναι άλλοτε ακαθάριστο και άλλοτε
// payout, ανάλογα με το `amount_basis`· το δηλωτέο ακαθάριστο βγαίνει μετά
// την αφαίρεση του τέλους ανθεκτικότητας, που δεν είναι έσοδο. Ο κανόνας ζει
// στο app/accountant/statement.ts, δοκιμασμένος. Μια δεύτερη γραφή του σε SQL
// θα έδινε δύο νούμερα για το ίδιο πράγμα και θα απέκλιναν την πρώτη φορά που
// άλλαζε ο ένας από τους δύο.
//
// Αρα η λίστα ζητά τις ΙΔΙΕΣ καταστάσεις που θα διάβαζε ο λογιστής ανοίγοντας
// τους πελάτες έναν έναν, περασμένες από τον ίδιο υπολογισμό.
//
// ΚΑΙ ΓΙΑΤΙ ΜΟΝΟ ΟΤΑΝ ΤΟ ΖΗΤΗΣΕΙ. Είναι ένα αίτημα ανά πελάτη. Ο λογιστής με
// ογδόντα πελάτες δεν πληρώνει ογδόντα αιτήματα κάθε φορά που ανοίγει τη
// λίστα: τα πληρώνει όταν πατήσει «Δείξε ποσά» ή «Κατέβασε τα όλα».
// ═══════════════════════════════════════════════════════════════════════════
import type { SupabaseClient } from '@supabase/supabase-js';
import { buildZip, type ZipFile } from '@/lib/accounting/zip';
import { downloadFile, safeFilename } from '@/lib/core/download';
import {
  propertyLines, statementTotals, statementSheets, type PortalData, type PropertyLine,
} from './statement';

/** Η κατάσταση ενός πελάτη, όπως τη διαβάζει και η σελίδα του. */
export interface ClientStatement {
  ownerId: string;
  owner: string;
  lines: PropertyLine[];
  income: number;
  expenses: number;
  /** Καμία καταχώρηση: το μηδέν εδώ δεν είναι υπολογισμός, είναι απουσία. */
  hasEntries: boolean;
}

/**
 * ΠΟΣΑ ΑΙΤΗΜΑΤΑ ΤΡΕΧΟΥΝ ΜΑΖΙ.
 *
 * Τέσσερα: αρκετά για να μη σέρνεται μια λίστα ογδόντα πελατών, λίγα για να μη
 * μοιάζει η μαζική λήψη με επίθεση στη δική μας βάση.
 */
const LANES = 4;

async function inLanes<T, R>(items: readonly T[], fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(LANES, items.length) }, async () => {
    for (let i = next++; i < items.length; i = next++) out[i] = await fn(items[i]);
  }));
  return out;
}

export interface BulkClient { ownerId: string; name: string; token: string | null }

/**
 * Οι καταστάσεις όλων των πελατών για μια χρήση.
 *
 * ΟΠΟΙΟΣ ΔΕΝ ΑΠΑΝΤΗΣΕ ΛΕΙΠΕΙ, ΔΕΝ ΜΗΔΕΝΙΖΕΤΑΙ. Ενας πελάτης του οποίου ο
 * σύνδεσμος ανακλήθηκε ή η κλήση απέτυχε δεν πρέπει να εμφανιστεί με «0,00 €»:
 * το μηδέν διαβάζεται ως μέτρηση.
 */
export async function loadStatements(
  db: SupabaseClient, clients: readonly BulkClient[], year: number,
): Promise<Map<string, ClientStatement>> {
  const withToken = clients.filter(c => c.token);
  const results = await inLanes(withToken, async (c) => {
    const { data, error } = await db.rpc('get_accountant_data', { p_token: c.token, p_year: year });
    if (error || !data) return null;
    const d = data as PortalData;
    const lines = propertyLines(d.properties || []);
    const totals = statementTotals(lines);
    return {
      ownerId: c.ownerId,
      owner: d.owner || c.name,
      lines,
      income: totals.income,
      expenses: totals.expenses,
      hasEntries: totals.hasEntries,
    } as ClientStatement;
  });
  const map = new Map<string, ClientStatement>();
  for (const r of results) if (r) map.set(r.ownerId, r);
  return map;
}

/** Το όνομα του βιβλίου ενός πελάτη μέσα στον φάκελο. */
export const bookName = (owner: string, year: number) =>
  `${safeFilename(`Κατάσταση χρήσης ${year} ${owner}`)}.xlsx`;

/**
 * Κατεβάζει έναν φάκελο με ΕΝΑ βιβλίο ανά πελάτη.
 *
 * ΓΙΑΤΙ ΧΩΡΙΣΤΑ ΑΡΧΕΙΑ ΚΑΙ ΟΧΙ ΕΝΑ ΒΙΒΛΙΟ ΜΕ ΦΥΛΛΑ. Ο λογιστής αρχειοθετεί ανά
 * πελάτη: ένα βιβλίο με ογδόντα φύλλα θα έπρεπε να το σπάσει μόνος του, ένα
 * αρχείο τη φορά, για να το βάλει στον φάκελο του καθενός.
 *
 * @returns πόσα βιβλία μπήκαν. Μηδέν όταν δεν υπήρχε τίποτα να κατέβει.
 */
export async function downloadAll(
  statements: readonly ClientStatement[], year: number, issued: string,
): Promise<number> {
  if (!statements.length) return 0;
  // Η βιβλιοθήκη του Excel φορτώνεται ΜΕ ΤΟ ΠΑΤΗΜΑ. Είναι 2,5 MB και ο λογιστής
  // που μπαίνει για να δει ποιον να κυνηγήσει δεν την ανοίγει ποτέ.
  const { xlsxBytes } = await import('@/app/dashboard/components/sheets');
  const files: ZipFile[] = [];
  for (const s of statements) {
    files.push({
      path: bookName(s.owner, year),
      data: await xlsxBytes(statementSheets({ owner: s.owner, year, issued, lines: s.lines })),
    });
  }
  downloadFile(new Blob([buildZip(files).slice().buffer], { type: 'application/zip' }),
    `${safeFilename(`Καταστάσεις πελατών ${year}`)}.zip`);
  return files.length;
}

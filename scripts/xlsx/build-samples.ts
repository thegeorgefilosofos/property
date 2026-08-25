// ═══════════════════════════════════════════════════════════════════════════
// ΚΑΘΕ ΒΙΒΛΙΟ ΠΟΥ ΒΓΑΖΕΙ Η ΕΦΑΡΜΟΓΗ, ΓΡΑΜΜΕΝΟ ΣΤΟΝ ΔΙΣΚΟ
// ─────────────────────────────────────────────────────────────────────────
// ΓΙΑΤΙ ΥΠΑΡΧΕΙ. Ο έλεγχος «ανοίγει σε κάθε πρόγραμμα;» δεν γίνεται με το μάτι
// σε ένα αρχείο: γίνεται σε ΟΛΑ, κάθε φορά. Οι έξι οικογένειες εξαγωγής
// καλούνται εδώ όπως ακριβώς τις καλεί η διεπαφή, με το πλαστό έγγραφο των
// σουιτών να πιάνει τα byte που θα κατέβαιναν στον χρήστη. Γράφονται σε φάκελο
// ώστε να τα ανοίξει μετά κάθε πρόγραμμα ανάγνωσης.
//
// ΤΑ ΔΕΔΟΜΕΝΑ ΕΙΝΑΙ ΕΛΛΗΝΙΚΑ ΚΑΙ ΓΕΜΑΤΑ. Ενα άδειο βιβλίο ανοίγει παντού: η
// αξία του ελέγχου είναι στα πραγματικά λεκτικά, στα ποσά με κόμμα και στους
// τόνους, που είναι ακριβώς ό,τι σπάει σε λάθος κωδικοποίηση.
// ═══════════════════════════════════════════════════════════════════════════
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { captureDownloads } from '@/lib/core/downloadCapture.testkit';
import { requirementsFor } from '@/lib/accounting/dossier';

const OUT = process.argv[2] || 'tmp/xlsx-samples';

async function main() {
  const caught = captureDownloads();

  // Οι εισαγωγές γίνονται ΜΕΤΑ το πλαστό έγγραφο: αρθρώματα με 'use client'
  // αγγίζουν το `document` τη στιγμή που φορτώνονται.
  const { downloadXlsx } = await import('@/app/dashboard/components/exportXlsx');
  const { downloadJournalWorkbook } = await import('@/app/dashboard/components/journalXlsx');
  const { downloadPortfolioComparison } = await import('@/app/dashboard/components/portfolioXlsx');
  const { exportPricingWorkbook } = await import('@/app/dashboard/components/pricingExport');
  const { runE2Export } = await import('@/app/dashboard/components/e2Export');
  const { exportAccountantBundle } = await import('@/app/dashboard/components/accountantExport');

  // ── 1. Ο απλός πίνακας: ό,τι κατεβάζει κάθε καρτέλα ─────────────────────
  downloadXlsx('Πίνακας εισπράξεων', [{
    name: 'Εισπράξεις',
    title: 'ΕΙΣΠΡΑΞΕΙΣ ΑΝΑ ΜΗΝΑ',
    subtitle: 'Ερμού 12, Αθήνα · Εκδοση 25/08/2026 · PROPERWISE',
    columns: [
      { header: 'Μήνας', kind: 'text' },
      { header: 'Αναμενόμενα', kind: 'eur' },
      { header: 'Εισπραχθέντα', kind: 'eur' },
      { header: 'Ποσοστό', kind: 'pct' },
    ],
    rows: [
      ['Ιανουάριος', 800, 800, 100],
      ['Φεβρουάριος', 800, 800, 100],
      ['Μάρτιος', 800, 650, 81.25],
      ['Απρίλιος', 800, 0, 0],
    ],
    totals: ['ΣΥΝΟΛΑ', 3200, 2250, 70.31],
    notes: ['Τα ποσά είναι όπως καταχωρίστηκαν στην εφαρμογή.'],
  }] as never);

  // ── 2. Το λογιστικό ημερολόγιο: τρία φύλλα ──────────────────────────────
  downloadJournalWorkbook({
    periodLabel: 'Μάρτιος 2026',
    entityName: 'Γεώργιος Παπαδόπουλος',
    year: 2026, month: 3,
    lines: [
      { date: '2026-03-01', code: '38.03', account: 'Καταθέσεις όψεως', description: 'Είσπραξη ενοικίου Μαρτίου', property: 'Ερμού 12', debit: 800, credit: 0, doc: 'ΑΠΥ 145' },
      { date: '2026-03-01', code: '71.00', account: 'Εσοδα από μισθώματα', description: 'Είσπραξη ενοικίου Μαρτίου', property: 'Ερμού 12', debit: 0, credit: 800, doc: 'ΑΠΥ 145' },
      { date: '2026-03-11', code: '62.03', account: 'Ηλεκτρικό ρεύμα', description: 'ΔΕΗ, Φεβρουάριος', property: 'Ερμού 12', debit: 88.5, credit: 0, doc: 'ΤΠΥ 9912' },
      { date: '2026-03-11', code: '38.03', account: 'Καταθέσεις όψεως', description: 'ΔΕΗ, Φεβρουάριος', property: 'Ερμού 12', debit: 0, credit: 88.5, doc: 'ΤΠΥ 9912' },
    ] as never,
  });

  // ── 3. Το συγκριτικό χαρτοφυλακίου ──────────────────────────────────────
  downloadPortfolioComparison({
    periodLabel: '2026',
    rows: [
      { name: 'Ερμού 12, Αθήνα', expected: 9600, collected: 8800, expenses: 1240.5 },
      { name: 'Κολωνάκι, 3ος όροφος', expected: 14400, collected: 14400, expenses: 2310 },
      { name: 'Θεσσαλονίκη, Τσιμισκή 4', expected: 7200, collected: 5400, expenses: 890.25 },
    ],
  } as never);

  // ── 4. Η δυναμική τιμολόγηση: τρία φύλλα ────────────────────────────────
  const days = Array.from({ length: 40 }, (_, i) => {
    const d = new Date(Date.UTC(2026, 6, 1 + i));
    const iso = d.toISOString().slice(0, 10);
    const dow = d.getUTCDay();
    return {
      date: iso, dow, season: 'peak' as never, isWeekend: dow === 0 || dow === 6,
      price: 95 + (dow === 0 || dow === 6 ? 25 : 0), booked: i % 3 === 0,
    };
  });
  exportPricingWorkbook({
    propName: 'Παραλία Νάξου, μεζονέτα',
    year: 2026,
    settings: { base: 95, min: 70, max: 180, weekendPremiumPct: 25, minStay: 2 },
    summary: { avg: 103.5, min: 95, max: 120, peakCount: 40, bookedCount: 14 },
    occupancy: { pct: 35, nights: 14 },
    realizedAdr: 101.4,
    rows: days as never,
  });

  // ── 5. Το έντυπο Ε2: τέσσερα φύλλα, από πλαστή βάση ─────────────────────
  const PID = '11111111-1111-1111-1111-111111111111';
  const YEAR = 2025;
  const data: Record<string, unknown[]> = {
    user_properties: [{
      id: PID, atak: '12345678901', address: 'Ερμού 12, Αθήνα', postal_code: '10563',
      ownership: '100', prop_type: 'apartment', status_detail: 'rented', rental_mode: 'long_term',
      target_rent: 800, sqm: 78, floor: '2',
    }],
    tenants: [{
      property_id: PID, afm: '123456789', full_name: 'Μαρία Ιωάννου', monthly_rent: 800,
      lease_start: '2025-01-01', lease_end: '2027-12-31', lease_type: 'residential', created_at: '2025-01-01',
    }],
    rent_payments: Array.from({ length: 12 }, (_, i) => ({ property_id: PID, amount: 800, period_year: YEAR, period_month: i + 1 })),
    property_settings: [{ property_id: PID, owner_afm: '987654321' }],
    client_stays: [],
  };
  const client = {
    from(table: string) {
      const rows = data[table] ?? [];
      const chain: Record<string, unknown> = {};
      for (const m of ['select', 'eq', 'in', 'is', 'order', 'not', 'limit', 'gte', 'lte']) chain[m] = () => chain;
      (chain as { then: unknown }).then = (res: (v: unknown) => void) => res({ data: rows, error: null });
      return chain;
    },
  } as never;
  await runE2Export(client, 'user-1', YEAR);

  // ── 6. Ο φάκελος του λογιστή: ΟΛΑ τα φύλλα, το βαρύτερο βιβλίο ──────────
  //
  // ΤΑ ΠΡΟΑΙΡΕΤΙΚΑ ΦΥΛΛΑ ΔΙΝΟΝΤΑΙ ΟΛΑ. Τέσσερα από τα εννέα φύλλα υπάρχουν μόνο
  // όταν το ζητά η είσοδος: το μητρώο παγίων θέλει `assets`, τα τρία του myDATA
  // θέλουν `myData` και τα τρία του φακέλου θέλουν `dossier`. Με λιτή είσοδο ο
  // έλεγχος θα κοίταζε τρία φύλλα και θα έλεγε «όλα καλά» για εννέα.
  exportAccountantBundle({
    year: 2026, propName: 'Διαμέρισμα Αθήνα', ownerName: 'Γεώργιος Παπαδόπουλος', ownerAfm: '094014201',
    statementLines: [
      { label: 'Ακαθάριστα έσοδα', amount: 9600, kind: 'subtotal' },
      { label: 'Δαπάνες', amount: 1240.5, kind: 'line', negative: true },
      { label: 'Αποτέλεσμα χρήσης', amount: 8359.5, kind: 'result' },
    ],
    provisionMonthly: 116.1,
    myData: { vat: 'none' },
    buildingFraction: 0.8,
    assets: [
      { name: 'Διαμέρισμα Ερμού 12', elp: '11', cost: 180000, acquired: '2019-05-10', land: 36000, rate: 0.04, source: 'Ακίνητο' },
      { name: 'Κλιματιστικό σαλονιού', elp: '14', cost: 780, acquired: '2024-07-01', rate: 0.1, source: 'Δαπάνη' },
      { name: 'Αντικατάσταση θερμοσίφωνα', elp: '11', cost: 420, acquired: null, rate: null, source: 'Δαπάνη', candidate: true },
    ],
    dossier: {
      requirements: requirementsFor({ form: 'individual', books: 'none', year: 2026, hasShortTerm: true, hasLongTerm: true } as never),
      haveIds: [], gaps: ['Καμία δαπάνη κοινοχρήστων για το 2026.'],
      readinessMessage: 'Λείπουν τρία δικαιολογητικά πριν φύγει ο φάκελος.',
      formLabel: 'Φυσικό πρόσωπο', booksLabel: 'Χωρίς βιβλία',
      properties: [
        { name: 'Ερμού 12, Αθήνα', status: 'Εκμισθωμένο, μακροχρόνια' },
        { name: 'Παραλία Νάξου, μεζονέτα', status: 'Βραχυχρόνια μίσθωση' },
      ],
    },
    book: [
      { date: '2026-03-04', type: 'income', category: 'Ενοίκια', description: 'Ενοίκιο Μαρτίου', amount: 650 },
      { date: '2026-03-11', type: 'expense', category: 'Ρεύμα', description: 'ΔΕΗ, Φεβρουάριος', amount: 88.5,
        supplier_country: 'GR', supply: 'domestic', supplier_afm: '094014201' },
      { date: '2026-04-02', type: 'expense', category: 'Συνδρομές', description: 'Microsoft 365, Personal', amount: 6.99,
        supplier_country: 'IE', supply: 'intra_eu', supplier_afm: '094014201' },
      { date: '2026-05-20', type: 'expense', category: 'Επισκευές', description: 'Αντικατάσταση θερμοσίφωνα', amount: 420 },
    ],
  } as never);

  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });
  const manifest = caught.map(f => {
    writeFileSync(join(OUT, f.name), f.bytes);
    return { name: f.name, bytes: f.bytes.length };
  });
  if (!manifest.length) { console.error('κανένα αρχείο δεν παρήχθη'); process.exit(1); }
  console.log(JSON.stringify(manifest));
}

main().catch(e => { console.error(e); process.exit(1); });

// ═══════════════════════════════════════════════════════════════════════════
// Η ΑΝΑΓΝΩΣΗ ΤΟΥ ΜΗΤΡΩΟΥ, ΠΑΝΩ ΣΤΗΝ ΠΡΑΓΜΑΤΙΚΗ ΑΠΑΝΤΗΣΗ
// ─────────────────────────────────────────────────────────────────────────
// Το `fixtures/eprel-washingmachines2019-2516037.json` είναι η απάντηση που
// επέστρεψε το μητρώο για ένα υπαρκτό πλυντήριο Amica. Δεν είναι φτιαγμένο
// δείγμα: είναι το σχήμα που θα δεχτεί η εφαρμογή στην πράξη.
//
// ΤΟ ΣΗΜΑΝΤΙΚΟΤΕΡΟ ΠΟΥ ΚΛΕΙΔΩΝΕΤΑΙ: τι ΔΕΝ συμπληρώνεται. Ένα πεδίο που γέμισε
// με εικασία φαίνεται ακριβώς ίδιο με ένα πεδίο που ήρθε από τον κατασκευαστή.
// ═══════════════════════════════════════════════════════════════════════════
import { readFileSync } from 'node:fs'
import {
  parseEprelRef, readEprel, warrantyExpiry, eprelApiUrl, eprelPageUrl,
} from './eprel'

let passed = 0, failed = 0
function ok(name: string, cond: boolean) { if (cond) { passed++ } else { failed++; console.log('  ✗ ' + name) } }

const REAL = JSON.parse(
  readFileSync(new URL('./fixtures/eprel-washingmachines2019-2516037.json', import.meta.url), 'utf8'),
)

// ── Η ΤΑΥΤΟΤΗΤΑ ΑΠΟ Ο,ΤΙ ΚΙ ΑΝ ΕΠΙΚΟΛΛΗΘΕΙ ────────────────────────────────
{
  const want = { productGroup: 'washingmachines2019', registrationId: '2516037' }
  const inputs = [
    'https://eprel.ec.europa.eu/screen/product/washingmachines2019/2516037',
    'https://eprel.ec.europa.eu/api/products/washingmachines2019/2516037',
    'https://eprel.ec.europa.eu/screen/product/washingmachines2019/2516037?lang=el',
    '  washingmachines2019/2516037  ',
  ]
  ok('ο σύνδεσμος του QR, το API και τα σκέτα κομμάτια δίνουν την ίδια ταυτότητα',
     inputs.every(i => JSON.stringify(parseEprelRef(i)) === JSON.stringify(want)))

  // Ο ίδιος αριθμός υπάρχει σε πολλές ομάδες προϊόντων: χωρίς την ομάδα θα
  // φέρναμε άλλη συσκευή, με σιγουριά.
  ok('σκέτος αριθμός δεν αρκεί', parseEprelRef('2516037') === null)
  ok('άσχετο κείμενο δεν δίνει ταυτότητα', parseEprelRef('το πλυντήριο της κουζίνας') === null)

  ok('η διεύθυνση της σελίδας χτίζεται',
     eprelPageUrl(want) === 'https://eprel.ec.europa.eu/screen/product/washingmachines2019/2516037')
  ok('και η διεύθυνση του μητρώου',
     eprelApiUrl(want) === 'https://eprel.ec.europa.eu/api/products/washingmachines2019/2516037')
}

// ── Η ΠΡΑΓΜΑΤΙΚΗ ΑΠΑΝΤΗΣΗ ─────────────────────────────────────────────────
{
  const r = readEprel(REAL)
  ok('η απάντηση διαβάζεται', r.ok)
  if (r.ok) {
    ok('μάρκα Amica', r.fill.brand === 'Amica')
    ok('μοντέλο DWA10C14ALiSR9', r.fill.model === 'DWA10C14ALiSR9')
    ok('ενεργειακή κλάση A', r.fill.energy_class === 'A')
    ok('εγγύηση 24 μήνες', r.fill.guarantee_months === 24)

    // Ο τρόπος βγαίνει από την ετικέτα, όχι από την κατηγορία που διάλεξε ο
    // χρήστης: η ετικέτα δηλώνει κύκλους, άρα κύκλοι.
    ok('τρόπος κατανάλωσης: κύκλοι', r.fill.energy_mode === 'cycles')
    ok('35 kWh ανά 100 κύκλους, όπως τα δηλώνει ο κατασκευαστής', r.fill.kwh_per_100_cycles === 35)
    ok('χωρίς ετήσια κατανάλωση, γιατί δεν τη δηλώνει', r.fill.annual_kwh === undefined)

    ok('η ταυτότητα επιβεβαιώνεται από την ίδια την απάντηση',
       r.ref.productGroup === 'washingmachines2019' && r.ref.registrationId === '2516037')
  }
}

// ── ΟΣΑ ΔΕΝ ΜΕΤΑΦΕΡΟΝΤΑΙ, ΚΑΙ ΓΙΑΤΙ ───────────────────────────────────────
// Η απάντηση φέρνει και χωρητικότητα, στροφές, θόρυβο, νερό και διαστάσεις. Η
// απογραφή δεν έχει πεδία γι' αυτά· θα κατέληγαν σε ελεύθερο κείμενο, δηλαδή σε
// δεδομένα που κανείς δεν μπορεί να υπολογίσει και κανείς δεν συντηρεί.
{
  const keys = Object.keys(readEprel(REAL).ok ? (readEprel(REAL) as { fill: object }).fill : {})
  ok('μεταφέρονται μόνο όσα έχουν θέση στην απογραφή', keys.length === 6)
}

// ── ΠΟΤΕ ΑΡΝΕΙΤΑΙ ─────────────────────────────────────────────────────────
{
  ok('χωρίς απάντηση, άρνηση', !readEprel(null).ok)
  ok('κείμενο αντί για αντικείμενο, άρνηση', !readEprel('<html>').ok)
  ok('χωρίς ομάδα και αριθμό, άρνηση', !readEprel({ energyClass: 'A' }).ok)
  ok('καταχώριση χωρίς κανένα χρήσιμο πεδίο, άρνηση',
     !readEprel({ productGroup: 'ovens', eprelRegistrationNumber: '1', noise: 44 }).ok)

  // Μηδενικά και αρνητικά διαβάζονται ως κενά: μια συσκευή δεν καταναλώνει μηδέν.
  const zero = readEprel({ ...REAL, energyConsPer100Cycle: 0 })
  ok('μηδενική κατανάλωση δεν συμπληρώνει τρόπο',
     zero.ok && zero.fill.energy_mode === undefined && zero.fill.brand === 'Amica')
}

// ── Η ΛΗΞΗ ΤΗΣ ΕΓΓΥΗΣΗΣ ───────────────────────────────────────────────────
// Μετριέται από την αγορά. Χωρίς ημερομηνία αγοράς δεν υπάρχει λήξη: μια
// ημερομηνία μετρημένη από το σήμερα θα ήταν επινοημένη.
{
  ok('24 μήνες από την αγορά', warrantyExpiry('2026-08-11', 24) === '2028-08-11')
  ok('12 μήνες γυρίζουν τη χρονιά', warrantyExpiry('2026-12-31', 12) === '2027-12-31')
  // 31 Ιανουαρίου συν έναν μήνα: ο Φεβρουάριος δεν έχει 31.
  ok('ο μήνας που δεν χωρά την ημέρα πάει στην τελευταία του',
     warrantyExpiry('2026-01-31', 1) === '2026-02-28')
  ok('χωρίς ημερομηνία αγοράς, τίποτα', warrantyExpiry(null, 24) === null)
  ok('χωρίς μήνες, τίποτα', warrantyExpiry('2026-08-11', undefined) === null)
  ok('με άκυρη ημερομηνία, τίποτα', warrantyExpiry('11/08/2026', 24) === null)
}

console.log(`property/eprel.test.ts: ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)

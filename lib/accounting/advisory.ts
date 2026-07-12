// ═══════════════════════════════════════════════════════════════════════════
// Συμβουλευτική ακινήτων, καθαρή, με ΑΞΙΑ, βασισμένη στα ΠΡΑΓΜΑΤΙΚΑ δεδομένα.
// Παράγει έναν ΜΙΚΡΟ, επιλεγμένο αριθμό υψηλής αξίας προτάσεων (όχι σούπερμάρκετ
// από κουμπάκια). Κάθε πρόταση είναι επαγγελματική και ΠΑΝΤΑ παραπέμπει σε
// πιστοποιημένο λογιστή / δικηγόρο / συμβολαιογράφο για την επίσημη εξαγωγή
// συμπερασμάτων, δεν υποκαθιστά κανέναν.
//
// Καθαρές συναρτήσεις, χωρίς I/O. Οι κανόνες φορολογίας αλλάζουν· τα ποσά
// επιβεβαιώνονται στην ΑΑΔΕ / λογιστή (κάθε πρόταση το λέει).
// ═══════════════════════════════════════════════════════════════════════════

import { marginalRate, RENTAL_TAX_BRACKETS_2026, BUSINESS_INCOME_BRACKETS_2026 } from '@/lib/billing/greekTax'

export type TaxRegime = 'individual_longterm' | 'individual_shortterm' | 'business'
export type AdvisoryTone = 'opportunity' | 'insight' | 'action' | 'caution'
export type ReferProfessional = 'accountant' | 'lawyer' | 'notary' | 'bank'

export interface AdvisoryInput {
  regime: TaxRegime
  businessForm?: 'sole' | 'company'
  /** Ηλικία, για τη μειωμένη κλίμακα νέων (ν.5246/2025). */
  age?: number | null
  grossIncome: number
  taxableIncome: number
  effectiveRate: number
  /** 'long_term' | 'short_term' | 'self_use' | άλλο. */
  rentalMode?: string | null
  sqm?: number | null
  propertyCount: number
  hasLoan: boolean
  loanInterestYear?: number
  deductibleExpenses?: number
}

export interface AdvisoryItem {
  id: string
  tone: AdvisoryTone
  title: string
  body: string
  /** Σε ποιον πιστοποιημένο επαγγελματία να απευθυνθεί για την επίσημη ανάλυση. */
  refer?: ReferProfessional
  linkLabel?: string
  linkHref?: string
}

const REFER_LABEL: Record<ReferProfessional, string> = {
  accountant: 'Συζήτησέ το με τον λογιστή σου',
  lawyer: 'Ζήτησε νομική γνώμη (δικηγόρος)',
  notary: 'Απευθύνσου σε συμβολαιογράφο',
  bank: 'Δες με την τράπεζα / σύμβουλο δανείων',
}
export const referLabel = (r?: ReferProfessional): string | undefined => (r ? REFER_LABEL[r] : undefined)

const eur = (n: number) => Math.round(n).toLocaleString('el-GR') + ' €'

// Επίσημες πηγές (σταθερές, δημόσιες), για να ανοίγει ο χρήστης το επίσημο σημείο.
const SRC = {
  aade: 'https://www.aade.gr',
  spitiMou: 'https://www.gov.gr/ipiresies/periousia-kai-phorologia/akineta/programma-spiti-mou',
  exoikonomo: 'https://exoikonomo.gov.gr',
  ktimatologio: 'https://www.ktimatologio.gr',
}

/**
 * Παράγει τις προτάσεις συμβουλευτικής, ταξινομημένες κατά προτεραιότητα/αξία.
 * Επιστρέφει το πολύ ~6 (οι πιο σχετικές πρώτες), καθαρά, όχι θόρυβος.
 */
export function buildAdvisory(input: AdvisoryInput, limit = 6): AdvisoryItem[] {
  const items: AdvisoryItem[] = []
  const longterm = input.regime === 'individual_longterm'
  const shortterm = input.regime === 'individual_shortterm'
  const business = input.regime === 'business'
  const age = input.age && input.age > 0 ? input.age : null

  // 1) Μειωμένη κλίμακα νέων (μόνο επιχειρηματική δραστηριότητα, όχι παθητικά ενοίκια).
  if (age != null && age <= 30) {
    if (business) {
      const rate = age <= 25 ? '0% έως 20.000 €' : '9% έως 20.000 €'
      items.push({
        id: 'youth-business', tone: 'opportunity',
        title: `Μειωμένη κλίμακα νέων, ${age <= 25 ? 'έως 25' : '26–30'} ετών`,
        body: `Ως ${age <= 25 ? 'έως 25' : '26–30'} ετών με επιχειρηματική δραστηριότητα (ατομική επιχείρηση, άρθρο 15), φορολογείσαι με ${rate} (ν.5246/2025). Ο υπολογισμός εδώ ήδη το εφαρμόζει, για την οριστική εκκαθάριση χρειάζεται δήλωση με τη σωστή ηλικιακή ένδειξη.`,
        refer: 'accountant',
      })
    } else {
      items.push({
        id: 'youth-not-rent', tone: 'insight',
        title: 'Η ελάφρυνση νέων ΔΕΝ αφορά τα ενοίκια',
        body: `Η μειωμένη κλίμακα νέων (0% έως 25, 9% για 26–30) ισχύει για εισόδημα από μισθωτή εργασία και επιχειρηματική δραστηριότητα, ΟΧΙ για παθητικά ενοίκια, που φορολογούνται με τη δική τους κλίμακα ακινήτων (15/25/35/45), ανεξαρτήτως ηλικίας. Αν αξιοποιείς ακίνητα επαγγελματικά (π.χ. μεσιτικό, οργανωμένη βραχυχρόνια με υπηρεσίες), τότε μπαίνεις στην κλίμακα άρθρου 15 και δικαιούσαι την ελάφρυνση.`,
        refer: 'accountant',
      })
    }
  }

  // 2) Απαλλαγή 3ετίας: κλειστό/βραχυχρόνιο → μακροχρόνια μίσθωση (κίνητρο 2024+).
  if (shortterm || input.rentalMode === 'self_use' || input.rentalMode === 'closed') {
    items.push({
      id: 'longterm-exemption', tone: 'opportunity',
      title: 'Απαλλαγή φόρου ενοικίου έως 3 έτη',
      body: `Κατοικίες που ήταν κλειστές ή σε βραχυχρόνια και μετατρέπονται σε μακροχρόνια μίσθωση μπορεί να απαλλάσσονται από φόρο εισοδήματος ενοικίου για έως τρία έτη (κίνητρο στέγασης, με προϋποθέσεις εμβαδού/χρόνου). Αν σε ενδιαφέρει σταθερότερο εισόδημα με χαμηλό ρίσκο, αξίζει σύγκριση καθαρού βραχυχρόνιας vs. απαλλασσόμενης μακροχρόνιας.`,
      refer: 'accountant', linkLabel: 'Όροι στην ΑΑΔΕ', linkHref: SRC.aade,
    })
  }

  // 3) Έκπτωση φόρου δαπανών ανακαίνισης/ενεργειακής αναβάθμισης (40%).
  items.push({
    id: 'renovation-credit', tone: 'action',
    title: 'Ανακαίνιση & αναβάθμιση, έκπτωση φόρου 40%',
    body: `Δαπάνες ενεργειακής, λειτουργικής και αισθητικής αναβάθμισης κτιρίων εκπίπτουν από τον φόρο εισοδήματος κατά 40%, ισόποσα σε βάθος ετών, με ανώτατο όριο και με προϋπόθεση ηλεκτρονικής πληρωμής και παραστατικών. Κράτα τιμολόγια και εξοφλήσεις μέσω τραπέζης/κάρτας, εδώ μπορείς να τα καταχωρείς ως έξοδα ανά ακίνητο.`,
    refer: 'accountant',
  })

  // 4) Πρόγραμμα «Εξοικονομώ» για ενεργειακή αναβάθμιση (επιδότηση).
  if (longterm || shortterm || input.rentalMode === 'self_use') {
    items.push({
      id: 'exoikonomo', tone: 'opportunity',
      title: 'Πρόγραμμα «Εξοικονομώ», επιδότηση αναβάθμισης',
      body: `Για ενεργειακή αναβάθμιση (κουφώματα, μόνωση, θέρμανση, φωτοβολταϊκά) το «Εξοικονομώ» επιδοτεί μέρος της δαπάνης ανάλογα με εισοδηματικά κριτήρια. Ανεβάζει την ενεργειακή κλάση, μειώνει λογαριασμούς και αυξάνει την αξία/ενοίκιο του ακινήτου.`,
      linkLabel: 'exoikonomo.gov.gr', linkHref: SRC.exoikonomo,
    })
  }

  // 5) Δάνειο: Σπίτι μου ΙΙ / επισκευαστικό, ανάλογα με προφίλ.
  if (!input.hasLoan) {
    items.push({
      id: 'loan-idea', tone: 'insight',
      title: 'Χρηματοδότηση: «Σπίτι μου ΙΙ» & επισκευαστικά',
      body: `Για αγορά πρώτης κατοικίας (νέοι/νέα ζευγάρια) το «Σπίτι μου ΙΙ» δίνει άτοκο ή χαμηλότοκο τμήμα δανείου με κριτήρια. Για ανακαίνιση υπάρχουν επισκευαστικά/«Ανακαινίζω-Νοικιάζω». Στο εργαλείο Δάνεια βλέπεις επιλεξιμότητα και σύγκριση δόσης πριν πας στην τράπεζα.`,
      refer: 'bank', linkLabel: 'Πρόγραμμα Σπίτι μου', linkHref: SRC.spitiMou,
    })
  } else if ((input.loanInterestYear ?? 0) > 0 && !business) {
    items.push({
      id: 'loan-interest-nondeduct', tone: 'caution',
      title: 'Οι τόκοι δανείου δεν εκπίπτουν ως ιδιώτης',
      body: `Για φυσικό πρόσωπο με ενοίκια, οι τόκοι στεγαστικού ΔΕΝ μειώνουν τη φορολογητέα βάση, μειώνουν μόνο το ταμείο. Αν το χαρτοφυλάκιο μεγαλώνει, η επιχειρηματική δομή (όπου τόκοι & αποσβέσεις εκπίπτουν) μπορεί να αλλάξει την εικόνα. Χρειάζεται προσεκτική σύγκριση.`,
      refer: 'accountant',
    })
  }

  // 6) Δομή δραστηριότητας: ατομική vs νομικό πρόσωπο (holding) / μεσιτικό.
  const highActivity = input.propertyCount >= 3 || input.grossIncome >= 30000 || shortterm
  if (highActivity && !business) {
    items.push({
      id: 'structure', tone: 'insight',
      title: 'Δομή αξιοποίησης: ιδιώτης, ατομική ή εταιρεία;',
      body: `Με ${input.propertyCount} ακίνητα και έσοδα ${eur(input.grossIncome)}, αξίζει να εξεταστεί αν συμφέρει να παραμείνεις ιδιώτης (κλίμακα ενοικίων), να ανοίξεις ατομική επιχείρηση (κλίμακα άρθρου 15, έκπτωση εξόδων/αποσβέσεων/τόκων) ή νομικό πρόσωπο / holding (σταθερό 22% + διανομή). Καθένα έχει διαφορετικό φόρο, ασφαλιστικές εισφορές, κόστος και ευθύνη. Δεν υπάρχει «σωστό» χωρίς την πλήρη εικόνα.`,
      refer: 'accountant',
    })
  } else if (business && input.businessForm === 'sole' && input.taxableIncome >= 40000) {
    items.push({
      id: 'structure-company', tone: 'insight',
      title: 'Ατομική vs νομικό πρόσωπο σε υψηλά κέρδη',
      body: `Με καθαρά κέρδη ${eur(input.taxableIncome)}, η ατομική επιχείρηση μπαίνει στα υψηλά κλιμάκια (έως 44%), ενώ ένα νομικό πρόσωπο (π.χ. ΙΚΕ) φορολογείται με 22%, με κόστος διανομής μερίσματος και λειτουργίας. Πάνω από ένα όριο κερδών η εταιρική μορφή συχνά συμφέρει· η ισορροπία εξαρτάται από το αν αναλαμβάνεις τα κέρδη ή τα επανεπενδύεις.`,
      refer: 'accountant',
    })
  }

  // 7) Βελτιστοποίηση: συνιδιοκτησία/κατανομή εισοδήματος στα κλιμάκια.
  const marg = business
    ? marginalRate(input.taxableIncome, BUSINESS_INCOME_BRACKETS_2026)
    : marginalRate(input.taxableIncome, RENTAL_TAX_BRACKETS_2026)
  if (!business && marg >= 0.35 && input.propertyCount >= 1) {
    items.push({
      id: 'income-split', tone: 'insight',
      title: 'Κατανομή εισοδήματος στα κλιμάκια',
      body: `Το οριακό σου κλιμάκιο είναι ${Math.round(marg * 100)}%. Επειδή η κλίμακα είναι προοδευτική, η κατανομή της κυριότητας/επικαρπίας σε περισσότερα πρόσωπα (π.χ. σύζυγο) ή η αξιοποίηση ζημιών/απαλλαγών μπορεί να μειώσει τον μέσο συντελεστή, πάντα νόμιμα και με ουσία, όχι εικονικά. Απαιτεί εξέταση της συνολικής οικογενειακής εικόνας.`,
      refer: 'accountant',
    })
  }

  // 8) Ασφάλιση ακινήτου, προστασία εισοδήματος/περιουσίας.
  items.push({
    id: 'insurance', tone: 'action',
    title: 'Ασφάλιση ακινήτου & απώλειας ενοικίου',
    body: `Ασφαλιστήριο πυρός/σεισμού και κάλυψη απώλειας ενοικίου προστατεύει τόσο την περιουσία όσο και τη ροή εσόδων σε ζημιά ή αφερεγγυότητα μισθωτή. Για επαγγελματική δομή, τα ασφάλιστρα ακινήτου εκπίπτουν ως έξοδο.`,
  })

  // Ταξινόμηση: opportunity/action πρώτα (πρακτική αξία), μετά insight, μετά caution.
  const order: Record<AdvisoryTone, number> = { opportunity: 0, action: 1, insight: 2, caution: 3 }
  items.sort((a, b) => order[a.tone] - order[b.tone])
  return items.slice(0, limit)
}

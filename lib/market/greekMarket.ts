// ═══════════════════════════════════════════════════════════════════════════
// ΔΕΔΟΜΕΝΑ ΑΓΟΡΑΣ ΑΚΙΝΗΤΩΝ ΕΛΛΑΔΑΣ — πραγματικά, με πηγές (Ιούλιος 2026).
// ---------------------------------------------------------------------------
// Πηγές: Τράπεζα Ελλάδος (δείκτες τιμών κατοικιών), ΕΛΣΤΑΤ (ΔΤΚ/ενοίκια),
// Global Property Guide, Spitogatos/market reports, AirDNA/AirROI/Airbtics
// (βραχυχρόνια), Eurostat, Trading Economics, ATHEX, World Gold Council.
//
// ΣΗΜΕΙΩΣΗ ΑΚΡΙΒΕΙΑΣ: οι ΑΠΟΔΟΣΕΙΣ (%) είναι διασταυρωμένες από πολλές πηγές και
// αξιόπιστες. Οι τιμές €/τ.μ. είναι ΕΝΔΕΙΚΤΙΚΑ ΕΥΡΗ αγοράς (μεγάλη διακύμανση εντός
// κάθε περιοχής) — για ακριβή εκτίμηση χρησιμοποίησε αντικειμενικές αξίες/εκτιμητή.
// ΠΑΡΕΛΘΟΥΣΕΣ ΑΠΟΔΟΣΕΙΣ ΔΕΝ ΕΓΓΥΩΝΤΑΙ ΜΕΛΛΟΝΤΙΚΕΣ.
// ═══════════════════════════════════════════════════════════════════════════

export const MARKET_DISCLAIMER =
  'Ενδεικτικά στοιχεία αγοράς για σύγκριση, από δημόσιες πηγές (Τράπεζα Ελλάδος, ΕΛΣΤΑΤ, Global Property Guide, AirDNA/AirROI). Οι τιμές διαφέρουν σημαντικά ανά ακίνητο, όροφο, κατάσταση και ακριβή θέση. Παρελθούσες αποδόσεις δεν εγγυώνται μελλοντικές. Δεν αποτελεί επενδυτική συμβουλή.'

export const MARKET_DATA_ASOF = 'Ιούλιος 2026'

// ── Απόδοση/τιμές ανά περιοχή (μακροχρόνια μίσθωση, μεικτή απόδοση) ──────────
export type RegionTag = 'metro' | 'airport' | 'port' | 'island' | 'city' | 'suburb' | 'center' | 'tourist'
export interface RegionYield {
  key: string
  label: string
  region: string              // γεωγραφικό διαμέρισμα / περιφέρεια
  pricePerSqm: [number, number] // ενδεικτικό εύρος €/τ.μ. (αγορά)
  rentPerSqm: [number, number]  // ενδεικτικό εύρος €/τ.μ./μήνα
  grossYield: number          // τυπική μεικτή απόδοση % (μακροχρόνια)
  tags: RegionTag[]
  note: string
}

// Οι μεικτές αποδόσεις είναι διασταυρωμένες (Global Property Guide / Investropa /
// AirROI 2025-2026). Τα €/τ.μ. ενδεικτικά εύρη αγοράς (Spitogatos-τύπου).
// Οι αποδόσεις είναι ΜΑΚΡΟΧΡΟΝΙΑΣ μίσθωσης (μεικτές). Η βραχυχρόνια είναι χωριστά
// (SHORT_TERM) — στα νησιά η βραχυχρόνια είναι πολύ υψηλότερη από τη μακροχρόνια.
export const REGIONS: RegionYield[] = [
  // ── Αττική (Global Property Guide: Αθήνα 5,4% μέσος) ──
  { key: 'ath_center', label: 'Κέντρο Αθήνας', region: 'Αττική', pricePerSqm: [2100, 3800], rentPerSqm: [10, 16], grossYield: 5.0, tags: ['center', 'metro', 'city'], note: 'Κυψέλη 5,4–7,3% · Εξάρχεια ~4,9% · Παγκράτι ~4,3% · Κουκάκι 3–4,4% (STR-κορεσμός). Οι φθηνότερες/κεντρικές αποδίδουν περισσότερο.' },
  { key: 'ath_kolonaki', label: 'Κολωνάκι / Prime', region: 'Αττική', pricePerSqm: [4500, 8900], rentPerSqm: [15, 22], grossYield: 3.7, tags: ['center', 'metro', 'city'], note: 'Prime κέντρο (~5.400 €/τ.μ.): υψηλές αξίες, χαμηλή % απόδοση αλλά ισχυρή διατήρηση αξίας & ζήτηση Golden Visa.' },
  { key: 'ath_south', label: 'Νότια προάστια', region: 'Αττική', pricePerSqm: [3700, 7600], rentPerSqm: [13, 21], grossYield: 3.6, tags: ['suburb', 'metro'], note: 'Γλυφάδα 3,8% · Βούλα 3,3% · Ελληνικό 3,5%: το ακριβότερο της Ελλάδας (Βουλιαγμένη ~7.586 €/τ.μ.). Χαμηλή % απόδοση, κορυφαία ανατίμηση (The Ellinikon).' },
  { key: 'ath_north', label: 'Βόρεια προάστια', region: 'Αττική', pricePerSqm: [2800, 5000], rentPerSqm: [11, 17], grossYield: 4.0, tags: ['suburb', 'metro'], note: 'Κηφισιά, Μαρούσι, Χαλάνδρι: οικογενειακή ζήτηση, μετρό Γρ. 3. Ζώνη Μετρό Γρ. 4 (Γαλάτσι/Ζωγράφου) με ισχυρή άνοδο.' },
  { key: 'ath_west', label: 'Δυτικά προάστια', region: 'Αττική', pricePerSqm: [1400, 2450], rentPerSqm: [9, 11], grossYield: 5.8, tags: ['suburb', 'metro', 'city'], note: 'Περιστέρι, Αιγάλεω (Παν. Δυτ. Αττικής), Ίλιον: προσιτές τιμές, υψηλή % απόδοση 5,4–6,5%· ταχεία άνοδος 2025 (Περιστέρι +22%).' },
  { key: 'piraeus', label: 'Πειραιάς', region: 'Αττική', pricePerSqm: [1700, 2900], rentPerSqm: [9, 12], grossYield: 5.0, tags: ['port', 'metro', 'city'], note: 'Μεγαλύτερο λιμάνι + μετρό (Γρ. 3, 2022): +83,8% τιμές 2019–24 (κορυφή Αττικής). Απόδοση 4,8–7,5%, ισχυρό ξένο ενδιαφέρον.' },
  { key: 'east_attica', label: 'Ανατολική Αττική', region: 'Αττική', pricePerSqm: [1800, 3200], rentPerSqm: [8, 12], grossYield: 4.8, tags: ['airport', 'suburb'], note: 'Παλλήνη, Ραφήνα, Αρτέμιδα: κοντά στο αεροδρόμιο (Ελ. Βενιζέλος, Γρ. 3), αναπτυσσόμενη ζήτηση.' },
  // ── Θεσσαλονίκη (Global Property Guide 4,4%· μετρό 2024) ──
  { key: 'thess_center', label: 'Κέντρο Θεσσαλονίκης', region: 'Κεντρική Μακεδονία', pricePerSqm: [2000, 3000], rentPerSqm: [9, 11], grossYield: 4.4, tags: ['center', 'city', 'port'], note: 'Λαδάδικα, Άνω Πόλη: μεγάλη φοιτητική ζήτηση (ΑΠΘ), μετρό 2024. Κόκκινη ζώνη ΑΜΑ (1ο διαμ.) από 1/7/2026.' },
  { key: 'thess_kalamaria', label: 'Καλαμαριά / Ανατολικά', region: 'Κεντρική Μακεδονία', pricePerSqm: [2500, 4700], rentPerSqm: [8, 10], grossYield: 3.3, tags: ['suburb', 'city'], note: 'Καλαμαριά (ακριβότερη), Πανόραμα, Πυλαία: premium προαστιακή ζώνη· επέκταση μετρό ~2026. Χαμηλή % απόδοση, υψηλές αξίες.' },
  // ── Κρήτη ──
  { key: 'heraklion', label: 'Ηράκλειο (Κρήτη)', region: 'Κρήτη', pricePerSqm: [1550, 2100], rentPerSqm: [8, 10], grossYield: 5.7, tags: ['island', 'city', 'airport', 'port'], note: 'Πανεπιστήμιο Κρήτης, αεροδρόμιο+λιμάνι: από τις κορυφαίες αποδόσεις (5,2–6,4%), χαμηλές τιμές + σταθερά ενοίκια.' },
  { key: 'chania', label: 'Χανιά (Κρήτη)', region: 'Κρήτη', pricePerSqm: [2400, 3200], rentPerSqm: [8, 11], grossYield: 3.9, tags: ['island', 'tourist', 'airport'], note: 'Από τις ακριβότερες περιοχές: χαμηλότερη ΜΑΚΡΟΧΡΟΝΙΑ απόδοση, αλλά βραχυχρόνια/τουριστικά 8–11% (Παλιά Πόλη).' },
  // ── Νησιά Αιγαίου (μακροχρόνια χαμηλή· βραχυχρόνια πολύ υψηλή) ──
  { key: 'mykonos_santorini', label: 'Μύκονος / Σαντορίνη', region: 'Νότιο Αιγαίο', pricePerSqm: [4800, 12000], rentPerSqm: [16, 24], grossYield: 3.5, tags: ['island', 'tourist'], note: 'Πολύ υψηλές αξίες (Μύκονος ~7.574, Σαντορίνη ~4.810 €/τ.μ.)· η μακροχρόνια % χαμηλή, αλλά έσοδα βραχυχρόνιας €40–60k/έτος.' },
  { key: 'paros_naxos', label: 'Πάρος / Νάξος', region: 'Νότιο Αιγαίο', pricePerSqm: [3500, 5000], rentPerSqm: [9, 14], grossYield: 3.0, tags: ['island', 'tourist'], note: 'Boutique νησιά, ταχεία ανατίμηση (Πάρος +108% από 2018). Μακροχρόνια απόδοση χαμηλή· βραχυχρόνια 6–8% με υψηλή πληρότητα.' },
  { key: 'rhodes', label: 'Ρόδος', region: 'Νότιο Αιγαίο', pricePerSqm: [1800, 3200], rentPerSqm: [9, 12], grossYield: 5.0, tags: ['island', 'tourist', 'airport'], note: 'Δωδεκάνησα: υψηλότερη απόδοση από Κυκλάδες (~5%), χαμηλότερες τιμές, ισχυρή σεζόν Ιουν–Σεπ, διεθνές αεροδρόμιο.' },
  { key: 'corfu', label: 'Κέρκυρα', region: 'Ιόνια Νησιά', pricePerSqm: [2000, 3500], rentPerSqm: [9, 14], grossYield: 4.6, tags: ['island', 'tourist', 'airport'], note: 'Δημοφιλής τουριστικός προορισμός, διεθνές αεροδρόμιο, ισχυρή βραχυχρόνια.' },
  // ── Λοιπές πόλεις (φοιτητικές: υψηλές αποδόσεις, χαμηλό κόστος εισόδου) ──
  { key: 'patras', label: 'Πάτρα', region: 'Δυτική Ελλάδα', pricePerSqm: [1300, 1700], rentPerSqm: [8, 9], grossYield: 5.9, tags: ['city', 'port'], note: 'Πανεπιστήμιο Πατρών + λιμάνι Αδριατικής: μεγάλη φοιτητική ζήτηση, ~1.646 €/τ.μ., απόδοση 5–7%.' },
  { key: 'larissa', label: 'Λάρισα', region: 'Θεσσαλία', pricePerSqm: [1170, 1335], rentPerSqm: [8, 9], grossYield: 7.0, tags: ['city'], note: 'Από τις υψηλότερες αποδόσεις Ελλάδας: πολύ χαμηλές τιμές (~1.333 €/τ.μ.), ενοίκια που ανεβαίνουν ταχύτερα, φοιτητές/νοσοκομείο.' },
  { key: 'volos', label: 'Βόλος', region: 'Θεσσαλία', pricePerSqm: [1430, 1710], rentPerSqm: [7, 8], grossYield: 5.4, tags: ['city', 'port'], note: 'Παν. Θεσσαλίας + λιμάνι + πύλη Πηλίου/Σποράδων. Απόδοση συμπιέζεται (τιμές +18% ενώ ενοίκια σταθερά).' },
  { key: 'ioannina', label: 'Ιωάννινα', region: 'Ήπειρος', pricePerSqm: [1700, 1880], rentPerSqm: [8, 9], grossYield: 5.5, tags: ['city'], note: 'Πανεπιστήμιο + Πανεπιστημιακό Νοσοκομείο: ισχυρή, σταθερή φοιτητική ζήτηση. Ανερχόμενος τουρισμός (Ζαγόρι/Βίκος).' },
]

/** Επίδραση εγγύτητας σε υποδομές στην αξία/ζήτηση (ενδεικτικά, ποιοτικά). */
export const PROXIMITY_EFFECTS = [
  { key: 'metro', label: 'Κοντά σε στάση Μετρό', impact: '+8% έως +15% στην αξία και ταχύτερη μίσθωση· ισχυρότερο σε Αθήνα/Πειραιά.', positive: true },
  { key: 'airport', label: 'Κοντά σε αεροδρόμιο', impact: 'Θετικό για βραχυχρόνια/εργαζόμενους· η υπερβολική εγγύτητα (θόρυβος) μπορεί να μειώνει την αξία κατοικίας.', positive: true },
  { key: 'port', label: 'Κοντά σε λιμάνι', impact: 'Ζήτηση από εργαζόμενους/επαγγελματική χρήση· ανάπλαση (π.χ. Πειραιάς) ανεβάζει αξίες.', positive: true },
  { key: 'sea', label: 'Θέα / πρόσβαση στη θάλασσα', impact: 'Σημαντικό premium αξίας και ενοικίου, ιδίως νότια προάστια & νησιά.', positive: true },
]

// ── Ιστορική διαδρομή τιμών & ενοικίων (δείκτης, 2007 = 100, ονομαστικά) ─────
// Πηγή: Τράπεζα Ελλάδος (δείκτης τιμών κατοικιών) + ΕΛΣΤΑΤ (ενοίκια). Επαληθευμένα
// σημεία-άγκυρες: κορυφή Q3/2008, πυθμένας Q3/2017 (−42% σωρευτικά), ανάκαμψη
// +70% ως 2024, υπέρβαση της κορυφής 2008 εντός 2025.
export interface IndexPoint { year: number; price: number; rent: number }
export const HISTORY_INDEX: IndexPoint[] = [
  { year: 2007, price: 100.0, rent: 100.0 },
  { year: 2008, price: 101.7, rent: 100.5 }, // κορυφή τιμών
  { year: 2009, price: 97.9, rent: 99.0 },
  { year: 2010, price: 93.3, rent: 96.0 },
  { year: 2011, price: 88.2, rent: 92.0 },
  { year: 2012, price: 77.9, rent: 87.0 },
  { year: 2013, price: 69.5, rent: 83.0 },
  { year: 2014, price: 64.3, rent: 80.0 },
  { year: 2015, price: 61.1, rent: 78.5 },
  { year: 2016, price: 59.5, rent: 78.0 },
  { year: 2017, price: 58.9, rent: 78.0 }, // πυθμένας τιμών
  { year: 2018, price: 60.0, rent: 79.0 },
  { year: 2019, price: 64.3, rent: 80.0 },
  { year: 2020, price: 67.1, rent: 80.5 },
  { year: 2021, price: 72.2, rent: 82.0 },
  { year: 2022, price: 80.8, rent: 85.0 },
  { year: 2023, price: 92.0, rent: 90.0 },
  { year: 2024, price: 100.0, rent: 96.0 },
  { year: 2025, price: 108.1, rent: 105.0 }, // υπέρβαση κορυφής 2008
  { year: 2026, price: 114.6, rent: 113.0 }, // προσωρινό (Q1 +5,7%)
]
export const HISTORY_ANCHORS = {
  peakYear: 2008, troughYear: 2017,
  peakToTroughPct: -42, troughToNowPct: 95,
  note: 'Κορυφή 2008 → πυθμένας 2017: −42% (ονομαστικά, −48% πραγματικά). Ανάκαμψη από τον πυθμένα ~+95% ως το 2026. Οι πρόσφατες ανατιμήσεις αποκλιμακώνονται (2023 +13,9% → 2026 Q1 +5,7%).',
}

// ── Εναλλακτικές επενδύσεις (benchmarks, 2026) ──────────────────────────────
// Πηγές: Trading Economics (ομόλογο/πληθωρισμός), Τράπεζα Ελλάδος (καταθέσεις),
// ATHEX, World Gold Council. Οι μακροχρόνιες αποδόσεις εξαρτώνται από την περίοδο.
export interface Benchmark { key: string; label: string; annualReturnPct: number; note: string }
export const BENCHMARKS: Benchmark[] = [
  { key: 'deposit', label: 'Προθεσμιακή κατάθεση', annualReturnPct: 1.1, note: 'Μέσο επιτόκιο νέων καταθέσεων ≤1 έτους (ΤτΕ, 2026). Κάτω από τον πληθωρισμό → αρνητική πραγματική απόδοση.' },
  { key: 'bond', label: 'Ελληνικό 10ετές ομόλογο', annualReturnPct: 3.75, note: 'Τρέχουσα απόδοση (2026). Το πλησιέστερο σε «χωρίς ρίσκο» σημείο αναφοράς σε ευρώ.' },
  { key: 'gold', label: 'Χρυσός', annualReturnPct: 7.0, note: 'Μακροχρόνια ~7%/έτος σε ευρώ (πρόσφατη δεκαετία υψηλότερα). Χωρίς εισόδημα, έντονη μεταβλητότητα.' },
  { key: 'stocks', label: 'Χρηματιστήριο Αθηνών', annualReturnPct: 8.0, note: 'Τεράστια μεταβλητότητα: ~+13–18%/έτος την τελευταία 10ετία (μετά την κρίση), αλλά ~0% σε ορίζοντα 20ετίας. Ενδεικτικά ~8% μακροπρόθεσμα.' },
  { key: 'sp500', label: 'S&P 500 ETF (VUAA / SXR8, accumulating)', annualReturnPct: 8.0, note: 'Παγκόσμιος δείκτης ΗΠΑ: ιστορικά ~9–10%/έτος (USD)· ενδεικτικά ~8% σε ευρώ. Accumulating → χωρίς φόρο μερίσματος· η υπεραξία εισηγμένων τίτλων ΕΕ δεν φορολογείται σήμερα για φυσικά πρόσωπα (0,2% τέλος πώλησης). Κίνδυνος αγοράς & συναλλάγματος (EUR/USD).' },
  { key: 'inflation', label: 'Πληθωρισμός (αναφορά)', annualReturnPct: 3.3, note: 'Μέσος ~3,3%/έτος (10ετία ΕΕ)· τρέχων Ελλάδα ~4,4% (2026). Αφαιρείται για πραγματική απόδοση.' },
]

// ── Βραχυχρόνια μίσθωση ανά περιοχή (πληρότητα, ADR, μεικτή απόδοση) ─────────
// Πηγές: AirDNA / AirROI / Airbtics 2025-2026. Δεδομένα θορυβώδη (±20% ανά πηγή).
// ΣΗΜΑΝΤΙΚΟ: η καθαρή απόδοση βραχυχρόνιας είναι πολύ χαμηλότερη — λειτουργικά κόστη
// (καθαρισμοί, διαχείριση 15–25%, ΤΑΚΚ, κενές νύχτες) «τρώνε» 40–60% των μεικτών.
export interface ShortTermStat {
  key: string; label: string; occupancy: number; adr: number; annualRevenue: number
  grossYield: number; longTermYield: number; redZone?: boolean; note: string
}
export const SHORT_TERM: ShortTermStat[] = [
  { key: 'ath_center', label: 'Κέντρο Αθήνας', occupancy: 58, adr: 125, annualRevenue: 16000, grossYield: 8, longTermYield: 5.0, redZone: true, note: 'Κόκκινη ζώνη ΑΜΑ (1ο–3ο διαμ.) ως 31/12/2026: ΚΑΝΕΝΑ νέο ΑΜΑ — για νέους αγοραστές η βραχυχρόνια δεν είναι επιλογή.' },
  { key: 'ath_riviera', label: 'Αθηναϊκή Ριβιέρα', occupancy: 55, adr: 120, annualRevenue: 14000, grossYield: 6, longTermYield: 3.8, note: 'Εκτός κόκκινης ζώνης — επιτρέπονται νέα ΑΜΑ· βασικός διαφοροποιητής vs κέντρο.' },
  { key: 'thess', label: 'Θεσσαλονίκη', occupancy: 62, adr: 68, annualRevenue: 14000, grossYield: 7, longTermYield: 4.4, redZone: true, note: 'Πάγωμα ΑΜΑ στο 1ο διαμέρισμα από 1/7/2026.' },
  { key: 'mykonos_santorini', label: 'Μύκονος / Σαντορίνη', occupancy: 62, adr: 200, annualRevenue: 50000, grossYield: 5, longTermYield: 3.5, note: 'Τεράστια έσοδα (Αύγ. ADR €360+) αλλά πολύ υψηλή τιμή αγοράς → η % απόδοση μέτρια. Ακραία εποχικότητα (5–6 μήνες).' },
  { key: 'paros_naxos', label: 'Πάρος / Νάξος', occupancy: 75, adr: 116, annualRevenue: 32000, grossYield: 7, longTermYield: 3.0, note: 'Υψηλή πληρότητα & ταχεία άνοδος ADR στη βραχυχρόνια· η μακροχρόνια απόδοση χαμηλή λόγω τιμών.' },
  { key: 'crete', label: 'Κρήτη (Χανιά/Ηράκλειο)', occupancy: 74, adr: 90, annualRevenue: 23000, grossYield: 6.5, longTermYield: 4.5, note: 'Μεγάλη σεζόν, υψηλότερο RevPAR πανελλαδικά· Ηράκλειο κορυφή μακροχρόνιας απόδοσης (~5,7%).' },
  { key: 'rhodes', label: 'Ρόδος', occupancy: 72, adr: 124, annualRevenue: 33000, grossYield: 6.5, longTermYield: 5.0, note: 'Νησί πακέτων, ισχυρή σεζόν Ιουν–Σεπ.' },
]

// Εποχικότητα (ενδεικτικά, 12 μήνες, 0=Ιαν): νησιά = καλοκαιρινή καμπύλη· πόλη = δίδυμες
// κορυφές άνοιξη/φθινόπωρο. Τιμές = σχετική ζήτηση (100 = μέγιστο).
export const SEASONALITY_ISLAND = [10, 12, 20, 45, 70, 90, 100, 100, 80, 50, 18, 10]
export const SEASONALITY_CITY = [45, 48, 65, 80, 85, 70, 60, 55, 85, 90, 55, 50]

// ── Πηγές (για εμφάνιση/διαφάνεια) ──────────────────────────────────────────
export const MARKET_SOURCES: { label: string; href: string }[] = [
  { label: 'Τράπεζα Ελλάδος — Δείκτες τιμών ακινήτων', href: 'https://www.bankofgreece.gr/en/statistics/real-estate-market' },
  { label: 'ΕΛΣΤΑΤ — Δείκτης Τιμών Καταναλωτή (ενοίκια)', href: 'https://www.statistics.gr/en/statistics/-/publication/DKT87/-' },
  { label: 'Global Property Guide — Greece rental yields', href: 'https://www.globalpropertyguide.com/europe/greece/rental-yields' },
  { label: 'AirDNA / AirROI — βραχυχρόνια Ελλάδας', href: 'https://www.airroi.com/airbnb-data/greece' },
]

// ── Βοηθητικά ───────────────────────────────────────────────────────────────
export const regionByKey = (key: string) => REGIONS.find(r => r.key === key)
export const shortTermByKey = (key: string) => SHORT_TERM.find(s => s.key === key)
export const midPricePerSqm = (r: RegionYield) => Math.round((r.pricePerSqm[0] + r.pricePerSqm[1]) / 2)
export const midRentPerSqm = (r: RegionYield) => Math.round((r.rentPerSqm[0] + r.rentPerSqm[1]) / 2)

/** Αξιολόγηση μιας απόδοσης σε σχέση με την ελληνική αγορά (μακροχρόνια). */
export function yieldVerdict(grossYieldPct: number): { label: string; tone: 'good' | 'ok' | 'low' } {
  if (grossYieldPct >= 5.5) return { label: 'Πάνω από τον μέσο όρο αγοράς', tone: 'good' }
  if (grossYieldPct >= 3.8) return { label: 'Κοντά στον μέσο όρο αγοράς', tone: 'ok' }
  return { label: 'Κάτω από τον μέσο όρο — έμφαση στην ανατίμηση', tone: 'low' }
}

/** Τυπική ελληνική μεικτή απόδοση αναφοράς (μακροχρόνια, Global Property Guide Q4 2025). */
export const GREECE_AVG_GROSS_YIELD = 4.4
/** Μέση απόδοση Αθήνας (υψηλότερη από τον εθνικό μέσο). */
export const ATHENS_AVG_GROSS_YIELD = 5.4

// ── Μοχλοί μεγιστοποίησης απόδοσης (με πηγές, ν.θέσπιση) ────────────────────
export interface YieldLever {
  key: string; title: string; impact: string; detail: string; risk: string
  audience: 'all' | 'pro'; href?: string
}
export const YIELD_LEVERS: YieldLever[] = [
  {
    key: 'auction', title: 'Αγορά κάτω από την αγορά (ηλεκτρονικός πλειστηριασμός)',
    impact: 'Έως −35% της εκτιμηθείσας αξίας → αύξηση μεικτής απόδοσης ~+33% σχετικά (π.χ. 5,0% → ~6,7%).',
    detail: 'Στο eauction.gr, μέσω συμβολαιογράφου. Μετά από 2 άγονους η τιμή πέφτει αυτόματα στο 80%, μετά τον 3ο στο 65%. Μόνο ~1 στους 7 βρίσκει αγοραστή → πλεόνασμα προσφοράς.',
    risk: 'Κατοικούμενο ακίνητο (καθυστέρηση έξωσης), χωρίς εσωτερική επίσκεψη, πιθανά κρυφά βάρη/κοινόχρηστα, δέσμευση 30% εγγύησης. Υποχρεωτικός νομικός έλεγχος τίτλου.',
    audience: 'pro', href: 'https://www.eauction.gr/Home/HowTo',
  },
  {
    key: 'leverage', title: 'Θετική μόχλευση (δανεισμός για αγορά)',
    impact: 'Όταν καθαρή απόδοση > κόστος δανείου: στο 70% δανεισμό με 5% απόδοση / 3% επιτόκιο, η απόδοση ιδίων κεφαλαίων ανεβαίνει 5% → ~9,7%.',
    detail: 'Απόδοση ιδίων = απόδοση + (δάνειο/ίδια)×(απόδοση − επιτόκιο). Το «Σπίτι μου ΙΙ» (50% άτοκο) υποδιπλασιάζει το μέσο επιτόκιο — αλλά ΜΟΝΟ για α΄ κατοικία, όχι για καθαρή επένδυση.',
    risk: 'Κόβει και προς τις δύο κατευθύνσεις: κενές περίοδοι ή άνοδος επιτοκίου γυρίζουν την απόδοση αρνητική. Έλεγχος αντοχής σε 1–2 μήνες κενό + επιτόκιο +2%.',
    audience: 'pro', href: 'https://hdb.gr/spiti-ii/',
  },
  {
    key: 'renovation_credit', title: 'Έκπτωση φόρου 40% ανακαίνισης',
    impact: 'Έως 16.000€ έκπτωση φόρου σε 5 έτη (3.200€/έτος) — επιδοτεί την αναβάθμιση που δικαιολογεί υψηλότερο ενοίκιο.',
    detail: 'Άρθρο 39Β ΚΦΕ (ως 31/12/2026): 40% επιλέξιμης δαπάνης, ηλεκτρονική πληρωμή, υλικά έως 1/3 (η εργασία κυριαρχεί).',
    risk: 'Αυστηρά κριτήρια (ημερομηνίες, ηλεκτρονική πληρωμή, υλικά/εργασία). Χρονικό παράθυρο.',
    audience: 'all', href: 'https://www.forin.gr/articles/article/87571/',
  },
  {
    key: 'anakainizo', title: 'Ανακαινίζω–Νοικιάζω (επιδότηση κενών)',
    impact: '60% του κόστους ανακαίνισης, έως 8.100€ επιδότηση, για κενή κατοικία → μακροχρόνια μίσθωση 3+ ετών.',
    detail: 'Κενό στο Ε2, ≤100 τ.μ., εισόδημα ≤~40.000€, συνολική αξία ≤300.000€. Μετατρέπει «νεκρό» ακίνητο σε εισόδημα με 60% καλυμμένο κόστος.',
    risk: 'Δέσμευση 3ετούς μίσθωσης, όρια εισοδήματος/μεγέθους, χρονικό/προϋπολογιστικό παράθυρο.',
    audience: 'all', href: 'https://www.gov.gr/ipiresies/periousia-kai-phorologia/epidoteseis-politon/anakainizo-noikiazo',
  },
  {
    key: 'enfia_insurance', title: 'Έκπτωση ΕΝΦΙΑ με ασφάλιση',
    impact: '−20% ΕΝΦΙΑ (αξία ≤500k) ή −10% (>500k) για φθηνό ασφαλιστήριο 3 κινδύνων.',
    detail: 'Κάλυψη σεισμού+πυρκαγιάς+πλημμύρας ≥3 μήνες, πλήρης αξία, εγγεγραμμένος ασφαλιστής. Αίτηση myAADE (προθεσμία ~16/2).',
    risk: 'Απαιτεί πλήρη κάλυψη 3 κινδύνων και εμπρόθεσμη δήλωση· αλλιώς χάνεται για τη χρονιά.',
    audience: 'all', href: 'https://www.aade.gr/en/application-grant-unified-property-tax-upt-reduction-insured-residences',
  },
  {
    key: 'bank_rent', title: 'Είσπραξη ενοικίων μέσω τραπέζης',
    impact: 'Διατηρεί την τεκμαρτή έκπτωση 5% (φόρος στο 95% αντί 100%) — άμεση αύξηση καθαρής απόδοσης.',
    detail: 'Από 1/4/2026 τα ενοίκια κατοικίας πρέπει να εισπράττονται τραπεζικά· με μετρητά χάνεται η έκπτωση 5%.',
    risk: 'Απλή συμμόρφωση — ζήτα κατάθεση/IRIS από τον ενοικιαστή.',
    audience: 'all',
  },
]

// ── Ηλεκτρονικός πλειστηριασμός — βασικά στοιχεία (για την ενότητα «pro») ────
export const AUCTION_FACTS = {
  platform: 'eauction.gr', conductor: 'Συμβολαιογράφος',
  systemFee: 50, guaranteePct: 30,
  reductions: [{ after: 2, toPct: 80 }, { after: 3, toPct: 65 }],
  completionRate: 14, // ~1 στους 7 βρίσκει αγοραστή
  note: 'Η μείωση τιμής είναι νομικό κατώφλι, όχι εγγυημένο πραγματικό discount — εξαρτάται από τον ανταγωνισμό των προσφορών και την ακρίβεια της εκτίμησης.',
  href: 'https://www.eauction.gr/Home/HowTo',
}

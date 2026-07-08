// ═══════════════════════════════════════════════════════════════════════════
// Ελαφρύς ταξινομητής δαπανών: από ελεύθερο κείμενο («πλήρωσα τον υδραυλικό»,
// «λογαριασμός ρεύματος», «αγόρασα ψυγείο») βρίσκει ομάδα + κατηγορία δαπάνης,
// ώστε ο βοηθός να καταχωρεί μια δαπάνη με μία φράση. Δεν αντιγράφει ΟΛΟ το
// δέντρο κατηγοριών της καρτέλας Δαπάνες, μόνο τις συχνές περιπτώσεις·
// ό,τι δεν αναγνωρίζεται πέφτει σε «Άλλες Δαπάνες» για να το διορθώσει ο χρήστης.
// ═══════════════════════════════════════════════════════════════════════════

export interface ExpenseClass { group: string; category: string; deductible: boolean }

// Λέξεις-κλειδιά → ομάδα/κατηγορία. Η σειρά μετράει: το πρώτο που ταιριάζει κερδίζει.
const RULES: { re: RegExp; group: string; category: string; deductible: boolean }[] = [
  // Πάγιες (εκπιπτόμενες)
  { re: /ρεύμ|ρευμ|δεη|δεδδη|ηλεκτρικ(ό|ο) ρευμ|kwh|κιλοβατ/i, group: 'fixed', category: 'Ρεύμα', deductible: true },
  { re: /νερ[όο]|ύδρευσ|υδρευσ|ευδαπ/i, group: 'fixed', category: 'Νερό', deductible: true },
  { re: /αέρι|αερι|φυσικό αέριο|φυσικο αεριο/i, group: 'fixed', category: 'Φυσικό Αέριο', deductible: true },
  { re: /ίντερνετ|ιντερνετ|internet|wifi|adsl|οπτικ(ή|η) ίν|router/i, group: 'fixed', category: 'Internet', deductible: true },
  { re: /τηλέφων|τηλεφων|σταθερ(ό|ο) τηλ|κινητ(ό|ο)/i, group: 'fixed', category: 'Τηλέφωνο', deductible: true },
  { re: /κοινόχρηστ|κοινοχρηστ/i, group: 'fixed', category: 'Κοινόχρηστα', deductible: true },
  { re: /ενφια|εν\.?φ\.?ι\.?α/i, group: 'fixed', category: 'ΕΝΦΙΑ', deductible: true },
  { re: /δημοτικ(ά|α) τέλ|δημοτικα τελ|τέλη καθαρι|τελη καθαρι/i, group: 'fixed', category: 'Δημοτικά Τέλη', deductible: true },
  { re: /ασφάλει|ασφαλει|ασφάλισ|ασφαλισ/i, group: 'fixed', category: 'Ασφάλεια Κτιρίου', deductible: true },
  { re: /λογιστ|φοροτεχ/i, group: 'fixed', category: 'Λογιστής/Φοροτεχνικός', deductible: true },
  // Συντήρηση (εκπιπτόμενη)
  { re: /υδραυλικ|αποφράξ|αποφραξ|διαρρο(ή|η)/i, group: 'maintenance', category: 'Υδραυλικός', deductible: true },
  { re: /ηλεκτρολόγ|ηλεκτρολογ/i, group: 'maintenance', category: 'Ηλεκτρολόγος', deductible: true },
  { re: /απεντόμωσ|απεντομωσ|μυοκτον/i, group: 'maintenance', category: 'Απεντόμωση', deductible: true },
  { re: /καθαρι[όο]τητ|καθάρισμ|καθαρισμ|συνεργεί(ο|ω) καθαρ/i, group: 'maintenance', category: 'Καθαριότητα', deductible: true },
  { re: /συντήρησ|συντηρησ|σέρβις|σερβις|service/i, group: 'maintenance', category: 'Γενική Συντήρηση', deductible: true },
  { re: /ασανσέρ|ασανσερ|ανελκυστ/i, group: 'maintenance', category: 'Συντήρηση Ασανσέρ', deductible: true },
  { re: /κηπουρ|κ(ή|η)πο/i, group: 'maintenance', category: 'Κηπουρός', deductible: true },
  // Ανακαίνιση (μη εκπιπτόμενη)
  { re: /βαφ(ή|η)|βάψιμο|βαψιμο|χρώματ|χρωματ|ελαιοχρωμ/i, group: 'renovation', category: 'Βαφές & Χρώματα', deductible: false },
  { re: /πλακάκ|πλακακ/i, group: 'renovation', category: 'Πλακάκια', deductible: false },
  { re: /παρκέ|παρκε|δάπεδο|δαπεδο|λαμινέιτ|laminate|πάτωμα|πατωμα/i, group: 'renovation', category: 'Πατώματα (γενικά)', deductible: false },
  { re: /ανακαίνισ|ανακαινισ|ανακατασκευ/i, group: 'renovation', category: 'Άλλη Ανακαίνιση', deductible: false },
  // Συσκευές & έπιπλα (μη εκπιπτόμενες)
  { re: /ψυγεί|ψυγει/i, group: 'appliances', category: 'Ψυγείο', deductible: false },
  { re: /πλυντήρι(ο|α) ρούχ|πλυντηρι(ο|α) ρουχ/i, group: 'appliances', category: 'Πλυντήριο Ρούχων', deductible: false },
  { re: /πλυντήρι(ο|α) πιάτ|πλυντηρι(ο|α) πιατ/i, group: 'appliances', category: 'Πλυντήριο Πιάτων', deductible: false },
  { re: /κλιματιστικ|air ?condition|a\/?c|κλίμα|ψυκτικ/i, group: 'appliances', category: 'Κλιματιστικό', deductible: false },
  { re: /φούρν|φουρν/i, group: 'appliances', category: 'Φούρνος Κουζίνας', deductible: false },
  { re: /τηλεόρασ|τηλεορασ|τιβι|τηλεόραση|smart tv/i, group: 'appliances', category: 'Τηλεόραση', deductible: false },
  { re: /καναπ|πολυθρόν|πολυθρον/i, group: 'appliances', category: 'Καναπές/Πολυθρόνα', deductible: false },
  { re: /κρεβάτ|κρεβατ|στρώμα|στρωμα/i, group: 'appliances', category: 'Κρεβάτι/Στρώμα', deductible: false },
  { re: /ντουλάπ|ντουλαπ/i, group: 'appliances', category: 'Ντουλάπα', deductible: false },
  { re: /έπιπλ|επιπλ|μπόι|μποϊ/i, group: 'appliances', category: 'Έπιπλα Σαλόνι', deductible: false },
  // Νομικά & διοικητικά (εκπιπτόμενα)
  { re: /συμβολαιογράφ|συμβολαιογραφ/i, group: 'legal', category: 'Συμβολαιογράφος', deductible: true },
  { re: /δικηγόρ|δικηγορ/i, group: 'legal', category: 'Δικηγόρος', deductible: true },
  { re: /μηχανικ|τοπογράφ|τοπογραφ|πεα|ενεργειακ(ή|η) επιθε/i, group: 'legal', category: 'Μηχανικός/Τοπογράφος', deductible: true },
  // Μεσιτικά (εκπιπτόμενα)
  { re: /μεσιτ|διαφήμισ|διαφημισ|αγγελί|αγγελι|spitogatos|φωτογράφ|φωτογραφ/i, group: 'broker', category: 'Μεσιτεία Ενοικίασης', deductible: true },
];

export function classifyExpense(text: string): ExpenseClass {
  const t = (text || '').trim();
  for (const r of RULES) if (r.re.test(t)) return { group: r.group, category: r.category, deductible: r.deductible };
  return { group: 'other', category: 'Άλλο', deductible: false };
}

// ΠΑΡΑΓΟΜΕΝΟ ΑΡΧΕΙΟ. Μην το γράψεις με το χέρι: βγαίνει από το
// scripts/brand/export-logo.mjs, που διαβάζει τη γεωμετρία από το
// components/BrandMark.tsx. Ξανατρέξε το βήμα αν αλλάξει το σήμα.
//
// ── ΓΙΑΤΙ ΕΔΩ ΚΑΙ ΟΧΙ ΣΤΟ app/dashboard/components ─────────────────────────
// Ζούσε δίπλα στην εξαγωγή Excel, που ήταν ο πρώτος του καταναλωτής. Το PDF
// όμως χτίζεται στο lib/pdf, που ΔΕΝ εισάγει από το app: μια βιβλιοθήκη που
// εξαρτάται από τη διεπαφή είναι ανάποδη εξάρτηση. Το αποτέλεσμα ήταν ότι το
// PDF δεν είχε πρόσβαση στο σήμα και ζωγράφιζε ένα γαλάζιο τετράγωνο με «P» —
// σε κάθε πίνακα τοκοχρεολυσίου, κάθε φάκελο λογιστή, κάθε εξαγωγή.
//
// Το σήμα είναι περιουσιακό στοιχείο της μάρκας, όχι λεπτομέρεια μιας οθόνης.
// Ζει σε βιβλιοθήκη, όπου φτάνουν και οι δύο.
//
// Γιατί ψηφίδες και όχι SVG: το OOXML δεν εμφανίζει SVG σε σχέδιο φύλλου.
// Γιατί base64 και όχι αρχείο: η εξαγωγή δεν ζητά τίποτα από το δίκτυο τη
// στιγμή που ο χρήστης πατά «κατέβασμα».

/** Το σήμα ως PNG 128×128, σε base64. Σκούρο μελάνι, με διαφάνεια. */
export const BRAND_MARK_PNG =
  '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';

/** Το ίδιο σήμα ως dataURL, όπως το θέλει το pdfmake και η ετικέτα `img`. */
export const BRAND_MARK_DATA_URL = `data:image/png;base64,${BRAND_MARK_PNG}`;

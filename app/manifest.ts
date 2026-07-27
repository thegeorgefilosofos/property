import type { MetadataRoute } from 'next';

// ═══════════════════════════════════════════════════════════════════════════
// Web App Manifest — κάνει το Property OS εγκαταστάσιμο σαν εφαρμογή.
//
// ΓΙΑΤΙ: ο Έλληνας ιδιοκτήτης δεν κάθεται σε γραφείο. Φωτογραφίζει έναν
// λογαριασμό στην ουρά της ΔΕΗ και καταχωρεί μια δαπάνη από το αυτοκίνητο.
// Ένα εικονίδιο στην αρχική οθόνη, χωρίς μπάρα διεύθυνσης, είναι η διαφορά
// ανάμεσα σε «θα το κάνω μετά» και «έγινε». Δεν αντικαθιστά native εφαρμογή —
// το λέμε ειλικρινά και στον βοηθό — αλλά καλύπτει το 90% της ανάγκης σήμερα.
//
// `id` σταθερό: αν αλλάξει, ο browser θεωρεί ότι είναι ΑΛΛΗ εφαρμογή και
// ξαναρωτά για εγκατάσταση σε όσους την έχουν ήδη.
// ═══════════════════════════════════════════════════════════════════════════

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/dashboard',
    name: 'Property OS — Διαχείριση ακινήτων',
    short_name: 'Property OS',
    description: 'Έσοδα, δαπάνες, ενοικιαστές, φόρος και προθεσμίες για τα ακίνητά σου, σε ένα σημείο.',
    start_url: '/dashboard',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait-primary',
    lang: 'el',
    dir: 'ltr',
    // Ουδέτερο, ώστε να μη «χτυπά» ούτε στο φωτεινό ούτε στο σκοτεινό θέμα.
    background_color: '#0b0f14',
    theme_color: '#1a73e8',
    categories: ['finance', 'business', 'productivity'],
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    // Συντομεύσεις από το μακρύ πάτημα στο εικονίδιο: οι δύο ενέργειες που
    // κάνει ο χρήστης όρθιος, με το ένα χέρι.
    shortcuts: [
      { name: 'Σάρωση εγγράφου', short_name: 'Σάρωση', url: '/dashboard?action=scan', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
      { name: 'Δαπάνες', short_name: 'Δαπάνες', url: '/dashboard?tab=finances', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
    ],
  };
}

import type { MetadataRoute } from 'next'

// Οι μηχανές αναζήτησης βλέπουν μόνο τις δημόσιες σελίδες. Οι ιδιωτικές
// περιοχές (πίνακας, portals ενοικιαστών/κρατήσεων, σελίδες με token,
// επαναφορά κωδικού) μένουν εκτός ευρετηρίου.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      // ΕΛΕΙΠΑΝ ΔΥΟ. Ο σύνδεσμος του λογιστή εκθέτει ΟΛΟ το χαρτοφυλάκιο —
      // όνομα, ΑΤΑΚ, διεύθυνση, ενοίκια, δαπάνες, διαμονές — και δεν ήταν στη
      // λίστα. Ούτε η κατάργηση συνδρομής, που φέρει διεύθυνση ηλεκτρονικού
      // ταχυδρομείου στη διεύθυνση της σελίδας.
      disallow: ['/dashboard', '/portal/', '/checkin/', '/accountant/', '/unsubscribe/', '/verify/', '/epivevaiosi-email/', '/reset-password'],
    },
    sitemap: 'https://propertyos.gr/sitemap.xml',
  }
}

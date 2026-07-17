import type { MetadataRoute } from 'next'

// Οι μηχανές αναζήτησης βλέπουν μόνο τις δημόσιες σελίδες. Οι ιδιωτικές
// περιοχές (πίνακας, portals ενοικιαστών/κρατήσεων, σελίδες με token,
// επαναφορά κωδικού) μένουν εκτός ευρετηρίου.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/dashboard', '/portal/', '/checkin/', '/reset-password'],
    },
    sitemap: 'https://property-os.gr/sitemap.xml',
  }
}

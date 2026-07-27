import type { MetadataRoute } from 'next'

// Χάρτης της δημόσιας σελίδας για τις μηχανές αναζήτησης. Μόνο δημόσιες
// διαδρομές: το dashboard, τα portals και οι σελίδες με token μένουν εκτός.
export default function sitemap(): MetadataRoute.Sitemap {
  const base = 'https://propertyos.gr'
  return [
    { url: base, changeFrequency: 'weekly', priority: 1 },
    { url: `${base}/signup`, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${base}/login`, changeFrequency: 'yearly', priority: 0.5 },
    { url: `${base}/trust`, changeFrequency: 'monthly', priority: 0.6 },
    { url: `${base}/privacy`, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${base}/terms`, changeFrequency: 'yearly', priority: 0.3 },
  ]
}

import type { MetadataRoute } from 'next'
import { SITE } from '@/lib/core/site'

// Χάρτης της δημόσιας σελίδας για τις μηχανές αναζήτησης. Μόνο δημόσιες
// διαδρομές: το dashboard, τα portals και οι σελίδες με token μένουν εκτός.
export default function sitemap(): MetadataRoute.Sitemap {
  const base = SITE
  return [
    { url: base, changeFrequency: 'weekly', priority: 1 },
    // Δωρεάν εργαλείο χωρίς εγγραφή. Υψηλή προτεραιότητα επειδή είναι η μόνη
    // σελίδα που απαντά σε ερώτηση που ο ιδιοκτήτης ψάχνει ΠΡΙΝ μας ξέρει.
    { url: `${base}/ypologismos-forou-enoikion`, changeFrequency: 'monthly', priority: 0.9 },
    { url: `${base}/ypologismos-enfia`, changeFrequency: 'monthly', priority: 0.9 },
    { url: `${base}/vraxyxronia-i-makroxronia`, changeFrequency: 'monthly', priority: 0.9 },
    { url: `${base}/kathari-apodosi`, changeFrequency: 'monthly', priority: 0.9 },
    // Τι περιλαμβάνει κάθε πακέτο: η ερώτηση που κάνει ο επισκέπτης ΠΡΙΝ
    // εγγραφεί, οπότε η απάντηση δεν ζει πίσω από τη σύνδεση.
    { url: `${base}/paketa`, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${base}/signup`, changeFrequency: 'monthly', priority: 0.8 },
    // Η ΣΥΝΔΕΣΗ ΒΓΗΚΕ. Ο χάρτης λέει «ευρετηρίασε αυτό» και η ίδια η σελίδα
    // λέει πλέον `noindex`: δύο αντικρουόμενα σήματα για το ίδιο πράγμα. Η
    // φόρμα εισόδου δεν είναι απάντηση σε καμία αναζήτηση — όποιος ψάχνει το
    // όνομα πρέπει να φτάνει στην αρχική.
    { url: `${base}/trust`, changeFrequency: 'monthly', priority: 0.6 },
    { url: `${base}/privacy`, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${base}/terms`, changeFrequency: 'yearly', priority: 0.3 },
  ]
}

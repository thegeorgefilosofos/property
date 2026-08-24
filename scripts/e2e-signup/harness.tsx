// Ο ΠΑΓΚΟΣ ΤΗΣ ΕΓΓΡΑΦΗΣ. Αποδίδει την ΠΡΑΓΜΑΤΙΚΗ σελίδα app/signup/page.tsx σε
// αληθινό Chromium, με ψεύτικο μόνο τον πελάτη ταυτότητας.
import { createRoot } from 'react-dom/client'
import SignUp from '@/app/signup/page'

createRoot(document.getElementById('root')!).render(<SignUp />)

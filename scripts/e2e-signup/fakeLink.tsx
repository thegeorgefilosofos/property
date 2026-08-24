// Το `next/link` εκτός Next. Κρατά το `href`, ώστε οι σύνδεσμοι να είναι
// πραγματικοί σύνδεσμοι και η πλοήγηση με πληκτρολόγιο να μη σπάει.
import type { ReactNode } from 'react'
export default function Link({ href, children, ...rest }: { href: string; children: ReactNode } & Record<string, unknown>) {
  return <a href={href} {...rest}>{children}</a>
}

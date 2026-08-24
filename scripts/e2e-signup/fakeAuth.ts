// Ο ΠΕΛΑΤΗΣ ΤΑΥΤΟΤΗΤΑΣ, ΨΕΥΤΙΚΟΣ. Το μόνο ψεύτικο κομμάτι του πάγκου: όλα τα
// υπόλοιπα είναι ο κώδικας της παραγωγής. Η εγγραφή πετυχαίνει πάντα, γιατί
// αυτό που δοκιμάζεται εδώ είναι τι κάνει η ΟΘΟΝΗ μετά την επιτυχία.
type Ok = { error: null }
export async function authClient() {
  return {
    auth: {
      getUser: async () => ({ data: { user: null } }),
      getSession: async () => ({ data: { session: null } }),
      signUp: async (): Promise<Ok> => ({ error: null }),
      resend: async (): Promise<Ok> => ({ error: null }),
      updateUser: async (): Promise<Ok> => ({ error: null }),
      signInWithOAuth: async (): Promise<Ok> => ({ error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    },
  }
}

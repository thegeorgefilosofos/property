// ═══════════════════════════════════════════════════════════════════════════
// Η ΟΥΡΑ ΤΩΝ ΕΙΣΕΡΧΟΜΕΝΩΝ ΕΧΕΙ ΕΝΑ ΣΠΙΤΙ
// ─────────────────────────────────────────────────────────────────────────
// Τρεις πράξεις, και καμία τους δεν επιτρέπεται να γίνει μισή:
//
//   ΚΑΤΑΧΩΡΗΣΗ. Γεννιέται δαπάνη ΚΑΙ σημειώνεται το εισερχόμενο. Αν το δεύτερο
//   βήμα χαθεί, ο ιδιοκτήτης βλέπει την ίδια πρόταση αύριο και την καταχωρεί
//   ξανά: διπλή δαπάνη, δηλαδή λάθος φορολογητέο εισόδημα. Γι' αυτό η
//   `fileAsExpense` κάνει και τα δύο, και λέει ρητά αν το δεύτερο απέτυχε.
//
//   ΑΠΟΡΡΙΨΗ. Μία στήλη, μία γραμμή. Το μήνυμα ΔΕΝ σβήνεται: μένει ως απόδειξη
//   ότι ήρθε και ότι κάποιος το είδε.
//
//   ΠΕΡΙΣΤΡΟΦΗ ΔΙΕΥΘΥΝΣΗΣ. Δεν γράφει ο πελάτης στον πίνακα — δεν έχει
//   δικαίωμα, επίτηδες. Καλεί συνάρτηση της βάσης που κρίνει η ίδια ποιος ρωτά.
// ═══════════════════════════════════════════════════════════════════════════
import type { SupabaseClient } from '@supabase/supabase-js';
import type { InboundMailboxesRow, InboundMessagesRow } from '@/lib/supabase/tables';
import type { DbError } from '@/lib/supabase/writeResult';
import { read, readOne, type ReadResult, type ReadOneResult } from './read';
import * as expenses from './expenses';

const TABLE = 'inbound_messages';
const MAILBOXES = 'inbound_mailboxes';

export type Db = SupabaseClient;

/**
 * Οι στήλες που δείχνει η οθόνη. Το σώμα του μηνύματος δεν αποθηκεύεται.
 *
 * ΟΥΤΕ Η ΩΡΑ ΑΦΙΞΗΣ ΟΥΤΕ Η ΚΑΤΑΣΤΑΣΗ ΚΑΤΕΒΑΙΝΟΥΝ. Η ώρα ταξινομεί, και η
 * ταξινόμηση δεν χρειάζεται τη στήλη στο αποτέλεσμα· η κατάσταση είναι ήδη το
 * φίλτρο του ερωτήματος, οπότε κάθε γραμμή που γυρίζει την ξέρει ο καλών.
 */
export const MESSAGE_COLUMNS =
  'id,from_address,subject,vendor,amount,due_date,issue_date,category,expense_group,attachments';

export type MessageRow = Pick<InboundMessagesRow,
  'id' | 'from_address' | 'subject' | 'vendor' | 'amount'
  | 'due_date' | 'issue_date' | 'category' | 'expense_group' | 'attachments'>;

export type MailboxRow = Pick<InboundMailboxesRow, 'token' | 'active'>;
export type MailboxOwner = Pick<InboundMailboxesRow, 'user_id' | 'active'>;

/** Ο,τι ξέρει η διαδρομή του webhook για ένα μήνυμα που μόλις ήρθε. */
export interface IncomingMessage {
  userId: string;
  providerId: string;
  from: string | null;
  subject: string | null;
  vendor: string | null;
  amount: number | null;
  dueDate: string | null;
  issueDate: string | null;
  category: string | null;
  expenseGroup: string | null;
  attachments: number;
}

/** Οσο χωράει σε στήλη κειμένου χωρίς να γίνει η βάση αποθήκη σκουπιδιών. */
const cut = (v: string | null, max: number): string | null => v ? v.slice(0, max) : null;

/**
 * Σε ποιον ανήκει ένα κουπόνι, και αν παραλαμβάνει ακόμη.
 *
 * ΜΟΝΟ ΓΙΑ ΤΟΝ ΔΙΑΚΟΜΙΣΤΗ. Ο πίνακας δεν έχει πολιτική που να επιτρέπει σε
 * χρήστη να ψάξει ΞΕΝΟ κουπόνι: με το δημόσιο κλειδί αυτή η αναζήτηση γυρίζει
 * πάντα κενή. Την καλεί η διαδρομή του webhook, με τον πελάτη υπηρεσίας.
 */
export async function mailboxOfToken(db: Db, token: string): Promise<ReadOneResult<MailboxOwner>> {
  return readOne<MailboxOwner>(db.from(MAILBOXES).select('user_id,active').eq('token', token).maybeSingle());
}

/**
 * Το εισερχόμενο, όπως το γράφει η διαδρομή του webhook.
 *
 * ΤΑ ΟΡΙΑ ΜΗΚΟΥΣ ΖΟΥΝ ΕΔΩ ΚΑΙ ΟΧΙ ΣΤΗ ΔΙΑΔΡΟΜΗ. Το θέμα και ο αποστολέας
 * έρχονται από έξω και δεν έχουν όριο: χωρίς κόψιμο, ο πίνακας γίνεται
 * αποθήκη για ό,τι στείλει ο καθένας.
 */
export async function record(db: Db, m: IncomingMessage): Promise<{ error: DbError | null }> {
  const { error } = await db.from(TABLE).insert({
    user_id: m.userId,
    provider_id: m.providerId,
    from_address: cut(m.from, 200),
    subject: cut(m.subject, 300),
    vendor: cut(m.vendor, 120),
    amount: m.amount,
    due_date: m.dueDate,
    issue_date: m.issueDate,
    category: m.category,
    expense_group: m.expenseGroup,
    attachments: m.attachments,
  });
  return { error: error as DbError | null };
}

/** Το ίδιο μήνυμα ξαναήρθε: υπάρχει ήδη πρόταση, δεν είναι αποτυχία. */
export const isDuplicate = (error: DbError | null): boolean => error?.code === '23505';

/** Η ιδιωτική διεύθυνση του συνδεδεμένου, ή τίποτα όταν δεν έχει γεννηθεί. */
export async function mailbox(db: Db, userId: string): Promise<ReadOneResult<MailboxRow>> {
  return readOne<MailboxRow>(db.from(MAILBOXES).select('token,active').eq('user_id', userId).maybeSingle());
}

/**
 * Νέα διεύθυνση, όταν η παλιά διέρρευσε.
 *
 * Η ΑΠΑΝΤΗΣΗ ΕΙΝΑΙ ΤΟ ΝΕΟ ΚΟΥΠΟΝΙ, ΟΧΙ «ΕΓΙΝΕ». Χωρίς αυτό η οθόνη θα έπρεπε
 * να ξαναδιαβάσει τον πίνακα και να ελπίζει ότι πρόλαβε.
 */
export async function rotate(db: Db): Promise<{ token: string | null; error: DbError | null }> {
  const { data, error } = await db.rpc('rotate_inbound_mailbox');
  return { token: typeof data === 'string' ? data : null, error: error as DbError | null };
}

/** Οσα περιμένουν τον άνθρωπο, τα πιο πρόσφατα πρώτα. */
export async function pending(db: Db, userId: string, limit = 20): Promise<ReadResult<MessageRow>> {
  return read<MessageRow>(db.from(TABLE).select(MESSAGE_COLUMNS)
    .eq('user_id', userId).eq('status', 'pending')
    .order('received_at', { ascending: false }).limit(limit));
}

/** Το εισερχόμενο δεν ήταν δαπάνη. Μένει ως ίχνος, με την κατάστασή του. */
export async function dismiss(db: Db, id: string): Promise<{ error: DbError | null }> {
  const { error } = await db.from(TABLE).update({ status: 'dismissed' }).eq('id', id);
  return { error: error as DbError | null };
}

/** Ο,τι χρειάζεται η καταχώρηση και ΔΕΝ το ξέρει το μήνυμα. */
export interface FileInput {
  propertyId: string;
  userId: string;
  description: string;
  amount: number;
  date: string;
  category: string;
  expenseGroup?: string;
  vendor?: string | null;
  /** Πληρωμένο ή απλώς καταχωρημένο. Ο λογαριασμός που ήρθε δεν είναι πληρωμένος. */
  paid?: boolean;
}

export interface FileResult {
  expenseId: string | null;
  error: DbError | null;
  /**
   * Η δαπάνη γράφτηκε αλλά το εισερχόμενο έμεινε ανοιχτό.
   *
   * ΔΕΝ ΕΙΝΑΙ ΤΟ ΙΔΙΟ ΜΕ ΤΗΝ ΑΠΟΤΥΧΙΑ, ΚΑΙ ΔΕΝ ΛΕΓΕΤΑΙ ΟΠΩΣ ΑΥΤΗ. Ο άνθρωπος
   * πρέπει να μάθει ότι η δαπάνη ΥΠΑΡΧΕΙ — αλλιώς θα την ξαναγράψει.
   */
  orphaned: boolean;
}

/**
 * Το εισερχόμενο γίνεται δαπάνη, και το λέει στον εαυτό του.
 *
 * Η ΣΕΙΡΑ ΕΧΕΙ ΣΗΜΑΣΙΑ: πρώτα η δαπάνη, μετά το σημάδι. Αντίστροφα, μια
 * αποτυχία στο δεύτερο βήμα θα άφηνε εισερχόμενο «καταχωρημένο» χωρίς καμία
 * δαπάνη πίσω του — δηλαδή έξοδο που εξαφανίστηκε από τα βιβλία σιωπηλά.
 */
export async function fileAsExpense(db: Db, messageId: string, input: FileInput): Promise<FileResult> {
  const { data, error } = await expenses.add(db,
    { propertyId: input.propertyId, userId: input.userId },
    {
      description: input.description,
      amount: input.amount,
      category: input.category,
      date: input.date,
      paid: input.paid ?? false,
      store_vendor: input.vendor ?? null,
      ...(input.expenseGroup ? { expense_group: input.expenseGroup } : {}),
    });
  if (error || !data?.id) return { expenseId: null, error: (error as DbError) ?? null, orphaned: false };

  const { error: markError } = await db.from(TABLE)
    .update({ status: 'filed', expense_id: data.id }).eq('id', messageId);
  return { expenseId: data.id, error: (markError as DbError) ?? null, orphaned: !!markError };
}

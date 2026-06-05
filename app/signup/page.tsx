"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function SignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (password !== confirm) {
      setError("Οι κωδικοί δεν ταιριάζουν");
      return;
    }
    if (password.length < 6) {
      setError("Ο κωδικός πρέπει να έχει τουλάχιστον 6 χαρακτήρες");
      return;
    }

    setLoading(true);

    const supabase = createClient();
    const { error } = await supabase.auth.signUp({ email, password });

    if (error) {
      setError(
        error.message === "User already registered"
          ? "Αυτό το email χρησιμοποιείται ήδη"
          : error.message
      );
      setLoading(false);
    } else {
      setSuccess(true);
      setTimeout(() => {
        router.push("/login");
      }, 3000);
    }
  }

  if (success) {
    return (
      <div className="min-h-screen bg-canvas flex items-center justify-center px-4">
        <div className="w-full max-w-sm text-center">
          <h1 className="font-display text-5xl text-gold mb-3">Property OS</h1>
          <div className="bg-surface border border-frame rounded-xl p-8 mt-8">
            <div className="w-12 h-12 rounded-full bg-success/20 border border-success flex items-center justify-center mx-auto mb-4">
              <span className="text-success text-xl">✓</span>
            </div>
            <h2
              className="text-ink text-sm mb-2"
              style={{ fontFamily: "var(--font-mono)" }}
            >
              Επιτυχής εγγραφή
            </h2>
            <p className="text-ink-muted text-xs" style={{ fontFamily: "var(--font-mono)" }}>
              Ελέγξτε το email σας για επιβεβαίωση.
              <br />
              Ανακατεύθυνση…
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-canvas flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-10">
          <h1 className="font-display text-5xl text-gold mb-3">Property OS</h1>
          <p
            className="text-xs text-ink-muted tracking-[0.25em] uppercase"
            style={{ fontFamily: "var(--font-mono)" }}
          >
            Διαχείριση Ακινήτων
          </p>
        </div>

        <div className="bg-surface border border-frame rounded-xl p-8">
          <h2
            className="text-sm text-ink-muted mb-6 tracking-wider uppercase"
            style={{ fontFamily: "var(--font-mono)" }}
          >
            Εγγραφή
          </h2>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label
                className="text-xs text-ink-muted uppercase tracking-wider block mb-2"
                style={{ fontFamily: "var(--font-mono)" }}
              >
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                className="w-full bg-elevated border border-frame rounded-lg px-3.5 py-2.5 text-ink text-sm focus:outline-none focus:border-gold transition-colors placeholder-ink-dim"
                placeholder="user@example.com"
              />
            </div>

            <div>
              <label
                className="text-xs text-ink-muted uppercase tracking-wider block mb-2"
                style={{ fontFamily: "var(--font-mono)" }}
              >
                Κωδικός
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="new-password"
                className="w-full bg-elevated border border-frame rounded-lg px-3.5 py-2.5 text-ink text-sm focus:outline-none focus:border-gold transition-colors placeholder-ink-dim"
                placeholder="Τουλάχιστον 6 χαρακτήρες"
              />
            </div>

            <div>
              <label
                className="text-xs text-ink-muted uppercase tracking-wider block mb-2"
                style={{ fontFamily: "var(--font-mono)" }}
              >
                Επιβεβαίωση Κωδικού
              </label>
              <input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
                autoComplete="new-password"
                className="w-full bg-elevated border border-frame rounded-lg px-3.5 py-2.5 text-ink text-sm focus:outline-none focus:border-gold transition-colors placeholder-ink-dim"
                placeholder="••••••••"
              />
            </div>

            {error && (
              <p
                className="text-xs text-danger"
                style={{ fontFamily: "var(--font-mono)" }}
              >
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gold hover:bg-gold-light text-canvas font-semibold text-sm py-2.5 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed mt-2"
              style={{ fontFamily: "var(--font-mono)" }}
            >
              {loading ? "Εγγραφή…" : "Δημιουργία Λογαριασμού"}
            </button>
          </form>

          <div className="mt-7 pt-6 border-t border-frame text-center">
            <p
              className="text-xs text-ink-muted"
              style={{ fontFamily: "var(--font-mono)" }}
            >
              Έχετε ήδη λογαριασμό;{" "}
              <Link
                href="/login"
                className="text-gold hover:text-gold-light transition-colors"
              >
                Σύνδεση
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

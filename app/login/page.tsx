"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setError(
        error.message === "Invalid login credentials"
          ? "Λανθασμένο email ή κωδικός"
          : error.message
      );
      setLoading(false);
    } else {
      router.push("/");
      router.refresh();
    }
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
            Σύνδεση
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
                autoComplete="current-password"
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
              {loading ? "Σύνδεση…" : "Σύνδεση"}
            </button>
          </form>

          <div className="mt-7 pt-6 border-t border-frame space-y-3 text-center">
            <Link
              href="/forgot-password"
              className="text-xs text-ink-muted hover:text-gold transition-colors block"
              style={{ fontFamily: "var(--font-mono)" }}
            >
              Ξεχάσατε τον κωδικό σας;
            </Link>
            <p
              className="text-xs text-ink-muted"
              style={{ fontFamily: "var(--font-mono)" }}
            >
              Δεν έχετε λογαριασμό;{" "}
              <Link
                href="/signup"
                className="text-gold hover:text-gold-light transition-colors"
              >
                Εγγραφή
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Property } from "@/lib/types";
import type { User } from "@supabase/supabase-js";

interface Props {
  user: User;
  properties: Property[];
  selectedProperty: Property | null;
  onSelectProperty: (p: Property) => void;
  onAddProperty: () => void;
}

export default function DashboardHeader({
  user,
  properties,
  selectedProperty,
  onSelectProperty,
  onAddProperty,
}: Props) {
  const router = useRouter();
  const [propOpen, setPropOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);
  const propRef = useRef<HTMLDivElement>(null);
  const userRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (propRef.current && !propRef.current.contains(e.target as Node))
        setPropOpen(false);
      if (userRef.current && !userRef.current.contains(e.target as Node))
        setUserOpen(false);
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="h-14 border-b border-frame bg-surface flex items-center px-5 gap-4 sticky top-0 z-40">
      {/* Brand */}
      <span className="font-display text-xl text-gold tracking-wide mr-auto">
        Property OS
      </span>

      {/* Property Switcher */}
      {properties.length > 0 && (
        <div className="relative" ref={propRef}>
          <button
            onClick={() => setPropOpen((v) => !v)}
            className="flex items-center gap-2 bg-elevated border border-frame rounded-lg px-3 py-1.5 text-ink text-sm hover:border-frame-light transition-colors"
            style={{ fontFamily: "var(--font-mono)" }}
          >
            <span className="max-w-[160px] truncate">
              {selectedProperty?.name ?? "—"}
            </span>
            <svg
              className={`w-3.5 h-3.5 text-ink-muted transition-transform ${propOpen ? "rotate-180" : ""}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M19 9l-7 7-7-7"
              />
            </svg>
          </button>

          {propOpen && (
            <div className="absolute right-0 top-full mt-1.5 w-56 bg-elevated border border-frame rounded-lg shadow-xl overflow-hidden z-50">
              {properties.map((p) => (
                <button
                  key={p.id}
                  onClick={() => {
                    onSelectProperty(p);
                    setPropOpen(false);
                  }}
                  className={`w-full text-left px-4 py-2.5 text-sm transition-colors hover:bg-frame ${
                    p.id === selectedProperty?.id
                      ? "text-gold"
                      : "text-ink"
                  }`}
                  style={{ fontFamily: "var(--font-mono)" }}
                >
                  <span className="block truncate">{p.name}</span>
                  <span className="text-xs text-ink-muted">{p.prop_type}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Add Property */}
      <button
        onClick={onAddProperty}
        className="flex items-center gap-1.5 bg-gold hover:bg-gold-light text-canvas text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
        style={{ fontFamily: "var(--font-mono)" }}
      >
        <svg
          className="w-3.5 h-3.5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 4v16m8-8H4"
          />
        </svg>
        Ακίνητο
      </button>

      {/* User Menu */}
      <div className="relative" ref={userRef}>
        <button
          onClick={() => setUserOpen((v) => !v)}
          className="w-8 h-8 rounded-full bg-elevated border border-frame flex items-center justify-center text-xs text-gold font-semibold hover:border-gold transition-colors"
          style={{ fontFamily: "var(--font-mono)" }}
          title={user.email}
        >
          {user.email?.charAt(0).toUpperCase()}
        </button>

        {userOpen && (
          <div className="absolute right-0 top-full mt-1.5 w-52 bg-elevated border border-frame rounded-lg shadow-xl overflow-hidden z-50">
            <div className="px-4 py-3 border-b border-frame">
              <p
                className="text-xs text-ink-muted truncate"
                style={{ fontFamily: "var(--font-mono)" }}
              >
                {user.email}
              </p>
            </div>
            <button
              onClick={handleLogout}
              className="w-full text-left px-4 py-2.5 text-sm text-danger hover:bg-frame transition-colors"
              style={{ fontFamily: "var(--font-mono)" }}
            >
              Αποσύνδεση
            </button>
          </div>
        )}
      </div>
    </header>
  );
}

"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Property } from "@/lib/types";
import type { User } from "@supabase/supabase-js";
import { T } from "@/components/Theme";

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
    <header
      style={{
        height: 56,
        borderBottom: "1px solid var(--border-subtle)",
        background: "var(--bg-surface)",
        display: "flex",
        alignItems: "center",
        paddingLeft: 20,
        paddingRight: 20,
        gap: 16,
        position: "sticky",
        top: 0,
        zIndex: 40,
      }}
    >
      {/* Brand */}
      <span
        style={{
          fontFamily: T.font.sans,
          fontWeight: 800,
          fontSize: 20,
          color: "var(--accent)",
          letterSpacing: "0.02em",
          marginRight: "auto",
        }}
      >
        Property OS
      </span>

      {/* Property Switcher */}
      {properties.length > 0 && (
        <div style={{ position: "relative" }} ref={propRef}>
          <button
            onClick={() => setPropOpen((v) => !v)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              background: "var(--bg-elevated)",
              border: "1px solid var(--border-subtle)",
              borderRadius: T.radius.inner,
              padding: "6px 12px",
              color: "var(--text-primary)",
              fontSize: 12,
              cursor: "pointer",
              transition: "border-color 0.15s ease",
              fontFamily: T.font.mono,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = "var(--border-default)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = "var(--border-subtle)";
            }}
          >
            <span
              style={{
                maxWidth: 160,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {selectedProperty?.name ?? "—"}
            </span>
            <svg
              style={{
                width: 14,
                height: 14,
                color: "var(--text-secondary)",
                transition: "transform 0.15s ease",
                transform: propOpen ? "rotate(180deg)" : "none",
              }}
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
            <div
              style={{
                position: "absolute",
                right: 0,
                top: "100%",
                marginTop: 6,
                width: 224,
                background: "var(--bg-elevated)",
                border: "1px solid var(--border-subtle)",
                borderRadius: T.radius.inner,
                boxShadow: "var(--shadow-xl)",
                overflow: "hidden",
                zIndex: 50,
              }}
            >
              {properties.map((p) => {
                const isActive = p.id === selectedProperty?.id;
                return (
                  <button
                    key={p.id}
                    onClick={() => {
                      onSelectProperty(p);
                      setPropOpen(false);
                    }}
                    style={{
                      width: "100%",
                      textAlign: "left",
                      padding: "10px 16px",
                      fontSize: 12,
                      background: "transparent",
                      border: "none",
                      cursor: "pointer",
                      transition: "background 0.15s ease",
                      color: isActive ? "var(--accent)" : "var(--text-primary)",
                      fontFamily: T.font.mono,
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = "var(--bg-overlay)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = "transparent";
                    }}
                  >
                    <span
                      style={{
                        display: "block",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {p.name}
                    </span>
                    <span
                      style={{ fontSize: 11, color: "var(--text-secondary)" }}
                    >
                      {p.prop_type}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Add Property */}
      <button
        onClick={onAddProperty}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          background: "var(--accent)",
          color: "var(--accent-text)",
          fontSize: 11,
          fontWeight: 600,
          padding: "6px 12px",
          borderRadius: T.radius.inner,
          border: "none",
          cursor: "pointer",
          transition: "background 0.15s ease",
          fontFamily: T.font.mono,
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = "var(--accent-hover)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = "var(--accent)";
        }}
      >
        <svg
          style={{ width: 14, height: 14 }}
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
      <div style={{ position: "relative" }} ref={userRef}>
        <button
          onClick={() => setUserOpen((v) => !v)}
          style={{
            width: 32,
            height: 32,
            borderRadius: T.radius.pill,
            background: "var(--bg-elevated)",
            border: "1px solid var(--border-subtle)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 11,
            color: "var(--accent)",
            fontWeight: 600,
            cursor: "pointer",
            transition: "border-color 0.15s ease",
            fontFamily: T.font.mono,
          }}
          title={user.email}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = "var(--accent)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = "var(--border-subtle)";
          }}
        >
          {user.email?.charAt(0).toUpperCase()}
        </button>

        {userOpen && (
          <div
            style={{
              position: "absolute",
              right: 0,
              top: "100%",
              marginTop: 6,
              width: 208,
              background: "var(--bg-elevated)",
              border: "1px solid var(--border-subtle)",
              borderRadius: T.radius.inner,
              boxShadow: "var(--shadow-xl)",
              overflow: "hidden",
              zIndex: 50,
            }}
          >
            <div
              style={{
                padding: "12px 16px",
                borderBottom: "1px solid var(--border-subtle)",
              }}
            >
              <p
                style={{
                  fontSize: 11,
                  color: "var(--text-secondary)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  fontFamily: T.font.mono,
                }}
              >
                {user.email}
              </p>
            </div>
            <button
              onClick={handleLogout}
              style={{
                width: "100%",
                textAlign: "left",
                padding: "10px 16px",
                fontSize: 12,
                color: "var(--negative)",
                background: "transparent",
                border: "none",
                cursor: "pointer",
                transition: "background 0.15s ease",
                fontFamily: T.font.mono,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "var(--bg-overlay)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "transparent";
              }}
            >
              Αποσύνδεση
            </button>
          </div>
        )}
      </div>
    </header>
  );
}

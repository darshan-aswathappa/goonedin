"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import {
  Envelope,
  CircleNotch,
  Rocket,
  ArrowRight,
  Warning,
} from "@phosphor-icons/react";
import { Kicker, DsButton, StatusBadge, TextField } from "@/components/ds";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (process.env.NODE_ENV === "development" && process.env.NEXT_PUBLIC_AUTO_LOGIN === "true") {
      const autoLogin = async () => {
        setLoading(true);
        const { error } = await supabase.auth.signInWithPassword({
          email: process.env.NEXT_PUBLIC_DEV_EMAIL || "test@example.com",
          password: process.env.NEXT_PUBLIC_DEV_PASSWORD || "password123",
        });
        if (!error) {
          window.location.href = "/";
        } else {
          setError(`Auto-login failed: ${error.message}`);
          setLoading(false);
        }
      };
      autoLogin();
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;

    setLoading(true);
    setError("");

    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    setLoading(false);

    if (error) {
      setError(error.message);
    } else {
      setSent(true);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-paper text-ink">
      {/* Masthead */}
      <header className="flex shrink-0 items-center justify-between border-b border-hairline px-6 py-4">
        <div className="flex items-baseline gap-4">
          <span className="font-serif text-[19px] font-semibold leading-none text-ink">
            HireFeed<span className="text-brick">.</span>
          </span>
          <Kicker className="hidden sm:block">Job Intelligence Desk</Kicker>
        </div>
        <StatusBadge label="Live" tone="complete" live />
      </header>

      {/* Main */}
      <main className="flex flex-1 items-center justify-center px-6 py-16">
        <div className="w-full max-w-[400px]">
          <div className="mb-8">
            <Kicker className="mb-3">Access</Kicker>
            <h1 className="font-serif text-[34px] font-semibold leading-tight text-ink">
              Sign in
            </h1>
            <p className="mt-3 font-sans text-[15px] leading-relaxed text-ink-2">
              No password. We send a one-time link to your inbox.
            </p>
          </div>

          <div className="rounded-[4px] border border-hairline bg-paper-card">
            <div className="flex items-center justify-between border-b border-hairline px-5 py-3">
              <Kicker>Sign in / Register</Kicker>
            </div>

            <div className="p-6">
              {sent ? (
                /* ── Email sent state ── */
                <div className="space-y-6">
                  <div className="inline-flex rounded-[4px] border border-hairline bg-forest-tint p-3">
                    <Envelope className="size-5 text-forest" />
                  </div>
                  <div className="space-y-2">
                    <Kicker className="text-forest">Link sent</Kicker>
                    <h2 className="font-serif text-[22px] font-semibold leading-tight text-ink">
                      Check your inbox
                    </h2>
                    <p className="font-sans text-[15px] leading-relaxed text-ink-2">
                      Access link dispatched to{" "}
                      <span className="font-mono text-[13px] text-ink">{email}</span>
                    </p>
                  </div>
                  <div className="border-t border-hairline pt-5">
                    <DsButton variant="ghost" size="sm" onClick={() => setSent(false)}>
                      Use different email
                    </DsButton>
                  </div>
                </div>
              ) : (
                /* ── Login form ── */
                <form onSubmit={handleSubmit} className="space-y-5">
                  <TextField
                    id="email"
                    label="Email address"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="user@domain.com"
                    required
                  />

                  {error && (
                    <div className="flex items-start gap-2 rounded-[4px] border border-brick bg-brick-tint px-3 py-2.5">
                      <Warning className="mt-px size-[14px] shrink-0 text-brick" />
                      <span className="font-sans text-[13px] leading-snug text-brick">
                        {error}
                      </span>
                    </div>
                  )}

                  <DsButton type="submit" disabled={loading} className="w-full">
                    {loading ? (
                      <CircleNotch className="size-4 animate-spin" />
                    ) : (
                      <>
                        <Envelope className="size-4" />
                        Send Access Link
                        <ArrowRight className="size-4" />
                      </>
                    )}
                  </DsButton>

                  {process.env.NODE_ENV === "development" && (
                    <div className="space-y-3 border-t border-hairline pt-5">
                      <Kicker className="text-center">Dev mode</Kicker>
                      <DsButton
                        variant="secondary"
                        size="sm"
                        disabled={loading}
                        onClick={async () => {
                          setLoading(true);
                          const { error } = await supabase.auth.signInWithPassword({
                            email: process.env.NEXT_PUBLIC_DEV_EMAIL || "test@example.com",
                            password: process.env.NEXT_PUBLIC_DEV_PASSWORD || "password123",
                          });
                          if (error) {
                            setError(`Dev Login Failed: ${error.message}`);
                            setLoading(false);
                          } else {
                            window.location.href = "/";
                          }
                        }}
                        className="w-full"
                      >
                        <Rocket className="size-[14px]" />
                        One-Click Dev Login
                      </DsButton>
                    </div>
                  )}
                </form>
              )}
            </div>
          </div>

          <p className="mt-6 text-center font-sans text-[13px] text-ink-muted">
            End-to-end encrypted.
          </p>
        </div>
      </main>

      {/* Footer */}
      <footer className="flex shrink-0 items-center justify-between border-t border-hairline px-6 py-3">
        <Kicker>Auth via Supabase</Kicker>
        <Kicker>&copy; 2025 HireFeed</Kicker>
      </footer>
    </div>
  );
}

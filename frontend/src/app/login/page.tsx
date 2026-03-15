"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import {
  Envelope,
  CircleNotch,
  Rocket,
  ArrowRight,
  Terminal,
} from "@phosphor-icons/react";

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
    <div className="min-h-screen bg-[#000000] text-white flex flex-col" style={{ fontFamily: "var(--font-ibm-mono), 'Courier New', monospace" }}>

      {/* Top bar */}
      <div className="border-b border-[#1E1E1E] px-5 py-2.5 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 bg-[#FF6E00]" />
          <span className="text-[#FF6E00] text-[11px] font-bold tracking-[0.22em] uppercase">GOONEDIN</span>
          <span className="text-[#2A2A2A] text-xs mx-1">│</span>
          <span className="text-[#444] text-[10px] tracking-[0.15em] uppercase">Job Intelligence Platform</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 bg-[#00B050] animate-pulse" />
            <span className="text-[#00B050] text-[9px] tracking-[0.2em] uppercase">LIVE</span>
          </div>
        </div>
      </div>

      {/* Main */}
      <div className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-sm">

          {/* Section label */}
          <div className="mb-7">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-px flex-1 bg-[#1A1A1A]" />
              <span className="text-[#FF6E00] text-[9px] tracking-[0.3em] uppercase">ACCESS TERMINAL</span>
              <div className="h-px flex-1 bg-[#1A1A1A]" />
            </div>
            <h1 className="text-lg font-bold uppercase tracking-tight text-white leading-tight">
              User Authentication
            </h1>
            <p className="text-[#444] text-[10px] tracking-[0.15em] mt-1 uppercase">
              Passwordless · Magic Link · Encrypted
            </p>
          </div>

          {/* Panel */}
          <div className="border border-[#1E1E1E] bg-[#040404]">

            {/* Panel header */}
            <div className="border-b border-[#1E1E1E] px-4 py-2 flex items-center justify-between bg-[#080808]">
              <span className="text-[#555] text-[9px] uppercase tracking-[0.2em]">SIGN IN / REGISTER</span>
              <Terminal weight="bold" className="h-3 w-3 text-[#333]" />
            </div>

            <div className="p-5">
              {sent ? (
                /* ── Email sent state ── */
                <div className="space-y-5 text-center py-2">
                  <div className="border border-[#1A2A1A] bg-[#060F06] p-4 inline-flex mx-auto">
                    <Envelope weight="bold" className="h-7 w-7 text-[#00B050]" />
                  </div>
                  <div className="space-y-2">
                    <p className="text-[#00B050] text-[9px] tracking-[0.25em] uppercase">TRANSMISSION SENT</p>
                    <h2 className="text-sm font-bold uppercase tracking-wider text-white">Check Your Inbox</h2>
                    <p className="text-[#555] text-[11px] leading-relaxed">
                      Access link dispatched to<br />
                      <span className="text-[#CCC] font-bold">{email}</span>
                    </p>
                  </div>
                  <div className="border-t border-[#141414] pt-4">
                    <button
                      className="text-[#FF6E00] text-[10px] tracking-[0.15em] uppercase hover:text-[#FF8A00] transition-colors"
                      onClick={() => setSent(false)}
                    >
                      ← Use different email
                    </button>
                  </div>
                </div>
              ) : (
                /* ── Login form ── */
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="space-y-1.5">
                    <label
                      htmlFor="email"
                      className="text-[#FF6E00] text-[9px] tracking-[0.22em] uppercase block"
                    >
                      Email Address
                    </label>
                    <input
                      id="email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="user@domain.com"
                      required
                      className="w-full bg-[#000] border border-[#222] text-white px-3 py-2.5 text-sm placeholder-[#2A2A2A] focus:border-[#FF6E00] focus:outline-none transition-colors"
                      style={{ fontFamily: "inherit" }}
                    />
                  </div>

                  {error && (
                    <div className="border border-[#2A1010] bg-[#100808] px-3 py-2 text-[10px] text-[#FF5555] tracking-wide">
                      ⚠ {error}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full bg-[#FF6E00] text-black px-4 py-3 text-[10px] font-bold tracking-[0.22em] uppercase hover:bg-[#FF8A00] active:bg-[#E05E00] transition-colors flex items-center justify-center gap-2 disabled:opacity-40"
                  >
                    {loading ? (
                      <CircleNotch weight="bold" className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        <Envelope weight="bold" className="h-3.5 w-3.5" />
                        Send Access Link
                        <ArrowRight weight="bold" className="h-3.5 w-3.5" />
                      </>
                    )}
                  </button>

                  {process.env.NODE_ENV === "development" && (
                    <div className="pt-3 border-t border-[#111] space-y-2">
                      <p className="text-[#2A2A2A] text-[9px] tracking-[0.2em] uppercase text-center">
                        DEV MODE
                      </p>
                      <button
                        type="button"
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
                        className="w-full border border-[#1E1E1E] text-[#444] px-4 py-2.5 text-[9px] tracking-[0.18em] uppercase hover:border-[#FF6E00] hover:text-[#FF6E00] transition-colors flex items-center justify-center gap-2"
                      >
                        <Rocket weight="bold" className="h-3 w-3" />
                        One-Click Dev Login
                      </button>
                    </div>
                  )}
                </form>
              )}
            </div>
          </div>

          {/* Footer label */}
          <div className="mt-5 flex items-center gap-3">
            <div className="h-px flex-1 bg-[#0F0F0F]" />
            <p className="text-[#222] text-[9px] tracking-[0.2em] uppercase">End-to-End Encrypted</p>
            <div className="h-px flex-1 bg-[#0F0F0F]" />
          </div>
        </div>
      </div>

      {/* Bottom status bar */}
      <div className="border-t border-[#111] px-5 py-1.5 flex items-center justify-between shrink-0">
        <span className="text-[#222] text-[9px] tracking-[0.18em] uppercase">Auth via Supabase</span>
        <span className="text-[#222] text-[9px] tracking-[0.18em] uppercase">© 2025 GoonedIn</span>
      </div>
    </div>
  );
}

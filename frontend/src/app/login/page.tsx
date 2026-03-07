"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { 
  Briefcase, 
  Envelope, 
  CircleNotch,
  Rocket 
} from "@phosphor-icons/react";
import { ThemeToggle } from "@/components/ThemeToggle";

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
    <div className="min-h-screen bg-background flex items-center justify-center p-4 transition-colors duration-300">
      <div className="absolute top-8 right-8">
        <ThemeToggle />
      </div>
      <div className="w-full max-w-md">
        <div className="flex justify-between items-center h-[42px] mb-10">
          <div className="flex items-center gap-3">
            <div className="brutal-border bg-primary p-2 shadow-[2px_2px_0px_0px_var(--border)]">
              <Briefcase weight="fill" className="h-5 w-5 text-white" />
            </div>
            <h1 className="text-xl font-black uppercase italic tracking-tighter leading-none">
              GoonedIn
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
          </div>
        </div>
        <p className="text-xs font-black uppercase tracking-widest text-[#606060] mb-4">
          Job Extraction Engine
        </p>

        <div className="brutal-border bg-card p-8 shadow-[8px_8px_0px_0px_var(--border)]">
          {sent ? (
            <div className="text-center space-y-6">
              <div className="brutal-border bg-[#E6F4EA] p-4 shadow-[4px_4px_0px_0px_#000000] inline-block mx-auto">
                <Envelope weight="bold" className="h-8 w-8 text-[#009063]" />
              </div>
              <div className="space-y-2">
                <h2 className="text-2xl font-black uppercase italic tracking-tighter">Check your email</h2>
                <p className="font-bold text-[#606060] leading-tight">
                  We sent a magic link to <strong>{email}</strong>.
                </p>
              </div>
              <button
                className="w-full brutal-border bg-white text-black py-3 font-black uppercase italic text-sm brutal-btn-hover"
                onClick={() => setSent(false)}
              >
                Use a different email
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <h2 className="text-2xl font-black uppercase italic tracking-tighter mb-1">Sign In / Join</h2>
                <p className="font-bold text-[#606060] text-sm leading-tight">
                  Enter your email to receive a secure login link.
                </p>
              </div>

              <div className="space-y-2">
                <label htmlFor="email" className="text-xs font-black uppercase tracking-widest">
                  Email Address
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                  className="w-full brutal-border bg-card p-3 font-bold text-sm focus:outline-none focus:bg-muted transition-colors"
                />
              </div>

              {error && (
                <div className="brutal-border bg-[#FFEBEB] p-2 text-xs font-bold text-[#D72638]">
                  {error}
                </div>
              )}

              <button
                type="submit"
                className="w-full brutal-border bg-[#F15152] text-white py-4 font-black uppercase italic text-lg brutal-btn-hover flex items-center justify-center gap-2"
                disabled={loading}
              >
                {loading ? (
                  <CircleNotch weight="bold" className="h-6 w-6 animate-spin" />
                ) : (
                  <>
                    <Envelope weight="bold" className="h-6 w-6" />
                    Send Magic Link
                  </>
                )}
              </button>

              {process.env.NODE_ENV === "development" && (
                <div className="pt-6 mt-6 border-t-2 border-black border-dashed">
                  <p className="text-[10px] font-black uppercase tracking-widest text-[#606060] text-center mb-4">
                    Local Development Only
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
                    className="w-full brutal-border bg-card text-foreground py-3 font-black uppercase italic text-sm brutal-btn-hover flex items-center justify-center gap-2"
                  >
                    <Rocket weight="bold" className="h-5 w-5 text-[#F15152]" />
                    One-Click Dev Login
                  </button>
                </div>
              )}
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

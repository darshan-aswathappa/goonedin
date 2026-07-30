"use client";

import { useState, useEffect, useCallback } from "react";
import {
  CircleNotch,
  FloppyDisk,
  Eye,
  EyeSlash,
  PlugsConnected,
  Trash,
} from "@phosphor-icons/react";
import { toast } from "sonner";
import { getAuthHeaders } from "@/hooks/useAuth";
import { useJobsStore } from "@/store/jobs";
import { DsButton, StatusBadge, TextField, type StatusTone } from "@/components/ds";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const PASSWORD_SENTINEL = "••••••••";

type ConnStatus = "unknown" | "connected" | "disconnected";

export function JobrightCredentialsManager() {
  const setHasJobrightCreds = useJobsStore((s) => s.setHasJobrightCreds);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [connStatus, setConnStatus] = useState<ConnStatus>("unknown");
  const [isFetching, setIsFetching] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [emailError, setEmailError] = useState("");

  const fetchCredentials = useCallback(async () => {
    setIsFetching(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`${API_URL}/config/jobright-credentials`, { headers });
      if (res.ok) {
        const data = await res.json();
        if (data.configured && data.email_masked) {
          setEmail(data.email_masked);
          setPassword(PASSWORD_SENTINEL);
          setConnStatus("connected");
          setHasJobrightCreds(true);
        } else {
          setConnStatus("disconnected");
          setHasJobrightCreds(false);
        }
      } else {
        setConnStatus("disconnected");
        setHasJobrightCreds(false);
      }
    } catch {
      setConnStatus("disconnected");
      setHasJobrightCreds(false);
    } finally {
      setIsFetching(false);
    }
  }, [setHasJobrightCreds]);

  useEffect(() => {
    fetchCredentials();
  }, [fetchCredentials]);

  const validateEmail = (val: string) => {
    if (!val.trim()) return "Email is required";
    if (val === email && val.includes("*")) return ""; // masked — unchanged
    if (!val.includes("@")) return "Enter a valid email";
    return "";
  };

  const handleTest = async () => {
    const err = validateEmail(email);
    if (err) { setEmailError(err); return; }
    if (!password || password === PASSWORD_SENTINEL) {
      toast.error("Enter your password to test the connection");
      return;
    }
    setIsTesting(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`${API_URL}/config/jobright-credentials/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success("Connection verified — Jobright is reachable");
        setConnStatus("connected");
      } else {
        toast.error(data.message || "Connection failed — check credentials");
        setConnStatus("disconnected");
      }
    } catch {
      toast.error("Test request failed — check your connection");
    } finally {
      setIsTesting(false);
    }
  };

  const handleSave = async () => {
    const err = validateEmail(email);
    if (err) { setEmailError(err); return; }
    setEmailError("");

    // If password is still the sentinel and email looks like a masked value, nothing changed
    if (password === PASSWORD_SENTINEL && email.includes("*")) {
      toast.error("No changes to save");
      return;
    }
    if (!password || password === PASSWORD_SENTINEL) {
      toast.error("Enter your password to save");
      return;
    }

    setIsSaving(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`${API_URL}/config/jobright-credentials`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({ email, password }),
      });
      if (res.ok) {
        const data = await res.json();
        setEmail(data.email_masked || email);
        setPassword(PASSWORD_SENTINEL);
        setConnStatus("connected");
        setHasJobrightCreds(true);
        toast.success("Jobright credentials saved");
      } else {
        toast.error("Failed to save credentials");
      }
    } catch {
      toast.error("Failed to save credentials");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDisconnect = async () => {
    setIsDisconnecting(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`${API_URL}/config/jobright-credentials`, {
        method: "DELETE",
        headers,
      });
      if (res.ok) {
        setEmail("");
        setPassword("");
        setConnStatus("disconnected");
        setHasJobrightCreds(false);
        toast.success("Jobright disconnected");
      } else {
        toast.error("Failed to disconnect");
      }
    } catch {
      toast.error("Failed to disconnect");
    } finally {
      setIsDisconnecting(false);
    }
  };

  const statusDot: { tone: StatusTone; label: string; live?: boolean } =
    connStatus === "connected"
      ? { tone: "complete", label: "CONNECTED" }
      : connStatus === "disconnected"
      ? { tone: "pending", label: "DISCONNECTED" }
      : { tone: "active", label: "CHECKING", live: true };

  return (
    <div className="rounded-[4px] border border-hairline bg-paper-card">
      {/* Panel header */}
      <div className="flex items-start justify-between gap-4 border-b border-hairline px-5 py-4">
        <div className="flex items-start gap-3">
          <PlugsConnected className="mt-1 size-4 shrink-0 text-ink-muted" />
          <div>
            <h2 className="font-mono text-[11px] uppercase tracking-[0.09em] text-ink-muted">
              Jobright Credentials
            </h2>
            <p className="mt-1 max-w-[440px] font-sans text-[13px] text-ink-muted">
              Connect your Jobright account to pull personalized job recommendations
            </p>
          </div>
        </div>
        {/* Status pill */}
        {!isFetching && (
          <div className="shrink-0 rounded-[4px] border border-hairline bg-paper-sunk px-2.5 py-1">
            <StatusBadge
              label={statusDot.label}
              tone={statusDot.tone}
              live={statusDot.live}
            />
          </div>
        )}
      </div>

      {/* Body */}
      <div className="flex flex-col gap-5 p-5">
        {isFetching ? (
          <div className="flex justify-center py-6">
            <CircleNotch className="size-5 animate-spin text-ink-muted" />
          </div>
        ) : (
          <>
            {/* Email */}
            <TextField
              label="JOBRIGHT EMAIL"
              type="text"
              value={email}
              onChange={(e) => { setEmail(e.target.value); setEmailError(""); }}
              placeholder="your@email.com"
              error={emailError || undefined}
              autoComplete="username"
            />

            {/* Password */}
            <div className="relative">
              <TextField
                label="PASSWORD"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
                className="pr-11"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                title={showPassword ? "Hide password" : "Show password"}
                className="absolute bottom-0 right-2 flex h-12 items-center rounded-[4px] px-1 text-ink-muted transition-colors duration-[120ms] hover:text-ink"
                tabIndex={-1}
              >
                {showPassword ? (
                  <EyeSlash className="size-4" />
                ) : (
                  <Eye className="size-4" />
                )}
              </button>
            </div>

            {/* Action buttons */}
            <div className="flex flex-wrap justify-end gap-3 pt-1">
              {/* Disconnect — only show when connected */}
              {connStatus === "connected" && (
                <DsButton
                  variant="danger"
                  size="sm"
                  onClick={handleDisconnect}
                  disabled={isDisconnecting}
                >
                  {isDisconnecting ? (
                    <CircleNotch className="size-3.5 animate-spin" />
                  ) : (
                    <Trash className="size-3.5" />
                  )}
                  {isDisconnecting ? "Disconnecting…" : "Disconnect"}
                </DsButton>
              )}

              {/* Test Connection */}
              <DsButton
                variant="secondary"
                size="sm"
                onClick={handleTest}
                disabled={isTesting || isSaving}
              >
                {isTesting ? (
                  <>
                    <CircleNotch className="size-3.5 animate-spin" />
                    Testing…
                  </>
                ) : (
                  <>
                    <PlugsConnected className="size-3.5" />
                    Test connection
                  </>
                )}
              </DsButton>

              {/* Save */}
              <DsButton
                variant="primary"
                size="sm"
                onClick={handleSave}
                disabled={isSaving || isTesting}
              >
                {isSaving ? (
                  <>
                    <CircleNotch className="size-3.5 animate-spin" />
                    Saving…
                  </>
                ) : (
                  <>
                    <FloppyDisk className="size-3.5" />
                    Save credentials
                  </>
                )}
              </DsButton>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

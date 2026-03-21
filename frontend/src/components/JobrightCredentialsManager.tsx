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
  const [emailFocused, setEmailFocused] = useState(false);
  const [passFocused, setPassFocused] = useState(false);
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

  const statusDot = connStatus === "connected"
    ? { color: "#22c55e", label: "CONNECTED" }
    : connStatus === "disconnected"
    ? { color: "#555", label: "DISCONNECTED" }
    : { color: "#ffd700", label: "CHECKING" };

  const inputStyle = (focused: boolean) => ({
    background: "#0a0a0a",
    border: focused ? "1px solid #ff8c00" : "1px solid #1c1c1c",
    color: "#f0f0f0",
    fontFamily: "var(--font-mono)",
    fontSize: "11px",
    padding: "7px 10px",
    outline: "none",
    borderRadius: "2px",
    width: "100%",
    boxSizing: "border-box" as const,
  });

  return (
    <div style={{ background: "#080808", border: "1px solid #1c1c1c", borderRadius: "2px" }}>
      {/* Panel header */}
      <div style={{ borderBottom: "1px solid #1c1c1c", padding: "10px 16px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <div style={{ width: "22px", height: "22px", background: "#ff8c00", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <PlugsConnected weight="fill" style={{ color: "#000", width: "12px", height: "12px" }} />
          </div>
          <div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: "9px", fontWeight: 600, letterSpacing: "0.18em", color: "#ff8c00", textTransform: "uppercase" }}>
              // JOBRIGHT CREDENTIALS
            </div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: "9px", color: "#555", letterSpacing: "0.05em", marginTop: "2px" }}>
              Connect your Jobright account to pull personalized job recommendations
            </div>
          </div>
        </div>
        {/* Status pill */}
        {!isFetching && (
          <div style={{ display: "flex", alignItems: "center", gap: "6px", border: "1px solid #1c1c1c", padding: "3px 10px" }}>
            <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: statusDot.color, flexShrink: 0 }} />
            <span style={{ fontFamily: "var(--font-mono)", fontSize: "8px", letterSpacing: "0.12em", color: statusDot.color }}>{statusDot.label}</span>
          </div>
        )}
      </div>

      {/* Body */}
      <div style={{ padding: "16px", display: "flex", flexDirection: "column", gap: "12px" }}>
        {isFetching ? (
          <div style={{ display: "flex", justifyContent: "center", padding: "24px 0" }}>
            <CircleNotch style={{ width: "20px", height: "20px", color: "#ff8c00" }} className="animate-spin" />
          </div>
        ) : (
          <>
            {/* Email */}
            <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
              <label style={{ fontFamily: "var(--font-mono)", fontSize: "9px", color: "#555", letterSpacing: "0.12em", textTransform: "uppercase" }}>
                JOBRIGHT EMAIL
              </label>
              <input
                type="text"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setEmailError(""); }}
                onFocus={() => setEmailFocused(true)}
                onBlur={() => setEmailFocused(false)}
                placeholder="your@email.com"
                style={inputStyle(emailFocused)}
              />
              {emailError && (
                <span style={{ fontFamily: "var(--font-mono)", fontSize: "9px", color: "#ff3333" }}>{emailError}</span>
              )}
            </div>

            {/* Password */}
            <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
              <label style={{ fontFamily: "var(--font-mono)", fontSize: "9px", color: "#555", letterSpacing: "0.12em", textTransform: "uppercase" }}>
                PASSWORD
              </label>
              <div style={{ position: "relative" }}>
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onFocus={() => setPassFocused(true)}
                  onBlur={() => setPassFocused(false)}
                  placeholder="••••••••"
                  style={{ ...inputStyle(passFocused), paddingRight: "36px" }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  style={{
                    position: "absolute",
                    right: "8px",
                    top: "50%",
                    transform: "translateY(-50%)",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    color: "#555",
                    display: "flex",
                    padding: "2px",
                  }}
                  tabIndex={-1}
                >
                  {showPassword
                    ? <EyeSlash style={{ width: "13px", height: "13px" }} />
                    : <Eye style={{ width: "13px", height: "13px" }} />
                  }
                </button>
              </div>
            </div>

            {/* Action buttons */}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", paddingTop: "4px", flexWrap: "wrap" }}>
              {/* Disconnect — only show when connected */}
              {connStatus === "connected" && (
                <button
                  onClick={handleDisconnect}
                  disabled={isDisconnecting}
                  style={{
                    border: "1px solid #333",
                    background: "transparent",
                    color: "#555",
                    fontFamily: "var(--font-mono)",
                    fontSize: "10px",
                    fontWeight: 700,
                    letterSpacing: "0.15em",
                    textTransform: "uppercase",
                    padding: "7px 16px",
                    cursor: isDisconnecting ? "not-allowed" : "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                    opacity: isDisconnecting ? 0.6 : 1,
                  }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = "#ff3333"; (e.currentTarget as HTMLButtonElement).style.color = "#ff3333"; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = "#333"; (e.currentTarget as HTMLButtonElement).style.color = "#555"; }}
                >
                  {isDisconnecting
                    ? <CircleNotch style={{ width: "12px", height: "12px" }} className="animate-spin" />
                    : <Trash style={{ width: "12px", height: "12px" }} />
                  }
                  {isDisconnecting ? "DISCONNECTING..." : "DISCONNECT"}
                </button>
              )}

              {/* Test Connection */}
              <button
                onClick={handleTest}
                disabled={isTesting || isSaving}
                style={{
                  border: "1px solid #1c1c1c",
                  background: "transparent",
                  color: "#aaa",
                  fontFamily: "var(--font-mono)",
                  fontSize: "10px",
                  fontWeight: 700,
                  letterSpacing: "0.15em",
                  textTransform: "uppercase",
                  padding: "7px 16px",
                  cursor: (isTesting || isSaving) ? "not-allowed" : "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  opacity: (isTesting || isSaving) ? 0.6 : 1,
                }}
                onMouseEnter={(e) => { if (!isTesting && !isSaving) { (e.currentTarget as HTMLButtonElement).style.borderColor = "#ff8c00"; (e.currentTarget as HTMLButtonElement).style.color = "#ff8c00"; }}}
                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = "#1c1c1c"; (e.currentTarget as HTMLButtonElement).style.color = "#aaa"; }}
              >
                {isTesting
                  ? <><CircleNotch style={{ width: "12px", height: "12px" }} className="animate-spin" />TESTING...</>
                  : <><PlugsConnected style={{ width: "12px", height: "12px" }} />TEST CONNECTION</>
                }
              </button>

              {/* Save */}
              <button
                onClick={handleSave}
                disabled={isSaving || isTesting}
                style={{
                  border: "1px solid #ff8c00",
                  background: "rgba(255,140,0,0.1)",
                  color: "#ff8c00",
                  fontFamily: "var(--font-mono)",
                  fontSize: "10px",
                  fontWeight: 700,
                  letterSpacing: "0.15em",
                  textTransform: "uppercase",
                  padding: "7px 20px",
                  cursor: (isSaving || isTesting) ? "not-allowed" : "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  opacity: (isSaving || isTesting) ? 0.6 : 1,
                }}
              >
                {isSaving
                  ? <><CircleNotch style={{ width: "12px", height: "12px" }} className="animate-spin" />SAVING...</>
                  : <><FloppyDisk style={{ width: "12px", height: "12px" }} />SAVE CREDENTIALS</>
                }
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

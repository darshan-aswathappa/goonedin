import { useState, useEffect, FormEvent, ChangeEvent } from "react";
import {
  Plus,
  Buildings,
  Briefcase,
  Code,
  MagnifyingGlass,
  Monitor,
} from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useJobsStore, CustomSource } from "@/store/jobs";
import { toast } from "sonner";
import { getAuthHeaders } from "@/hooks/useAuth";

const ICONS = [
  { name: "Buildings", component: Buildings },
  { name: "Briefcase", component: Briefcase },
  { name: "Code", component: Code },
  { name: "MagnifyingGlass", component: MagnifyingGlass },
  { name: "Monitor", component: Monitor },
];

const CONSTRAINTS = {
  NAME_MAX: 100,
  URL_MAX: 500,
  TTL_MIN: 1,
  TTL_MAX: 720,
  INTERVAL_MIN: 1,
  INTERVAL_MAX: 10080,
};

const validateUrl = (urlStr: string): boolean => {
  if (!urlStr.trim()) return false;
  try {
    const url = new URL(urlStr);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
};

interface AddJobSourceModalProps {
  editSource?: CustomSource;
  triggerNode?: React.ReactNode;
  onSuccess?: (id: string) => void;
}

const inputBaseStyle = {
  background: "#0a0a0a",
  border: "1px solid #1c1c1c",
  color: "#f0f0f0",
  fontFamily: "var(--font-mono)",
  fontSize: "11px",
  padding: "7px 10px",
  width: "100%",
  outline: "none",
  borderRadius: "2px",
};

const inputFocusStyle = {
  ...inputBaseStyle,
  border: "1px solid #ff8c00",
};

const inputErrorStyle = {
  ...inputBaseStyle,
  border: "1px solid rgba(255,51,51,0.6)",
};

export function AddJobSourceModal({
  editSource,
  triggerNode,
  onSuccess,
}: AddJobSourceModalProps) {
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [icon, setIcon] = useState("Buildings");
  const [ttlHours, setTtlHours] = useState("24");
  const [intervalMinutes, setIntervalMinutes] = useState("60");
  const [disableJavascript, setDisableJavascript] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

  // Focus states for inputs
  const [nameFocused, setNameFocused] = useState(false);
  const [urlFocused, setUrlFocused] = useState(false);
  const [iconFocused, setIconFocused] = useState(false);
  const [ttlFocused, setTtlFocused] = useState(false);
  const [intervalFocused, setIntervalFocused] = useState(false);
  const [cancelHovered, setCancelHovered] = useState(false);
  const [submitHovered, setSubmitHovered] = useState(false);
  const [triggerHovered, setTriggerHovered] = useState(false);

  const addCustomSource = useJobsStore((state) => state.addCustomSource);

  useEffect(() => {
    if (open && editSource) {
      setEditingId(editSource.id);
      setName(editSource.name);
      setUrl(editSource.url);
      setIcon(editSource.icon);
      setTtlHours(editSource.ttl_hours.toString());
      setIntervalMinutes(editSource.interval_minutes.toString());
      setDisableJavascript(editSource.disable_javascript ?? false);
    } else if (!open) {
      resetForm();
    }
  }, [open, editSource]);

  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};

    if (!name.trim()) {
      errors.name = "Source name is required";
    } else if (name.length > CONSTRAINTS.NAME_MAX) {
      errors.name = `Name must be ${CONSTRAINTS.NAME_MAX} characters or less`;
    }

    if (!url.trim()) {
      errors.url = "URL is required";
    } else if (!validateUrl(url)) {
      errors.url = "Please enter a valid URL (include http:// or https://)";
    } else if (url.length > CONSTRAINTS.URL_MAX) {
      errors.url = `URL must be ${CONSTRAINTS.URL_MAX} characters or less`;
    }

    const ttlNum = parseInt(ttlHours);
    if (isNaN(ttlNum) || ttlNum < CONSTRAINTS.TTL_MIN || ttlNum > CONSTRAINTS.TTL_MAX) {
      errors.ttlHours = `TTL must be between ${CONSTRAINTS.TTL_MIN} and ${CONSTRAINTS.TTL_MAX} hours`;
    }

    const intervalNum = parseInt(intervalMinutes);
    if (isNaN(intervalNum) || intervalNum < CONSTRAINTS.INTERVAL_MIN || intervalNum > CONSTRAINTS.INTERVAL_MAX) {
      errors.intervalMinutes = `Interval must be between ${CONSTRAINTS.INTERVAL_MIN} minute and ${CONSTRAINTS.INTERVAL_MAX / 1440} days`;
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setValidationErrors({});

    if (!validateForm()) {
      return;
    }

    setIsSubmitting(true);

    try {
      const headers = await getAuthHeaders();
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

      const requestPayload = {
        source: {
          id: editingId || crypto.randomUUID(),
          name,
          icon,
          url,
          ttl_hours: parseInt(ttlHours),
          interval_minutes: parseInt(intervalMinutes),
          disable_javascript: disableJavascript,
        },
      };

      const endpoint = editingId
        ? `${apiUrl}/config/custom-sources/${editingId}`
        : `${apiUrl}/config/custom-sources`;
      const method = editingId ? "PUT" : "POST";

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const res = await fetch(endpoint, {
        method,
        headers: {
          "Content-Type": "application/json",
          ...headers,
        },
        body: JSON.stringify(requestPayload),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!res.ok) {
        let errorMsg = "Failed to save source";
        try {
          const errorData = await res.json();
          if (errorData.detail) {
            errorMsg = errorData.detail;
          }
        } catch {
          if (res.status === 409) {
            errorMsg = "A source with this name already exists";
          } else if (res.status === 400) {
            errorMsg = "URL or settings are invalid. Check the URL format and try again.";
          } else if (res.status >= 500) {
            errorMsg = "Server error. Please try again later.";
          } else if (res.status === 401) {
            errorMsg = "Please sign in again";
          }
        }
        toast.error(errorMsg);
        setIsSubmitting(false);
        return;
      }

      const responseData = await res.json();
      const newSourceList: CustomSource[] = responseData.custom_sources || [];
      const newSource = newSourceList.find(
        (s) => s.id === requestPayload.source.id,
      );

      if (newSource) {
        if (!editingId) {
          addCustomSource(newSource);
        } else {
          useJobsStore.getState().updateCustomSource(editingId, newSource);
        }
        toast.success(
          `${editingId ? "Updated" : "Tracking jobs from"} ${newSource.name}`,
        );
        if (onSuccess) onSuccess(newSource.id);
      } else {
        useJobsStore.getState().setCustomSources(newSourceList);
        toast.success(
          `${editingId ? "Updated" : "Tracking jobs from"} ${name}`,
        );
        if (onSuccess && newSourceList.length > 0 && !editingId) {
          onSuccess(newSourceList[newSourceList.length - 1].id);
        }
      }

      setOpen(false);
      resetForm();
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        toast.error("Request timed out. Please check your connection and try again.");
      } else if (err instanceof TypeError) {
        toast.error("Network error. Check your connection and try again.");
      } else {
        toast.error("Failed to save source. Please try again.");
      }
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetForm = () => {
    setEditingId(null);
    setName("");
    setUrl("");
    setIcon("Buildings");
    setTtlHours("24");
    setIntervalMinutes("60");
    setDisableJavascript(false);
  };

  const labelStyle: React.CSSProperties = {
    fontFamily: "var(--font-mono)",
    fontSize: "9px",
    fontWeight: 600,
    letterSpacing: "0.15em",
    textTransform: "uppercase",
    color: "#555",
    display: "block",
    marginBottom: "4px",
  };

  const errorStyle: React.CSSProperties = {
    fontFamily: "var(--font-mono)",
    fontSize: "9px",
    color: "#ff3333",
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    marginTop: "4px",
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(val) => {
        setOpen(val);
        if (!val) resetForm();
      }}
    >
      <DialogTrigger asChild>
        {triggerNode || (
          <button
            onMouseEnter={() => setTriggerHovered(true)}
            onMouseLeave={() => setTriggerHovered(false)}
            style={{
              border: triggerHovered ? "1px solid #ff8c00" : "1px solid #1c1c1c",
              background: "transparent",
              color: triggerHovered ? "#ff8c00" : "#555",
              fontFamily: "var(--font-mono)",
              fontSize: "9px",
              letterSpacing: "0.15em",
              textTransform: "uppercase",
              padding: "6px 12px",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "6px",
              whiteSpace: "nowrap",
              transition: "border-color 0.1s, color 0.1s",
              borderRadius: "2px",
            }}
          >
            <Plus weight="bold" className="h-4 w-4 sm:h-5 sm:w-5" />
            <span className="sr-only sm:not-sr-only sm:inline">Add Source</span>
          </button>
        )}
      </DialogTrigger>

      <DialogContent
        className="max-w-[calc(100%-1.5rem)] sm:max-w-[425px] md:max-w-lg rounded-none max-h-[90dvh] overflow-y-auto p-0"
        style={{
          background: "#060606",
          border: "1px solid #333",
          boxShadow: "none",
          borderRadius: "2px",
        }}
      >
        {/* Modal Header */}
        <DialogHeader
          style={{
            background: "#080808",
            borderBottom: "1px solid #1c1c1c",
            padding: "12px 16px",
          }}
        >
          <DialogTitle asChild>
            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "9px",
                fontWeight: 600,
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                color: "#ff8c00",
              }}
            >
              {editingId ? "// EDIT JOB BOARD" : "// CUSTOM JOB BOARD"}
            </div>
          </DialogTitle>
          <DialogDescription
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "9px",
              color: "#555",
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              marginTop: "4px",
            }}
          >
            Automatically extract jobs from any website
          </DialogDescription>
        </DialogHeader>

        {/* Form */}
        <form
          onSubmit={handleSubmit}
          style={{ padding: "16px", display: "flex", flexDirection: "column", gap: "16px" }}
        >
          {/* Name */}
          <div>
            <label htmlFor="name" style={labelStyle}>
              Name <span style={{ color: "#ff3333" }}>*</span>
            </label>
            <input
              id="name"
              value={name}
              maxLength={CONSTRAINTS.NAME_MAX}
              onChange={(e: ChangeEvent<HTMLInputElement>) => {
                setName(e.target.value.slice(0, CONSTRAINTS.NAME_MAX));
                if (validationErrors.name) {
                  setValidationErrors((prev) => {
                    const next = { ...prev };
                    delete next.name;
                    return next;
                  });
                }
              }}
              onFocus={() => setNameFocused(true)}
              onBlur={() => setNameFocused(false)}
              style={validationErrors.name ? inputErrorStyle : nameFocused ? inputFocusStyle : inputBaseStyle}
              placeholder="e.g. Acme Corp Jobs"
            />
            {validationErrors.name && (
              <p style={errorStyle}>{validationErrors.name}</p>
            )}
          </div>

          {/* URL */}
          <div>
            <label htmlFor="url" style={labelStyle}>
              Job Board URL <span style={{ color: "#ff3333" }}>*</span>
            </label>
            <input
              id="url"
              value={url}
              maxLength={CONSTRAINTS.URL_MAX}
              onChange={(e: ChangeEvent<HTMLInputElement>) => {
                setUrl(e.target.value.slice(0, CONSTRAINTS.URL_MAX));
                if (validationErrors.url) {
                  setValidationErrors((prev) => {
                    const next = { ...prev };
                    delete next.url;
                    return next;
                  });
                }
              }}
              onFocus={() => setUrlFocused(true)}
              onBlur={() => setUrlFocused(false)}
              style={validationErrors.url ? inputErrorStyle : urlFocused ? inputFocusStyle : inputBaseStyle}
              placeholder="https://jobs.example.com"
            />
            {validationErrors.url && (
              <p style={errorStyle}>{validationErrors.url}</p>
            )}
          </div>

          {/* Icon */}
          <div>
            <label htmlFor="icon" style={labelStyle}>
              Icon
            </label>
            <select
              id="icon"
              value={icon}
              onChange={(e: ChangeEvent<HTMLSelectElement>) => setIcon(e.target.value)}
              onFocus={() => setIconFocused(true)}
              onBlur={() => setIconFocused(false)}
              style={iconFocused ? inputFocusStyle : inputBaseStyle}
            >
              {ICONS.map((Ico) => (
                <option key={Ico.name} value={Ico.name}>
                  {Ico.name}
                </option>
              ))}
            </select>
          </div>

          {/* TTL + Interval */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            <div>
              <label htmlFor="ttl" style={labelStyle}>
                Keep jobs (hrs) <span style={{ color: "#ff3333" }}>*</span>
              </label>
              <input
                id="ttl"
                type="number"
                min={CONSTRAINTS.TTL_MIN}
                max={CONSTRAINTS.TTL_MAX}
                step="1"
                value={ttlHours}
                onChange={(e: ChangeEvent<HTMLInputElement>) => {
                  setTtlHours(e.target.value);
                  if (validationErrors.ttlHours) {
                    setValidationErrors((prev) => {
                      const next = { ...prev };
                      delete next.ttlHours;
                      return next;
                    });
                  }
                }}
                onFocus={() => setTtlFocused(true)}
                onBlur={() => setTtlFocused(false)}
                style={validationErrors.ttlHours ? inputErrorStyle : ttlFocused ? inputFocusStyle : inputBaseStyle}
              />
              {validationErrors.ttlHours && (
                <p style={errorStyle}>{validationErrors.ttlHours}</p>
              )}
            </div>
            <div>
              <label htmlFor="interval" style={labelStyle}>
                Check every (min) <span style={{ color: "#ff3333" }}>*</span>
              </label>
              <input
                id="interval"
                type="number"
                min={CONSTRAINTS.INTERVAL_MIN}
                max={CONSTRAINTS.INTERVAL_MAX}
                step="1"
                value={intervalMinutes}
                onChange={(e: ChangeEvent<HTMLInputElement>) => {
                  setIntervalMinutes(e.target.value);
                  if (validationErrors.intervalMinutes) {
                    setValidationErrors((prev) => {
                      const next = { ...prev };
                      delete next.intervalMinutes;
                      return next;
                    });
                  }
                }}
                onFocus={() => setIntervalFocused(true)}
                onBlur={() => setIntervalFocused(false)}
                style={validationErrors.intervalMinutes ? inputErrorStyle : intervalFocused ? inputFocusStyle : inputBaseStyle}
              />
              {validationErrors.intervalMinutes && (
                <p style={errorStyle}>{validationErrors.intervalMinutes}</p>
              )}
            </div>
          </div>

          {/* Checkbox */}
          <div>
            <div style={{ display: "flex", alignItems: "flex-start", gap: "8px", marginTop: "4px" }}>
              <input
                type="checkbox"
                id="disable_js"
                checked={disableJavascript}
                onChange={(e) => setDisableJavascript(e.target.checked)}
                className="h-4 w-4 accent-black mt-1"
                style={{ border: "1px solid #1c1c1c", flexShrink: 0 }}
              />
              <label
                htmlFor="disable_js"
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "10px",
                  color: "#aaa",
                  letterSpacing: "0.05em",
                  cursor: "pointer",
                }}
              >
                Browser scraping (works on JS-heavy sites)
              </label>
            </div>
          </div>

          {/* Footer */}
          <DialogFooter
            style={{
              borderTop: "1px solid #1c1c1c",
              paddingTop: "12px",
              marginTop: "4px",
              display: "flex",
              gap: "8px",
              justifyContent: "flex-end",
              alignItems: "center",
            }}
          >
            {editingId && (
              <Button
                type="button"
                onClick={() => setOpen(false)}
                variant="outline"
                onMouseEnter={() => setCancelHovered(true)}
                onMouseLeave={() => setCancelHovered(false)}
                style={{
                  border: cancelHovered ? "1px solid #333" : "1px solid #1c1c1c",
                  background: "transparent",
                  color: cancelHovered ? "#aaa" : "#555",
                  fontFamily: "var(--font-mono)",
                  fontSize: "10px",
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  padding: "7px 16px",
                  cursor: "pointer",
                  transition: "border-color 0.1s, color 0.1s",
                  borderRadius: "2px",
                  height: "auto",
                }}
              >
                Cancel
              </Button>
            )}
            <Button
              type="submit"
              disabled={isSubmitting}
              onMouseEnter={() => setSubmitHovered(true)}
              onMouseLeave={() => setSubmitHovered(false)}
              style={{
                border: "1px solid #ff8c00",
                background: submitHovered && !isSubmitting ? "rgba(255,140,0,0.18)" : "rgba(255,140,0,0.1)",
                color: "#ff8c00",
                fontFamily: "var(--font-mono)",
                fontSize: "10px",
                fontWeight: 700,
                letterSpacing: "0.15em",
                textTransform: "uppercase",
                padding: "7px 20px",
                cursor: isSubmitting ? "not-allowed" : "pointer",
                flex: 1,
                transition: "background 0.1s",
                borderRadius: "2px",
                height: "auto",
                opacity: isSubmitting ? 0.5 : 1,
              }}
            >
              {isSubmitting
                ? "Saving..."
                : editingId
                  ? "Update"
                  : "Start Scraping"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

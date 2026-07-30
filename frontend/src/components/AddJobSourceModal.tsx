import { useState, useEffect, FormEvent, ChangeEvent } from "react";
import {
  Plus,
  Buildings,
  Briefcase,
  Code,
  MagnifyingGlass,
  Monitor,
} from "@phosphor-icons/react";
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
import { Kicker, DsButton, TextField, Checkbox } from "@/components/ds";

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

/** Matches the DS TextField field surface — used for the native <select>. */
const SELECT_CLASS =
  "w-full cursor-pointer appearance-none rounded-[4px] border border-hairline bg-paper-card px-4 py-3 font-mono text-[15px] text-ink outline-none transition-colors duration-[120ms] focus:border-brick";

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
          <DsButton
            variant="secondary"
            size="sm"
            className="whitespace-nowrap font-mono text-[11px] uppercase tracking-[0.09em]"
          >
            <Plus weight="regular" className="size-4 text-ink-muted" />
            <span className="sr-only sm:not-sr-only sm:inline">Add Source</span>
          </DsButton>
        )}
      </DialogTrigger>

      <DialogContent className="max-w-[calc(100%-1.5rem)] sm:max-w-[425px] md:max-w-lg max-h-[90dvh] overflow-y-auto p-0 gap-0 rounded-[10px] border border-hairline bg-paper shadow-[var(--shadow-modal)]">
        {/* Modal Header */}
        <DialogHeader className="flex flex-col gap-1 border-b border-hairline bg-paper-card px-5 py-5 text-left sm:px-7 sm:py-6">
          <Kicker>{editingId ? "Edit source" : "Feed the press"}</Kicker>
          <DialogTitle asChild>
            <h2 className="font-serif text-[22px] font-semibold leading-tight text-ink sm:text-[28px]">
              {editingId ? "Edit job board" : "Custom job board"}
            </h2>
          </DialogTitle>
          <DialogDescription className="mt-1 font-sans text-[13px] leading-snug text-ink-2 sm:text-[15px]">
            Automatically extract jobs from any website
          </DialogDescription>
        </DialogHeader>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-5 px-5 py-6 sm:px-7">
          {/* Name */}
          <TextField
            id="name"
            label="Name *"
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
            error={validationErrors.name}
            placeholder="e.g. Acme Corp Jobs"
          />

          {/* URL */}
          <TextField
            id="url"
            label="Job Board URL *"
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
            error={validationErrors.url}
            placeholder="https://jobs.example.com"
          />

          {/* Icon */}
          <div className="flex flex-col gap-2">
            <Kicker as="label" htmlFor="icon">
              Icon
            </Kicker>
            <select
              id="icon"
              value={icon}
              onChange={(e: ChangeEvent<HTMLSelectElement>) => setIcon(e.target.value)}
              className={SELECT_CLASS}
            >
              {ICONS.map((Ico) => (
                <option key={Ico.name} value={Ico.name}>
                  {Ico.name}
                </option>
              ))}
            </select>
          </div>

          {/* TTL + Interval */}
          <div className="grid grid-cols-2 gap-3">
            <TextField
              id="ttl"
              label="Keep jobs (hrs) *"
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
              error={validationErrors.ttlHours}
            />
            <TextField
              id="interval"
              label="Check every (min) *"
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
              error={validationErrors.intervalMinutes}
            />
          </div>

          {/* Checkbox */}
          <Checkbox
            id="disable_js"
            checked={disableJavascript}
            onChange={(e) => setDisableJavascript(e.target.checked)}
            label="Browser scraping (works on JS-heavy sites)"
            className="text-[13px] sm:text-[15px]"
          />

          {/* Footer */}
          <DialogFooter className="mt-1 flex flex-row items-center justify-end gap-2 border-t border-hairline pt-5">
            {editingId && (
              <DsButton type="button" onClick={() => setOpen(false)} variant="secondary" size="sm">
                Cancel
              </DsButton>
            )}
            <DsButton type="submit" disabled={isSubmitting} variant="primary" size="sm" className="flex-1">
              {isSubmitting
                ? "Saving..."
                : editingId
                  ? "Update"
                  : "Start Scraping"}
            </DsButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

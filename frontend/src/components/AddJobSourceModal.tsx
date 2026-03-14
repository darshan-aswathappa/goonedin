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
          <button className="brutal-border rounded-none px-2.5 sm:px-4 py-2 sm:py-3 font-black uppercase italic tracking-tighter text-xs sm:text-sm bg-muted text-foreground shadow-[1px_1px_0px_0px_var(--border)] sm:shadow-[4px_4px_0px_0px_var(--border)] brutal-btn-hover whitespace-nowrap shrink-0 flex items-center gap-1 sm:gap-2 h-10 sm:h-auto">
            <Plus weight="bold" className="h-4 w-4 sm:h-5 sm:w-5" />
            <span className="sr-only sm:not-sr-only sm:inline">Add Source</span>
          </button>
        )}
      </DialogTrigger>

      <DialogContent className="max-w-[calc(100%-1.5rem)] sm:max-w-[425px] brutal-border rounded-none bg-card shadow-[2px_2px_0px_0px_var(--border)] sm:shadow-[4px_4px_0px_0px_var(--border)] max-h-[90dvh] overflow-y-auto p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle className="font-black italic uppercase tracking-tighter text-lg sm:text-2xl text-foreground">
            {editingId ? "Edit Job Board" : "Custom Job Board"}
          </DialogTitle>
          <DialogDescription className="font-bold uppercase text-xs text-muted-foreground">
            Automatically extract jobs from any website
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="grid gap-3 sm:gap-6 py-2 sm:py-4">
          <div className="grid gap-1.5 sm:gap-2">
            <label
              htmlFor="name"
              className="font-black italic uppercase tracking-tight text-xs text-foreground"
            >
              Name <span className="text-destructive">*</span>
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
              className={`flex h-9 sm:h-10 w-full bg-background px-2.5 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-0 disabled:cursor-not-allowed disabled:opacity-50 brutal-border rounded-none shadow-[1px_1px_0px_0px_var(--border)] ${
                validationErrors.name ? "border-destructive" : ""
              }`}
              placeholder="e.g. Acme Corp Jobs"
            />
            {validationErrors.name && (
              <p className="text-xs text-destructive font-bold uppercase">{validationErrors.name}</p>
            )}
            <p className="text-xs text-muted-foreground">
              {name.length}/{CONSTRAINTS.NAME_MAX}
            </p>
          </div>
          <div className="grid gap-1.5 sm:gap-2">
            <label
              htmlFor="url"
              className="font-black italic uppercase tracking-tight text-xs text-foreground"
            >
              Job Board URL <span className="text-destructive">*</span>
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
              className={`flex h-9 sm:h-10 w-full bg-background px-2.5 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-0 disabled:cursor-not-allowed disabled:opacity-50 brutal-border rounded-none shadow-[1px_1px_0px_0px_var(--border)] ${
                validationErrors.url ? "border-destructive" : ""
              }`}
              placeholder="https://jobs.example.com"
            />
            {validationErrors.url && (
              <p className="text-xs text-destructive font-bold uppercase">{validationErrors.url}</p>
            )}
            <p className="text-xs text-muted-foreground">
              Must start with http:// or https://
            </p>
          </div>

          <div className="grid gap-1.5 sm:gap-2">
            <label
              htmlFor="icon"
              className="font-black italic uppercase tracking-tight text-xs text-foreground"
            >
              Icon
            </label>
            <select
              id="icon"
              value={icon}
              onChange={(e: ChangeEvent<HTMLSelectElement>) =>
                setIcon(e.target.value)
              }
              className="brutal-border font-bold w-full rounded-none flex h-9 sm:h-10 bg-background px-2.5 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-0 disabled:cursor-not-allowed disabled:opacity-50 shadow-[1px_1px_0px_0px_var(--border)]"
            >
              {ICONS.map((Ico) => (
                <option key={Ico.name} value={Ico.name} className="font-bold">
                  {Ico.name}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            <div className="grid gap-1.5 sm:gap-2">
              <label
                htmlFor="ttl"
                className="font-black italic uppercase tracking-tight text-xs text-foreground"
              >
                Keep jobs (hrs) <span className="text-destructive">*</span>
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
                className={`flex h-9 sm:h-10 w-full bg-background px-2.5 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-0 disabled:cursor-not-allowed disabled:opacity-50 brutal-border rounded-none shadow-[1px_1px_0px_0px_var(--border)] ${
                  validationErrors.ttlHours ? "border-destructive" : ""
                }`}
              />
              {validationErrors.ttlHours && (
                <p className="text-xs text-destructive font-bold uppercase">{validationErrors.ttlHours}</p>
              )}
              <p className="text-xs text-muted-foreground">1-720</p>
            </div>
            <div className="grid gap-1.5 sm:gap-2">
              <label
                htmlFor="interval"
                className="font-black italic uppercase tracking-tight text-xs text-foreground"
              >
                Check every (min) <span className="text-destructive">*</span>
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
                className={`flex h-9 sm:h-10 w-full bg-background px-2.5 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-0 disabled:cursor-not-allowed disabled:opacity-50 brutal-border rounded-none shadow-[1px_1px_0px_0px_var(--border)] ${
                  validationErrors.intervalMinutes ? "border-destructive" : ""
                }`}
              />
              {validationErrors.intervalMinutes && (
                <p className="text-xs text-destructive font-bold uppercase">{validationErrors.intervalMinutes}</p>
              )}
              <p className="text-xs text-muted-foreground">1-10080</p>
            </div>
          </div>

          <div className="grid gap-1.5 sm:gap-2">
            <div className="flex items-start space-x-2 mt-1 sm:mt-2">
              <input
                type="checkbox"
                id="disable_js"
                checked={disableJavascript}
                onChange={(e) => setDisableJavascript(e.target.checked)}
                className="h-4 w-4 brutal-border accent-black mt-1"
              />
              <label
                htmlFor="disable_js"
                className="font-black italic uppercase tracking-tight text-xs cursor-pointer text-foreground"
              >
                Browser scraping (works on JS-heavy sites)
              </label>
            </div>
            <p className="text-xs text-muted-foreground ml-6">
              Slower but handles complex sites
            </p>
          </div>

          <DialogFooter className="mt-3 sm:mt-4 items-stretch gap-2 sm:flex-row sm:items-center sm:justify-between border-t border-border pt-3 sm:pt-4">
            {editingId && (
              <Button
                type="button"
                onClick={() => setOpen(false)}
                variant="outline"
                className="brutal-border font-black italic uppercase shadow-[1px_1px_0px_0px_var(--border)] sm:shadow-[2px_2px_0px_0px_var(--border)] transition-all active:translate-x-[1px] active:translate-y-[1px] active:shadow-none bg-card text-foreground hover:bg-muted w-full sm:w-auto sm:flex-none text-xs sm:text-sm py-1.5 sm:py-2"
              >
                Cancel
              </Button>
            )}
            <Button
              type="submit"
              disabled={isSubmitting}
              className="w-full brutal-border rounded-none font-black italic uppercase bg-primary text-primary-foreground shadow-[1px_1px_0px_0px_var(--border)] sm:shadow-[2px_2px_0px_0px_var(--border)] transition-all active:translate-x-[1px] active:translate-y-[1px] active:shadow-none disabled:opacity-50 sm:flex-1 sm:min-w-0 hover:bg-primary/90 text-xs sm:text-sm py-1.5 sm:py-2"
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

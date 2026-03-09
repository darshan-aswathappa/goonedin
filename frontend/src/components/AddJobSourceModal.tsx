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

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      setIsSubmitting(true);

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

      const res = await fetch(endpoint, {
        method,
        headers: {
          "Content-Type": "application/json",
          ...headers,
        },
        body: JSON.stringify(requestPayload),
      });

      if (!res.ok)
        throw new Error(
          `Failed to ${editingId ? "update" : "add"} custom source`,
        );

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
        // Fallback if not found for some reason, just update the whole list
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
      toast.error("Error creating job source");
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
          <button className="brutal-border rounded-none px-4 py-3 font-black uppercase italic tracking-tighter text-sm bg-muted text-foreground shadow-[4px_4px_0px_0px_var(--border)] transition-all hover:bg-neutral-200 dark:hover:bg-neutral-800 active:translate-x-[2px] active:translate-y-[2px] active:shadow-none whitespace-nowrap shrink-0 flex items-center gap-2">
            <Plus weight="bold" className="h-5 w-5" />
            <span className="sr-only sm:not-sr-only sm:inline">Add Source</span>
          </button>
        )}
      </DialogTrigger>

      <DialogContent className="sm:max-w-[425px] brutal-border brutal-shadow rounded-none sm:rounded-none bg-background">
        <DialogHeader>
          <DialogTitle className="font-black italic uppercase tracking-tighter text-2xl">
            {editingId ? "Edit Custom Job Board" : "Custom Job Board"}
          </DialogTitle>
          <DialogDescription className="font-medium">
            AI Scrape jobs from any custom URL
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="grid gap-6 py-4">
          <div className="grid gap-2">
            <label
              htmlFor="name"
              className="font-black uppercase tracking-tight text-xs"
            >
              Name
            </label>
            <input
              id="name"
              value={name}
              onChange={(e: ChangeEvent<HTMLInputElement>) =>
                setName(e.target.value)
              }
              className="flex h-10 w-full bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 brutal-border rounded-none focus-visible:ring-0 focus-visible:border-black"
              placeholder="e.g. Acme Corp Jobs"
              required
            />
          </div>
          <div className="grid gap-2">
            <label
              htmlFor="url"
              className="font-black uppercase tracking-tight text-xs"
            >
              Origin URL
            </label>
            <input
              id="url"
              type="url"
              value={url}
              onChange={(e: ChangeEvent<HTMLInputElement>) =>
                setUrl(e.target.value)
              }
              className="flex h-10 w-full bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 brutal-border rounded-none focus-visible:ring-0 focus-visible:border-black"
              placeholder="https://acme.com/careers"
              required
            />
          </div>

          <div className="grid gap-2 flex-1">
            <label
              htmlFor="icon"
              className="font-black uppercase tracking-tight text-xs"
            >
              Icon
            </label>
            <div className="relative">
              <select
                id="icon"
                value={icon}
                onChange={(e: ChangeEvent<HTMLSelectElement>) =>
                  setIcon(e.target.value)
                }
                className="brutal-border font-bold w-full rounded-none flex h-10 w-full bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {ICONS.map((Ico) => (
                  <option key={Ico.name} value={Ico.name} className="font-bold">
                    {Ico.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <label
                htmlFor="ttl"
                className="font-black uppercase tracking-tight text-xs"
              >
                Job TTL (Hours)
              </label>
              <input
                id="ttl"
                type="number"
                min="1"
                value={ttlHours}
                onChange={(e: ChangeEvent<HTMLInputElement>) =>
                  setTtlHours(e.target.value)
                }
                className="flex h-10 w-full bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 brutal-border rounded-none focus-visible:ring-0 focus-visible:border-black"
                required
              />
            </div>
            <div className="grid gap-2">
              <label
                htmlFor="interval"
                className="font-black uppercase tracking-tight text-xs"
              >
                Refresh (Mins)
              </label>
              <input
                id="interval"
                type="number"
                min="5"
                value={intervalMinutes}
                onChange={(e: ChangeEvent<HTMLInputElement>) =>
                  setIntervalMinutes(e.target.value)
                }
                className="flex h-10 w-full bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 brutal-border rounded-none focus-visible:ring-0 focus-visible:border-black"
                required
              />
            </div>
          </div>

          <div className="grid gap-2">
            <div className="flex items-center space-x-2 mt-2">
              <input
                type="checkbox"
                id="disable_js"
                checked={disableJavascript}
                onChange={(e) => setDisableJavascript(e.target.checked)}
                className="h-4 w-4 brutal-border accent-black"
              />
              <label
                htmlFor="disable_js"
                className="font-black uppercase tracking-tight text-xs cursor-pointer"
              >
                Disable JavaScript (Faster)
              </label>
            </div>
            <p className="text-xs text-muted-foreground ml-6">
              Enable this only if the job board is a Single Page App (SPA) that
              requires JavaScript to load listings.
            </p>
          </div>

          <DialogFooter className="mt-2 items-stretch gap-2 sm:flex-row sm:items-center sm:justify-between">
            {editingId && (
              <Button
                type="button"
                onClick={() => setOpen(false)}
                variant="outline"
                className="w-full brutal-border font-black italic uppercase sm:w-auto sm:flex-none shadow-[4px_4px_0px_0px_var(--border)] transition-all hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none"
              >
                Cancel Edit
              </Button>
            )}
            <Button
              type="submit"
              disabled={isSubmitting}
              className="w-full brutal-border rounded-none font-black italic uppercase bg-primary text-white shadow-[4px_4px_0px_0px_var(--border)] transition-all hover:bg-primary/90 hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none disabled:opacity-50 sm:flex-1 sm:min-w-0"
            >
              {isSubmitting
                ? "Saving..."
                : editingId
                  ? "Update Source"
                  : "Start Scraping"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

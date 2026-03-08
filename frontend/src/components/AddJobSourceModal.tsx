import { useState, FormEvent, ChangeEvent } from "react";
import { Plus, Buildings, Briefcase, Code, MagnifyingGlass, Monitor, Trash } from "@phosphor-icons/react";
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

export function AddJobSourceModal() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [icon, setIcon] = useState("Buildings");
  const [ttlHours, setTtlHours] = useState("24");
  const [intervalMinutes, setIntervalMinutes] = useState("60");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const addCustomSource = useJobsStore((state) => state.addCustomSource);
  const removeCustomSource = useJobsStore((state) => state.removeCustomSource);
  const customSources = useJobsStore((state) => state.customSources);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      setIsSubmitting(true);
      
      const headers = await getAuthHeaders();

      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
      const res = await fetch(`${apiUrl}/config/custom-sources`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...headers
        },
        body: JSON.stringify({
          source: {
            id: name.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-' + Math.random().toString(36).substring(2, 7),
            name,
            icon,
            url,
            ttl_hours: parseInt(ttlHours),
            interval_minutes: parseInt(intervalMinutes)
          }
        })
      });

      if (!res.ok) throw new Error("Failed to add custom source");

      const newSource = (await res.json()) as CustomSource;
      addCustomSource(newSource);
      
      toast.success(`Tracking jobs from ${newSource.name}`);
      setOpen(false);
      resetForm();
    } catch (err) {
      toast.error("Error creating job source");
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
      try {
          const headers = await getAuthHeaders();
          const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
          
          const res = await fetch(`${apiUrl}/config/custom-sources/${id}`, {
              method: "DELETE",
              headers
          });
          
          if (!res.ok) throw new Error("Failed to delete");
          removeCustomSource(id);
          toast.success(`Deleted ${name}`);
      } catch (err) {
          toast.error("Error deleting job source");
          console.error(err);
      }
  };

  const resetForm = () => {
    setName("");
    setUrl("");
    setIcon("Buildings");
    setTtlHours("24");
    setIntervalMinutes("60");
  };

  return (
    <Dialog open={open} onOpenChange={(val) => {
      setOpen(val);
      if (!val) resetForm();
    }}>
      <DialogTrigger asChild>
        <button
          className="brutal-border rounded-none px-4 py-3 font-black uppercase italic tracking-tighter text-sm bg-muted text-foreground shadow-[4px_4px_0px_0px_var(--border)] transition-all hover:bg-neutral-200 dark:hover:bg-neutral-800 active:translate-x-[2px] active:translate-y-[2px] active:shadow-none whitespace-nowrap shrink-0 flex items-center gap-2"
        >
          <Plus weight="bold" className="h-5 w-5" />
          <span className="sr-only sm:not-sr-only sm:inline">Add Source</span>
        </button>
      </DialogTrigger>
      
      <DialogContent className="sm:max-w-[425px] brutal-border brutal-shadow rounded-none sm:rounded-none bg-background">
        <DialogHeader>
          <DialogTitle className="font-black italic uppercase tracking-tighter text-2xl">
            Custom Job Board
          </DialogTitle>
          <DialogDescription className="font-medium">
            AI Scrape jobs from any custom URL
          </DialogDescription>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="grid gap-6 py-4">
          <div className="grid gap-2">
            <label htmlFor="name" className="font-black uppercase tracking-tight text-xs">Name</label>
            <input
              id="name"
              value={name}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setName(e.target.value)}
              className="flex h-10 w-full bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 brutal-border rounded-none focus-visible:ring-0 focus-visible:border-black"
              placeholder="e.g. Acme Corp Jobs"
              required
            />
          </div>
          <div className="grid gap-2">
            <label htmlFor="url" className="font-black uppercase tracking-tight text-xs">Origin URL</label>
            <input
              id="url"
              type="url"
              value={url}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setUrl(e.target.value)}
              className="flex h-10 w-full bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 brutal-border rounded-none focus-visible:ring-0 focus-visible:border-black"
              placeholder="https://acme.com/careers"
              required
            />
          </div>
          
          <div className="grid gap-2 flex-1">
            <label htmlFor="icon" className="font-black uppercase tracking-tight text-xs">Icon</label>
            <div className="relative">
                <select
                    id="icon"
                    value={icon}
                    onChange={(e: ChangeEvent<HTMLSelectElement>) => setIcon(e.target.value)}
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
                <label htmlFor="ttl" className="font-black uppercase tracking-tight text-xs">Job TTL (Hours)</label>
                <input
                id="ttl"
                type="number"
                min="1"
                value={ttlHours}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setTtlHours(e.target.value)}
                className="flex h-10 w-full bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 brutal-border rounded-none focus-visible:ring-0 focus-visible:border-black"
                required
                />
            </div>
            <div className="grid gap-2">
                <label htmlFor="interval" className="font-black uppercase tracking-tight text-xs">Refresh (Mins)</label>
                <input
                id="interval"
                type="number"
                min="5"
                value={intervalMinutes}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setIntervalMinutes(e.target.value)}
                className="flex h-10 w-full bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 brutal-border rounded-none focus-visible:ring-0 focus-visible:border-black"
                required
                />
            </div>
          </div>
          
          <DialogFooter className="sm:justify-between items-center sm:items-center mt-2">
            <Button
              type="submit"
              disabled={isSubmitting}
              className="brutal-border rounded-none font-black italic uppercase w-full bg-primary hover:bg-primary/90 text-white disabled:opacity-50 shadow-[4px_4px_0px_0px_var(--border)] transition-all hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none"
            >
              {isSubmitting ? "Saving..." : "Start Scraping"}
            </Button>
          </DialogFooter>
        </form>

        {customSources.length > 0 && (
            <div className="mt-4 pt-6 border-t-[3px] border-border">
                <h4 className="font-black italic uppercase tracking-tight text-sm mb-4">Manage Sources</h4>
                <div className="flex flex-col gap-3 max-h-[150px] overflow-y-auto pr-2 scrollbar-hide">
                    {customSources.map((src) => {
                         const IcoComponent = ICONS.find(i => i.name === src.icon)?.component || Buildings;
                         return (
                         <div key={src.id} className="flex items-center justify-between p-2 pb-1 pt-1 border-[3px] border-border bg-muted/50">
                            <div className="flex items-center gap-3 overflow-hidden">
                                <IcoComponent weight="bold" className="h-5 w-5 shrink-0" />
                                <span className="font-bold text-sm tracking-tight truncate flex-1 block">{src.name}</span>
                            </div>
                            <Button 
                                variant="ghost" 
                                size="sm" 
                                className="h-8 w-8 p-0 text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-none shrink-0"
                                onClick={() => handleDelete(src.id, src.name)}
                            >
                                <Trash weight="bold" className="h-5 w-5" />
                            </Button>
                         </div>
                    )})}
                </div>
            </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

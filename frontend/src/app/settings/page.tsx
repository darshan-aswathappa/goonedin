"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Plus,
  Trash2,
  Save,
  Loader2,
  Search,
  MapPin,
  Ban,
  Filter,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast, Toaster } from "sonner";
import { getAuthHeaders } from "@/hooks/useAuth";
import { ResumeManager } from "@/components/ResumeManager";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface ConfigSection {
  key: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  endpoint: string;
  dataKey: string;
}

const CONFIG_SECTIONS: ConfigSection[] = [
  {
    key: "target_keywords",
    title: "Target Keywords",
    description: "Keywords to search for in job titles (e.g., 'Software Engineer', 'Python')",
    icon: <Search className="h-5 w-5" />,
    endpoint: "/config/target-keywords",
    dataKey: "target_keywords",
  },
  {
    key: "target_locations",
    title: "Target Locations",
    description: "Locations to search for jobs (e.g., 'United States', 'Remote')",
    icon: <MapPin className="h-5 w-5" />,
    endpoint: "/config/target-locations",
    dataKey: "target_locations",
  },
  {
    key: "blocked_companies",
    title: "Blocked Companies",
    description: "Companies to filter out from results (e.g., staffing agencies)",
    icon: <Ban className="h-5 w-5" />,
    endpoint: "/config/blocked-companies",
    dataKey: "blocked_companies",
  },
  {
    key: "title_filter_keywords",
    title: "Title Filter Keywords",
    description: "Keywords to exclude from job titles (e.g., 'senior', 'lead', 'manager')",
    icon: <Filter className="h-5 w-5" />,
    endpoint: "/config/title-filter-keywords",
    dataKey: "title_filter_keywords",
  },
];

function ConfigEditor({
  section,
  values,
  onChange,
  onSave,
  isSaving,
}: {
  section: ConfigSection;
  values: string[];
  onChange: (values: string[]) => void;
  onSave: () => void;
  isSaving: boolean;
}) {
  const [newItem, setNewItem] = useState("");
  const [searchTerm, setSearchTerm] = useState("");

  const handleAdd = () => {
    const trimmed = newItem.trim();
    if (trimmed && !values.includes(trimmed)) {
      onChange([...values, trimmed]);
      setNewItem("");
    }
  };

  const handleRemove = (index: number) => {
    onChange(values.filter((_, i) => i !== index));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAdd();
    }
  };

  const filteredValues = searchTerm
    ? values.filter((v) => v.toLowerCase().includes(searchTerm.toLowerCase()))
    : values;

  return (
    <Card className="brutal-border rounded-none bg-card shadow-[8px_8px_0px_0px_var(--border)] overflow-hidden">
      <CardHeader className="pb-4 border-b-2 border-border bg-card">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center brutal-border bg-primary text-white shadow-[2px_2px_0px_0px_var(--border)]">
              {section.icon}
            </div>
            <div>
              <CardTitle className="text-xl font-black italic uppercase tracking-tighter leading-none">{section.title}</CardTitle>
              <CardDescription className="text-xs font-black uppercase tracking-widest text-muted-foreground mt-1.5">{section.description}</CardDescription>
            </div>
          </div>
          <div className="brutal-badge bg-muted">
            {values.length} items
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6 pt-6">
        <div className="flex gap-2">
          <input
            type="text"
            value={newItem}
            onChange={(e) => setNewItem(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={`Add new ${section.title.toLowerCase().slice(0, -1)}...`}
            className="flex-1 brutal-border bg-muted px-3 py-2 text-sm font-bold focus:outline-none focus:bg-background transition-colors"
          />
          <Button
            onClick={handleAdd}
            disabled={!newItem.trim()}
            size="sm"
            className="brutal-border bg-primary text-white hover:bg-black dark:hover:bg-white dark:hover:text-black shadow-[2px_2px_0px_0px_var(--border)] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none h-10 w-10"
          >
            <Plus className="h-5 w-5" />
          </Button>
        </div>

        {values.length > 5 && (
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Filter items..."
              className="w-full brutal-border bg-muted pl-10 pr-3 py-2 text-sm font-bold focus:outline-none focus:bg-background transition-colors"
            />
          </div>
        )}

        <div className="max-h-64 overflow-y-auto brutal-border bg-muted/30 p-4">
          {filteredValues.length === 0 ? (
            <p className="py-4 text-center text-sm text-gray-500">
              {searchTerm ? "No matches found" : "No items yet"}
            </p>
          ) : (
            <div className="flex flex-wrap gap-3">
              {filteredValues.map((item, index) => {
                const originalIndex = values.indexOf(item);
                return (
                  <div
                    key={`${item}-${index}`}
                    className="group flex items-center gap-3 brutal-border bg-card px-3 py-2 text-sm font-black uppercase tracking-tight shadow-[3px_3px_0px_0px_var(--border)] hover:bg-muted transition-all hover:translate-x-[-1px] hover:translate-y-[-1px] hover:shadow-[4px_4px_0px_0px_var(--border)]"
                  >
                    <span>{item}</span>
                    <button
                      onClick={() => handleRemove(originalIndex)}
                      className="ml-1 rounded p-0.5 text-muted-foreground hover:bg-primary hover:text-white transition-colors"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex justify-end pt-4">
          <Button
            onClick={onSave}
            disabled={isSaving}
            className="brutal-border bg-green-500 text-white hover:bg-green-600 shadow-[4px_4px_0px_0px_var(--border)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition-all font-black uppercase tracking-widest px-6"
          >
            {isSaving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="mr-2 h-4 w-4" />
                Save Changes
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default function SettingsPage() {
  const [config, setConfig] = useState<Record<string, string[]>>({});
  const [originalConfig, setOriginalConfig] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(true);
  const [savingSection, setSavingSection] = useState<string | null>(null);


  const fetchConfig = useCallback(async () => {
    try {
      const headers = await getAuthHeaders();
      const configRes = await fetch(`${API_URL}/config`, { headers });

      if (configRes.ok) {
        const data = await configRes.json();
        setConfig(data);
        setOriginalConfig(data);
      }
    } catch (error) {
      console.error("Failed to fetch config:", error);
      toast.error("Failed to load configuration");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  const handleChange = (key: string, values: string[]) => {
    setConfig((prev) => ({ ...prev, [key]: values }));
  };

  const handleSave = async (section: ConfigSection) => {
    setSavingSection(section.key);
    try {
      const headers = await getAuthHeaders();
      const response = await fetch(`${API_URL}${section.endpoint}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({ values: config[section.key] || [] }),
      });

      if (response.ok) {
        setOriginalConfig((prev) => ({
          ...prev,
          [section.key]: config[section.key] || [],
        }));
        toast.success(`${section.title} updated successfully`);
      } else {
        throw new Error("Failed to save");
      }
    } catch (error) {
      console.error("Failed to save config:", error);
      toast.error(`Failed to update ${section.title}`);
    } finally {
      setSavingSection(null);
    }
  };


  const hasUnsavedChanges = (key: string) => {
    const current = config[key] || [];
    const original = originalConfig[key] || [];
    return JSON.stringify(current) !== JSON.stringify(original);
  };

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="mx-auto max-w-4xl">
        <div className="mb-8 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="brutal-border flex h-10 w-10 items-center justify-center bg-card hover:bg-muted transition-all shadow-[2px_2px_0px_0px_var(--border)] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none"
              title="Back to Dashboard"
            >
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <div>
              <h1 className="text-2xl font-black italic uppercase tracking-tighter leading-none">
                Settings
              </h1>
              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mt-1">
                Configure job search filters and alerts
              </p>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-cyan-400" />
          </div>
        ) : (
          <div className="space-y-6">
            {/* Resume Upload / Manager */}
            <ResumeManager />

            {/* Job Search Filters */}
            {CONFIG_SECTIONS.map((section) => (
              <div key={section.key} className="relative">
                {hasUnsavedChanges(section.key) && (
                  <div className="absolute -left-2 top-4 h-2 w-2 rounded-full bg-yellow-500" title="Unsaved changes" />
                )}
                <ConfigEditor
                  section={section}
                  values={config[section.key] || []}
                  onChange={(values) => handleChange(section.key, values)}
                  onSave={() => handleSave(section)}
                  isSaving={savingSection === section.key}
                />
              </div>
            ))}
          </div>
        )}
      </div>

      <Toaster
        position="bottom-right"
        toastOptions={{
          className: "brutal-border bg-card text-foreground",
        }}
      />
    </div>
  );
}

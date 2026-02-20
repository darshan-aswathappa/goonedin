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
    <Card className="border-gray-800 bg-[#161b22]">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-800/50 text-cyan-400">
              {section.icon}
            </div>
            <div>
              <CardTitle className="text-lg text-white">{section.title}</CardTitle>
              <CardDescription className="text-gray-500">{section.description}</CardDescription>
            </div>
          </div>
          <Badge variant="secondary" className="bg-gray-800 text-gray-300">
            {values.length} items
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <input
            type="text"
            value={newItem}
            onChange={(e) => setNewItem(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={`Add new ${section.title.toLowerCase().slice(0, -1)}...`}
            className="flex-1 rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-white placeholder:text-gray-500 focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500"
          />
          <Button
            onClick={handleAdd}
            disabled={!newItem.trim()}
            size="sm"
            className="bg-cyan-600 hover:bg-cyan-700"
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>

        {values.length > 5 && (
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search..."
            className="w-full rounded-lg border border-gray-700 bg-gray-900/50 px-3 py-1.5 text-sm text-white placeholder:text-gray-500 focus:border-gray-600 focus:outline-none"
          />
        )}

        <div className="max-h-64 overflow-y-auto rounded-lg border border-gray-800 bg-gray-900/30 p-2">
          {filteredValues.length === 0 ? (
            <p className="py-4 text-center text-sm text-gray-500">
              {searchTerm ? "No matches found" : "No items yet"}
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {filteredValues.map((item, index) => {
                const originalIndex = values.indexOf(item);
                return (
                  <div
                    key={`${item}-${index}`}
                    className="group flex items-center gap-1.5 rounded-md bg-gray-800 px-2.5 py-1.5 text-sm text-gray-200"
                  >
                    <span>{item}</span>
                    <button
                      onClick={() => handleRemove(originalIndex)}
                      className="ml-1 rounded p-0.5 text-gray-500 hover:bg-gray-700 hover:text-red-400"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex justify-end pt-2">
          <Button
            onClick={onSave}
            disabled={isSaving}
            className="bg-green-600 hover:bg-green-700"
          >
            {isSaving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="h-4 w-4" />
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
      const response = await fetch(`${API_URL}/config`);
      if (response.ok) {
        const data = await response.json();
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
      const response = await fetch(`${API_URL}${section.endpoint}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
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
    <div className="min-h-screen bg-[#0d1117] p-6">
      <div className="mx-auto max-w-4xl">
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-gray-800 transition-colors"
              title="Back to Dashboard"
            >
              <ArrowLeft className="h-4 w-4 text-gray-400" />
            </Link>
            <div>
              <h1 className="text-xl font-semibold tracking-wide text-white">
                Settings
              </h1>
              <p className="text-sm text-gray-500">
                Configure job search filters and preferences
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={fetchConfig}
            disabled={loading}
            className="border-gray-700 bg-transparent text-gray-300 hover:bg-gray-800 hover:text-white"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-cyan-400" />
          </div>
        ) : (
          <div className="space-y-6">
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
          className: "bg-[#161b22] border-gray-800 text-white",
        }}
      />
    </div>
  );
}

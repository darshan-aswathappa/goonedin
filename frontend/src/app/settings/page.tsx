"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Plus,
  Trash,
  FloppyDisk,
  CircleNotch,
  MagnifyingGlass,
  MapPin,
  Prohibit,
  Funnel,
} from "@phosphor-icons/react";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { getAuthHeaders } from "@/hooks/useAuth";
import { ResumeManager } from "@/components/ResumeManager";
import { JobrightCredentialsManager } from "@/components/JobrightCredentialsManager";
import { Kicker, DsButton } from "@/components/ds";

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
    key: "target_locations",
    title: "Target Locations",
    description: "Locations to search for jobs (e.g., 'United States', 'Remote')",
    icon: <MapPin className="size-4 text-ink-muted" />,
    endpoint: "/config/target-locations",
    dataKey: "target_locations",
  },
  {
    key: "blocked_companies",
    title: "Blocked Companies",
    description: "Companies to filter out from results (e.g., staffing agencies)",
    icon: <Prohibit className="size-4 text-ink-muted" />,
    endpoint: "/config/blocked-companies",
    dataKey: "blocked_companies",
  },
  {
    key: "title_filter_keywords",
    title: "Title Filter Keywords",
    description: "Keywords to exclude from job titles (e.g., 'senior', 'lead', 'manager')",
    icon: <Funnel className="size-4 text-ink-muted" />,
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
    <section className="rounded-[4px] border border-hairline bg-paper-card">
      {/* Panel header */}
      <header className="flex items-start justify-between gap-4 border-b border-hairline px-4 py-3">
        <div className="flex items-start gap-3">
          <span className="mt-px shrink-0">{section.icon}</span>
          <div>
            <h2 className="font-serif text-[17px] font-semibold leading-tight text-ink">
              {section.title}
            </h2>
            <p className="mt-1 font-sans text-[13px] leading-snug text-ink-muted">
              {section.description}
            </p>
          </div>
        </div>
        <span className="shrink-0 rounded-[4px] border border-hairline px-2 py-0.5 font-mono text-[11px] tracking-[0.09em] text-ink-muted">
          {values.length}
        </span>
      </header>

      {/* Card body */}
      <div className="flex flex-col gap-3 p-4">
        {/* Add input row */}
        <div className="flex gap-2">
          <input
            type="text"
            value={newItem}
            onChange={(e) => setNewItem(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={`Add new ${section.title.toLowerCase().slice(0, -1)}...`}
            className="min-w-0 flex-1 rounded-[4px] border border-hairline bg-paper-card px-3 py-2 font-mono text-[13px] text-ink outline-none transition-colors duration-[120ms] placeholder:text-ink-faint focus:border-brick"
          />
          <DsButton
            onClick={handleAdd}
            disabled={!newItem.trim()}
            size="icon"
            aria-label={`Add ${section.title.toLowerCase()}`}
            className="shrink-0"
          >
            <Plus className="size-4" />
          </DsButton>
        </div>

        {/* Search filter (when > 5 items) */}
        {values.length > 5 && (
          <div className="relative">
            <MagnifyingGlass className="pointer-events-none absolute left-3 top-1/2 size-[14px] -translate-y-1/2 text-ink-muted" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Filter items..."
              className="w-full rounded-[4px] border border-hairline bg-paper-card py-2 pl-9 pr-3 font-mono text-[13px] text-ink outline-none transition-colors duration-[120ms] placeholder:text-ink-faint focus:border-brick"
            />
          </div>
        )}

        {/* Items list */}
        <div className="ds-well max-h-[200px] overflow-y-auto p-3">
          {filteredValues.length === 0 ? (
            <Kicker className="py-4 text-center">
              {searchTerm ? "No matches found" : "No items yet"}
            </Kicker>
          ) : (
            <div className="flex flex-wrap gap-2">
              {filteredValues.map((item, index) => {
                const originalIndex = values.indexOf(item);
                const chipKey = `${item}-${index}`;
                return (
                  <span
                    key={chipKey}
                    className="group inline-flex items-center gap-2 rounded-[4px] border border-hairline bg-paper-card px-2.5 py-1 font-mono text-[13px] leading-none text-ink-2 transition-colors duration-[120ms] hover:border-hairline-strong"
                  >
                    {item}
                    <button
                      type="button"
                      onClick={() => handleRemove(originalIndex)}
                      aria-label={`Remove ${item}`}
                      className="flex p-0.5 text-ink-faint transition-colors duration-[120ms] hover:text-brick"
                    >
                      <Trash className="size-3" />
                    </button>
                  </span>
                );
              })}
            </div>
          )}
        </div>

        {/* Save button */}
        <div className="flex justify-end pt-1">
          <DsButton onClick={onSave} disabled={isSaving} size="sm">
            {isSaving ? (
              <>
                <CircleNotch className="size-[14px] animate-spin" />
                Saving
              </>
            ) : (
              <>
                <FloppyDisk className="size-[14px]" />
                Save Changes
              </>
            )}
          </DsButton>
        </div>
      </div>
    </section>
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
    <div className="min-h-dvh bg-paper">
      <div className="shell-main mx-auto max-w-[860px]">
        {/* Page header */}
        <header className="mb-8 flex items-center gap-4">
          <Link
            href="/"
            title="Back to Dashboard"
            aria-label="Back to Dashboard"
            className="shell-back"
          >
            <ArrowLeft className="size-[14px]" />
          </Link>
          <div>
            <h1 className="font-serif text-[28px] font-semibold leading-tight text-ink">
              Job search filters
            </h1>
            <Kicker className="mt-1.5">Settings</Kicker>
          </div>
        </header>

        {loading ? (
          <div className="flex flex-col items-center gap-4 py-20">
            <CircleNotch className="size-7 animate-spin text-brick" />
            <Kicker>Loading configuration</Kicker>
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            <ResumeManager />
            <JobrightCredentialsManager />

            {CONFIG_SECTIONS.map((section) => (
              <div key={section.key} className="relative">
                {hasUnsavedChanges(section.key) && (
                  <span
                    title="Unsaved changes"
                    className="absolute -left-3 top-4 size-1.5 rounded-full bg-brick"
                  />
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
          className:
            "rounded-[4px] font-mono text-[13px] bg-paper-card border border-hairline-strong text-ink",
        }}
      />
    </div>
  );
}

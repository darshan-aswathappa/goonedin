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
import { SponsorshipFilterToggle } from "@/components/SponsorshipFilterToggle";
import { ExperienceFilterToggle } from "@/components/ExperienceFilterToggle";
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
  const [addError, setAddError] = useState("");

  const ITEM_MAX = 120;

  const handleAdd = () => {
    const trimmed = newItem.trim();
    if (!trimmed) {
      setAddError("Enter a value");
      return;
    }
    if (trimmed.length > ITEM_MAX) {
      setAddError(`Keep it under ${ITEM_MAX} characters`);
      return;
    }
    if (values.some((v) => v.toLowerCase() === trimmed.toLowerCase())) {
      setAddError("Already in the list");
      return;
    }
    onChange([...values, trimmed]);
    setNewItem("");
    setAddError("");
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
      <header className="flex flex-col gap-3 border-b border-hairline px-4 py-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <span className="mt-px shrink-0">{section.icon}</span>
          <div className="min-w-0">
            <h2 className="font-serif text-[17px] font-semibold leading-tight text-ink">
              {section.title}
            </h2>
            <p className="mt-1 break-words font-sans text-[13px] leading-snug text-ink-muted">
              {section.description}
            </p>
          </div>
        </div>
        <span className="w-fit shrink-0 self-start rounded-[4px] border border-hairline px-2 py-0.5 font-mono text-[11px] tracking-[0.09em] text-ink-muted">
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
            maxLength={ITEM_MAX}
            onChange={(e) => {
              setNewItem(e.target.value.slice(0, ITEM_MAX));
              if (addError) setAddError("");
            }}
            onKeyDown={handleKeyDown}
            placeholder={`Add new ${section.title.toLowerCase().slice(0, -1)}...`}
            aria-invalid={addError ? true : undefined}
            aria-describedby={addError ? `${section.key}-add-error` : undefined}
            className="min-h-11 min-w-0 flex-1 rounded-[4px] border border-hairline bg-paper-card px-3 py-2 font-mono text-[16px] text-ink outline-none transition-colors duration-[120ms] placeholder:text-ink-faint focus:border-brick sm:min-h-0 sm:text-[13px]"
          />
          <DsButton
            onClick={handleAdd}
            disabled={!newItem.trim() || isSaving}
            size="icon"
            aria-label={`Add ${section.title.toLowerCase()}`}
            className="size-11 shrink-0"
          >
            <Plus className="size-4" />
          </DsButton>
        </div>
        {addError && (
          <p
            id={`${section.key}-add-error`}
            role="alert"
            className="font-mono text-[11px] uppercase tracking-[0.09em] text-brick"
          >
            {addError}
          </p>
        )}

        {/* Search filter (when > 5 items) */}
        {values.length > 5 && (
          <div className="relative">
            <MagnifyingGlass className="pointer-events-none absolute left-3 top-1/2 size-[14px] -translate-y-1/2 text-ink-muted" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Filter items..."
              aria-label={`Filter ${section.title.toLowerCase()}`}
              className="w-full rounded-[4px] border border-hairline bg-paper-card py-2.5 pl-9 pr-3 font-mono text-[16px] text-ink outline-none transition-colors duration-[120ms] placeholder:text-ink-faint focus:border-brick sm:text-[13px]"
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
                    className="group inline-flex max-w-full items-center gap-1 rounded-[4px] border border-hairline bg-paper-card py-1 pl-2.5 pr-1 font-mono text-[13px] leading-none text-ink-2 transition-colors duration-[120ms] hover:border-hairline-strong"
                  >
                    <span className="min-w-0 truncate py-0.5" title={item}>
                      {item}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleRemove(originalIndex)}
                      aria-label={`Remove ${item}`}
                      className="flex size-8 shrink-0 items-center justify-center text-ink-faint transition-colors duration-[120ms] hover:text-brick"
                    >
                      <Trash className="size-3.5" />
                    </button>
                  </span>
                );
              })}
            </div>
          )}
        </div>

        {/* Save button */}
        <div className="flex justify-stretch pt-1 sm:justify-end">
          <DsButton onClick={onSave} disabled={isSaving} size="sm" className="min-h-11 w-full sm:min-h-0 sm:w-auto">
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
  const [loadError, setLoadError] = useState<string | null>(null);
  const [savingSection, setSavingSection] = useState<string | null>(null);

  const fetchConfig = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const headers = await getAuthHeaders();
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);
      let configRes: Response;
      try {
        configRes = await fetch(`${API_URL}/config`, {
          headers,
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeoutId);
      }

      if (configRes.ok) {
        const data = await configRes.json();
        setConfig(data);
        setOriginalConfig(data);
      } else if (configRes.status === 401) {
        setLoadError("Please sign in again to manage settings.");
      } else {
        setLoadError("Couldn't load configuration. Try again.");
        toast.error("Failed to load configuration");
      }
    } catch (error) {
      console.error("Failed to fetch config:", error);
      if (error instanceof DOMException && error.name === "AbortError") {
        setLoadError("Request timed out. Check your connection and try again.");
      } else {
        setLoadError("Network error. Check your connection and try again.");
      }
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
    if (savingSection) return;
    setSavingSection(section.key);
    try {
      const headers = await getAuthHeaders();
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);
      let response: Response;
      try {
        response = await fetch(`${API_URL}${section.endpoint}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json", ...headers },
          body: JSON.stringify({ values: config[section.key] || [] }),
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeoutId);
      }

      if (response.ok) {
        setOriginalConfig((prev) => ({
          ...prev,
          [section.key]: config[section.key] || [],
        }));
        toast.success(`${section.title} updated successfully`);
      } else if (response.status === 401) {
        toast.error("Please sign in again");
      } else if (response.status === 429) {
        toast.error("Too many requests. Wait a moment and try again.");
      } else {
        throw new Error("Failed to save");
      }
    } catch (error) {
      console.error("Failed to save config:", error);
      if (error instanceof DOMException && error.name === "AbortError") {
        toast.error("Request timed out. Try again.");
      } else {
        toast.error(`Failed to update ${section.title}`);
      }
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
      <header className="shell-header bg-paper-card">
        <div className="shell-header-inner">
          <div className="flex min-w-0 items-center gap-3">
            <Link
              href="/"
              title="Back to Dashboard"
              aria-label="Back to Dashboard"
              className="shell-back"
            >
              <ArrowLeft className="size-[14px]" />
            </Link>
            <div className="min-w-0">
              <h1 className="font-serif text-[19px] font-semibold leading-none text-ink sm:text-[22px]">
                Job search filters
              </h1>
              <Kicker className="mt-1">Settings</Kicker>
            </div>
          </div>
        </div>
      </header>

      <div className="shell-main mx-auto max-w-[860px]">
        {loading ? (
          <div className="flex flex-col items-center gap-4 py-20">
            <CircleNotch className="size-7 animate-spin text-brick" />
            <Kicker>Loading configuration</Kicker>
          </div>
        ) : loadError ? (
          <div
            role="alert"
            className="flex flex-col items-center gap-4 rounded-[4px] border border-brick bg-brick-tint px-5 py-12 text-center"
          >
            <p className="max-w-[360px] break-words font-sans text-[15px] leading-relaxed text-ink">
              {loadError}
            </p>
            <DsButton variant="primary" size="sm" onClick={fetchConfig}>
              Try again
            </DsButton>
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            <ResumeManager />
            <JobrightCredentialsManager />
            <SponsorshipFilterToggle />
            <ExperienceFilterToggle />

            {CONFIG_SECTIONS.map((section) => (
              <div key={section.key} className="relative">
                {hasUnsavedChanges(section.key) && (
                  <span
                    role="status"
                    aria-label="Unsaved changes"
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
        position="bottom-center"
        toastOptions={{
          className:
            "rounded-[4px] font-mono text-[13px] bg-paper-card border border-hairline-strong text-ink",
        }}
      />
    </div>
  );
}

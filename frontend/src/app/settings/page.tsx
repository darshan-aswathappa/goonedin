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
    icon: <MapPin style={{ color: "#000", width: "12px", height: "12px" }} />,
    endpoint: "/config/target-locations",
    dataKey: "target_locations",
  },
  {
    key: "blocked_companies",
    title: "Blocked Companies",
    description: "Companies to filter out from results (e.g., staffing agencies)",
    icon: <Prohibit style={{ color: "#000", width: "12px", height: "12px" }} />,
    endpoint: "/config/blocked-companies",
    dataKey: "blocked_companies",
  },
  {
    key: "title_filter_keywords",
    title: "Title Filter Keywords",
    description: "Keywords to exclude from job titles (e.g., 'senior', 'lead', 'manager')",
    icon: <Funnel style={{ color: "#000", width: "12px", height: "12px" }} />,
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
  const [inputFocused, setInputFocused] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);
  const [hoveredChip, setHoveredChip] = useState<string | null>(null);
  const [hoveredTrash, setHoveredTrash] = useState<string | null>(null);

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
    <div style={{ background: "#080808", border: "1px solid #1c1c1c", borderRadius: "2px" }}>
      {/* Panel header */}
      <div style={{ borderBottom: "1px solid #1c1c1c", padding: "10px 16px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <div style={{ width: "22px", height: "22px", background: "#ff8c00", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            {section.icon}
          </div>
          <div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: "9px", fontWeight: 600, letterSpacing: "0.18em", color: "#ff8c00", textTransform: "uppercase" }}>
              // {section.title.toUpperCase()}
            </div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: "9px", color: "#555", letterSpacing: "0.05em", marginTop: "2px" }}>
              {section.description}
            </div>
          </div>
        </div>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: "9px", color: "#555", border: "1px solid #1c1c1c", padding: "2px 8px", letterSpacing: "0.1em" }}>
          {values.length}
        </div>
      </div>

      {/* Card body */}
      <div style={{ padding: "16px", display: "flex", flexDirection: "column", gap: "12px" }}>
        {/* Add input row */}
        <div style={{ display: "flex", gap: "8px" }}>
          <input
            type="text"
            value={newItem}
            onChange={(e) => setNewItem(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => setInputFocused(true)}
            onBlur={() => setInputFocused(false)}
            placeholder={`Add new ${section.title.toLowerCase().slice(0, -1)}...`}
            style={{
              background: "#0a0a0a",
              border: inputFocused ? "1px solid #ff8c00" : "1px solid #1c1c1c",
              color: "#f0f0f0",
              fontFamily: "var(--font-mono)",
              fontSize: "11px",
              padding: "7px 10px",
              flex: 1,
              outline: "none",
              borderRadius: "2px",
            }}
          />
          <button
            onClick={handleAdd}
            disabled={!newItem.trim()}
            style={{
              border: "1px solid #ff8c00",
              background: "rgba(255,140,0,0.1)",
              color: "#ff8c00",
              width: "36px",
              height: "36px",
              cursor: newItem.trim() ? "pointer" : "not-allowed",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
              opacity: newItem.trim() ? 1 : 0.4,
            }}
          >
            <Plus style={{ width: "14px", height: "14px" }} />
          </button>
        </div>

        {/* Search filter (when > 5 items) */}
        {values.length > 5 && (
          <div style={{ position: "relative" }}>
            <MagnifyingGlass
              style={{
                position: "absolute",
                left: "10px",
                top: "50%",
                transform: "translateY(-50%)",
                color: "#555",
                width: "12px",
                height: "12px",
                pointerEvents: "none",
              }}
            />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setSearchFocused(false)}
              placeholder="Filter items..."
              style={{
                background: "#0a0a0a",
                border: searchFocused ? "1px solid #ff8c00" : "1px solid #1c1c1c",
                color: "#f0f0f0",
                fontFamily: "var(--font-mono)",
                fontSize: "11px",
                padding: "7px 10px 7px 30px",
                width: "100%",
                outline: "none",
                borderRadius: "2px",
                boxSizing: "border-box",
              }}
            />
          </div>
        )}

        {/* Items list */}
        <div style={{ background: "#000", border: "1px solid #1c1c1c", padding: "12px", maxHeight: "200px", overflowY: "auto" }}>
          {filteredValues.length === 0 ? (
            <div style={{ fontFamily: "var(--font-mono)", fontSize: "9px", color: "#555", textAlign: "center", padding: "16px", letterSpacing: "0.08em", textTransform: "uppercase" }}>
              {searchTerm ? "NO MATCHES FOUND" : "NO ITEMS YET"}
            </div>
          ) : (
            <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
              {filteredValues.map((item, index) => {
                const originalIndex = values.indexOf(item);
                const chipKey = `${item}-${index}`;
                return (
                  <div
                    key={chipKey}
                    onMouseEnter={() => setHoveredChip(chipKey)}
                    onMouseLeave={() => setHoveredChip(null)}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "8px",
                      border: hoveredChip === chipKey ? "1px solid #333" : "1px solid #1c1c1c",
                      background: "#080808",
                      padding: "4px 10px",
                      fontFamily: "var(--font-mono)",
                      fontSize: "10px",
                      color: "#aaa",
                      letterSpacing: "0.08em",
                      textTransform: "uppercase",
                      transition: "border-color 0.1s",
                    }}
                  >
                    <span>{item}</span>
                    <button
                      onClick={() => handleRemove(originalIndex)}
                      onMouseEnter={() => setHoveredTrash(chipKey)}
                      onMouseLeave={() => setHoveredTrash(null)}
                      style={{
                        background: "none",
                        border: "none",
                        color: hoveredTrash === chipKey ? "#ff3333" : "#555",
                        cursor: "pointer",
                        display: "flex",
                        padding: "2px",
                        transition: "color 0.1s",
                      }}
                    >
                      <Trash style={{ width: "12px", height: "12px" }} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Save button */}
        <div style={{ display: "flex", justifyContent: "flex-end", paddingTop: "4px" }}>
          <button
            onClick={onSave}
            disabled={isSaving}
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
              cursor: isSaving ? "not-allowed" : "pointer",
              display: "flex",
              alignItems: "center",
              gap: "8px",
              opacity: isSaving ? 0.6 : 1,
            }}
          >
            {isSaving ? (
              <>
                <CircleNotch style={{ width: "12px", height: "12px" }} className="animate-spin" />
                SAVING...
              </>
            ) : (
              <>
                <FloppyDisk style={{ width: "12px", height: "12px" }} />
                SAVE CHANGES
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function SettingsPage() {
  const [config, setConfig] = useState<Record<string, string[]>>({});
  const [originalConfig, setOriginalConfig] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(true);
  const [savingSection, setSavingSection] = useState<string | null>(null);
  const [backHovered, setBackHovered] = useState(false);

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
    <div style={{ minHeight: "100vh", background: "#000", padding: "16px 20px" }}>
      <div style={{ maxWidth: "860px", margin: "0 auto" }}>
        {/* Page header */}
        <div style={{ marginBottom: "24px", display: "flex", alignItems: "center", gap: "16px" }}>
          <Link href="/">
            <div
              onMouseEnter={() => setBackHovered(true)}
              onMouseLeave={() => setBackHovered(false)}
              style={{
                width: "32px",
                height: "32px",
                border: backHovered ? "1px solid #ff8c00" : "1px solid #1c1c1c",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: backHovered ? "#ff8c00" : "#555",
                cursor: "pointer",
                transition: "border-color 0.1s, color 0.1s",
                flexShrink: 0,
              }}
              title="Back to Dashboard"
            >
              <ArrowLeft style={{ width: "14px", height: "14px" }} />
            </div>
          </Link>
          <div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: "11px", fontWeight: 700, letterSpacing: "0.2em", color: "#ff8c00", textTransform: "uppercase" }}>
              // SETTINGS
            </div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: "9px", color: "#555", letterSpacing: "0.12em", textTransform: "uppercase", marginTop: "3px" }}>
              CONFIGURE JOB SEARCH FILTERS
            </div>
          </div>
        </div>

        {loading ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "80px 0" }}>
            <CircleNotch style={{ width: "28px", height: "28px", color: "#ff8c00" }} className="animate-spin" />
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <ResumeManager />

            {CONFIG_SECTIONS.map((section) => (
              <div key={section.key} style={{ position: "relative" }}>
                {hasUnsavedChanges(section.key) && (
                  <div
                    title="Unsaved changes"
                    style={{
                      width: "4px",
                      height: "4px",
                      background: "#ffd700",
                      position: "absolute",
                      left: "-8px",
                      top: "14px",
                    }}
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
          className: "rounded-none font-mono text-xs bg-[#080808] border border-[#333] text-[#f0f0f0]",
        }}
      />
    </div>
  );
}

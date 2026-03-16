// ── Knowledge Base + AI Companion types ──────────────────────────────────────

export type QueryPlanType = "sql" | "vector" | "hybrid" | "none";

export interface QueryPlan {
  type?: QueryPlanType;
  // New fields from the orchestrator's "done" event
  query_type?: string;
  elapsed_ms?: number;
  rows_returned?: number;
  tables_used?: string[];
}

export interface StreamEvent {
  type: "status" | "chunk" | "done" | "error";
  // type === "status"
  message?: string;
  // type === "chunk"
  text?: string;
  // type === "done"
  session_id?: string;
  query_plan?: QueryPlan;
  rows_returned?: number;
  // type === "error"
  error?: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  queryPlan?: QueryPlan;
  isStreaming?: boolean;
}

export interface AnalyticsContext {
  totalJobs: number;
  topCompanies: Array<{ company: string; count: number }>;
  sourceBreakdown: Array<{ source: string; count: number }>;
  workModelBreakdown: Array<{ model: string; count: number }>;
}

// Command palette types
export type CommandGroup = "NAVIGATE" | "ACTION";

export interface Command {
  id: string;
  label: string;
  description?: string;
  group: CommandGroup;
  shortcut?: string;
  action: () => void;
}

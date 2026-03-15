// ── Knowledge Base + AI Companion types ──────────────────────────────────────

export type QueryPlanType = "sql" | "vector" | "hybrid" | "none";

export interface QueryPlan {
  type?: QueryPlanType;
  query_type?: string;
  elapsed_ms?: number;
  rows_returned?: number;
  tables_used?: string[];
  sql_query?: string;
  sql_time_ms?: number;
}

export interface StreamEvent {
  type: "status" | "chunk" | "done" | "error";
  message?: string;
  text?: string;
  session_id?: string;
  query_plan?: QueryPlan;
  rows_returned?: number;
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

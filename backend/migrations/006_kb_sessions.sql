-- ============================================================
-- MIGRATION 6: Conversation history tables
-- ============================================================
-- Run in Supabase SQL Editor.
-- Prerequisites: 003_kb_role.sql
-- ============================================================

CREATE TABLE IF NOT EXISTS ai_kb_sessions (
  session_id   UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID         NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  last_active  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  expires_at   TIMESTAMPTZ  NOT NULL DEFAULT (NOW() + INTERVAL '90 days')
);
CREATE INDEX IF NOT EXISTS idx_ai_kb_sessions_user   ON ai_kb_sessions (user_id);
CREATE INDEX IF NOT EXISTS idx_ai_kb_sessions_expiry ON ai_kb_sessions (expires_at);

CREATE TABLE IF NOT EXISTS ai_kb_messages (
  id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id    UUID         NOT NULL REFERENCES ai_kb_sessions(session_id) ON DELETE CASCADE,
  turn_index    INT          NOT NULL,           -- monotonic, no tie-breaking needed
  role          TEXT         NOT NULL CHECK (role IN ('user','assistant')),
  content       TEXT         NOT NULL,
  query_plan    JSONB,                           -- serialised QueryPlan (strategy, sql, rows)
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ai_kb_msg_session ON ai_kb_messages (session_id, turn_index);

-- TTL cleanup (can be scheduled via pg_cron: '0 3 * * *')
CREATE OR REPLACE FUNCTION cleanup_expired_ai_kb_sessions()
RETURNS INT LANGUAGE plpgsql AS $$
DECLARE deleted INT;
BEGIN
  DELETE FROM ai_kb_sessions WHERE expires_at < NOW();
  GET DIAGNOSTICS deleted = ROW_COUNT;
  RETURN deleted;
END;
$$;

-- RLS: users can only read their own sessions
ALTER TABLE ai_kb_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_kb_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY ai_kb_sessions_owner ON ai_kb_sessions
  USING (user_id = auth.uid());
CREATE POLICY ai_kb_messages_owner ON ai_kb_messages
  USING (session_id IN (
    SELECT session_id FROM ai_kb_sessions WHERE user_id = auth.uid()
  ));

-- ai_kb_reader cannot read conversation history (it only queries job data)
REVOKE ALL ON ai_kb_sessions FROM ai_kb_reader;
REVOKE ALL ON ai_kb_messages FROM ai_kb_reader;

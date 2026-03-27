"use client";

interface Props {
  title: string;
  message?: string;
  suggestion?: string;
}

export default function EmptyPanel({
  title,
  message = "No data available yet",
  suggestion = "Data will appear here once jobs are collected and analyzed.",
}: Props) {
  return (
    <div className="panel chart-enter" style={{ height: "100%" }}>
      <div className="panel-header">{title}</div>
      <div className="empty-panel-body">
        <div className="empty-panel-message">
          <span className="empty-panel-message-dash">—</span>
          {message}
        </div>
        <div className="empty-panel-suggestion">{suggestion}</div>
        <div className="empty-panel-footer">
          <span className="empty-panel-waiting">WAITING</span>
          <div className="empty-panel-dot" />
          <div className="empty-panel-dot" />
          <div className="empty-panel-dot" />
        </div>
      </div>
    </div>
  );
}

"use client";

import { useState, useEffect } from "react";

const STORAGE_KEY = "hirefeed-section-guides-dismissed";

interface Props {
  label: string;
  description: string;
}

export default function SectionGuide({ label, description }: Props) {
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const seen = localStorage.getItem(STORAGE_KEY);
    if (!seen) setDismissed(false);
  }, []);

  if (dismissed) return null;

  return (
    <div className="section-guide">
      <div className="section-guide-label">{label}</div>
      <div className="section-guide-line" />
      <div className="section-guide-desc">{description}</div>
    </div>
  );
}

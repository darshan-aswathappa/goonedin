"use client";

import { TrendUp, Buildings, Code, MapPin, Sparkle } from "@phosphor-icons/react";

interface Props {
  topCompany?: string;
  topSkill?: string;
  topCity?: string;
  sponsorshipRate?: number;
  avgJobsPerDay?: number;
  completionRate?: number;
  totalJobs?: number;
}

interface InsightItem {
  icon: React.ReactNode;
  color: string;
  label: string;
  text: string;
}

export default function IntelPanel({
  topCompany,
  topSkill,
  topCity,
  sponsorshipRate,
  avgJobsPerDay,
  completionRate,
  totalJobs,
}: Props) {
  const insights: InsightItem[] = [];

  if (topCompany) {
    insights.push({
      icon: <Buildings size={12} weight="bold" />,
      color: "var(--teal)",
      label: "TOP EMPLOYER",
      text: `${topCompany} leads all companies in posting volume \u2014 consistently the most active recruiter in this dataset.`,
    });
  }

  if (topSkill) {
    insights.push({
      icon: <Code size={12} weight="bold" />,
      color: "var(--blue)",
      label: "HOT SKILL",
      text: `${topSkill} appears more frequently than any other keyword in analyzed job descriptions. Consider highlighting it on your resume.`,
    });
  }

  if (topCity) {
    insights.push({
      icon: <MapPin size={12} weight="bold" />,
      color: "var(--amber)",
      label: "TOP MARKET",
      text: `${topCity} has the highest concentration of job postings in this dataset.`,
    });
  }

  if (sponsorshipRate !== undefined) {
    const level = sponsorshipRate > 40 ? "strong" : sponsorshipRate > 20 ? "moderate" : "limited";
    insights.push({
      icon: <Sparkle size={12} weight="bold" />,
      color: sponsorshipRate > 40 ? "var(--green)" : sponsorshipRate > 20 ? "var(--amber)" : "var(--red)",
      label: "VISA SIGNAL",
      text: `${sponsorshipRate}% sponsorship availability \u2014 a ${level} signal. ${
        sponsorshipRate > 40
          ? "International candidates have favorable conditions in this market."
          : sponsorshipRate > 20
          ? "Sponsorship is available but not the norm. Target companies explicitly."
          : "Sponsorship is scarce. Prioritize companies with established H-1B programs."
      }`,
    });
  }

  if (avgJobsPerDay !== undefined && totalJobs !== undefined) {
    insights.push({
      icon: <TrendUp size={12} weight="bold" />,
      color: "var(--purple)",
      label: "MARKET VELOCITY",
      text: `${avgJobsPerDay} jobs/day over the last 30 days. ${totalJobs.toLocaleString()} total postings tracked. ${
        completionRate !== undefined ? `${completionRate}% AI-analyzed.` : ""
      }`,
    });
  }

  return (
    <div className="panel chart-enter" style={{ height: "100%" }}>
      <div className="panel-header">Market Intelligence</div>
      <div className="panel-body" style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        {insights.length === 0 ? (
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "10px",
              color: "var(--muted)",
              textAlign: "center",
              paddingTop: "20px",
            }}
          >
            Waiting for enough data to generate insights
          </div>
        ) : (
          insights.map((item, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                gap: "10px",
                paddingBottom: "12px",
                borderBottom: i < insights.length - 1 ? "1px solid var(--border)" : "none",
              }}
            >
              <div style={{ color: item.color, flexShrink: 0, marginTop: "1px" }}>
                {item.icon}
              </div>
              <div>
                <div className="stat-label" style={{ color: item.color, fontSize: "8px", letterSpacing: "0.18em", marginBottom: "4px", marginTop: 0 }}>
                  {item.label}
                </div>
                <div
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: "10px",
                    color: "var(--text-dim)",
                    lineHeight: 1.6,
                  }}
                >
                  {item.text}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

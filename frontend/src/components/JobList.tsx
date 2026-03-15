"use client";

import { Job, useJobsStore } from "@/store/jobs";
import { JobCard } from "./JobCard";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Briefcase, Lock, Gear, ArrowRight, WarningCircle } from "@phosphor-icons/react";
import Link from "next/link";
import { useState } from "react";

interface JobListProps {
  jobs: Job[];
  emptyMessage?: string;
  isLocked?: boolean;
  error?: string | null;
  onRetry?: () => void;
}

const DUMMY_JOBS: Job[] = [
  {
    external_id: "dummy-1",
    title: "Software Engineer, Machine Learning",
    company: "GitHub",
    location: "San Francisco, CA",
    url: "#",
    source: "GitHub",
    is_new: true,
  },
  {
    external_id: "dummy-3",
    title: "Senior Backend Developer",
    company: "LinkedIn",
    location: "Sunnyvale, CA",
    url: "#",
    source: "LinkedIn",
    is_new: false,
  },
  {
    external_id: "dummy-5",
    title: "Full Stack Engineer",
    company: "MathWorks",
    location: "Natick, MA",
    url: "#",
    source: "MathWorks",
    is_new: false,
  },
  {
    external_id: "dummy-6",
    title: "Frontend Developer",
    company: "GitHub",
    location: "Remote",
    url: "#",
    source: "GitHub",
    is_new: false,
  },
];

function JobCardSkeleton() {
  return (
    <div
      className="h-full flex flex-col"
      style={{
        background: "#080808",
        border: "1px solid #1c1c1c",
        padding: "16px",
        borderRadius: "2px",
      }}
    >
      <div
        className="animate-pulse"
        style={{ background: "#1c1c1c", height: "12px", borderRadius: "2px", width: "75%", marginBottom: "10px" }}
      />
      <div
        className="animate-pulse"
        style={{ background: "#1c1c1c", height: "12px", borderRadius: "2px", width: "50%", opacity: 0.5, marginBottom: "16px" }}
      />
      <div style={{ borderTop: "1px solid #1c1c1c", paddingTop: "12px", marginTop: "auto", display: "flex", flexDirection: "column", gap: "8px" }}>
        <div
          className="animate-pulse"
          style={{ background: "#1c1c1c", height: "12px", borderRadius: "2px", width: "66%" }}
        />
        <div
          className="animate-pulse"
          style={{ background: "#1c1c1c", height: "12px", borderRadius: "2px", width: "33%" }}
        />
      </div>
    </div>
  );
}

function RetryButton({ onClick }: { onClick: () => void }) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        border: "1px solid #ff3333",
        background: hovered ? "rgba(255,51,51,0.18)" : "rgba(255,51,51,0.1)",
        color: "#ff3333",
        fontFamily: "var(--font-mono)",
        fontSize: "10px",
        fontWeight: 700,
        letterSpacing: "0.15em",
        textTransform: "uppercase" as const,
        padding: "7px 16px",
        cursor: "pointer",
        width: "100%",
        transition: "background 0.1s",
        borderRadius: "2px",
      }}
    >
      Retry
    </button>
  );
}

function ConfigureLink() {
  const [hovered, setHovered] = useState(false);
  return (
    <Link href="/settings">
      <div
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          border: hovered ? "1px solid #ff8c00" : "1px solid #1c1c1c",
          background: "#080808",
          padding: "8px 14px",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          gap: "8px",
          transition: "border-color 0.1s",
          borderRadius: "2px",
        }}
      >
        <Gear
          weight="bold"
          className="h-4 w-4"
          style={{ color: hovered ? "#ff8c00" : "#555" }}
        />
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "11px",
            letterSpacing: "0.1em",
            textTransform: "uppercase" as const,
            color: hovered ? "#ff8c00" : "#555",
            transition: "color 0.1s",
          }}
        >
          Configure keywords &amp; location
        </span>
        <ArrowRight
          weight="bold"
          className="h-4 w-4"
          style={{ color: hovered ? "#ff8c00" : "#555" }}
        />
      </div>
    </Link>
  );
}

function CtaButton() {
  const [hovered, setHovered] = useState(false);
  return (
    <Link href="/login" className="w-full">
      <button
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          border: "1px solid #ff8c00",
          background: hovered ? "rgba(255,140,0,0.18)" : "rgba(255,140,0,0.1)",
          color: "#ff8c00",
          fontFamily: "var(--font-mono)",
          fontSize: "11px",
          fontWeight: 700,
          letterSpacing: "0.2em",
          textTransform: "uppercase" as const,
          padding: "10px",
          width: "100%",
          cursor: "pointer",
          transition: "background 0.1s",
          borderRadius: "2px",
        }}
      >
        Get Started Free
      </button>
    </Link>
  );
}

export function JobList({
  jobs,
  emptyMessage = "No jobs yet. We're actively searching—check back in a few minutes!",
  isLocked = false,
  error,
  onRetry,
}: JobListProps) {
  const isLoading = useJobsStore((state) => state.isLoading);
  const displayJobs = isLocked ? DUMMY_JOBS : jobs;

  if (isLoading && !isLocked) {
    return (
      <div className="job-card-grid pb-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <JobCardSkeleton key={i} />
        ))}
      </div>
    );
  }

  if (error && !isLocked) {
    return (
      <div className="flex flex-col items-center justify-center py-8 sm:py-24 px-3 text-center">
        <div
          style={{
            background: "#080808",
            border: "1px solid rgba(255,51,51,0.4)",
            padding: "20px",
            maxWidth: "400px",
            borderRadius: "2px",
            width: "100%",
          }}
        >
          <WarningCircle weight="bold" className="h-8 w-8 sm:h-10 sm:w-10 mb-2 sm:mb-4" style={{ color: "#ff3333" }} />
          <h3
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "13px",
              color: "#ff3333",
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              marginBottom: "8px",
            }}
          >
            Couldn&apos;t Load Jobs
          </h3>
          <p
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "10px",
              color: "#555",
              marginBottom: "8px",
              wordBreak: "break-word",
            }}
          >
            {error}
          </p>
          <p
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "10px",
              color: "#555",
              marginBottom: "16px",
            }}
          >
            Try refreshing or check your connection.
          </p>
          {onRetry && <RetryButton onClick={onRetry} />}
        </div>
      </div>
    );
  }

  if (displayJobs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 sm:py-16 px-3 text-center">
        <div className="relative mb-4 sm:mb-6">
          <div
            style={{
              background: "#080808",
              border: "1px solid #1c1c1c",
              padding: "12px 24px",
              position: "relative",
              zIndex: 10,
              borderRadius: "2px",
            }}
          >
            <Briefcase weight="bold" className="h-8 w-8 sm:h-12 sm:w-12" style={{ color: "#333" }} />
          </div>
          <div
            className="absolute inset-[-6px] animate-scan-ring pointer-events-none"
            style={{ border: "1px solid rgba(255,140,0,0.4)" }}
          />
        </div>
        <h3
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "11px",
            letterSpacing: "0.08em",
            color: "#aaa",
            marginBottom: "6px",
            maxWidth: "280px",
          }}
        >
          {emptyMessage}
        </h3>
        <p
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "9px",
            color: "#555",
            marginBottom: "24px",
            letterSpacing: "0.05em",
          }}
        >
          Streaming live — new extractions appear automatically.
        </p>
        <ConfigureLink />
      </div>
    );
  }

  return (
    <div className="relative">
      <div className={isLocked ? "pointer-events-none" : ""}>
        <ScrollArea className={`${isLocked ? "h-[500px] sm:h-[600px] overflow-hidden" : "h-[calc(100dvh-200px)] sm:h-[calc(100dvh-220px)]"} pr-3 sm:pr-4 pb-6 sm:pb-8`}>
          <div className="job-card-grid">
            {displayJobs.map((job, index) => (
              <div
                key={job.external_id}
                className={`h-full animate-job-enter ${isLocked && index >= 3 ? "blur-[2px] opacity-40" : ""}`}
                style={{ animationDelay: `${Math.min(index * 40, 200)}ms` }}
              >
                <JobCard job={job} isLocked={isLocked} />
              </div>
            ))}
          </div>
        </ScrollArea>
      </div>

      {isLocked && (
        <div className="absolute inset-x-0 bottom-0 top-0 flex flex-col items-center justify-center bg-background/20 backdrop-blur-[2px] p-3 sm:p-0">
          <div
            style={{
              background: "#080808",
              border: "1px solid #1c1c1c",
              padding: "24px 32px",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "16px",
              maxWidth: "360px",
              textAlign: "center",
              width: "100%",
              borderRadius: "2px",
            }}
          >
            <div style={{ background: "#ff8c00", padding: "10px", borderRadius: "2px" }}>
              <Lock weight="fill" className="h-7 w-7 sm:h-10 sm:w-10" style={{ color: "#000" }} />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <h3
                style={{
                  fontFamily: "var(--font-mono)",
                  color: "#ff8c00",
                  fontSize: "14px",
                  letterSpacing: "0.15em",
                  textTransform: "uppercase",
                  fontWeight: 700,
                }}
              >
                Create an Account
              </h3>
              <p
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "10px",
                  color: "#555",
                  letterSpacing: "0.04em",
                  lineHeight: 1.6,
                }}
              >
                Sign up free to see all jobs and get real-time alerts.
              </p>
            </div>
            <CtaButton />
          </div>
        </div>
      )}
    </div>
  );
}

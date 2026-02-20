"use client";

import { useState } from "react";
import { Job, useJobsStore } from "@/store/jobs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Building2,
  MapPin,
  Clock,
  DollarSign,
  Briefcase,
  ExternalLink,
  ThumbsDown,
  Loader2,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface JobCardProps {
  job: Job;
}

function getSourceColor(source: string) {
  switch (source) {
    case "LinkedIn":
      return "bg-blue-500/20 text-blue-400 border-blue-500/30";
    case "Jobright":
      return "bg-purple-500/20 text-purple-400 border-purple-500/30";
    case "JobrightMiniSites":
      return "bg-emerald-500/20 text-emerald-400 border-emerald-500/30";
    case "Fidelity":
      return "bg-green-500/20 text-green-400 border-green-500/30";
    case "StateStreet":
      return "bg-orange-500/20 text-orange-400 border-orange-500/30";
    case "MathWorks":
      return "bg-red-500/20 text-red-400 border-red-500/30";
    default:
      return "bg-zinc-500/20 text-zinc-400 border-zinc-500/30";
  }
}

export function JobCard({ job }: JobCardProps) {
  const [isBlocking, setIsBlocking] = useState(false);
  const removeJob = useJobsStore((state) => state.removeJob);

  const postedAt = job.posted_at
    ? formatDistanceToNow(new Date(job.posted_at), { addSuffix: true })
    : null;

  const handleBlockCompany = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (isBlocking) return;
    
    setIsBlocking(true);
    try {
      const response = await fetch(`${API_URL}/jobs/block`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company: job.company,
          source: job.source,
          external_id: job.external_id,
        }),
      });
      
      if (response.ok) {
        removeJob(job.external_id);
      }
    } catch (error) {
      console.error("Failed to block company:", error);
    } finally {
      setIsBlocking(false);
    }
  };

  return (
    <Card className="group relative overflow-hidden border-border/50 bg-card/50 backdrop-blur-sm transition-all duration-300 hover:border-primary/30 hover:bg-card/80 hover:shadow-lg hover:shadow-primary/5">
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={handleBlockCompany}
              disabled={isBlocking}
              className="absolute top-3 right-3 z-10 p-1.5 rounded-md bg-background/80 border border-border/50 text-muted-foreground hover:text-red-400 hover:border-red-400/50 hover:bg-red-500/10 transition-all duration-200 opacity-0 group-hover:opacity-100"
            >
              {isBlocking ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ThumbsDown className="h-4 w-4" />
              )}
            </button>
          </TooltipTrigger>
          <TooltipContent side="left">
            <p>Block this company and remove from list</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0 pr-8">
            <CardTitle className="line-clamp-2 text-lg font-semibold leading-tight group-hover:text-primary transition-colors">
              {job.title}
            </CardTitle>
          </div>
        </div>
        <Badge
          variant="outline"
          className={`mt-2 w-fit ${getSourceColor(job.source)}`}
        >
          {job.source === "JobrightMiniSites"
            ? "Jobright Mini"
            : job.source === "StateStreet"
            ? "State Street"
            : job.source === "MathWorks"
            ? "MathWorks"
            : job.source}
        </Badge>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="grid gap-2 text-sm">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Building2 className="h-4 w-4 shrink-0 text-primary/70" />
            <span className="truncate font-medium text-foreground/90">
              {job.company}
            </span>
          </div>

          <div className="flex items-center gap-2 text-muted-foreground">
            <MapPin className="h-4 w-4 shrink-0 text-primary/70" />
            <span className="truncate">{job.location}</span>
          </div>

          {postedAt && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Clock className="h-4 w-4 shrink-0 text-primary/70" />
              <span>{postedAt}</span>
            </div>
          )}

          {job.salary && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <DollarSign className="h-4 w-4 shrink-0 text-emerald-500/70" />
              <span className="text-emerald-400">{job.salary}</span>
            </div>
          )}

          {job.work_model && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Briefcase className="h-4 w-4 shrink-0 text-primary/70" />
              <span>{job.work_model}</span>
            </div>
          )}
        </div>

        <Button
          asChild
          variant="outline"
          className="w-full gap-2 border-border/50 hover:border-primary/50 hover:bg-primary/10"
        >
          <a href={job.url} target="_blank" rel="noopener noreferrer">
            View Job
            <ExternalLink className="h-4 w-4" />
          </a>
        </Button>
      </CardContent>
    </Card>
  );
}

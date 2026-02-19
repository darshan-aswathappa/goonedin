"use client";

import { Job } from "@/store/jobs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Building2,
  MapPin,
  Clock,
  DollarSign,
  Briefcase,
  ExternalLink,
  Sparkles,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

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
    default:
      return "bg-zinc-500/20 text-zinc-400 border-zinc-500/30";
  }
}

export function JobCard({ job }: JobCardProps) {
  const postedAt = job.posted_at
    ? formatDistanceToNow(new Date(job.posted_at), { addSuffix: true })
    : null;

  return (
    <Card className="group relative overflow-hidden border-border/50 bg-card/50 backdrop-blur-sm transition-all duration-300 hover:border-primary/30 hover:bg-card/80 hover:shadow-lg hover:shadow-primary/5">
      {job.is_new && (
        <div className="absolute right-3 top-3">
          <Badge className="gap-1 bg-amber-500/20 text-amber-400 border-amber-500/30">
            <Sparkles className="h-3 w-3" />
            New
          </Badge>
        </div>
      )}

      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <CardTitle className="line-clamp-2 text-lg font-semibold leading-tight group-hover:text-primary transition-colors">
              {job.title}
            </CardTitle>
          </div>
        </div>
        <Badge
          variant="outline"
          className={`mt-2 w-fit ${getSourceColor(job.source)}`}
        >
          {job.source === "JobrightMiniSites" ? "Jobright Mini" : job.source}
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

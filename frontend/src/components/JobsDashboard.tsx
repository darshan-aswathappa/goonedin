"use client";

import { useJobsStore } from "@/store/jobs";
import { useWebSocket } from "@/hooks/useWebSocket";
import { useJobsApi } from "@/hooks/useJobsApi";
import { JobList } from "./JobList";
import { ConnectionStatus } from "./ConnectionStatus";
import { ServerTime } from "./ServerTime";
import { CompanyTicker } from "./CompanyTicker";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Toaster } from "@/components/ui/sonner";
import { LOCATION_FILTER } from "@/config/filters";
import { useAuth } from "@/hooks/useAuth";
import {
  Briefcase,
  Linkedin,
  Sparkles,
  Globe,
  RefreshCw,
  Loader2,
  Building,
  Building2,
  Calculator,
  MapPin,
  Terminal,
  Settings,
  Github,
  LogOut,
  Bookmark,
} from "lucide-react";
import Link from "next/link";

export function JobsDashboard() {
  const { user, signOut } = useAuth();
  
  // Only connect/fetch if user is authenticated
  useWebSocket({ enabled: !!user });
  const { refetch } = useJobsApi(!!user);

  const jobs = useJobsStore((state) => state.jobs);
  const linkedinJobs = useJobsStore((state) => state.linkedinJobs);
  const fidelityJobs = useJobsStore((state) => state.fidelityJobs);
  const statestreetJobs = useJobsStore((state) => state.statestreetJobs);
  const mathworksJobs = useJobsStore((state) => state.mathworksJobs);
  const githubJobs = useJobsStore((state) => state.githubJobs);
  const locationFilteredJobs = useJobsStore(
    (state) => state.locationFilteredJobs,
  );
  const isLoading = useJobsStore((state) => state.isLoading);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border/40 bg-background/80 backdrop-blur-xl">
        <div className="container mx-auto px-4 py-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-linear-to-br from-primary/20 to-primary/5 ring-1 ring-primary/20">
                <Briefcase className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h1 className="text-xl font-bold tracking-tight">
                  Job Tracker
                </h1>
                <p className="text-xs text-muted-foreground">
                  Real-time job notifications
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {user && (
                <>
                  <ServerTime />
                  <Badge variant="secondary" className="gap-1.5">
                    <Sparkles className="h-3 w-3" />
                    {jobs.length} jobs
                  </Badge>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={refetch}
                    disabled={isLoading}
                    className="h-8 w-8"
                    title="Refresh jobs"
                  >
                    {isLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <RefreshCw className="h-4 w-4" />
                    )}
                  </Button>
                  <Link href="/saved">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-blue-500 hover:text-blue-400 hover:bg-blue-500/10"
                      title="Saved Jobs"
                    >
                      <Bookmark className="h-4 w-4" />
                    </Button>
                  </Link>
                  <Link href="/settings">
                    <Button variant="ghost" size="icon" className="h-8 w-8" title="Settings">
                      <Settings className="h-4 w-4" />
                    </Button>
                  </Link>
                  <Link href="/logs">
                    <Button variant="ghost" size="icon" className="h-8 w-8" title="System Logs">
                      <Terminal className="h-4 w-4" />
                    </Button>
                  </Link>
                  <ConnectionStatus />
                  <Button variant="ghost" size="icon" onClick={signOut} className="h-8 w-8" title="Sign out">
                    <LogOut className="h-4 w-4" />
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6">
        {!user && <CompanyTicker />}
        <Tabs defaultValue="all" className={!user ? "w-full mt-8" : "w-full"}>
          {user && (
            <TabsList className="mb-6 grid w-full grid-cols-7 bg-muted/50 p-1">
            <TabsTrigger
              value="all"
              className="gap-2 data-[state=active]:bg-background data-[state=active]:shadow-sm"
            >
              <Globe className="h-4 w-4" />
              <span className="hidden sm:inline">All</span>
              <Badge
                variant="secondary"
                className="ml-1 hidden h-5 px-1.5 text-xs sm:flex"
              >
                {user ? jobs.length : 6}
              </Badge>
            </TabsTrigger>
            {LOCATION_FILTER.enabled && (
              <TabsTrigger
                value="location"
                className="gap-2 data-[state=active]:bg-background data-[state=active]:shadow-sm"
              >
                <MapPin className="h-4 w-4" />
                <span className="hidden sm:inline">
                  {LOCATION_FILTER.displayName}
                </span>
              <Badge
                variant="secondary"
                className="ml-1 hidden h-5 px-1.5 text-xs sm:flex"
              >
                {user ? locationFilteredJobs.length : 3}
              </Badge>
            </TabsTrigger>
          )}
          <TabsTrigger
            value="linkedin"
            className="gap-2 data-[state=active]:bg-background data-[state=active]:shadow-sm"
          >
            <Linkedin className="h-4 w-4" />
            <span className="hidden sm:inline">LinkedIn</span>
            <Badge
              variant="secondary"
              className="ml-1 hidden h-5 px-1.5 text-xs sm:flex"
            >
              {user ? linkedinJobs.length : 1}
            </Badge>
          </TabsTrigger>
          <TabsTrigger
            value="fidelity"
            className="gap-2 data-[state=active]:bg-background data-[state=active]:shadow-sm"
          >
            <Building className="h-4 w-4" />
            <span className="hidden sm:inline">Fidelity</span>
            <Badge
              variant="secondary"
              className="ml-1 hidden h-5 px-1.5 text-xs sm:flex"
            >
              {user ? fidelityJobs.length : 1}
            </Badge>
          </TabsTrigger>
          <TabsTrigger
            value="statestreet"
            className="gap-2 data-[state=active]:bg-background data-[state=active]:shadow-sm"
          >
            <Building2 className="h-4 w-4" />
            <span className="hidden sm:inline">State Street</span>
            <Badge
              variant="secondary"
              className="ml-1 hidden h-5 px-1.5 text-xs sm:flex"
            >
              {user ? statestreetJobs.length : 1}
            </Badge>
          </TabsTrigger>
          <TabsTrigger
            value="mathworks"
            className="gap-2 data-[state=active]:bg-background data-[state=active]:shadow-sm"
          >
            <Calculator className="h-4 w-4" />
            <span className="hidden sm:inline">MathWorks</span>
            <Badge
              variant="secondary"
              className="ml-1 hidden h-5 px-1.5 text-xs sm:flex"
            >
              {user ? mathworksJobs.length : 1}
            </Badge>
          </TabsTrigger>
          <TabsTrigger
            value="github"
            className="gap-2 data-[state=active]:bg-background data-[state=active]:shadow-sm"
          >
            <Github className="h-4 w-4" />
            <span className="hidden sm:inline">GitHub</span>
            <Badge
              variant="secondary"
              className="ml-1 hidden h-5 px-1.5 text-xs sm:flex"
            >
              {user ? githubJobs.length : 2}
            </Badge>
            </TabsTrigger>
          </TabsList>
          )}

          <TabsContent value="all" className="mt-0">
            <JobList
              jobs={jobs}
              emptyMessage="No jobs yet. Waiting for opportunities..."
              isLocked={!user}
            />
          </TabsContent>

          {LOCATION_FILTER.enabled && (
            <TabsContent value="location" className="mt-0">
              <JobList
                jobs={locationFilteredJobs}
                emptyMessage={`No jobs in ${LOCATION_FILTER.location} yet. They'll appear here when found.`}
                isLocked={!user}
              />
            </TabsContent>
          )}

          <TabsContent value="linkedin" className="mt-0">
            <JobList
              jobs={linkedinJobs}
              emptyMessage="No LinkedIn jobs yet. They'll appear here when found."
              isLocked={!user}
            />
          </TabsContent>

          <TabsContent value="fidelity" className="mt-0">
            <JobList
              jobs={fidelityJobs}
              emptyMessage="No Fidelity jobs yet. Jobs posted today will appear here."
              isLocked={!user}
            />
          </TabsContent>

          <TabsContent value="statestreet" className="mt-0">
            <JobList
              jobs={statestreetJobs}
              emptyMessage="No State Street jobs yet. Fresh postings will appear here."
              isLocked={!user}
            />
          </TabsContent>

          <TabsContent value="mathworks" className="mt-0">
            <JobList
              jobs={mathworksJobs}
              emptyMessage="No MathWorks jobs yet. New postings will appear here."
              isLocked={!user}
            />
          </TabsContent>

          <TabsContent value="github" className="mt-0">
            <JobList
              jobs={githubJobs}
              emptyMessage="No GitHub jobs yet. New grad postings from SimplifyJobs will appear here."
              isLocked={!user}
            />
          </TabsContent>
        </Tabs>
      </main>

      <Toaster
        position="bottom-right"
        toastOptions={{
          className: "bg-card border-border",
        }}
      />
    </div>
  );
}

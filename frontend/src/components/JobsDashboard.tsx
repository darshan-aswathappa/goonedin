"use client";

import { useJobsStore } from "@/store/jobs";
import { useWebSocket } from "@/hooks/useWebSocket";
import { useJobsApi } from "@/hooks/useJobsApi";
import { JobList } from "./JobList";
import { ConnectionStatus } from "./ConnectionStatus";
import { ThemeToggle } from "./ThemeToggle";
import { CompanyTicker } from "./CompanyTicker";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Toaster } from "@/components/ui/sonner";
import { LOCATION_FILTER } from "@/config/filters";
import { useAuth } from "@/hooks/useAuth";
import {
  Briefcase,
  Globe,
  ArrowsClockwise,
  CircleNotch,
  Buildings,
  LinkedinLogo,
  GithubLogo,
  MapPin,
  TerminalWindow,
  Gear,
  BookmarkSimple,
  SignOut,
  Sparkle,
} from "@phosphor-icons/react";
import Link from "next/link";
import { useTheme } from "next-themes";

export function JobsDashboard() {
  const { user, loading, signOut } = useAuth();
  
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

  if (loading) {
    return (
      <div className="min-h-screen bg-[#FFF7F1] flex items-center justify-center">
        <CircleNotch weight="bold" className="h-12 w-12 animate-spin text-[#F15152]" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground font-medium transition-colors duration-300">
      {/* Header / Navbar */}
      <header className="brutal-border border-t-0 border-l-0 border-r-0 bg-card sticky top-0 z-50">
        <div className="container mx-auto px-4 py-3">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="brutal-border bg-primary p-2 shadow-[2px_2px_0px_0px_var(--border)]">
                <Briefcase weight="fill" className="h-6 w-6 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-black uppercase italic tracking-tighter leading-none">
                  GoonedIn
                </h1>
                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                  Job Extraction Engine
                </p>
              </div>
            </div>

            {user && (
              <div className="flex items-center gap-2">
                <div className="brutal-border bg-card px-3 py-1.5 flex items-center gap-2 shadow-[2px_2px_0px_0px_var(--border)] h-[42px]">
                  <Sparkle weight="fill" className="h-4 w-4 text-primary" />
                  <span className="font-black text-sm">{jobs.length}</span>
                </div>

                <div className="flex items-center gap-1 h-[42px]">
                  <ThemeToggle />

                  <button
                    onClick={refetch}
                    disabled={isLoading}
                    className="brutal-border p-2 bg-card hover:bg-muted transition-colors shadow-[2px_2px_0px_0px_var(--border)] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none h-[42px] w-[42px] flex items-center justify-center"
                    title="Refresh"
                  >
                    {isLoading ? (
                      <CircleNotch weight="bold" className="h-5 w-5 animate-spin" />
                    ) : (
                      <ArrowsClockwise weight="bold" className="h-5 w-5" />
                    )}
                  </button>

                  <Link href="/saved">
                    <div className="brutal-border p-2 bg-card hover:bg-muted transition-colors shadow-[2px_2px_0px_0px_var(--border)] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none h-[42px] w-[42px] flex items-center justify-center text-[#009063]">
                      <BookmarkSimple weight="bold" className="h-5 w-5" />
                    </div>
                  </Link>

                  <Link href="/settings">
                    <div className="brutal-border p-2 bg-card hover:bg-muted transition-colors shadow-[2px_2px_0px_0px_var(--border)] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none h-[42px] w-[42px] flex items-center justify-center">
                      <Gear weight="bold" className="h-5 w-5" />
                    </div>
                  </Link>

                  <Link href="/logs">
                    <div className="brutal-border p-2 bg-card hover:bg-muted transition-colors shadow-[2px_2px_0px_0px_var(--border)] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none h-[42px] w-[42px] flex items-center justify-center">
                      <TerminalWindow weight="bold" className="h-5 w-5" />
                    </div>
                  </Link>

                  <ConnectionStatus />

                  <button
                    onClick={signOut}
                    className="brutal-border p-2 bg-primary text-white hover:bg-black dark:hover:bg-white dark:hover:text-black transition-colors shadow-[2px_2px_0px_0px_var(--border)] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none h-[42px] w-[42px] flex items-center justify-center"
                    title="Sign Out"
                  >
                    <SignOut weight="bold" className="h-5 w-5" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        {!user && <CompanyTicker />}
        
        <Tabs defaultValue="all" className={!user ? "w-full mt-8" : "w-full"}>
          {user && (
            <TabsList className="flex flex-wrap h-auto gap-2 bg-transparent p-0 mb-10 items-start justify-start border-none">
              <TabsTrigger
                value="all"
                className="brutal-border rounded-none px-4 py-3 font-black uppercase italic tracking-tighter text-sm data-[state=active]:bg-primary data-[state=active]:text-white shadow-[4px_4px_0px_0px_var(--border)] transition-all data-[state=active]:translate-x-[2px] data-[state=active]:translate-y-[2px] data-[state=active]:shadow-none hover:bg-muted active:scale-95 whitespace-nowrap"
              >
                <div className="flex items-center gap-2">
                  <Globe weight="bold" className="h-5 w-5" />
                  All ({jobs.length})
                </div>
              </TabsTrigger>
              
              {LOCATION_FILTER.enabled && (
                <TabsTrigger
                  value="location"
                  className="brutal-border rounded-none px-4 py-3 font-black uppercase italic tracking-tighter text-sm data-[state=active]:bg-primary data-[state=active]:text-white shadow-[4px_4px_0px_0px_var(--border)] transition-all data-[state=active]:translate-x-[2px] data-[state=active]:translate-y-[2px] data-[state=active]:shadow-none hover:bg-muted active:scale-95 whitespace-nowrap"
                >
                  <div className="flex items-center gap-2">
                    <MapPin weight="bold" className="h-5 w-5" />
                    {LOCATION_FILTER.displayName} ({locationFilteredJobs.length})
                  </div>
                </TabsTrigger>
              )}

              <TabsTrigger
                value="linkedin"
                className="brutal-border rounded-none px-4 py-3 font-black uppercase italic tracking-tighter text-sm data-[state=active]:bg-[#0A66C2] data-[state=active]:text-white shadow-[4px_4px_0px_0px_var(--border)] transition-all data-[state=active]:translate-x-[2px] data-[state=active]:translate-y-[2px] data-[state=active]:shadow-none hover:bg-muted active:scale-95 whitespace-nowrap"
              >
                <div className="flex items-center gap-2">
                  <LinkedinLogo weight="bold" className="h-5 w-5" />
                  LinkedIn ({linkedinJobs.length})
                </div>
              </TabsTrigger>

              <TabsTrigger
                value="fidelity"
                className="brutal-border rounded-none px-4 py-3 font-black uppercase italic tracking-tighter text-sm data-[state=active]:bg-[#338800] data-[state=active]:text-white shadow-[4px_4px_0px_0px_var(--border)] transition-all data-[state=active]:translate-x-[2px] data-[state=active]:translate-y-[2px] data-[state=active]:shadow-none hover:bg-muted active:scale-95 whitespace-nowrap"
              >
                <div className="flex items-center gap-2">
                  <Buildings weight="bold" className="h-5 w-5" />
                  Fidelity ({fidelityJobs.length})
                </div>
              </TabsTrigger>

              <TabsTrigger
                value="statestreet"
                className="brutal-border rounded-none px-4 py-3 font-black uppercase italic tracking-tighter text-sm data-[state=active]:bg-[#005295] data-[state=active]:text-white shadow-[4px_4px_0px_0px_var(--border)] transition-all data-[state=active]:translate-x-[2px] data-[state=active]:translate-y-[2px] data-[state=active]:shadow-none hover:bg-muted active:scale-95 whitespace-nowrap"
              >
                <div className="flex items-center gap-2">
                  <Buildings weight="bold" className="h-5 w-5" />
                  State Street ({statestreetJobs.length})
                </div>
              </TabsTrigger>

              <TabsTrigger
                value="mathworks"
                className="brutal-border rounded-none px-4 py-3 font-black uppercase italic tracking-tighter text-sm data-[state=active]:bg-[#ED1C24] data-[state=active]:text-white shadow-[4px_4px_0px_0px_var(--border)] transition-all data-[state=active]:translate-x-[2px] data-[state=active]:translate-y-[2px] data-[state=active]:shadow-none hover:bg-muted active:scale-95 whitespace-nowrap"
              >
                <div className="flex items-center gap-2">
                  <Buildings weight="bold" className="h-5 w-5" />
                  MathWorks ({mathworksJobs.length})
                </div>
              </TabsTrigger>

              <TabsTrigger
                value="github"
                className="brutal-border rounded-none px-4 py-3 font-black uppercase italic tracking-tighter text-sm data-[state=active]:bg-[#24292e] data-[state=active]:text-white shadow-[4px_4px_0px_0px_var(--border)] transition-all data-[state=active]:translate-x-[2px] data-[state=active]:translate-y-[2px] data-[state=active]:shadow-none hover:bg-muted active:scale-95 whitespace-nowrap"
              >
                <div className="flex items-center gap-2">
                  <GithubLogo weight="bold" className="h-5 w-5" />
                  GitHub ({githubJobs.length})
                </div>
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
          className: "brutal-border brutal-shadow rounded-none bg-card text-foreground",
        }}
      />
    </div>
  );
}

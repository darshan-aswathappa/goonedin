"use client";

import { useState } from "react";
import { useJobsStore } from "@/store/jobs";
import { useWebSocket } from "@/hooks/useWebSocket";
import { useJobsApi } from "@/hooks/useJobsApi";
import { JobList } from "./JobList";
import { ConnectionStatus } from "./ConnectionStatus";
import { ThemeToggle } from "./ThemeToggle";
import { CompanyTicker } from "./CompanyTicker";
import { AddJobSourceModal } from "./AddJobSourceModal";
import { LocationFilterInput } from "./LocationFilterInput";
import { ScrapeCountdown } from "./ScrapeCountdown";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Toaster } from "@/components/ui/sonner";
import { LOCATION_FILTER } from "@/config/filters";
import { useAuth, getAuthHeaders } from "@/hooks/useAuth";
import { toast } from "sonner";
import {
  Briefcase,
  Globe,
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
  Plus,
  PencilSimple,
  Trash,
  Tag,
} from "@phosphor-icons/react";
import * as PhosphorIcons from "@phosphor-icons/react";
import Link from "next/link";
import { useTheme } from "next-themes";

export function JobsDashboard() {
  const { user, loading, signOut } = useAuth();
  const [activeTab, setActiveTab] = useState("all");
  
  useWebSocket({ enabled: !!user });
  useJobsApi(!!user);

  const jobs = useJobsStore((state) => state.jobs);
  const linkedinJobs = useJobsStore((state) => state.linkedinJobs);
  const jobrightJobs = useJobsStore((state) => state.jobrightJobs);
  const mathworksJobs = useJobsStore((state) => state.mathworksJobs);
  const githubJobs = useJobsStore((state) => state.githubJobs);
  const locationFilteredJobs = useJobsStore(
    (state) => state.locationFilteredJobs,
  );
  const locationFilterLocation = useJobsStore((state) => state.locationFilterLocation);
  const locationFilterNormalized = useJobsStore((state) => state.locationFilterNormalized);
  const nextLinkedinScrape = useJobsStore((state) => state.nextLinkedinScrape);
  const nextLocationScrape = useJobsStore((state) => state.nextLocationScrape);
  const customSources = useJobsStore((state) => state.customSources);
  const removeCustomSource = useJobsStore((state) => state.removeCustomSource);
  const sourceStatuses = useJobsStore((state) => state.sourceStatuses);

  const handleDeleteSource = async (id: string, name: string) => {
      try {
          const headers = await getAuthHeaders();
          const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
          
          const res = await fetch(`${apiUrl}/config/custom-sources/${id}`, {
              method: "DELETE",
              headers
          });
          
          if (!res.ok) throw new Error("Failed to delete");
          removeCustomSource(id);
          setActiveTab("all");
          toast.success(`Deleted source: ${name}`);
      } catch (err) {
          toast.error("Error deleting job source");
          console.error(err);
      }
  };

  const getDynamicIcon = (iconName: string) => {
    const IconComponent = (PhosphorIcons as any)[iconName] || PhosphorIcons.Buildings;
    return <IconComponent weight="bold" className="h-5 w-5" />;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#FFF7F1] flex items-center justify-center">
        <CircleNotch weight="bold" className="h-12 w-12 animate-spin text-[#F15152]" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground font-medium transition-colors duration-300">
      <header className="brutal-border border-t-0 border-l-0 border-r-0 bg-card sticky top-0 z-40">
        <div className="container mx-auto px-4 py-3">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="brutal-border bg-primary p-2 shadow-[2px_2px_0px_0px_var(--border)]">
                <Briefcase weight="fill" className="h-6 w-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-black uppercase italic tracking-tighter leading-none">
                  GoonedIn
                </h1>
                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                  Job Extraction Engine
                </p>
              </div>
            </div>

            {user && (
              <div className="flex items-center gap-2">
                <div className="brutal-border bg-card px-3 py-1.5 hidden sm:flex items-center gap-2 shadow-[2px_2px_0px_0px_var(--border)] h-[42px]">
                  <Sparkle weight="fill" className="h-4 w-4 text-primary" />
                  <span className="font-black text-sm">{jobs.length}</span>
                </div>

                <div className="flex items-center gap-0.5 sm:gap-1 h-[42px]">
                  <ThemeToggle />

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

                  <Link href="/keyword-matcher">
                    <div className="brutal-border p-2 bg-card hover:bg-muted transition-colors shadow-[2px_2px_0px_0px_var(--border)] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none h-[42px] w-[42px] flex items-center justify-center">
                      <Tag weight="bold" className="h-5 w-5" />
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
        
        <Tabs value={activeTab} onValueChange={setActiveTab} className={!user ? "w-full mt-8" : "w-full"}>
          {user && (
            <div className="relative flex items-center gap-4 w-full mb-10">
              <TabsList className="flex flex-nowrap h-auto gap-2 bg-transparent p-0 items-center justify-start border-none overflow-x-auto whitespace-nowrap scrollbar-hide w-full max-w-full pb-2">
                <TabsTrigger
                value="all"
                className="brutal-border rounded-none px-4 py-3 font-black uppercase italic tracking-tighter text-sm data-[state=active]:bg-primary data-[state=active]:text-white shadow-[4px_4px_0px_0px_var(--border)] transition-all data-[state=active]:translate-x-[2px] data-[state=active]:translate-y-[2px] data-[state=active]:shadow-none hover:bg-muted active:scale-95 whitespace-nowrap shrink-0"
              >
                <div className="flex items-center gap-2">
                  <Globe weight="bold" className="h-5 w-5" />
                  All ({jobs.length})
                </div>
              </TabsTrigger>
              
              <TabsTrigger
                value="location"
                className="brutal-border rounded-none px-4 py-3 font-black uppercase italic tracking-tighter text-sm data-[state=active]:bg-primary data-[state=active]:text-white shadow-[4px_4px_0px_0px_var(--border)] transition-all data-[state=active]:translate-x-[2px] data-[state=active]:translate-y-[2px] data-[state=active]:shadow-none hover:bg-muted active:scale-95 whitespace-nowrap shrink-0"
              >
                <div className="flex items-center gap-2">
                  <MapPin weight="bold" className="h-5 w-5" />
                  {locationFilterNormalized?.abbreviation || (LOCATION_FILTER.enabled ? LOCATION_FILTER.displayName : "Location")} ({locationFilteredJobs.length})
                </div>
              </TabsTrigger>

              <TabsTrigger
                value="linkedin"
                className="brutal-border rounded-none px-4 py-3 font-black uppercase italic tracking-tighter text-sm data-[state=active]:bg-[#0A66C2] data-[state=active]:text-white shadow-[4px_4px_0px_0px_var(--border)] transition-all data-[state=active]:translate-x-[2px] data-[state=active]:translate-y-[2px] data-[state=active]:shadow-none hover:bg-muted active:scale-95 whitespace-nowrap shrink-0"
              >
                <div className="flex items-center gap-2">
                  <LinkedinLogo weight="bold" className="h-5 w-5" />
                  LinkedIn ({linkedinJobs.length})
                </div>
              </TabsTrigger>

              <TabsTrigger
                value="jobright"
                className="brutal-border rounded-none px-4 py-3 font-black uppercase italic tracking-tighter text-sm data-[state=active]:bg-[#5465FF] data-[state=active]:text-white shadow-[4px_4px_0px_0px_var(--border)] transition-all data-[state=active]:translate-x-[2px] data-[state=active]:translate-y-[2px] data-[state=active]:shadow-none hover:bg-muted active:scale-95 whitespace-nowrap shrink-0"
              >
                <div className="flex items-center gap-2">
                  <Briefcase weight="bold" className="h-5 w-5" />
                  Jobright ({jobrightJobs.length})
                </div>
              </TabsTrigger>

              <TabsTrigger
                value="mathworks"
                className="brutal-border rounded-none px-4 py-3 font-black uppercase italic tracking-tighter text-sm data-[state=active]:bg-[#ED1C24] data-[state=active]:text-white shadow-[4px_4px_0px_0px_var(--border)] transition-all data-[state=active]:translate-x-[2px] data-[state=active]:translate-y-[2px] data-[state=active]:shadow-none hover:bg-muted active:scale-95 whitespace-nowrap shrink-0"
              >
                <div className="flex items-center gap-2">
                  <Buildings weight="bold" className="h-5 w-5" />
                  MathWorks ({mathworksJobs.length})
                </div>
              </TabsTrigger>

              <TabsTrigger
                value="github"
                className="brutal-border rounded-none px-4 py-3 font-black uppercase italic tracking-tighter text-sm data-[state=active]:bg-[#24292e] data-[state=active]:text-white shadow-[4px_4px_0px_0px_var(--border)] transition-all data-[state=active]:translate-x-[2px] data-[state=active]:translate-y-[2px] data-[state=active]:shadow-none hover:bg-muted active:scale-95 whitespace-nowrap shrink-0"
              >
                <div className="flex items-center gap-2">
                  <GithubLogo weight="bold" className="h-5 w-5" />
                  GitHub ({githubJobs.length})
                </div>
              </TabsTrigger>

              {customSources.map((source) => {
                const sourceJobs = jobs.filter((j) => j.source === source.name);
                return (
                  <TabsTrigger
                    key={source.id}
                    value={source.id}
                    className="brutal-border rounded-none px-4 py-3 font-black uppercase italic tracking-tighter text-sm data-[state=active]:bg-foreground data-[state=active]:text-background shadow-[4px_4px_0px_0px_var(--border)] transition-all data-[state=active]:translate-x-[2px] data-[state=active]:translate-y-[2px] data-[state=active]:shadow-none hover:bg-muted active:scale-95 whitespace-nowrap shrink-0"
                  >
                    <div className="flex items-center gap-2">
                      {getDynamicIcon(source.icon)}
                      {source.name} ({sourceJobs.length})
                    </div>
                  </TabsTrigger>
                );
              })}

              </TabsList>
              
              <div className="shrink-0 pb-2">
                <AddJobSourceModal onSuccess={(id: string) => setActiveTab(id)} />
              </div>
              <div className="pointer-events-none absolute right-10 top-0 h-full w-10 bg-gradient-to-l from-background to-transparent sm:hidden" aria-hidden="true" />
            </div>
          )}

          <TabsContent value="all" className="mt-0">
            <JobList
              jobs={jobs}
              emptyMessage="No jobs yet. Waiting for opportunities..."
              isLocked={!user}
            />
          </TabsContent>

          <TabsContent value="location" className="mt-0">
            <div className="flex flex-col gap-3 mb-6 pb-3 border-b-4 border-black border-dotted sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-col gap-1">
                <span className="font-black uppercase tracking-tighter text-xl">
                  {locationFilterNormalized?.full_name || "Location Filter"}
                </span>
                {locationFilterNormalized && (
                  <span className="font-bold text-xs text-muted-foreground flex gap-2 flex-wrap">
                    <span className="px-2 py-0.5 border-2 border-black bg-red-100 dark:bg-red-900/50">{locationFilterNormalized.abbreviation}</span>
                    <ScrapeCountdown nextScrapeAt={nextLocationScrape} />
                  </span>
                )}
              </div>
              <LocationFilterInput />
            </div>
            <JobList
              jobs={locationFilteredJobs}
              emptyMessage={
                locationFilterLocation
                  ? `No jobs in ${locationFilterNormalized?.full_name || locationFilterLocation} yet. They'll appear here when found.`
                  : "Set a location above to filter jobs by state or city."
              }
              isLocked={!user}
            />
          </TabsContent>

          <TabsContent value="linkedin" className="mt-0">
            {nextLinkedinScrape && (
              <div className="mb-4">
                <ScrapeCountdown nextScrapeAt={nextLinkedinScrape} />
              </div>
            )}
            <JobList
              jobs={linkedinJobs}
              emptyMessage="No LinkedIn jobs yet. They'll appear here when found."
              isLocked={!user}
            />
          </TabsContent>

          <TabsContent value="jobright" className="mt-0">
            <JobList
              jobs={jobrightJobs}
              emptyMessage="No Jobright jobs yet. They'll appear here when found."
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

          {customSources.map((source) => {
            const sourceJobs = jobs.filter((j) => j.source === source.name);
            const liveStatus = sourceStatuses[source.id];
            const status = liveStatus?.status || source.status || "done";
            const statusMessage = liveStatus?.message || source.status_message || "";
            const isProcessing = status === "pending" || status === "fetching" || status === "parsing";
            const isError = status === "error";
            const progressPercent = status === "pending" ? 10 : status === "fetching" ? 40 : status === "parsing" ? 75 : 100;
            return (
              <TabsContent key={source.id} value={source.id} className="mt-0">
                <div className="flex flex-col gap-3 mb-6 pb-3 border-b-4 border-black border-dotted sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex flex-col gap-1">
                     <span className="font-black uppercase tracking-tighter text-xl">{source.name}</span>
                     <span className="font-bold text-xs text-muted-foreground flex gap-2">
                        <span className="px-2 py-0.5 border-2 border-black bg-yellow-100 dark:bg-yellow-900/50">Interval: {source.interval_minutes}m</span>
                        <span className="px-2 py-0.5 border-2 border-black bg-blue-100 dark:bg-blue-900/50">TTL: {source.ttl_hours}h</span>
                     </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <AddJobSourceModal 
                      editSource={source} 
                      triggerNode={
                        <button className="brutal-border px-3 py-1.5 font-bold text-sm bg-amber-300 text-black hover:bg-amber-400 flex items-center gap-1 transition-transform active:translate-y-[2px] active:translate-x-[2px] shadow-[2px_2px_0px_0px_var(--border)] active:shadow-none">
                          <PencilSimple weight="bold" /> Edit
                        </button>
                      } 
                    />
                    <button 
                      onClick={() => handleDeleteSource(source.id, source.name)}
                      className="brutal-border px-3 py-1.5 font-bold text-sm bg-red-500 text-white hover:bg-red-600 flex items-center gap-1 transition-transform active:translate-y-[2px] active:translate-x-[2px] shadow-[2px_2px_0px_0px_var(--border)] active:shadow-none"
                    >
                      <Trash weight="bold" /> Delete
                    </button>
                  </div>
                </div>

                {(isProcessing || isError) && (
                  <div className="brutal-border mb-6 p-4 bg-card shadow-[4px_4px_0px_0px_var(--border)]">
                    <div className="flex items-center gap-3 mb-3">
                      {isProcessing && (
                        <CircleNotch weight="bold" className="h-5 w-5 animate-spin text-primary" />
                      )}
                      {isError && (
                        <div className="h-5 w-5 text-red-500 font-black text-lg leading-none">✕</div>
                      )}
                      <span className={`font-black uppercase tracking-tighter text-sm ${
                        isError ? "text-red-500" : "text-foreground"
                      }`}>
                        {statusMessage || (isProcessing ? "Processing..." : "Error")}
                      </span>
                    </div>
                    {isProcessing && (
                      <div className="w-full bg-muted brutal-border h-3 overflow-hidden">
                        <div
                          className="h-full bg-primary transition-all duration-700 ease-out"
                          style={{ width: `${progressPercent}%` }}
                        />
                      </div>
                    )}
                    {isProcessing && (
                      <div className="flex justify-between mt-2">
                        {["Queued", "Fetching", "AI Parsing", "Done"].map((step, idx) => {
                          const stepStatuses = ["pending", "fetching", "parsing", "done"];
                          const currentIdx = stepStatuses.indexOf(status);
                          const isActive = idx <= currentIdx;
                          return (
                            <span key={step} className={`text-[10px] font-black uppercase tracking-wider ${
                              isActive ? "text-primary" : "text-muted-foreground/40"
                            }`}>
                              {step}
                            </span>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                <JobList
                  jobs={sourceJobs}
                  emptyMessage={isProcessing
                    ? `Processing ${source.name}... Jobs will appear here shortly.`
                    : `Waiting for jobs from ${source.name}. This may take a few minutes while our AI processes the page...`
                  }
                  isLocked={!user}
                />
              </TabsContent>
            );
          })}
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

"use client";

import { useState, useCallback, useEffect } from "react";
import {
  CloudArrowUp,
  FileText,
  Trash,
  CircleNotch,
  Warning,
  GraduationCap,
  Medal,
  Code,
  Sparkle,
} from "@phosphor-icons/react";
import { useDropzone } from "react-dropzone";
import { toast } from "sonner";
import { getAuthHeaders } from "@/hooks/useAuth";
import { formatDistanceToNow } from "date-fns";
import {
  Chip,
  DsButton,
  DsCard,
  DsModal,
  Kicker,
  StatusBadge,
  type StatusTone,
} from "@/components/ds";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const MAX_RESUME_BYTES = 10 * 1024 * 1024;
const MAX_FILENAME_LENGTH = 100;

interface Resume {
  id: string;
  filename: string;
  file_path: string;
  created_at: string;
  analysis_status?: string;
}

interface ResumeAnalysis {
  education: string[];
  certifications: string[];
  skills: string[];
  project_keywords: string[];
  summary: string;
}

/** Mono uppercase label above each analysis block. */
function SectionLabel({
  icon,
  children,
}: {
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Kicker className="mb-3 flex items-center gap-2">
      {icon}
      {children}
    </Kicker>
  );
}

export function ResumeManager() {
  const [resumes, setResumes] = useState<Resume[]>([]);
  const [stagedFiles, setStagedFiles] = useState<{ id: string; file: File; name: string }[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  const [selectedResume, setSelectedResume] = useState<Resume | null>(null);
  const [analysis, setAnalysis] = useState<ResumeAnalysis | null>(null);
  const [analysisStatus, setAnalysisStatus] = useState<string | null>(null);
  const [isLoadingAnalysis, setIsLoadingAnalysis] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [resumeToDelete, setResumeToDelete] = useState<Resume | null>(null);
  const [isDeletingResume, setIsDeletingResume] = useState(false);

  const fetchResumes = useCallback(async () => {
    try {
      const headers = await getAuthHeaders();
      const response = await fetch(`${API_URL}/resumes`, { headers });
      if (response.ok) {
        const data = await response.json();
        setResumes(data.resumes || []);
      }
    } catch (error) {
      console.error("Failed to fetch resumes:", error);
      toast.error("Failed to load your resumes");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchResumes();
  }, [fetchResumes]);

  useEffect(() => {
    const processingResumes = resumes.filter(r => r.analysis_status === "processing");
    if (processingResumes.length === 0) return;

    const interval = setInterval(() => {
      fetchResumes();
    }, 10000);

    return () => clearInterval(interval);
  }, [resumes, fetchResumes]);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const pdfFiles = acceptedFiles.filter(file => file.type === "application/pdf");

    if (pdfFiles.length === 0) {
      toast.error("Only PDF files are allowed");
      return;
    }

    const oversized = pdfFiles.filter((file) => file.size > MAX_RESUME_BYTES);
    if (oversized.length > 0) {
      toast.error(
        oversized.length === 1
          ? `${oversized[0].name} is over 10MB`
          : `${oversized.length} files are over 10MB`
      );
    }

    const validFiles = pdfFiles.filter((file) => file.size <= MAX_RESUME_BYTES);
    if (validFiles.length === 0) return;

    const newStaged = validFiles.map(file => ({
      id: Math.random().toString(36).substring(7),
      file,
      name: file.name.replace(/\.[^/.]+$/, "").slice(0, MAX_FILENAME_LENGTH)
    }));

    setStagedFiles(prev => [...prev, ...newStaged]);
  }, []);

  const handleUpload = async () => {
    if (stagedFiles.length === 0 || isUploading) return;

    const invalidNames = stagedFiles.filter((s) => !s.name.trim());
    if (invalidNames.length > 0) {
      toast.error("Give each resume a filename before uploading");
      return;
    }

    setIsUploading(true);
    setUploadProgress(0);

    const headers = await getAuthHeaders();
    let successCount = 0;

    for (let i = 0; i < stagedFiles.length; i++) {
      const { file, name } = stagedFiles[i];
      if (file.size > MAX_RESUME_BYTES) {
        toast.error(`${file.name} is over 10MB`);
        setUploadProgress(((i + 1) / stagedFiles.length) * 100);
        continue;
      }

      const formData = new FormData();
      formData.append("file", file);

      const trimmedName = name.trim().slice(0, MAX_FILENAME_LENGTH);
      const finalName = trimmedName.toLowerCase().endsWith('.pdf')
        ? trimmedName.slice(0, -4) + '.pdf'
        : `${trimmedName}.pdf`;
      formData.append("filename", finalName);

      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 60000);
        const response = await fetch(`${API_URL}/resumes`, {
          method: "POST",
          headers: { ...headers },
          body: formData,
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

        if (response.ok) {
          successCount++;
        } else {
          try {
            const errData = await response.json();
            toast.error(errData.detail || `Failed to upload ${file.name}`);
          } catch {
            if (response.status === 413) {
              toast.error(`${file.name} is too large`);
            } else {
              toast.error(`Failed to upload ${file.name}`);
            }
          }
        }
      } catch (error) {
        console.error(`Error uploading ${file.name}:`, error);
        if (error instanceof DOMException && error.name === "AbortError") {
          toast.error(`Upload timed out for ${file.name}`);
        } else {
          toast.error(`Error uploading ${file.name}`);
        }
      }

      setUploadProgress(((i + 1) / stagedFiles.length) * 100);
    }

    if (successCount > 0) {
      toast.success(`Successfully uploaded ${successCount} resume(s). AI analysis started!`);
      setStagedFiles([]);
      fetchResumes();
    }

    setTimeout(() => {
      setIsUploading(false);
      setUploadProgress(0);
    }, 500);
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "application/pdf": [".pdf"],
    },
    maxSize: MAX_RESUME_BYTES,
    disabled: isUploading,
    onDropRejected: (rejections) => {
      const tooLarge = rejections.some((r) =>
        r.errors.some((e) => e.code === "file-too-large")
      );
      if (tooLarge) {
        toast.error("PDF must be 10MB or smaller");
      } else {
        toast.error("Only PDF files are allowed");
      }
    },
  });

  const openDeleteDialog = (resume: Resume) => {
    setResumeToDelete(resume);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!resumeToDelete) return;
    setIsDeletingResume(true);

    try {
      const headers = await getAuthHeaders();
      const response = await fetch(`${API_URL}/resumes/${resumeToDelete.id}`, {
        method: "DELETE",
        headers,
      });

      if (response.ok) {
        toast.success("Resume deleted");
        setResumes(prev => prev.filter(r => r.id !== resumeToDelete.id));
        setDeleteDialogOpen(false);
        setResumeToDelete(null);
      } else {
        throw new Error("Delete failed");
      }
    } catch (error) {
      console.error("Failed to delete resume:", error);
      toast.error("Failed to delete resume");
    } finally {
      setIsDeletingResume(false);
    }
  };

  const handleViewAnalysis = async (resume: Resume) => {
    setSelectedResume(resume);
    setDialogOpen(true);
    setIsLoadingAnalysis(true);
    setAnalysis(null);
    setAnalysisStatus(null);

    try {
      const headers = await getAuthHeaders();
      const response = await fetch(`${API_URL}/resumes/${resume.id}/analysis`, {
        headers,
      });

      if (response.ok) {
        const data = await response.json();
        setAnalysisStatus(data.status);
        if (data.analysis) {
          setAnalysis({
            education: data.analysis.education || [],
            certifications: data.analysis.certifications || [],
            skills: data.analysis.skills || [],
            project_keywords: data.analysis.project_keywords || [],
            summary: data.analysis.summary || "",
          });
        }
      } else {
        toast.error("Failed to fetch analysis");
      }
    } catch (error) {
      console.error("Failed to fetch analysis:", error);
      toast.error("Failed to load analysis");
    } finally {
      setIsLoadingAnalysis(false);
    }
  };

  /** Top stripe on a resume card is the data status, not a decoration. */
  const getCardStatus = (status?: string): "success" | "brand" | "neutral" => {
    switch (status) {
      case "completed":
        return "success";
      case "failed":
        return "brand";
      case "processing":
        return "neutral";
      default:
        return "neutral";
    }
  };

  const getStatusBadge = (status?: string) => {
    const map: Record<string, { label: string; tone: StatusTone; live?: boolean }> = {
      processing: { label: "ANALYZING", tone: "active", live: true },
      completed: { label: "AI READY", tone: "complete" },
      failed: { label: "FAILED", tone: "failed" },
    };
    const entry = map[status ?? ""] ?? { label: "READY", tone: "pending" as StatusTone };
    return <StatusBadge label={entry.label} tone={entry.tone} live={entry.live} />;
  };

  return (
    <>
      {/* Main panel */}
      <div className="rounded-[4px] border border-hairline bg-paper-card">
        {/* Panel header */}
        <div className="flex items-start gap-3 border-b border-hairline px-5 py-4">
          <FileText className="mt-1 size-4 shrink-0 text-ink-muted" />
          <div>
            <Kicker className="mb-1">Documents</Kicker>
            <h2 className="font-serif text-[22px] font-semibold leading-tight text-ink">
              Resume Management
            </h2>
            <p className="mt-1 font-sans text-[13px] text-ink-muted">
              Upload PDF resumes for AI skill extraction
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-8 p-5">
          {/* Dropzone */}
          <div
            {...getRootProps()}
            className={`relative flex flex-col items-center justify-center rounded-[4px] border border-dashed px-4 py-10 text-center transition-colors duration-[120ms] ${
              isDragActive
                ? "border-brick bg-brick-tint"
                : "border-hairline-strong bg-paper-sunk hover:border-ink-faint"
            } ${isUploading ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}
          >
            <input {...getInputProps()} />
            <CloudArrowUp className="mb-3 size-6 text-ink-muted" />
            <div className="mb-2 font-mono text-[11px] uppercase tracking-[0.09em] text-ink">
              {isDragActive ? "DROP RESUME HERE" : "DRAG & DROP RESUME"}
            </div>
            <Kicker className="rounded-[4px] border border-hairline-strong bg-paper-card px-2 py-1">
              PDF ONLY · 10MB MAX
            </Kicker>
            {isUploading && (
              <div className="absolute inset-x-4 bottom-3 flex flex-col gap-1.5">
                <div className="h-1 w-full rounded-full bg-hairline-strong">
                  <div
                    className="h-full rounded-full bg-brick transition-[width] duration-300"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
                <span className="text-center font-mono text-[11px] tracking-[0.09em] text-brick">
                  {Math.round(uploadProgress)}%
                </span>
              </div>
            )}
          </div>

          {/* Staged files */}
          {stagedFiles.length > 0 && (
            <div className="flex flex-col gap-3">
              <Kicker count={stagedFiles.length}>STAGED FOR UPLOAD</Kicker>
              <div className="flex flex-col gap-2">
                {stagedFiles.map((staged, index) => (
                  <div key={staged.id} className="flex items-center gap-2">
                    <div className="flex flex-1 items-center gap-2.5 rounded-[4px] border border-hairline bg-paper-sunk px-3 py-2">
                      <FileText className="size-4 shrink-0 text-ink-muted" />
                      <input
                        type="text"
                        aria-label="Resume filename"
                        value={staged.name}
                        maxLength={MAX_FILENAME_LENGTH}
                        onChange={(e) => {
                          const newStaged = [...stagedFiles];
                          newStaged[index].name = e.target.value.slice(0, MAX_FILENAME_LENGTH);
                          setStagedFiles(newStaged);
                        }}
                        className="min-w-0 flex-1 border-none bg-transparent font-mono text-[13px] text-ink outline-none"
                        disabled={isUploading}
                      />
                      <span className="shrink-0 rounded-[4px] border border-hairline-strong bg-paper-card px-1.5 py-0.5 font-mono text-[11px] text-ink-muted">
                        .pdf
                      </span>
                    </div>
                    <DsButton
                      variant="secondary"
                      size="icon-sm"
                      onClick={() => setStagedFiles(prev => prev.filter(s => s.id !== staged.id))}
                      disabled={isUploading}
                      aria-label="Remove staged file"
                      className="text-ink-muted hover:border-brick hover:bg-brick-tint hover:text-brick"
                    >
                      <Trash className="size-4" />
                    </DsButton>
                  </div>
                ))}
              </div>

              <DsButton
                variant="primary"
                onClick={handleUpload}
                disabled={isUploading}
                className="w-full"
              >
                {isUploading ? (
                  <CircleNotch className="size-4 animate-spin" />
                ) : (
                  <CloudArrowUp className="size-4" />
                )}
                Upload and analyze ({stagedFiles.length} resume{stagedFiles.length !== 1 ? "s" : ""})
              </DsButton>
            </div>
          )}

          {/* Resume list */}
          <div className="flex flex-col gap-3">
            <Kicker count={resumes.length}>UPLOADED RESUMES</Kicker>

            {isLoading ? (
              <div className="flex items-center justify-center py-10">
                <CircleNotch className="size-5 animate-spin text-ink-muted" />
              </div>
            ) : resumes.length === 0 ? (
              <div className="flex flex-col items-center gap-2 rounded-[4px] border border-dashed border-hairline-strong bg-paper-sunk p-8">
                <span className="font-mono text-[11px] uppercase tracking-[0.09em] text-ink-muted">
                  NO RESUMES YET — UPLOAD YOUR PDF TO GET STARTED
                </span>
              </div>
            ) : (
              <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(280px,1fr))]">
                {resumes.map((resume) => (
                  <DsCard
                    key={resume.id}
                    status={getCardStatus(resume.analysis_status)}
                    onClick={() => handleViewAnalysis(resume)}
                    className="flex cursor-pointer flex-col gap-3 p-4"
                  >
                    <div className="flex items-start justify-between gap-2">
                      {getStatusBadge(resume.analysis_status)}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          openDeleteDialog(resume);
                        }}
                        className="-mr-1 -mt-1 flex size-10 shrink-0 items-center justify-center rounded-[4px] text-ink-faint transition-colors duration-[120ms] hover:bg-brick-tint hover:text-brick focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brick/40"
                        title="Delete resume"
                        aria-label="Delete resume"
                      >
                        <Trash className="size-4" />
                      </button>
                    </div>

                    <h3
                      className="truncate font-serif text-[17px] font-semibold leading-tight text-ink"
                      title={resume.filename}
                    >
                      {resume.filename}
                    </h3>

                    <span
                      suppressHydrationWarning
                      className="font-mono text-[11px] uppercase tracking-[0.09em] text-ink-muted"
                    >
                      {(() => {
                        try {
                          return formatDistanceToNow(new Date(resume.created_at), { addSuffix: true });
                        } catch {
                          return "recently";
                        }
                      })()}
                    </span>
                  </DsCard>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Analysis Dialog */}
      <DsModal
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        kicker="AI RESUME ANALYSIS"
        title={selectedResume?.filename || "Resume analysis"}
      >
        {isLoadingAnalysis ? (
          <div className="flex flex-col items-center justify-center gap-4 py-14">
            <CircleNotch className="size-7 animate-spin text-ink-muted" />
            <span className="font-mono text-[11px] uppercase tracking-[0.09em] text-ink-muted">
              ANALYZING RESUME_
            </span>
          </div>
        ) : analysisStatus === "processing" ? (
          <div className="flex flex-col items-center justify-center gap-3 py-14 text-center">
            <CircleNotch className="size-7 animate-spin text-ink-muted" />
            <p className="max-w-[380px] font-sans text-[15px] leading-relaxed text-ink-2">
              Resume analysis in progress. This usually takes 15&ndash;30 seconds. You can close
              this and check back shortly.
            </p>
          </div>
        ) : analysisStatus === "failed" ? (
          <div className="flex flex-col items-center justify-center gap-3 py-14 text-center">
            <Warning className="size-7 text-brick" />
            <p className="font-sans text-[15px] text-brick">
              Analysis failed. Try uploading again.
            </p>
            <Kicker>MAKE SURE YOUR PDF IS READABLE AND NOT SCANNED</Kicker>
          </div>
        ) : analysis ? (
          <div className="flex flex-col gap-8">
            {analysis.summary && (
              <div>
                <SectionLabel>PROFESSIONAL SUMMARY</SectionLabel>
                <div className="rounded-[4px] border border-hairline bg-paper-sunk px-4 py-3 font-sans text-[15px] leading-relaxed text-ink-2">
                  {analysis.summary}
                </div>
              </div>
            )}

            {analysis.education && analysis.education.length > 0 && (
              <div>
                <SectionLabel icon={<GraduationCap className="size-3.5 text-ink-muted" />}>
                  EDUCATION
                </SectionLabel>
                <div className="flex flex-col gap-1.5">
                  {analysis.education.map((item, i) => (
                    <div
                      key={i}
                      className="rounded-[4px] border border-hairline bg-paper-sunk px-3 py-2 font-sans text-[13px] text-ink-2"
                    >
                      {item}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {analysis.certifications && analysis.certifications.length > 0 && (
              <div>
                <SectionLabel icon={<Medal className="size-3.5 text-ink-muted" />}>
                  CERTIFICATIONS
                </SectionLabel>
                <div className="flex flex-wrap gap-2">
                  {analysis.certifications.map((cert, i) => (
                    <Chip key={i} tone="success" className="text-[11px]">
                      {cert}
                    </Chip>
                  ))}
                </div>
              </div>
            )}

            {analysis.skills && analysis.skills.length > 0 && (
              <div>
                <SectionLabel icon={<Code className="size-3.5 text-ink-muted" />}>
                  SKILLS
                </SectionLabel>
                <div className="flex flex-wrap gap-2">
                  {analysis.skills.map((skill, i) => (
                    <Chip
                      key={i}
                      className="text-[11px] transition-colors duration-[120ms] hover:border-brick hover:text-brick"
                    >
                      {skill}
                    </Chip>
                  ))}
                </div>
              </div>
            )}

            {analysis.project_keywords && analysis.project_keywords.length > 0 && (
              <div>
                <SectionLabel icon={<Sparkle className="size-3.5 text-ink-muted" />}>
                  EXPERIENCE KEYWORDS
                </SectionLabel>
                <div className="flex flex-wrap gap-2">
                  {analysis.project_keywords.map((kw, i) => (
                    <Chip key={i} tone="sunk" className="text-[11px]">
                      {kw}
                    </Chip>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center gap-2 py-14 text-center">
            <Warning className="size-5 text-ink-muted" />
            <span className="font-mono text-[11px] uppercase tracking-[0.09em] text-ink-muted">
              ANALYSIS NOT READY YET. PLEASE CHECK BACK IN A MOMENT.
            </span>
          </div>
        )}
      </DsModal>

      {/* Delete confirmation Dialog */}
      <DsModal
        open={deleteDialogOpen}
        onOpenChange={(open) => {
          if (!isDeletingResume) {
            setDeleteDialogOpen(open);
            if (!open) setResumeToDelete(null);
          }
        }}
        kicker="DELETE RESUME"
        title="Delete Resume"
        className="max-w-[460px]"
        footer={
          <>
            <DsButton
              variant="ghost"
              size="sm"
              onClick={() => {
                setDeleteDialogOpen(false);
                setResumeToDelete(null);
              }}
              disabled={isDeletingResume}
            >
              Cancel
            </DsButton>
            <DsButton
              variant="danger"
              size="sm"
              onClick={handleDeleteConfirm}
              disabled={!resumeToDelete || isDeletingResume}
            >
              {isDeletingResume ? (
                <>
                  <CircleNotch className="size-3.5 animate-spin" />
                  Deleting…
                </>
              ) : (
                "Delete"
              )}
            </DsButton>
          </>
        }
      >
        <p className="font-sans text-[15px] leading-relaxed text-ink-2">
          This will permanently remove{" "}
          <span className="font-mono text-[13px] text-ink">{resumeToDelete?.filename}</span> and its
          AI analysis.
        </p>
      </DsModal>
    </>
  );
}

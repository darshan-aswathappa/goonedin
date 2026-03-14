"use client";

import { useState, useCallback, useEffect } from "react";
import {
  CloudArrowUp,
  FileText,
  Trash,
  CircleNotch,
  Warning,
  CheckCircle,
  Brain,
  GraduationCap,
  Medal,
  Code,
  Sparkle,
  X,
} from "@phosphor-icons/react";
import { useDropzone } from "react-dropzone";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { getAuthHeaders } from "@/hooks/useAuth";
import { formatDistanceToNow } from "date-fns";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface Resume {
  id: string;
  filename: string;
  file_path: string;
  uploaded_at: string;
  analysis_status?: string;
}

interface ResumeAnalysis {
  education: string[];
  certifications: string[];
  skills: string[];
  project_keywords: string[];
  summary: string;
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
    }, 10000); // poll every 10s

    return () => clearInterval(interval);
  }, [resumes, fetchResumes]);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const pdfFiles = acceptedFiles.filter(file => file.type === "application/pdf");
    
    if (pdfFiles.length === 0) {
      toast.error("Only PDF files are allowed");
      return;
    }

    const newStaged = pdfFiles.map(file => ({
      id: Math.random().toString(36).substring(7),
      file,
      name: file.name.replace(/\.[^/.]+$/, "")
    }));

    setStagedFiles(prev => [...prev, ...newStaged]);
  }, []);

  const handleUpload = async () => {
    if (stagedFiles.length === 0 || isUploading) return;

    setIsUploading(true);
    setUploadProgress(0);

    const headers = await getAuthHeaders();
    let successCount = 0;
    
    for (let i = 0; i < stagedFiles.length; i++) {
      const { file, name } = stagedFiles[i];
      const formData = new FormData();
      formData.append("file", file);
      
      const finalName = name.toLowerCase().endsWith('.pdf') ? name.slice(0, -4) + '.pdf' : `${name}.pdf`;
      formData.append("filename", finalName);

      try {
        const response = await fetch(`${API_URL}/resumes`, {
          method: "POST",
          headers: { ...headers },
          body: formData,
        });

        if (response.ok) {
          successCount++;
        } else {
          try {
            const errData = await response.json();
            toast.error(errData.detail || `Failed to upload ${file.name}`);
          } catch {
            toast.error(`Failed to upload ${file.name}`);
          }
        }
      } catch (error) {
        console.error(`Error uploading ${file.name}:`, error);
        toast.error(`Error uploading ${file.name}`);
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
    disabled: isUploading,
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

  const getStatusBadge = (status?: string) => {
    switch (status) {
      case "processing":
        return (
          <div className="flex items-center gap-1.5 brutal-badge bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300">
            <CircleNotch className="h-3 w-3 animate-spin" />
            <span>Analyzing…</span>
          </div>
        );
      case "completed":
        return (
          <div className="flex items-center gap-1.5 brutal-badge bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300">
            <Brain className="h-3 w-3" />
            <span>AI Ready</span>
          </div>
        );
      case "failed":
        return (
          <div className="flex items-center gap-1.5 brutal-badge bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300">
            <Warning className="h-3 w-3" />
            <span>Failed</span>
          </div>
        );
      default:
        return (
          <div className="flex items-center gap-1.5 brutal-badge bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-300">
            <CheckCircle className="h-3 w-3" />
            <span>Ready</span>
          </div>
        );
    }
  };

  return (
    <>
      <Card className="brutal-border rounded-none bg-card shadow-[8px_8px_0px_0px_var(--border)] overflow-hidden">
        <CardHeader className="pb-4 border-b-2 border-border bg-card">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center brutal-border bg-primary text-white shadow-[2px_2px_0px_0px_var(--border)]">
              <FileText className="h-6 w-6" />
            </div>
            <div>
              <CardTitle className="text-xl font-black italic uppercase tracking-tighter leading-none">Resume Management</CardTitle>
              <CardDescription className="text-xs font-black uppercase tracking-widest text-muted-foreground mt-1">
                Upload PDF resumes. We'll automatically extract your skills, education, and experience.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-8 pt-6">
          <div
            {...getRootProps()}
            className={`relative flex flex-col items-center justify-center brutal-border border-dashed p-6 sm:p-12 text-center transition-all duration-200 ${
              isDragActive
                ? "bg-primary/10 border-primary"
                : "bg-muted border-border hover:bg-muted/80"
            } ${isUploading ? "pointer-events-none opacity-60" : "cursor-pointer"}`}
          >
            <input {...getInputProps()} />
            
            <div className="mb-4 brutal-border bg-primary p-4 shadow-[4px_4px_0px_0px_var(--border)]">
              <CloudArrowUp className="h-8 w-8 text-white" />
            </div>
            <h3 className="mb-2 text-lg font-black italic uppercase tracking-tighter leading-none">
              {isDragActive ? "Drop your resume here" : "Drag and drop your resume"}
            </h3>
            <p className="brutal-badge bg-card text-muted-foreground mt-2 border-dashed shadow-none">PDF only, up to 10MB per file</p>

            {isUploading && (
              <div className="absolute inset-x-8 bottom-4 flex flex-col items-center gap-2">
                <Progress value={uploadProgress} className="h-2 w-full brutal-border bg-muted overflow-hidden" />
                <span className="text-[10px] font-black uppercase tracking-widest text-primary">{Math.round(uploadProgress)}%</span>
              </div>
            )}
          </div>

          {stagedFiles.length > 0 && (
            <div className="brutal-border bg-muted/30 p-6 space-y-6">
              <h4 className="text-sm font-black italic uppercase tracking-tight">Staged for Upload</h4>
              <div className="space-y-4">
                {stagedFiles.map((staged, index) => (
                  <div key={staged.id} className="flex flex-col gap-3 sm:flex-row sm:items-center">
                    <div className="flex flex-1 items-center gap-3 brutal-border bg-card px-4 py-3 shadow-[2px_2px_0px_0px_var(--border)]">
                      <FileText className="h-5 w-5 shrink-0 text-muted-foreground" />
                      <input 
                        type="text" 
                        value={staged.name}
                        onChange={(e) => {
                          const newStaged = [...stagedFiles];
                          newStaged[index].name = e.target.value;
                          setStagedFiles(newStaged);
                        }}
                        className="w-full bg-transparent text-sm font-bold focus:outline-none"
                        disabled={isUploading}
                      />
                      <span className="brutal-badge bg-muted text-muted-foreground">.pdf</span>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setStagedFiles(prev => prev.filter(s => s.id !== staged.id))}
                      className="brutal-border bg-card text-foreground hover:bg-red-500 hover:text-white transition-all shadow-[2px_2px_0px_0px_var(--border)] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none sm:shrink-0 h-11 w-11 w-full sm:w-auto font-bold"
                      disabled={isUploading}
                    >
                      <Trash className="h-5 w-5" />
                    </Button>
                  </div>
                ))}
              </div>
              
              <div className="mt-4 flex justify-end">
                <Button
                  onClick={handleUpload}
                  disabled={isUploading}
                  className="w-full brutal-border rounded-none bg-primary text-primary-foreground hover:bg-primary/90 shadow-[2px_2px_0px_0px_var(--border)] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none transition-all font-black italic uppercase tracking-widest px-8 py-6 h-auto sm:w-auto"
                >
                  {isUploading ? (
                    <CircleNotch className="mr-3 h-5 w-5 animate-spin" />
                  ) : (
                    <CloudArrowUp className="mr-3 h-5 w-5" />
                  )}
                  Upload and Analyze ({stagedFiles.length} resume{stagedFiles.length !== 1 ? 's' : ''})
                </Button>
              </div>
            </div>
          )}

          <div>
            <h4 className="mb-4 text-sm font-black italic uppercase tracking-tight pl-1">
              Uploaded Resumes ({resumes.length})
            </h4>
            
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <CircleNotch className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : resumes.length === 0 ? (
              <div className="flex flex-col items-center justify-center brutal-border bg-muted/30 py-12 text-muted-foreground border-dashed">
                <Warning className="mb-3 h-8 w-8 opacity-40" />
                <p className="text-sm font-bold uppercase tracking-widest">No resumes yet. Upload your PDF to get started.</p>
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                {resumes.map((resume) => (
                  <div
                    key={resume.id}
                    onClick={() => handleViewAnalysis(resume)}
                    className="group flex cursor-pointer flex-col justify-between brutal-border bg-card p-5 min-h-[88px] transition-all shadow-[4px_4px_0px_0px_var(--border)] hover:translate-x-[-2px] hover:translate-y-[-2px] hover:shadow-[6px_6px_0px_0px_var(--border)] active:translate-x-[1px] active:translate-y-[1px] active:shadow-[2px_2px_0px_0px_var(--border)]"
                  >
                    <div className="mb-4 flex items-start justify-between gap-4">
                      <div className="flex items-center gap-3 overflow-hidden min-w-0">
                        <div className="flex h-8 w-8 items-center justify-center brutal-border bg-muted shrink-0 shadow-[1px_1px_0px_0px_var(--border)]">
                          <FileText className="h-4 w-4 text-primary" />
                        </div>
                        <span className="truncate text-sm font-black uppercase tracking-tight min-w-0">
                          {resume.filename}
                        </span>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          openDeleteDialog(resume);
                        }}
                        className="p-1.5 text-muted-foreground hover:bg-primary hover:text-white transition-all brutal-border shadow-[1px_1px_0px_0px_var(--border)] active:shadow-none active:translate-x-[1px] active:translate-y-[1px]"
                        title="Delete resume"
                      >
                        <Trash className="h-4 w-4" />
                      </button>
                    </div>
                    
                    <div className="flex items-center justify-between">
                      <span suppressHydrationWarning className="brutal-badge bg-muted text-muted-foreground">
                        {(() => {
                          try {
                            return formatDistanceToNow(new Date(resume.uploaded_at), { addSuffix: true });
                          } catch {
                            return "recently";
                          }
                        })()}
                      </span>
                      {getStatusBadge(resume.analysis_status)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent showCloseButton={false} className="max-w-2xl bg-card text-foreground border-2 border-border rounded-none shadow-[8px_8px_0px_0px_var(--border)] max-h-[85vh] overflow-y-auto p-0 gap-0 focus:outline-none">
          <DialogHeader className="p-6 bg-foreground text-background space-y-1 relative">
            <DialogTitle className="flex items-center gap-2 text-2xl font-black italic uppercase tracking-tighter">
              <Brain className="h-6 w-6 text-primary" />
              AI Resume Analysis
            </DialogTitle>
            <p className="text-background/70 font-bold text-sm">
              {selectedResume?.filename}
            </p>
            <button
              onClick={() => setDialogOpen(false)}
              className="absolute right-4 top-4 brutal-border bg-card p-3 text-foreground hover:bg-primary hover:text-white transition-all shadow-[2px_2px_0px_0px_var(--border)] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none focus:outline-none"
            >
              <X className="h-5 w-5" />
            </button>
          </DialogHeader>

          <div className="p-4 sm:p-10">
            {isLoadingAnalysis ? (
              <div className="flex flex-col items-center justify-center py-20">
                <CircleNotch className="mb-6 h-12 w-12 animate-spin text-primary" />
                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Analyzing your resume...</p>
              </div>
            ) : analysisStatus === "processing" ? (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <div className="mb-8 brutal-border bg-muted p-6 shadow-[8px_8px_0px_0px_var(--border)]">
                  <CircleNotch className="h-12 w-12 animate-spin text-primary" />
                </div>
                <h3 className="mb-2 text-2xl font-black italic uppercase tracking-tighter">Resume Analysis in Progress</h3>
                <p className="text-sm font-bold text-muted-foreground leading-tight max-w-sm">
                  Analyzing skills, education, and experience. This usually takes 15–30 seconds.
                  <br /><br />
                  <span className="text-[10px] uppercase tracking-widest opacity-60">You can close this and check back shortly.</span>
                </p>
              </div>
            ) : analysisStatus === "failed" ? (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <div className="mb-8 brutal-border bg-destructive/10 dark:bg-destructive/20 p-6 shadow-[8px_8px_0px_0px_var(--border)]">
                  <Warning className="h-12 w-12 text-destructive" />
                </div>
                <h3 className="mb-2 text-2xl font-black italic uppercase tracking-tighter">We Couldn't Analyze This Resume</h3>
                <p className="text-sm font-bold text-muted-foreground leading-tight">
                  Try uploading again. If the problem persists, make sure your PDF is readable.
                </p>
              </div>
            ) : analysis ? (
              <div className="space-y-6 sm:space-y-12">
                {analysis.summary && (
                  <div className="brutal-border bg-muted p-8 shadow-[8px_8px_0px_0px_var(--border)]">
                    <div className="mb-6 flex items-center gap-3 text-lg font-black italic uppercase tracking-tighter text-primary bg-card w-fit px-4 py-1.5 brutal-border shadow-[4px_4px_0px_0px_var(--border)]">
                      <Sparkle className="h-6 w-6" />
                      Professional Summary
                    </div>
                    <p className="text-base font-bold leading-relaxed">{analysis.summary}</p>
                  </div>
                )}

                {analysis.education && analysis.education.length > 0 && (
                  <div>
                    <div className="mb-6 flex items-center gap-3 text-lg font-black italic uppercase tracking-tighter text-foreground bg-muted w-fit px-4 py-1.5 brutal-border shadow-[4px_4px_0px_0px_var(--border)]">
                      <GraduationCap className="h-6 w-6 text-primary" />
                      Education
                    </div>
                    <div className="space-y-4">
                      {analysis.education.map((item, i) => (
                        <div
                          key={i}
                          className="brutal-border bg-card px-6 py-4 text-sm font-bold shadow-[4px_4px_0px_0px_var(--border)] hover:bg-muted transition-colors"
                        >
                          {item}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {analysis.certifications && analysis.certifications.length > 0 && (
                  <div>
                    <div className="mb-6 flex items-center gap-3 text-lg font-black italic uppercase tracking-tighter text-foreground bg-muted w-fit px-4 py-1.5 brutal-border shadow-[4px_4px_0px_0px_var(--border)]">
                      <Medal className="h-6 w-6 text-primary" />
                      Certifications
                    </div>
                    <div className="flex flex-wrap gap-4">
                      {analysis.certifications.map((cert, i) => (
                        <div
                          key={i}
                          className="brutal-border bg-card px-4 py-2 text-xs font-black uppercase tracking-widest shadow-[4px_4px_0px_0px_var(--border)] hover:bg-muted transition-colors"
                        >
                          {cert}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {analysis.skills && analysis.skills.length > 0 && (
                  <div>
                    <div className="mb-6 flex items-center gap-3 text-lg font-black italic uppercase tracking-tighter text-foreground bg-muted w-fit px-4 py-1.5 brutal-border shadow-[4px_4px_0px_0px_var(--border)]">
                      <Code className="h-6 w-6 text-primary" />
                      Skills
                    </div>
                    <div className="flex flex-wrap gap-4">
                      {analysis.skills.map((skill, i) => (
                        <div
                          key={i}
                          className="brutal-border bg-primary text-primary-foreground px-4 py-2 text-xs font-black uppercase tracking-widest shadow-[4px_4px_0px_0px_var(--border)] hover:bg-foreground hover:text-background transition-all"
                        >
                          {skill}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {analysis.project_keywords && analysis.project_keywords.length > 0 && (
                  <div>
                    <div className="mb-6 flex items-center gap-3 text-lg font-black italic uppercase tracking-tighter text-foreground bg-muted w-fit px-4 py-1.5 brutal-border shadow-[4px_4px_0px_0px_var(--border)]">
                      <Sparkle className="h-6 w-6 text-primary" />
                      Experience Keywords
                    </div>
                    <div className="flex flex-wrap gap-4">
                      {analysis.project_keywords.map((kw, i) => (
                        <div
                          key={i}
                          className="brutal-border bg-muted px-4 py-2 text-xs font-black uppercase tracking-widest shadow-[4px_4px_0px_0px_var(--border)] hover:bg-card transition-colors"
                        >
                          {kw}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-20 border-dashed brutal-border bg-muted/30">
                <Warning className="mb-4 h-12 w-12 text-muted-foreground opacity-40" />
                <p className="text-sm font-black uppercase tracking-widest text-muted-foreground">Analysis not ready yet. Please check back in a moment.</p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={deleteDialogOpen}
        onOpenChange={(open) => {
          if (!isDeletingResume) {
            setDeleteDialogOpen(open);
            if (!open) setResumeToDelete(null);
          }
        }}
      >
        <DialogContent
          showCloseButton={false}
          className="max-w-md bg-card text-foreground border-2 border-border rounded-none shadow-[8px_8px_0px_0px_var(--border)] p-0 gap-0"
        >
          <DialogHeader className="p-6 border-b-2 border-border bg-destructive/10 dark:bg-destructive/20 space-y-2 text-left">
            <DialogTitle className="flex items-center gap-2 text-xl font-black italic uppercase tracking-tighter">
              <Warning className="h-5 w-5 text-destructive" />
              Delete Resume
            </DialogTitle>
            <DialogDescription className="text-sm font-bold text-foreground leading-tight">
              This will permanently remove <span className="font-black">{resumeToDelete?.filename}</span> and its AI analysis.
            </DialogDescription>
          </DialogHeader>

          <div className="flex items-center justify-end gap-3 p-6">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setDeleteDialogOpen(false);
                setResumeToDelete(null);
              }}
              disabled={isDeletingResume}
              className="brutal-border rounded-none bg-card text-foreground font-black italic uppercase tracking-widest shadow-[2px_2px_0px_0px_var(--border)] hover:bg-muted active:translate-x-[1px] active:translate-y-[1px] active:shadow-none"
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleDeleteConfirm}
              disabled={!resumeToDelete || isDeletingResume}
              className="brutal-border rounded-none bg-destructive text-white font-black italic uppercase tracking-widest shadow-[2px_2px_0px_0px_var(--border)] hover:bg-destructive/90 active:translate-x-[1px] active:translate-y-[1px] active:shadow-none"
            >
              {isDeletingResume ? (
                <>
                  <CircleNotch className="mr-2 h-4 w-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                "Delete"
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

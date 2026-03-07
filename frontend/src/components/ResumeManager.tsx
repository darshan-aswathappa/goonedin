"use client";

import { useState, useCallback, useEffect } from "react";
import {
  UploadCloud,
  FileText,
  Trash2,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Brain,
  GraduationCap,
  Award,
  Code,
  Sparkles,
  X,
  RefreshCw,
} from "lucide-react";
import { useDropzone } from "react-dropzone";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
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

  // Modal state
  const [selectedResume, setSelectedResume] = useState<Resume | null>(null);
  const [analysis, setAnalysis] = useState<ResumeAnalysis | null>(null);
  const [analysisStatus, setAnalysisStatus] = useState<string | null>(null);
  const [isLoadingAnalysis, setIsLoadingAnalysis] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);

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

  // Poll for analysis status updates on resumes that are "processing"
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
    if (stagedFiles.length === 0) return;

    setIsUploading(true);
    setUploadProgress(0);

    const headers = await getAuthHeaders();
    let successCount = 0;
    
    for (let i = 0; i < stagedFiles.length; i++) {
      const { file, name } = stagedFiles[i];
      const formData = new FormData();
      formData.append("file", file);
      
      const finalName = name.toLowerCase().endsWith('.pdf') ? name : `${name}.pdf`;
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

  const handleDelete = async (id: string, filename: string) => {
    if (!confirm(`Are you sure you want to delete ${filename}?`)) return;

    try {
      const headers = await getAuthHeaders();
      const response = await fetch(`${API_URL}/resumes/${id}`, {
        method: "DELETE",
        headers,
      });

      if (response.ok) {
        toast.success("Resume deleted");
        setResumes(prev => prev.filter(r => r.id !== id));
      } else {
        throw new Error("Delete failed");
      }
    } catch (error) {
      console.error("Failed to delete resume:", error);
      toast.error("Failed to delete resume");
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
          <div className="flex items-center gap-1 text-amber-400">
            <Loader2 className="h-3 w-3 animate-spin" />
            <span className="text-xs">Analyzing…</span>
          </div>
        );
      case "completed":
        return (
          <div className="flex items-center gap-1 text-emerald-400">
            <Brain className="h-3 w-3" />
            <span className="text-xs">AI Ready</span>
          </div>
        );
      case "failed":
        return (
          <div className="flex items-center gap-1 text-red-400">
            <AlertCircle className="h-3 w-3" />
            <span className="text-xs">Failed</span>
          </div>
        );
      default:
        return (
          <div className="flex items-center gap-1 text-green-500/80">
            <CheckCircle2 className="h-3 w-3" />
            <span className="text-xs">Ready</span>
          </div>
        );
    }
  };

  return (
    <>
      <Card className="border-gray-800 bg-[#161b22]">
        <CardHeader className="pb-3 border-b-2 border-border">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center brutal-border bg-primary text-white shadow-[2px_2px_0px_0px_var(--border)]">
              <FileText className="h-6 w-6" />
            </div>
            <div>
              <CardTitle className="text-xl font-black italic uppercase tracking-tighter leading-none">Resume Management</CardTitle>
              <CardDescription className="text-xs font-black uppercase tracking-widest text-muted-foreground mt-1">
                Upload resumes (PDF). AI will automatically analyze skills.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Upload Zone */}
          <div
            {...getRootProps()}
            className={`relative flex flex-col items-center justify-center brutal-border border-dashed p-10 text-center transition-all duration-200 ${
              isDragActive
                ? "bg-primary/10 border-primary"
                : "bg-muted border-border hover:bg-muted/80"
            } ${isUploading ? "pointer-events-none opacity-60" : "cursor-pointer"}`}
          >
            <input {...getInputProps()} />
            
            <div className="mb-4 brutal-border bg-primary p-3 shadow-[2px_2px_0px_0px_var(--border)]">
              <UploadCloud className="h-8 w-8 text-white" />
            </div>
            <h3 className="mb-1 text-sm font-black uppercase tracking-tighter leading-none">
              {isDragActive ? "Drop resumes here" : "Click or drag resumes here"}
            </h3>
            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">PDF files up to 10MB</p>

            {isUploading && (
              <div className="absolute inset-x-8 bottom-4 flex flex-col items-center gap-2">
                <Progress value={uploadProgress} className="h-1.5 w-full bg-gray-800" />
                <span className="text-xs text-gray-400">{Math.round(uploadProgress)}%</span>
              </div>
            )}
          </div>

          {/* Staged Resumes */}
          {stagedFiles.length > 0 && (
            <div className="rounded-xl border border-gray-800 bg-gray-900/30 p-5">
              <h4 className="mb-4 text-sm font-medium text-cyan-400">Ready to Upload</h4>
              <div className="space-y-3">
                {stagedFiles.map((staged, index) => (
                  <div key={staged.id} className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <div className="flex flex-1 items-center gap-3 rounded-lg border border-gray-800 bg-gray-900/50 p-2">
                      <FileText className="h-5 w-5 shrink-0 text-gray-500" />
                      <input 
                        type="text" 
                        value={staged.name}
                        onChange={(e) => {
                          const newStaged = [...stagedFiles];
                          newStaged[index].name = e.target.value;
                          setStagedFiles(newStaged);
                        }}
                        className="w-full bg-transparent text-sm text-gray-200 focus:outline-none"
                        disabled={isUploading}
                      />
                      <span className="text-sm text-gray-500 pr-2">.pdf</span>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setStagedFiles(prev => prev.filter(s => s.id !== staged.id))}
                      className="text-gray-500 hover:text-red-400 sm:shrink-0"
                      disabled={isUploading}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
              
              <div className="mt-5 flex justify-end">
                <Button 
                  onClick={handleUpload} 
                  disabled={isUploading} 
                  className="w-full bg-cyan-600 text-white hover:bg-cyan-700 sm:w-auto"
                >
                  {isUploading ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <UploadCloud className="mr-2 h-4 w-4" />
                  )}
                  Upload {stagedFiles.length} Resume{stagedFiles.length !== 1 ? 's' : ''}
                </Button>
              </div>
            </div>
          )}

          {/* Resumes List */}
          <div>
            <h4 className="mb-3 text-sm font-medium text-gray-300">
              Uploaded Resumes ({resumes.length})
            </h4>
            
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-gray-500" />
              </div>
            ) : resumes.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-lg border border-gray-800 bg-gray-900/30 py-8 text-gray-500">
                <AlertCircle className="mb-2 h-5 w-5 opacity-50" />
                <p className="text-sm">No resumes uploaded yet</p>
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {resumes.map((resume) => (
                  <div
                    key={resume.id}
                    onClick={() => handleViewAnalysis(resume)}
                    className="group flex cursor-pointer flex-col justify-between rounded-lg border border-gray-800 bg-gray-900/50 p-4 transition-all hover:border-cyan-500/40 hover:bg-gray-800/50 hover:shadow-md hover:shadow-cyan-500/5"
                  >
                    <div className="mb-3 flex items-start justify-between gap-3">
                      <div className="flex items-center gap-2 overflow-hidden">
                        <FileText className="h-4 w-4 shrink-0 text-cyan-400" />
                        <span className="truncate text-sm font-medium text-gray-200">
                          {resume.filename}
                        </span>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(resume.id, resume.filename);
                        }}
                        className="rounded p-1 text-gray-500 opacity-0 transition-all hover:bg-gray-800 hover:text-red-400 group-hover:opacity-100"
                        title="Delete resume"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                    
                    <div className="flex items-center justify-between text-xs text-gray-500">
                      <span suppressHydrationWarning>
                        {formatDistanceToNow(new Date(resume.uploaded_at), { addSuffix: true })}
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

      {/* Analysis Modal */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent showCloseButton={false} className="max-w-2xl bg-card text-foreground border-2 border-border rounded-none shadow-[8px_8px_0px_0px_var(--border)] sm:max-h-[85vh] overflow-y-auto p-0 gap-0 focus:outline-none">
          <DialogHeader className="p-6 bg-foreground text-background space-y-1 relative">
            <DialogTitle className="flex items-center gap-2 text-2xl font-black italic uppercase tracking-tighter text-background">
              <Brain className="h-6 w-6 text-primary" />
              AI Resume Analysis
            </DialogTitle>
            <DialogDescription className="text-xs font-black uppercase tracking-widest text-background/80">
              {selectedResume?.filename}
            </DialogDescription>
            <button
              onClick={() => setDialogOpen(false)}
              className="absolute top-6 right-6 p-2 bg-background text-foreground brutal-border shadow-[2px_2px_0px_0px_var(--border)] hover:bg-primary hover:text-white transition-all active:translate-x-[1px] active:translate-y-[1px] active:shadow-none"
            >
              <X className="h-5 w-5" />
            </button>
          </DialogHeader>

          <div className="p-8">
            {isLoadingAnalysis ? (
              <div className="flex flex-col items-center justify-center py-12">
                <Loader2 className="mb-3 h-8 w-8 animate-spin text-primary" />
                <p className="text-sm font-black uppercase tracking-widest text-muted-foreground">Loading analysis...</p>
              </div>
            ) : analysisStatus === "processing" ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="mb-4 brutal-border bg-muted p-4 shadow-[4px_4px_0px_0px_var(--border)]">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
                <h3 className="mb-1 text-lg font-black italic uppercase tracking-tighter">Analysis in Progress</h3>
                <p className="text-sm font-bold text-muted-foreground leading-tight">
                  DeepSeek AI is analyzing your resume. This typically takes 15–30 seconds.
                  <br />
                  You can close this and check back shortly.
                </p>
              </div>
            ) : analysisStatus === "failed" ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="mb-4 brutal-border bg-[#FFEBEB] p-4 shadow-[4px_4px_0px_0px_var(--border)]">
                  <AlertCircle className="h-8 w-8 text-[#D72638]" />
                </div>
                <h3 className="mb-1 text-lg font-black italic uppercase tracking-tighter">Analysis Failed</h3>
                <p className="text-sm font-bold text-muted-foreground leading-tight">
                  Something went wrong during the AI analysis. Please try re-uploading the resume.
                </p>
              </div>
            ) : analysis ? (
              <div className="space-y-8">
                {/* Summary */}
                {analysis.summary && (
                  <div className="brutal-border bg-muted p-6 shadow-[4px_4px_0px_0px_var(--border)]">
                    <div className="mb-4 flex items-center gap-2 text-sm font-black italic uppercase tracking-tighter text-primary">
                      <Sparkles className="h-5 w-5" />
                      Professional Summary
                    </div>
                    <p className="text-sm font-bold leading-relaxed">{analysis.summary}</p>
                  </div>
                )}

                {/* Education */}
                {analysis.education && analysis.education.length > 0 && (
                  <div>
                    <div className="mb-4 flex items-center gap-2 text-sm font-black italic uppercase tracking-tighter text-foreground">
                      <GraduationCap className="h-5 w-5 text-primary" />
                      Education
                    </div>
                    <div className="space-y-2">
                      {analysis.education.map((item, i) => (
                        <div
                          key={i}
                          className="brutal-border bg-card px-4 py-3 text-sm font-bold shadow-[2px_2px_0px_0px_var(--border)]"
                        >
                          {item}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Certifications */}
                {analysis.certifications && analysis.certifications.length > 0 && (
                  <div>
                    <div className="mb-4 flex items-center gap-2 text-sm font-black italic uppercase tracking-tighter text-foreground">
                      <Award className="h-5 w-5 text-primary" />
                      Certifications
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {analysis.certifications.map((cert, i) => (
                        <div
                          key={i}
                          className="brutal-border bg-card px-3 py-1 text-xs font-black uppercase tracking-widest shadow-[2px_2px_0px_0px_var(--border)]"
                        >
                          {cert}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Skills */}
                {analysis.skills && analysis.skills.length > 0 && (
                  <div>
                    <div className="mb-4 flex items-center gap-2 text-sm font-black italic uppercase tracking-tighter text-foreground">
                      <Code className="h-5 w-5 text-primary" />
                      Skills
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {analysis.skills.map((skill, i) => (
                        <div
                          key={i}
                          className="brutal-border bg-primary text-white px-3 py-1 text-xs font-black uppercase tracking-widest shadow-[2px_2px_0px_0px_var(--border)]"
                        >
                          {skill}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Project Keywords */}
                {analysis.project_keywords && analysis.project_keywords.length > 0 && (
                  <div>
                    <div className="mb-4 flex items-center gap-2 text-sm font-black italic uppercase tracking-tighter text-foreground">
                      <Sparkles className="h-5 w-5 text-primary" />
                      Experience Keywords
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {analysis.project_keywords.map((kw, i) => (
                        <div
                          key={i}
                          className="brutal-border bg-muted px-3 py-1 text-xs font-black uppercase tracking-widest shadow-[2px_2px_0px_0px_var(--border)]"
                        >
                          {kw}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-12">
                <p className="text-sm font-black uppercase tracking-widest text-muted-foreground">No analysis data available.</p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

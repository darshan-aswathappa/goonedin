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
          toast.error(`Failed to upload ${file.name}`);
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
        <CardHeader className="pb-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-800/50 text-cyan-400">
              <FileText className="h-5 w-5" />
            </div>
            <div>
              <CardTitle className="text-lg text-white">Resume Management</CardTitle>
              <CardDescription className="text-gray-500">
                Upload resumes (PDF). AI will automatically analyze skills, education &amp; more.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Upload Zone */}
          <div
            {...getRootProps()}
            className={`relative flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-8 text-center transition-all duration-200 ${
              isDragActive
                ? "border-cyan-500 bg-cyan-500/10"
                : "border-gray-700 bg-gray-900/50 hover:border-gray-500 hover:bg-gray-800/50"
            } ${isUploading ? "pointer-events-none opacity-60" : "cursor-pointer"}`}
          >
            <input {...getInputProps()} />
            
            <div className="mb-4 rounded-full bg-gray-800 p-3 text-cyan-400">
              <UploadCloud className="h-6 w-6" />
            </div>
            <h3 className="mb-1 text-sm font-medium text-white">
              {isDragActive ? "Drop resumes here" : "Click or drag resumes here"}
            </h3>
            <p className="text-xs text-gray-500">PDF files up to 10MB</p>

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
        <DialogContent className="max-w-2xl border-gray-800 bg-[#0d1117] text-white sm:max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg">
              <Brain className="h-5 w-5 text-cyan-400" />
              AI Resume Analysis
            </DialogTitle>
            <DialogDescription className="text-gray-400">
              {selectedResume?.filename}
            </DialogDescription>
          </DialogHeader>

          {isLoadingAnalysis ? (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2 className="mb-3 h-8 w-8 animate-spin text-cyan-400" />
              <p className="text-sm text-gray-400">Loading analysis...</p>
            </div>
          ) : analysisStatus === "processing" ? (
            <div className="flex flex-col items-center justify-center py-12">
              <div className="mb-4 rounded-full bg-amber-500/10 p-4">
                <Loader2 className="h-8 w-8 animate-spin text-amber-400" />
              </div>
              <h3 className="mb-1 font-medium text-white">Analysis in Progress</h3>
              <p className="text-center text-sm text-gray-400">
                DeepSeek AI is analyzing your resume. This typically takes 15–30 seconds.
                <br />
                You can close this and check back shortly.
              </p>
            </div>
          ) : analysisStatus === "failed" ? (
            <div className="flex flex-col items-center justify-center py-12">
              <div className="mb-4 rounded-full bg-red-500/10 p-4">
                <AlertCircle className="h-8 w-8 text-red-400" />
              </div>
              <h3 className="mb-1 font-medium text-white">Analysis Failed</h3>
              <p className="text-center text-sm text-gray-400">
                Something went wrong during the AI analysis. Please try re-uploading the resume.
              </p>
            </div>
          ) : analysis ? (
            <div className="space-y-6 py-2">
              {/* Summary */}
              {analysis.summary && (
                <div className="rounded-lg border border-gray-800 bg-gray-900/40 p-4">
                  <div className="mb-2 flex items-center gap-2 text-sm font-medium text-cyan-400">
                    <Sparkles className="h-4 w-4" />
                    Professional Summary
                  </div>
                  <p className="text-sm leading-relaxed text-gray-300">{analysis.summary}</p>
                </div>
              )}

              {/* Education */}
              {analysis.education.length > 0 && (
                <div>
                  <div className="mb-3 flex items-center gap-2 text-sm font-medium text-gray-200">
                    <GraduationCap className="h-4 w-4 text-blue-400" />
                    Education
                  </div>
                  <div className="space-y-2">
                    {analysis.education.map((item, i) => (
                      <div
                        key={i}
                        className="rounded-md border border-gray-800 bg-gray-900/30 px-3 py-2 text-sm text-gray-300"
                      >
                        {item}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Certifications */}
              {analysis.certifications.length > 0 && (
                <div>
                  <div className="mb-3 flex items-center gap-2 text-sm font-medium text-gray-200">
                    <Award className="h-4 w-4 text-yellow-400" />
                    Certifications
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {analysis.certifications.map((cert, i) => (
                      <Badge
                        key={i}
                        variant="outline"
                        className="border-yellow-500/30 bg-yellow-500/10 text-yellow-300"
                      >
                        {cert}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* Skills */}
              {analysis.skills.length > 0 && (
                <div>
                  <div className="mb-3 flex items-center gap-2 text-sm font-medium text-gray-200">
                    <Code className="h-4 w-4 text-green-400" />
                    Skills
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {analysis.skills.map((skill, i) => (
                      <Badge
                        key={i}
                        variant="outline"
                        className="border-green-500/30 bg-green-500/10 text-green-300"
                      >
                        {skill}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* Project Keywords */}
              {analysis.project_keywords.length > 0 && (
                <div>
                  <div className="mb-3 flex items-center gap-2 text-sm font-medium text-gray-200">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    Project &amp; Experience Keywords
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {analysis.project_keywords.map((kw, i) => (
                      <Badge
                        key={i}
                        variant="outline"
                        className="border-purple-500/30 bg-purple-500/10 text-purple-300"
                      >
                        {kw}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12">
              <p className="text-sm text-gray-400">No analysis data available.</p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

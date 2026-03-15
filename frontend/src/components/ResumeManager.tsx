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
import {
  Dialog,
  DialogContent,
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

  // Hover states
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [hoveredDeleteId, setHoveredDeleteId] = useState<string | null>(null);
  const [hoveredRemoveId, setHoveredRemoveId] = useState<string | null>(null);
  const [uploadBtnHovered, setUploadBtnHovered] = useState(false);
  const [cancelBtnHovered, setCancelBtnHovered] = useState(false);
  const [deleteBtnHovered, setDeleteBtnHovered] = useState(false);
  const [closeDialogHovered, setCloseDialogHovered] = useState(false);

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
          <div style={{ display: "inline-flex", alignItems: "center", gap: "4px", border: "1px solid rgba(255,215,0,0.3)", background: "rgba(255,215,0,0.05)", color: "#ffd700", fontFamily: "var(--font-mono)", fontSize: "9px", padding: "2px 8px", letterSpacing: "0.1em", textTransform: "uppercase" }}>
            <CircleNotch style={{ width: "10px", height: "10px" }} className="animate-spin" />
            <span>ANALYZING</span>
          </div>
        );
      case "completed":
        return (
          <div style={{ display: "inline-flex", alignItems: "center", gap: "4px", border: "1px solid rgba(255,140,0,0.3)", background: "rgba(255,140,0,0.05)", color: "#ff8c00", fontFamily: "var(--font-mono)", fontSize: "9px", padding: "2px 8px", letterSpacing: "0.1em", textTransform: "uppercase" }}>
            <Brain style={{ width: "10px", height: "10px" }} />
            <span>AI READY</span>
          </div>
        );
      case "failed":
        return (
          <div style={{ display: "inline-flex", alignItems: "center", gap: "4px", border: "1px solid rgba(255,51,51,0.3)", background: "rgba(255,51,51,0.05)", color: "#ff3333", fontFamily: "var(--font-mono)", fontSize: "9px", padding: "2px 8px", letterSpacing: "0.1em", textTransform: "uppercase" }}>
            <Warning style={{ width: "10px", height: "10px" }} />
            <span>FAILED</span>
          </div>
        );
      default:
        return (
          <div style={{ display: "inline-flex", alignItems: "center", gap: "4px", border: "1px solid rgba(255,140,0,0.3)", background: "rgba(255,140,0,0.05)", color: "#ff8c00", fontFamily: "var(--font-mono)", fontSize: "9px", padding: "2px 8px", letterSpacing: "0.1em", textTransform: "uppercase" }}>
            <CheckCircle style={{ width: "10px", height: "10px" }} />
            <span>READY</span>
          </div>
        );
    }
  };

  return (
    <>
      {/* Main card */}
      <div style={{ background: "#080808", border: "1px solid #1c1c1c", borderRadius: "2px" }}>
        {/* Panel header */}
        <div style={{ borderBottom: "1px solid #1c1c1c", padding: "10px 16px", display: "flex", alignItems: "center", gap: "12px" }}>
          <div style={{ width: "22px", height: "22px", background: "#ff8c00", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <FileText style={{ width: "12px", height: "12px", color: "#000" }} />
          </div>
          <div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: "9px", fontWeight: 600, letterSpacing: "0.18em", color: "#ff8c00", textTransform: "uppercase" }}>// RESUME MANAGEMENT</div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: "9px", color: "#555", letterSpacing: "0.05em", marginTop: "2px" }}>Upload PDF resumes for AI skill extraction</div>
          </div>
        </div>

        <div style={{ padding: "16px", display: "flex", flexDirection: "column", gap: "20px" }}>
          {/* Dropzone */}
          <div
            {...getRootProps()}
            style={{
              border: isDragActive ? "1px solid #ff8c00" : "1px dashed #1c1c1c",
              background: isDragActive ? "rgba(255,140,0,0.05)" : "#000",
              padding: "32px 16px",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              textAlign: "center",
              cursor: isUploading ? "not-allowed" : "pointer",
              opacity: isUploading ? 0.6 : 1,
              transition: "border-color 0.15s",
              position: "relative",
            }}
          >
            <input {...getInputProps()} />
            <div style={{ width: "36px", height: "36px", background: "#ff8c00", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: "12px" }}>
              <CloudArrowUp style={{ width: "18px", height: "18px", color: "#000" }} />
            </div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: "11px", fontWeight: 600, color: "#f0f0f0", letterSpacing: "0.08em", marginBottom: "6px" }}>
              {isDragActive ? "DROP RESUME HERE" : "DRAG & DROP RESUME"}
            </div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: "9px", color: "#555", letterSpacing: "0.1em", border: "1px solid #1c1c1c", padding: "2px 8px" }}>
              PDF ONLY · 10MB MAX
            </div>
            {isUploading && (
              <div style={{ position: "absolute", bottom: "8px", left: "16px", right: "16px", display: "flex", flexDirection: "column", gap: "4px" }}>
                <div style={{ height: "2px", background: "#1c1c1c", width: "100%" }}>
                  <div style={{ height: "100%", background: "#ff8c00", width: `${uploadProgress}%`, transition: "width 0.3s" }} />
                </div>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: "9px", color: "#ff8c00", textAlign: "center", letterSpacing: "0.1em" }}>{Math.round(uploadProgress)}%</span>
              </div>
            )}
          </div>

          {/* Staged files */}
          {stagedFiles.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: "9px", fontWeight: 600, letterSpacing: "0.18em", color: "#ff8c00", textTransform: "uppercase" }}>
                // STAGED FOR UPLOAD
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {stagedFiles.map((staged, index) => (
                  <div key={staged.id} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <div style={{ background: "#0a0a0a", border: "1px solid #1c1c1c", padding: "8px 12px", display: "flex", alignItems: "center", gap: "8px", flex: 1 }}>
                      <FileText style={{ width: "12px", height: "12px", color: "#555", flexShrink: 0 }} />
                      <input
                        type="text"
                        value={staged.name}
                        onChange={(e) => {
                          const newStaged = [...stagedFiles];
                          newStaged[index].name = e.target.value;
                          setStagedFiles(newStaged);
                        }}
                        style={{ background: "transparent", border: "none", color: "#f0f0f0", fontFamily: "var(--font-mono)", fontSize: "11px", flex: 1, outline: "none" }}
                        disabled={isUploading}
                      />
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: "9px", color: "#555", border: "1px solid #1c1c1c", padding: "1px 6px" }}>.pdf</span>
                    </div>
                    <button
                      onClick={() => setStagedFiles(prev => prev.filter(s => s.id !== staged.id))}
                      onMouseEnter={() => setHoveredRemoveId(staged.id)}
                      onMouseLeave={() => setHoveredRemoveId(null)}
                      disabled={isUploading}
                      style={{
                        border: hoveredRemoveId === staged.id ? "1px solid #ff3333" : "1px solid #1c1c1c",
                        background: "transparent",
                        color: hoveredRemoveId === staged.id ? "#ff3333" : "#555",
                        padding: "6px",
                        cursor: isUploading ? "not-allowed" : "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        transition: "border-color 0.1s, color 0.1s",
                      }}
                    >
                      <Trash style={{ width: "14px", height: "14px" }} />
                    </button>
                  </div>
                ))}
              </div>

              <button
                onClick={handleUpload}
                disabled={isUploading}
                onMouseEnter={() => setUploadBtnHovered(true)}
                onMouseLeave={() => setUploadBtnHovered(false)}
                style={{
                  border: "1px solid #ff8c00",
                  background: uploadBtnHovered ? "rgba(255,140,0,0.2)" : "rgba(255,140,0,0.1)",
                  color: "#ff8c00",
                  fontFamily: "var(--font-mono)",
                  fontSize: "10px",
                  fontWeight: 700,
                  letterSpacing: "0.15em",
                  textTransform: "uppercase",
                  padding: "10px 20px",
                  cursor: isUploading ? "not-allowed" : "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "8px",
                  width: "100%",
                  opacity: isUploading ? 0.6 : 1,
                  transition: "background 0.1s",
                }}
              >
                {isUploading ? (
                  <CircleNotch style={{ width: "14px", height: "14px" }} className="animate-spin" />
                ) : (
                  <CloudArrowUp style={{ width: "14px", height: "14px" }} />
                )}
                UPLOAD AND ANALYZE ({stagedFiles.length} RESUME{stagedFiles.length !== 1 ? "S" : ""})
              </button>
            </div>
          )}

          {/* Resume list */}
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: "9px", fontWeight: 600, letterSpacing: "0.18em", color: "#ff8c00", textTransform: "uppercase" }}>
              // UPLOADED RESUMES ({resumes.length})
            </div>

            {isLoading ? (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "40px 0" }}>
                <CircleNotch style={{ width: "20px", height: "20px", color: "#ff8c00" }} className="animate-spin" />
              </div>
            ) : resumes.length === 0 ? (
              <div style={{ background: "#000", border: "1px dashed #1c1c1c", padding: "32px", display: "flex", flexDirection: "column", alignItems: "center", gap: "8px" }}>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: "9px", color: "#555", letterSpacing: "0.1em", textTransform: "uppercase" }}>NO RESUMES YET — UPLOAD YOUR PDF TO GET STARTED</span>
              </div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "8px" }}>
                {resumes.map((resume) => (
                  <div
                    key={resume.id}
                    onClick={() => handleViewAnalysis(resume)}
                    onMouseEnter={() => setHoveredId(resume.id)}
                    onMouseLeave={() => setHoveredId(null)}
                    style={{
                      background: "#000",
                      border: hoveredId === resume.id ? "1px solid #333" : "1px solid #1c1c1c",
                      padding: "12px 14px",
                      cursor: "pointer",
                      transition: "border-color 0.1s",
                      display: "flex",
                      flexDirection: "column",
                      gap: "10px",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "8px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "10px", overflow: "hidden", minWidth: 0 }}>
                        <div style={{ width: "28px", height: "28px", background: "#080808", border: "1px solid #1c1c1c", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                          <FileText style={{ width: "14px", height: "14px", color: "#ff8c00" }} />
                        </div>
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: "10px", color: "#f0f0f0", textTransform: "uppercase", letterSpacing: "0.05em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {resume.filename}
                        </span>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          openDeleteDialog(resume);
                        }}
                        onMouseEnter={() => setHoveredDeleteId(resume.id)}
                        onMouseLeave={() => setHoveredDeleteId(null)}
                        style={{
                          background: "transparent",
                          border: hoveredDeleteId === resume.id ? "1px solid #ff3333" : "1px solid #1c1c1c",
                          color: hoveredDeleteId === resume.id ? "#ff3333" : "#555",
                          padding: "4px",
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          flexShrink: 0,
                          transition: "border-color 0.1s, color 0.1s",
                        }}
                        title="Delete resume"
                      >
                        <Trash style={{ width: "12px", height: "12px" }} />
                      </button>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <span
                        suppressHydrationWarning
                        style={{ fontFamily: "var(--font-mono)", fontSize: "9px", color: "#555", border: "1px solid #1c1c1c", padding: "1px 6px", letterSpacing: "0.05em" }}
                      >
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
        </div>
      </div>

      {/* Analysis Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent
          showCloseButton={false}
          className="max-w-2xl rounded-none max-h-[85vh] overflow-y-auto p-0 gap-0"
          style={{ background: "#060606", border: "1px solid #333", boxShadow: "none", borderRadius: "2px" }}
        >
          <DialogTitle className="sr-only">AI Resume Analysis</DialogTitle>
          {/* Header bar */}
          <div style={{ background: "#080808", borderBottom: "1px solid #1c1c1c", padding: "12px 16px", position: "relative", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: "9px", fontWeight: 600, letterSpacing: "0.18em", color: "#ff8c00", textTransform: "uppercase" }}>
                // AI RESUME ANALYSIS
              </div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: "9px", color: "#555", letterSpacing: "0.05em", marginTop: "3px" }}>
                {selectedResume?.filename}
              </div>
            </div>
            <button
              onClick={() => setDialogOpen(false)}
              onMouseEnter={() => setCloseDialogHovered(true)}
              onMouseLeave={() => setCloseDialogHovered(false)}
              style={{
                background: "transparent",
                border: closeDialogHovered ? "1px solid #ff3333" : "1px solid #1c1c1c",
                color: closeDialogHovered ? "#ff3333" : "#555",
                padding: "4px",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                transition: "border-color 0.1s, color 0.1s",
              }}
            >
              <X style={{ width: "14px", height: "14px" }} />
            </button>
          </div>

          {/* Content area */}
          <div style={{ background: "#000", padding: "16px" }}>
            {isLoadingAnalysis ? (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "60px 0", gap: "16px" }}>
                <CircleNotch style={{ width: "28px", height: "28px", color: "#ff8c00" }} className="animate-spin" />
                <span style={{ fontFamily: "var(--font-mono)", fontSize: "9px", color: "#ff8c00", letterSpacing: "0.18em", textTransform: "uppercase" }}>ANALYZING RESUME_</span>
              </div>
            ) : analysisStatus === "processing" ? (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "60px 0", textAlign: "center", gap: "12px" }}>
                <CircleNotch style={{ width: "28px", height: "28px", color: "#ff8c00" }} className="animate-spin" />
                <div style={{ fontFamily: "var(--font-mono)", fontSize: "11px", color: "#aaa", letterSpacing: "0.05em", maxWidth: "320px", lineHeight: 1.6 }}>
                  RESUME ANALYSIS IN PROGRESS. THIS USUALLY TAKES 15–30 SECONDS. YOU CAN CLOSE THIS AND CHECK BACK SHORTLY.
                </div>
              </div>
            ) : analysisStatus === "failed" ? (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "60px 0", textAlign: "center", gap: "12px" }}>
                <Warning style={{ width: "28px", height: "28px", color: "#ff3333" }} />
                <div style={{ fontFamily: "var(--font-mono)", fontSize: "11px", color: "#ff3333", letterSpacing: "0.05em" }}>
                  ANALYSIS FAILED. TRY UPLOADING AGAIN.
                </div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: "9px", color: "#555", letterSpacing: "0.08em" }}>
                  MAKE SURE YOUR PDF IS READABLE AND NOT SCANNED.
                </div>
              </div>
            ) : analysis ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
                {analysis.summary && (
                  <div style={{ marginBottom: "0" }}>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: "9px", fontWeight: 600, letterSpacing: "0.18em", color: "#ff8c00", textTransform: "uppercase", marginBottom: "10px" }}>
                      // PROFESSIONAL SUMMARY
                    </div>
                    <div style={{ background: "#080808", border: "1px solid #1c1c1c", padding: "12px 16px", fontFamily: "var(--font-mono)", fontSize: "11px", color: "#aaa", lineHeight: 1.6 }}>
                      {analysis.summary}
                    </div>
                  </div>
                )}

                {analysis.education && analysis.education.length > 0 && (
                  <div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: "9px", fontWeight: 600, letterSpacing: "0.18em", color: "#ff8c00", textTransform: "uppercase", marginBottom: "10px", display: "flex", alignItems: "center", gap: "6px" }}>
                      <GraduationCap style={{ width: "10px", height: "10px" }} />
                      // EDUCATION
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                      {analysis.education.map((item, i) => (
                        <div key={i} style={{ background: "#080808", border: "1px solid #1c1c1c", padding: "8px 12px", fontFamily: "var(--font-mono)", fontSize: "10px", color: "#aaa" }}>
                          {item}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {analysis.certifications && analysis.certifications.length > 0 && (
                  <div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: "9px", fontWeight: 600, letterSpacing: "0.18em", color: "#ff8c00", textTransform: "uppercase", marginBottom: "10px", display: "flex", alignItems: "center", gap: "6px" }}>
                      <Medal style={{ width: "10px", height: "10px" }} />
                      // CERTIFICATIONS
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                      {analysis.certifications.map((cert, i) => (
                        <div key={i} style={{ border: "1px solid #333", background: "#080808", color: "#f0f0f0", fontFamily: "var(--font-mono)", fontSize: "10px", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", padding: "3px 8px" }}>
                          {cert}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {analysis.skills && analysis.skills.length > 0 && (
                  <div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: "9px", fontWeight: 600, letterSpacing: "0.18em", color: "#ff8c00", textTransform: "uppercase", marginBottom: "10px", display: "flex", alignItems: "center", gap: "6px" }}>
                      <Code style={{ width: "10px", height: "10px" }} />
                      // SKILLS
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                      {analysis.skills.map((skill, i) => (
                        <div
                          key={i}
                          style={{ border: "1px solid #333", background: "#080808", color: "#f0f0f0", fontFamily: "var(--font-mono)", fontSize: "10px", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", padding: "3px 8px", cursor: "default" }}
                          onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.borderColor = "#ff8c00"; }}
                          onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.borderColor = "#333"; }}
                        >
                          {skill}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {analysis.project_keywords && analysis.project_keywords.length > 0 && (
                  <div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: "9px", fontWeight: 600, letterSpacing: "0.18em", color: "#ff8c00", textTransform: "uppercase", marginBottom: "10px", display: "flex", alignItems: "center", gap: "6px" }}>
                      <Sparkle style={{ width: "10px", height: "10px" }} />
                      // EXPERIENCE KEYWORDS
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                      {analysis.project_keywords.map((kw, i) => (
                        <div
                          key={i}
                          style={{ border: "1px solid #333", background: "#080808", color: "#f0f0f0", fontFamily: "var(--font-mono)", fontSize: "10px", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", padding: "3px 8px", cursor: "default" }}
                          onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.borderColor = "#ffd700"; }}
                          onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.borderColor = "#333"; }}
                        >
                          {kw}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "60px 0", gap: "8px" }}>
                <Warning style={{ width: "20px", height: "20px", color: "#555" }} />
                <span style={{ fontFamily: "var(--font-mono)", fontSize: "9px", color: "#555", letterSpacing: "0.1em", textTransform: "uppercase" }}>ANALYSIS NOT READY YET. PLEASE CHECK BACK IN A MOMENT.</span>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation Dialog */}
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
          className="max-w-md rounded-none p-0 gap-0"
          style={{ background: "#060606", border: "1px solid #333", boxShadow: "none", borderRadius: "2px" }}
        >
          <DialogTitle className="sr-only">Delete Resume</DialogTitle>
          {/* Header */}
          <div style={{ background: "#080808", borderBottom: "1px solid rgba(255,51,51,0.3)", padding: "12px 16px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
              <Warning style={{ width: "12px", height: "12px", color: "#ff3333" }} />
              <div style={{ fontFamily: "var(--font-mono)", fontSize: "9px", fontWeight: 600, letterSpacing: "0.18em", color: "#ff3333", textTransform: "uppercase" }}>
                // DELETE RESUME
              </div>
            </div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: "11px", color: "#aaa", lineHeight: 1.5 }}>
              This will permanently remove <span style={{ color: "#f0f0f0", fontWeight: 700 }}>{resumeToDelete?.filename}</span> and its AI analysis.
            </div>
          </div>

          {/* Footer */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: "8px", padding: "12px 16px" }}>
            <button
              type="button"
              onClick={() => {
                setDeleteDialogOpen(false);
                setResumeToDelete(null);
              }}
              disabled={isDeletingResume}
              onMouseEnter={() => setCancelBtnHovered(true)}
              onMouseLeave={() => setCancelBtnHovered(false)}
              style={{
                border: cancelBtnHovered ? "1px solid #333" : "1px solid #1c1c1c",
                background: "transparent",
                color: cancelBtnHovered ? "#aaa" : "#555",
                fontFamily: "var(--font-mono)",
                fontSize: "10px",
                fontWeight: 700,
                letterSpacing: "0.15em",
                textTransform: "uppercase",
                padding: "7px 16px",
                cursor: isDeletingResume ? "not-allowed" : "pointer",
                transition: "border-color 0.1s, color 0.1s",
              }}
            >
              CANCEL
            </button>
            <button
              type="button"
              onClick={handleDeleteConfirm}
              disabled={!resumeToDelete || isDeletingResume}
              onMouseEnter={() => setDeleteBtnHovered(true)}
              onMouseLeave={() => setDeleteBtnHovered(false)}
              style={{
                border: "1px solid #ff3333",
                background: deleteBtnHovered ? "rgba(255,51,51,0.2)" : "rgba(255,51,51,0.1)",
                color: "#ff3333",
                fontFamily: "var(--font-mono)",
                fontSize: "10px",
                fontWeight: 700,
                letterSpacing: "0.15em",
                textTransform: "uppercase",
                padding: "7px 16px",
                cursor: (!resumeToDelete || isDeletingResume) ? "not-allowed" : "pointer",
                display: "flex",
                alignItems: "center",
                gap: "6px",
                opacity: (!resumeToDelete || isDeletingResume) ? 0.6 : 1,
                transition: "background 0.1s",
              }}
            >
              {isDeletingResume ? (
                <>
                  <CircleNotch style={{ width: "12px", height: "12px" }} className="animate-spin" />
                  DELETING...
                </>
              ) : (
                "DELETE"
              )}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

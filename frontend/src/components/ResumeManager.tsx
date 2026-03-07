"use client";

import { useState, useCallback, useEffect } from "react";
import {
  UploadCloud,
  FileText,
  Trash2,
  Loader2,
  AlertCircle,
  CheckCircle2,
} from "lucide-react";
import { useDropzone } from "react-dropzone";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { getAuthHeaders } from "@/hooks/useAuth";
import { formatDistanceToNow } from "date-fns";
const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface Resume {
  id: string;
  filename: string;
  file_path: string;
  uploaded_at: string;
}

export function ResumeManager() {
  const [resumes, setResumes] = useState<Resume[]>([]);
  const [stagedFiles, setStagedFiles] = useState<{ id: string; file: File; name: string }[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

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

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const pdfFiles = acceptedFiles.filter(file => file.type === "application/pdf");
    
    if (pdfFiles.length === 0) {
      toast.error("Only PDF files are allowed");
      return;
    }

    const newStaged = pdfFiles.map(file => ({
      id: Math.random().toString(36).substring(7),
      file,
      name: file.name.replace(/\.[^/.]+$/, "") // strip extension for easy editing
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
      toast.success(`Successfully uploaded ${successCount} resume(s)`);
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

  return (
    <Card className="border-gray-800 bg-[#161b22]">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-800/50 text-cyan-400">
            <FileText className="h-5 w-5" />
          </div>
          <div>
            <CardTitle className="text-lg text-white">Resume Management</CardTitle>
            <CardDescription className="text-gray-500">
              Upload multiple resumes (PDF only) to be used for AI job applications.
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
                  className="group flex flex-col justify-between rounded-lg border border-gray-800 bg-gray-900/50 p-4 transition-colors hover:border-gray-700 hover:bg-gray-800/50"
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
                    <span>
                      {formatDistanceToNow(new Date(resume.uploaded_at), { addSuffix: true })}
                    </span>
                    <div className="flex items-center gap-1 text-green-500/80">
                      <CheckCircle2 className="h-3 w-3" />
                      <span>Ready</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

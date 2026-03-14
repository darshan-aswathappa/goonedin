"""
Resume microservice — FastAPI app.
Exposes:
  POST /analyze  — PDF bytes → structured resume analysis (DeepSeek)
  POST /match    — skills + keywords → match score
  GET  /health   — liveness probe
"""

import asyncio
import logging
import os
from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import FastAPI, File, HTTPException, UploadFile

from analyzer import analyze_resume_with_deepseek, extract_text_from_pdf
from models import AnalyzeResponse

load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("ResumeService")


@asynccontextmanager
async def lifespan(app: FastAPI):
    api_key = os.getenv("DEEPSEEK_API_KEY")
    if not api_key:
        logger.warning("DEEPSEEK_API_KEY not set — /analyze will fail")
    yield


app = FastAPI(title="Resume Microservice", version="1.0.0", lifespan=lifespan)


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.post("/analyze", response_model=AnalyzeResponse)
async def analyze(file: UploadFile = File(...)):
    pdf_bytes = await file.read()
    if not pdf_bytes:
        raise HTTPException(status_code=400, detail="Empty file")

    try:
        resume_text = await asyncio.to_thread(extract_text_from_pdf, pdf_bytes)
    except Exception as e:
        logger.error(f"PDF extraction failed: {e}")
        raise HTTPException(status_code=400, detail=f"PDF extraction failed: {e}")

    if not resume_text.strip():
        raise HTTPException(status_code=400, detail="Could not extract any text from the PDF")

    api_key = os.getenv("DEEPSEEK_API_KEY")
    if not api_key:
        raise HTTPException(status_code=502, detail="DEEPSEEK_API_KEY not configured")

    try:
        analysis = await asyncio.to_thread(analyze_resume_with_deepseek, resume_text, api_key)
    except Exception as e:
        logger.error(f"DeepSeek call failed: {e}")
        raise HTTPException(status_code=502, detail=f"DeepSeek analysis failed: {e}")

    return AnalyzeResponse(
        education=analysis.get("education") or [],
        certifications=analysis.get("certifications") or [],
        skills=analysis.get("skills") or [],
        project_keywords=analysis.get("project_keywords") or [],
        summary=analysis.get("summary") or "",
    )



"""
Resume analysis service using DeepSeek AI (OpenAI-compatible API).

Extracts education, certifications, skills, and project keywords from
uploaded PDF resumes using the deepseek-reasoner model.
"""

import json
import logging
from typing import Any

import PyPDF2
import io
from openai import OpenAI

logger = logging.getLogger("VelocityMain")

DEEPSEEK_SYSTEM_PROMPT = """You are an expert resume analyzer. Given the raw text of a resume, extract the following information and return it as valid JSON only (no markdown, no explanation):

{
  "education": ["degree — institution (year if available)", ...],
  "certifications": ["certification name (issuer if available)", ...],
  "skills": ["skill1", "skill2", ...],
  "project_keywords": ["keyword1", "keyword2", ...],
  "summary": "A 1-2 sentence professional summary of the candidate."
}

Rules:
- "education" should list degrees, institutions, and years.
- "certifications" should only include professional certifications, not degrees.
- "skills" should include both technical skills (languages, frameworks, tools) and relevant soft skills.
- "project_keywords" should extract domain-specific keywords and technologies mentioned in the experience/projects sections. Focus on action verbs, technologies, methodologies, and domain terms.
- If a section has no data, return an empty list [].
- Return ONLY the JSON object, nothing else."""


def extract_text_from_pdf(pdf_bytes: bytes) -> str:
    """Extract text content from PDF bytes using PyPDF2."""
    reader = PyPDF2.PdfReader(io.BytesIO(pdf_bytes))
    text_parts: list[str] = []
    for page in reader.pages:
        page_text = page.extract_text()
        if page_text:
            text_parts.append(page_text)
    return "\n".join(text_parts)


def analyze_resume_with_deepseek(resume_text: str, api_key: str) -> dict[str, Any]:
    """Call the DeepSeek API to analyze resume text and return structured data."""
    client = OpenAI(
        api_key=api_key,
        base_url="https://api.deepseek.com",
    )

    response = client.chat.completions.create(
        model="deepseek-reasoner",
        messages=[
            {"role": "system", "content": DEEPSEEK_SYSTEM_PROMPT},
            {"role": "user", "content": f"Analyze this resume:\n\n{resume_text}"},
        ],
        max_tokens=4096,
    )

    content = response.choices[0].message.content or ""

    # Strip potential markdown fences
    content = content.strip()
    if content.startswith("```"):
        # Remove opening fence (```json or ```)
        first_newline = content.index("\n")
        content = content[first_newline + 1 :]
    if content.endswith("```"):
        content = content[: -3]
    content = content.strip()

    try:
        result = json.loads(content)
    except json.JSONDecodeError:
        logger.warning(f"DeepSeek returned non-JSON. Raw content: {content[:500]}")
        result = {
            "education": [],
            "certifications": [],
            "skills": [],
            "project_keywords": [],
            "summary": "Analysis could not be parsed. Raw output saved.",
            "_raw": content,
        }

    return result


async def run_resume_analysis(
    resume_id: str,
    user_id: str,
    file_path: str,
    supabase_client: Any,
    api_key: str,
) -> None:
    """
    Full background analysis pipeline:
    1. Download PDF from Supabase Storage
    2. Extract text
    3. Call DeepSeek
    4. Store results in resume_analysis table
    5. Update analysis_status on user_resumes
    """
    import asyncio

    try:
        logger.info(f"[ResumeAI] Starting analysis for resume {resume_id}")

        # 1. Download PDF from Supabase storage
        def _download_pdf(*args: Any, **kwargs: Any) -> bytes:
            return supabase_client.storage.from_("resumes").download(file_path)

        pdf_bytes: bytes = await asyncio.to_thread(_download_pdf)

        # 2. Extract text
        resume_text = await asyncio.to_thread(extract_text_from_pdf, pdf_bytes)

        if not resume_text.strip():
            raise ValueError("Could not extract any text from the PDF")

        logger.info(
            f"[ResumeAI] Extracted {len(resume_text)} chars from resume {resume_id}"
        )

        # 3. Call DeepSeek (blocking HTTP call, run in thread)
        analysis = await asyncio.to_thread(
            analyze_resume_with_deepseek, resume_text, api_key
        )

        logger.info(f"[ResumeAI] DeepSeek analysis complete for resume {resume_id}")

        # 4. Store results in resume_analysis table
        def _store_analysis(*args: Any, **kwargs: Any) -> Any:
            return supabase_client.table("resume_analysis").insert(
                {
                    "resume_id": resume_id,
                    "user_id": user_id,
                    "education": json.dumps(analysis.get("education", [])),
                    "certifications": json.dumps(
                        analysis.get("certifications", [])
                    ),
                    "skills": json.dumps(analysis.get("skills", [])),
                    "project_keywords": json.dumps(
                        analysis.get("project_keywords", [])
                    ),
                    "summary": analysis.get("summary", ""),
                    "raw_response": json.dumps(analysis),
                }
            ).execute()

        await asyncio.to_thread(_store_analysis)

        # 5. Update status to completed
        def _update_status_completed(*args: Any, **kwargs: Any) -> Any:
            return (
                supabase_client.table("user_resumes")
                .update({"analysis_status": "completed"})
                .eq("id", resume_id)
                .execute()
            )

        await asyncio.to_thread(_update_status_completed)

        logger.info(f"[ResumeAI] Analysis stored for resume {resume_id}")

    except Exception as e:
        logger.error(f"[ResumeAI] Analysis failed for resume {resume_id}: {e}")

        # Update status to failed
        try:
            import asyncio

            def _update_status_failed(*args: Any, **kwargs: Any) -> Any:
                return (
                    supabase_client.table("user_resumes")
                    .update({"analysis_status": "failed"})
                    .eq("id", resume_id)
                    .execute()
                )

            await asyncio.to_thread(_update_status_failed)
        except Exception as inner_e:
            logger.error(
                f"[ResumeAI] Could not update status to failed: {inner_e}"
            )

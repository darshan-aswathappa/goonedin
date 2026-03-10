"""
Resume text extraction and DeepSeek AI analysis.
Pure computation — no Supabase, no queue.
"""

import json
import logging
import os

import PyPDF2
import io
from openai import OpenAI

logger = logging.getLogger("ResumeService")

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


def analyze_resume_with_deepseek(resume_text: str, api_key: str) -> dict:
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
        first_newline = content.index("\n")
        content = content[first_newline + 1:]
    if content.endswith("```"):
        content = content[:-3]
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

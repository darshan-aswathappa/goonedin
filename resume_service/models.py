from pydantic import BaseModel
from typing import Optional


class AnalyzeResponse(BaseModel):
    education: list[str]
    certifications: list[str]
    skills: list[str]
    project_keywords: list[str]
    summary: str


class MatchRequest(BaseModel):
    resume_skills: list[str]
    resume_project_keywords: list[str]
    must_have_keywords: list[str]
    good_to_have_keywords: list[str]


class MatchResult(BaseModel):
    score: float
    matched_must_have: list[str]
    missing_must_have: list[str]
    matched_good_to_have: list[str]


class MatchResponse(BaseModel):
    match: Optional[MatchResult]

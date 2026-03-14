from pydantic import BaseModel


class AnalyzeResponse(BaseModel):
    education: list[str]
    certifications: list[str]
    skills: list[str]
    project_keywords: list[str]
    summary: str

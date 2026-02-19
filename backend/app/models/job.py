from pydantic import BaseModel, HttpUrl, Field, ConfigDict
from typing import Optional
from datetime import datetime

class JobBase(BaseModel):
    """
    The essence of what we are hunting.
    """
    title: str = Field(..., description="The job title, e.g. 'Senior Python Dev'")
    company: str = Field(..., description="Company name")
    location: str = Field(..., description="Remote, NYC, etc.")
    url: HttpUrl = Field(..., description="Direct link to apply")
    source: str = Field(..., description="Where we found it (LinkedIn, Glassdoor)")
    posted_at: Optional[datetime] = Field(default_factory=datetime.utcnow)
    
    # Optional fields (used by JobrightMiniSites)
    salary: Optional[str] = Field(default=None, description="Salary range if available")
    work_model: Optional[str] = Field(default=None, description="Remote, Hybrid, On-site")
    
    # We want to track if we've already alerted you about this one
    is_new: bool = True

class JobCreate(JobBase):
    """
    Used when we first scrape the data.
    """
    external_id: str = Field(..., description="Unique ID from the source (e.g., LinkedIn Job ID)")

class Job(JobBase):
    """
    The full object stored in our database/cache.
    """
    model_config = ConfigDict(from_attributes=True)

    id: int
    external_id: str
    created_at: datetime
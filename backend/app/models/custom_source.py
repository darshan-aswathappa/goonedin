from pydantic import BaseModel, HttpUrl, Field
from typing import Optional

class CustomJobSource(BaseModel):
    id: str = Field(..., description="Unique slug for the source, e.g. 'greenhouse-stripe'")
    name: str = Field(..., description="Display name for the tab, e.g. 'Stripe'")
    icon: str = Field(..., description="Phosphor icon name, e.g. 'StripeLogo'")
    url: HttpUrl = Field(..., description="The URL to scrape jobs from")
    ttl_hours: int = Field(24, description="How long to keep jobs from this source visible")
    interval_minutes: int = Field(60, description="How often to scrape the source")

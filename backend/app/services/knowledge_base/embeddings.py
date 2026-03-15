"""
pgvector semantic search layer for the GoOneIn knowledge base.

Architecture decisions:
  - Embedding model: text-embedding-3-small (OpenAI) via DeepSeek-compatible endpoint,
    OR a local sentence-transformers model as fallback.
  - We embed: title + summary + must_have_keywords + good_to_have_keywords per job.
    This gives the richest semantic surface without noise from raw job descriptions.
  - Storage: pgvector extension in Supabase (job_embeddings table — see migration below).
  - Retrieval: cosine similarity, top-K with configurable threshold.
  - Hybrid queries: vector results are filtered post-retrieval by SQL predicates.

Required Supabase migration (run once):
    CREATE EXTENSION IF NOT EXISTS vector;

    CREATE TABLE job_embeddings (
        external_id     TEXT PRIMARY KEY REFERENCES job_analysis_cache(external_id),
        embedding       vector(1536),         -- matches text-embedding-3-small dimensions
        embedded_text   TEXT,                 -- the text that was embedded (for debugging)
        embedded_at     TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX ON job_embeddings USING ivfflat (embedding vector_cosine_ops)
        WITH (lists = 100);

    -- Function for similarity search (called from Python)
    CREATE OR REPLACE FUNCTION match_job_embeddings(
        query_embedding  vector(1536),
        match_threshold  float,
        match_count      int
    )
    RETURNS TABLE (
        external_id  TEXT,
        similarity   float
    )
    LANGUAGE plpgsql
    AS $$
    BEGIN
        RETURN QUERY
        SELECT
            je.external_id,
            1 - (je.embedding <=> query_embedding) AS similarity
        FROM job_embeddings je
        WHERE 1 - (je.embedding <=> query_embedding) > match_threshold
        ORDER BY je.embedding <=> query_embedding
        LIMIT match_count;
    END;
    $$;
"""

import asyncio
import json
import logging
from typing import Any, Optional

import httpx
from openai import AsyncOpenAI

from app.core.config import get_settings

logger = logging.getLogger("KnowledgeBase.Embeddings")
settings = get_settings()

# Embedding dimensions for text-embedding-3-small
EMBEDDING_DIMENSIONS = 1536

# Similarity threshold: jobs below this score are excluded.
# 0.70 is a solid threshold for semantic job matching — loose enough to catch
# paraphrasing, tight enough to exclude noise.
DEFAULT_SIMILARITY_THRESHOLD = 0.70

# Maximum results returned from vector search.
DEFAULT_TOP_K = 20


def build_job_embedding_text(
    title: str,
    summary: Optional[str],
    must_have_keywords: list[str],
    good_to_have_keywords: list[str],
    minimum_qualifications: Optional[list[str]] = None,
    company: Optional[str] = None,
    location: Optional[str] = None,
) -> str:
    """
    Build the canonical text representation of a job for embedding.

    Design rationale:
    - Title gets repeated first (highest signal for "what kind of job is this?")
    - Summary adds semantic context that keywords alone miss
    - Keywords are joined as comma-separated to keep them as token units
    - Qualifications added for seniority signal (e.g., "5+ years", "PhD")
    - Company and location are optional context (useful for hybrid queries)
    - No newlines in the final string — single dense paragraph for embedding
    - Max ~300 tokens total to stay well within 8192-token model limit
    """
    parts: list[str] = []

    if title:
        # Repeat title twice to upweight it in the embedding
        parts.append(f"Job Title: {title}. {title}.")

    if company:
        parts.append(f"Company: {company}.")

    if location:
        parts.append(f"Location: {location}.")

    if summary:
        # Truncate to ~500 chars to stay within token budget
        truncated_summary = summary[:500] + ("..." if len(summary) > 500 else "")
        parts.append(f"Summary: {truncated_summary}")

    if must_have_keywords:
        parts.append(f"Required skills: {', '.join(must_have_keywords[:20])}.")

    if good_to_have_keywords:
        parts.append(f"Preferred skills: {', '.join(good_to_have_keywords[:15])}.")

    if minimum_qualifications:
        parts.append(f"Qualifications: {', '.join(minimum_qualifications[:10])}.")

    return " ".join(parts)


async def embed_text(text: str) -> Optional[list[float]]:
    """
    Embed a single text string using the configured embedding model.

    Primary: OpenAI text-embedding-3-small via DeepSeek's OpenAI-compatible endpoint.
    Note: DeepSeek's base URL is for chat completions. For embeddings, we use the
    standard OpenAI endpoint unless EMBEDDING_API_URL is set in config.

    Falls back to None on any error — callers should handle gracefully.
    """
    api_key = getattr(settings, "OPENAI_API_KEY", None) or settings.DEEPSEEK_API_KEY
    base_url = getattr(settings, "EMBEDDING_API_URL", None)  # Optional override

    try:
        # Use standard OpenAI endpoint for embeddings (DeepSeek doesn't offer embeddings)
        # If EMBEDDING_API_URL is set, use that (e.g. for a self-hosted model)
        client_kwargs: dict[str, Any] = {"api_key": api_key}
        if base_url:
            client_kwargs["base_url"] = base_url

        client = AsyncOpenAI(**client_kwargs)

        response = await client.embeddings.create(
            model="text-embedding-3-small",
            input=text,
            dimensions=EMBEDDING_DIMENSIONS,
        )
        return response.data[0].embedding

    except Exception as e:
        logger.error(f"[Embeddings] Failed to embed text: {e}")
        return None


async def embed_batch(texts: list[str], batch_size: int = 100) -> list[Optional[list[float]]]:
    """
    Embed multiple texts with batching to stay within API rate limits.
    Returns a list of embeddings (or None for any that failed).
    """
    results: list[Optional[list[float]]] = []

    api_key = getattr(settings, "OPENAI_API_KEY", None) or settings.DEEPSEEK_API_KEY
    base_url = getattr(settings, "EMBEDDING_API_URL", None)

    client_kwargs: dict[str, Any] = {"api_key": api_key}
    if base_url:
        client_kwargs["base_url"] = base_url

    client = AsyncOpenAI(**client_kwargs)

    for i in range(0, len(texts), batch_size):
        batch = texts[i:i + batch_size]
        try:
            response = await client.embeddings.create(
                model="text-embedding-3-small",
                input=batch,
                dimensions=EMBEDDING_DIMENSIONS,
            )
            batch_embeddings = [item.embedding for item in response.data]
            results.extend(batch_embeddings)
        except Exception as e:
            logger.error(f"[Embeddings] Batch {i//batch_size} failed: {e}")
            results.extend([None] * len(batch))

    return results


async def upsert_job_embedding(
    supabase: Any,
    external_id: str,
    embedding: list[float],
    embedded_text: str,
) -> bool:
    """
    Upsert a job embedding into the job_embeddings table.
    Uses Supabase's REST API (supabase-py) since we don't need asyncpg here.
    """
    try:
        row = {
            "external_id": external_id,
            "embedding": embedding,  # supabase-py handles vector serialization
            "embedded_text": embedded_text[:1000],  # Store truncated for debugging
        }
        await asyncio.to_thread(
            lambda: supabase.table("job_embeddings")
            .upsert(row, on_conflict="external_id")
            .execute()
        )
        return True
    except Exception as e:
        logger.error(f"[Embeddings] Failed to upsert embedding for {external_id}: {e}")
        return False


async def embed_and_index_job(supabase: Any, cache_row: dict[str, Any]) -> bool:
    """
    Given a completed job_analysis_cache row, build the embedding text,
    generate the embedding, and store it. Called from the queue worker
    after a successful analysis.

    Args:
        supabase:  Supabase client
        cache_row: A row from job_analysis_cache with analysis JSONB

    Returns:
        True if embedding was stored successfully, False otherwise.
    """
    external_id = cache_row.get("external_id")
    if not external_id:
        return False

    analysis = cache_row.get("analysis") or {}
    if isinstance(analysis, str):
        try:
            analysis = json.loads(analysis)
        except Exception:
            analysis = {}

    # Fetch title and company from scraped_jobs (latest record with this external_id)
    title = ""
    company = ""
    try:
        resp = await asyncio.to_thread(
            lambda: supabase.table("scraped_jobs")
            .select("title, company")
            .eq("external_id", external_id)
            .limit(1)
            .execute()
        )
        if resp.data:
            title = resp.data[0].get("title", "")
            company = resp.data[0].get("company", "")
    except Exception as e:
        logger.warning(f"[Embeddings] Could not fetch title for {external_id}: {e}")

    embedded_text = build_job_embedding_text(
        title=title,
        summary=analysis.get("summary"),
        must_have_keywords=analysis.get("must_have_keywords", []),
        good_to_have_keywords=analysis.get("good_to_have_keywords", []),
        minimum_qualifications=analysis.get("minimum_qualifications", []),
        company=company,
    )

    if not embedded_text.strip():
        logger.warning(f"[Embeddings] No text to embed for {external_id}")
        return False

    embedding = await embed_text(embedded_text)
    if embedding is None:
        return False

    return await upsert_job_embedding(supabase, external_id, embedding, embedded_text)


async def search_similar_jobs(
    query_text: str,
    supabase: Any,
    top_k: int = DEFAULT_TOP_K,
    similarity_threshold: float = DEFAULT_SIMILARITY_THRESHOLD,
) -> list[dict[str, Any]]:
    """
    Perform semantic similarity search over job embeddings.

    Flow:
      1. Embed the query text
      2. Call the match_job_embeddings Postgres function via Supabase RPC
      3. Fetch full job details for the matching external_ids
      4. Return enriched results sorted by similarity score

    Returns list of dicts: {external_id, similarity, title, company, location,
                             salary, visa, summary, must_have_keywords, ...}
    """
    if not query_text.strip():
        return []

    # Step 1: embed the query
    query_embedding = await embed_text(query_text)
    if query_embedding is None:
        logger.error("[Embeddings] Could not embed query text — returning empty results")
        return []

    # Step 2: call the RPC function for cosine similarity search
    try:
        rpc_result = await asyncio.to_thread(
            lambda: supabase.rpc(
                "match_job_embeddings",
                {
                    "query_embedding": query_embedding,
                    "match_threshold": similarity_threshold,
                    "match_count": top_k,
                },
            ).execute()
        )
        matched = rpc_result.data or []
    except Exception as e:
        logger.error(f"[Embeddings] RPC search failed: {e}")
        return []

    if not matched:
        return []

    # Step 3: fetch job details for the matching external_ids
    external_ids = [m["external_id"] for m in matched]
    similarity_map = {m["external_id"]: m["similarity"] for m in matched}

    try:
        cache_resp = await asyncio.to_thread(
            lambda: supabase.table("job_analysis_cache")
            .select("external_id, job_url, analysis, salary, visa, analyzed_at")
            .in_("external_id", external_ids)
            .execute()
        )
        cache_rows = {r["external_id"]: r for r in (cache_resp.data or [])}
    except Exception as e:
        logger.error(f"[Embeddings] Failed to fetch cache rows after vector search: {e}")
        cache_rows = {}

    # Fetch titles/companies from scraped_jobs (one representative row per external_id)
    try:
        job_resp = await asyncio.to_thread(
            lambda: supabase.table("scraped_jobs")
            .select("external_id, title, company, location, source")
            .in_("external_id", external_ids)
            .execute()
        )
        # Keep one row per external_id (multiple users may have the same job)
        job_rows: dict[str, dict] = {}
        for r in (job_resp.data or []):
            eid = r["external_id"]
            if eid not in job_rows:
                job_rows[eid] = r
    except Exception as e:
        logger.error(f"[Embeddings] Failed to fetch job details after vector search: {e}")
        job_rows = {}

    # Step 4: assemble enriched results
    results = []
    for eid in external_ids:
        cache = cache_rows.get(eid, {})
        job = job_rows.get(eid, {})
        analysis = cache.get("analysis") or {}
        if isinstance(analysis, str):
            try:
                analysis = json.loads(analysis)
            except Exception:
                analysis = {}

        results.append({
            "external_id": eid,
            "similarity": round(similarity_map.get(eid, 0.0), 4),
            "title": job.get("title", "Unknown"),
            "company": job.get("company", "Unknown"),
            "location": job.get("location", ""),
            "source": job.get("source", ""),
            "url": cache.get("job_url", ""),
            "salary": cache.get("salary"),
            "visa": cache.get("visa"),
            "summary": analysis.get("summary", ""),
            "must_have_keywords": analysis.get("must_have_keywords", []),
            "good_to_have_keywords": analysis.get("good_to_have_keywords", []),
        })

    # Sort by similarity descending (RPC already sorts, but re-sort after enrichment)
    results.sort(key=lambda x: x["similarity"], reverse=True)
    return results


def format_vector_results_for_llm(results: list[dict[str, Any]]) -> str:
    """
    Format vector search results into a compact text blob for the synthesizer.
    """
    if not results:
        return "Vector search returned no results above the similarity threshold."

    lines = [f"Semantic search returned {len(results)} matching jobs:\n"]
    for i, r in enumerate(results[:15], 1):
        keywords = ", ".join(r.get("must_have_keywords", [])[:8])
        lines.append(
            f"{i}. [{r['similarity']:.2f}] {r['title']} @ {r['company']} | "
            f"{r.get('location', 'N/A')} | {r.get('salary', 'N/A')} | "
            f"Visa: {r.get('visa', 'N/A')}"
        )
        if r.get("summary"):
            lines.append(f"   {r['summary'][:120]}...")
        if keywords:
            lines.append(f"   Skills: {keywords}")
    return "\n".join(lines)

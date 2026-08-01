/**
 * Experience filter.
 *
 * `min_exp` is the minimum required years of experience extracted by the AI
 * analysis (highest required years; 0 when none/seniority-only). A `null`/
 * `undefined` value means the job hasn't been analyzed for experience yet, so
 * we never hide it — unknown jobs are always shown.
 */
export function exceedsExperience(
  minExp: number | null | undefined,
  maxYears: number
): boolean {
  if (minExp == null) return false; // unknown → keep
  return minExp > maxYears;
}

export function filterByMaxExperience<T extends { min_exp?: number | null }>(
  jobs: T[],
  enabled: boolean,
  maxYears: number
): T[] {
  if (!enabled) return jobs;
  return jobs.filter((job) => !exceedsExperience(job.min_exp, maxYears));
}

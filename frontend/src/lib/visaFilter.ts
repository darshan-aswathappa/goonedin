/** Matches visa text that explicitly rules out sponsorship, e.g. "Not eligible for sponsorship". */
export function isSponsorshipIneligible(visa?: string | null): boolean {
  if (!visa) return false;
  const vLower = visa.toLowerCase();
  return (
    (vLower.includes("without") && vLower.includes("sponsorship")) ||
    vLower.includes("not eligible") ||
    vLower.includes("does not sponsor") ||
    vLower.includes("no sponsorship") ||
    (vLower.includes("eligible") && vLower.includes("without"))
  );
}

export function filterSponsorshipEligible<T extends { visa?: string | null }>(
  jobs: T[],
  hideIneligible: boolean
): T[] {
  if (!hideIneligible) return jobs;
  return jobs.filter((job) => !isSponsorshipIneligible(job.visa));
}

import { z } from 'zod';
import { fetchJson } from './http.js';

const summarySchema = z.object({
  title: z.string(),
  description: z.string().optional(),
  // Plain text. The API also offers extract_html, which we deliberately never use,
  // so no upstream HTML can reach the page.
  extract: z.string(),
  thumbnail: z.object({ source: z.string() }).optional(),
  content_urls: z.object({ desktop: z.object({ page: z.string() }) }),
});

export type WikipediaSummary = z.infer<typeof summarySchema>;

// Wikimedia's API policy asks clients to identify themselves with a
// descriptive User-Agent that includes a way to reach the maintainer.
const USER_AGENT = 'TravelPlanner/1.0 (https://github.com/AliSAkbari/travel-planner)';

/** The article summary for an exact Wikipedia title, e.g. "New_York_City". */
export function fetchSummary(title: string): Promise<WikipediaSummary> {
  return fetchJson(
    'wikipedia',
    `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`,
    summarySchema,
    { 'User-Agent': USER_AGENT },
  );
}

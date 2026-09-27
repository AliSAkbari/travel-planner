import type { WikipediaSummary } from '../clients/wikipedia.client.js';
import { CITIES, findCity, type City } from '../data/cities.js';
import { HttpError } from '../utils/httpError.js';
import { TtlCache } from '../utils/ttlCache.js';

export interface CitySummary {
  cityId: string;
  title: string;
  /** Wikipedia's one-line description, e.g. "City in Alberta, Canada". */
  description: string | null;
  /** Plain-text introduction. Never HTML, so it is always safe to render. */
  extract: string;
  thumbnailUrl: string | null;
  /** Link back to the article, crediting the source. */
  wikiUrl: string;
}

export interface CityServiceDeps {
  fetchSummary: (title: string) => Promise<WikipediaSummary>;
}

// Article introductions change rarely; a day keeps Wikipedia traffic minimal.
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export function createCityService({ fetchSummary }: CityServiceDeps) {
  const cache = new TtlCache<CitySummary>(CACHE_TTL_MS);

  /** The selectable cities, without internal fields such as the Wikipedia title. */
  function listCities() {
    return CITIES.map(({ id, name, country }) => ({ id, name, country }));
  }

  /** Resolves a city id from the URL, or 404s. Every data endpoint goes through this. */
  function getCity(id: string): City {
    const city = findCity(id);
    if (!city) throw new HttpError(404, 'CITY_NOT_FOUND', `Unknown city: ${id}`);
    return city;
  }

  async function getSummary(city: City): Promise<CitySummary> {
    return cache.getOrLoad(city.id, async () => {
      const summary = await fetchSummary(city.wikiTitle);
      return {
        cityId: city.id,
        title: summary.title,
        description: summary.description ?? null,
        extract: summary.extract,
        thumbnailUrl: summary.thumbnail?.source ?? null,
        wikiUrl: summary.content_urls.desktop.page,
      };
    });
  }

  return { listCities, getCity, getSummary };
}

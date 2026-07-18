/**
 * Загружает камеры фиксации скорости через наш прокси-эндпоинт:
 * БД (постоянные) + OSM + Waze live.
 * Кэш в localStorage на 30 мин — Waze обновляется чаще OSM.
 */

const CACHE_KEY = 'osm_cameras_v2';
const CACHE_TTL = 30 * 60 * 1000; // 30 мин

export interface OsmCamera {
  id: number | string;
  lat: number;
  lon: number;
  name?: string;
  direction?: number;
  maxspeed?: string;
  _source?: string;
}

interface CacheEntry { ts: number; city: string; cameras: OsmCamera[] }

function loadCache(city: string): OsmCamera[] | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const entry: CacheEntry = JSON.parse(raw);
    if (entry.city !== city) return null;
    if (Date.now() - entry.ts > CACHE_TTL) return null;
    return entry.cameras;
  } catch { return null; }
}

function saveCache(city: string, cameras: OsmCamera[]) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), city, cameras }));
  } catch { /* ignore quota */ }
}

export async function fetchOsmCameras(city = 'blagoveshchensk'): Promise<OsmCamera[]> {
  const cached = loadCache(city);
  if (cached) return cached;

  try {
    const res = await fetch(`/api/dps-radar/osm-cameras?city=${encodeURIComponent(city)}`);
    if (!res.ok) throw new Error(`API ${res.status}`);

    const json = await res.json() as {
      elements: Array<{
        id: number | string; lat: number; lon: number;
        tags?: Record<string, string>; _source?: string;
      }>;
    };

    const cameras: OsmCamera[] = (json.elements ?? []).map(el => ({
      id:        el.id,
      lat:       el.lat,
      lon:       el.lon,
      name:      el.tags?.['name'] ?? el.tags?.['description'],
      direction: el.tags?.['direction'] ? parseInt(el.tags['direction']) : undefined,
      maxspeed:  el.tags?.['maxspeed'],
      _source:   el._source,
    }));

    saveCache(city, cameras);
    return cameras;
  } catch (err) {
    console.warn('[OSM cameras] fetch failed:', err);
    return [];
  }
}

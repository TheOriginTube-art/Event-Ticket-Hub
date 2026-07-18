/**
 * Загружает камеры фиксации скорости из БД по видимой области карты.
 */

export interface OsmCamera {
  id: number | string;
  lat: number;
  lon: number;
  name?: string;
  direction?: number;
  maxspeed?: string;
  _source?: string;
}

export interface MapBounds {
  minLat: number; maxLat: number;
  minLng: number; maxLng: number;
}

// In-memory кэш: если bounds почти те же — не перезапрашиваем
let boundsCache: { bounds: MapBounds; cameras: OsmCamera[]; ts: number } | null = null;
const CACHE_TTL = 5 * 60 * 1000; // 5 мин

function boundsChanged(a: MapBounds, b: MapBounds, threshold = 0.05): boolean {
  return (
    Math.abs(a.minLat - b.minLat) > threshold ||
    Math.abs(a.maxLat - b.maxLat) > threshold ||
    Math.abs(a.minLng - b.minLng) > threshold ||
    Math.abs(a.maxLng - b.maxLng) > threshold
  );
}

export async function fetchCamerasInBounds(bounds: MapBounds): Promise<OsmCamera[]> {
  if (
    boundsCache &&
    Date.now() - boundsCache.ts < CACHE_TTL &&
    !boundsChanged(boundsCache.bounds, bounds)
  ) {
    return boundsCache.cameras;
  }

  try {
    const { minLat, maxLat, minLng, maxLng } = bounds;
    const url = `/api/dps-radar/cameras-in-bounds?minLat=${minLat}&maxLat=${maxLat}&minLng=${minLng}&maxLng=${maxLng}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`API ${res.status}`);

    const json = await res.json() as {
      elements: Array<{
        id: number | string; lat: number; lon: number;
        tags?: Record<string, string>; _source?: string;
      }>;
    };

    const cameras: OsmCamera[] = (json.elements ?? []).map(el => ({
      id:       el.id,
      lat:      el.lat,
      lon:      el.lon,
      name:     el.tags?.['name'],
      maxspeed: el.tags?.['maxspeed'],
      _source:  el._source,
    }));

    boundsCache = { bounds, cameras, ts: Date.now() };
    return cameras;
  } catch (err) {
    console.warn('[cameras] fetch failed:', err);
    return boundsCache?.cameras ?? [];
  }
}

// Обратная совместимость — старый вызов по городу больше не нужен,
// но оставляем экспорт чтобы не ломать возможные другие импорты.
export async function fetchOsmCameras(_city = 'blagoveshchensk'): Promise<OsmCamera[]> {
  return [];
}

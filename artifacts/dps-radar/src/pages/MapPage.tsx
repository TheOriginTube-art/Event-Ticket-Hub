import React from 'react';
import * as L from 'leaflet';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Navigation, Settings, MapPin, X, Check, Trash2, Camera } from 'lucide-react';
import { useListDpsEvents, useGetDpsStats } from '@workspace/api-client-react';
import { GeocodeResult, useGeocodeSearch } from '@/lib/nominatim';
import { fetchOsrmRoute, calculateAvoidanceWaypoints, RouteResult } from '@/lib/osrm';
import { fetchOsmCameras, OsmCamera } from '@/lib/osmCameras';

function escHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// City config for centering the map
const CITY_CONFIG: Record<string, { name: string; lat: number; lng: number }> = {
  blagoveshchensk: { name: 'Благовещенск', lat: 50.2906, lng: 127.5272 },
  khabarovsk: { name: 'Хабаровск', lat: 48.4827, lng: 135.0839 },
};
const DEFAULT_CITY = 'blagoveshchensk';

/** Читает ?city= из URL или возвращает дефолт */
function getCityFromUrl(): string {
  const params = new URLSearchParams(window.location.search);
  const city = params.get('city') ?? DEFAULT_CITY;
  return CITY_CONFIG[city] ? city : DEFAULT_CITY;
}

// ─── Иконки ──────────────────────────────────────────────────────────────────
const makeCircleIcon = (color: string, size: number, border = '#1e293b') =>
  L.divIcon({
    className: 'custom-div-icon',
    html: `<div style="background:${color};width:${size}px;height:${size}px;border-radius:50%;border:2.5px solid ${border};box-shadow:0 0 8px rgba(0,0,0,.5)"></div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -size / 2],
  });

const dpsIcon      = makeCircleIcon('hsl(45,93%,47%)', 24);   // amber — пост ДПС
const cameraIcon   = makeCircleIcon('hsl(187,86%,53%)', 16);  // cyan — камера (меньше!)
const accidentIcon = makeCircleIcon('hsl(0,84%,60%)', 22);    // red — авария
const originIcon   = makeCircleIcon('#3b82f6', 20);
const destIcon     = makeCircleIcon('#10b981', 20);
const customIcon   = makeCircleIcon('#a855f7', 20, '#7c3aed'); // purple — своя метка

// ─── Своя метка (localStorage) ────────────────────────────────────────────────
const STORAGE_KEY = 'dps_custom_markers_v1';
interface CustomMarker { id: string; lat: number; lng: number; label: string }

function loadCustomMarkers(): CustomMarker[] {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]'); }
  catch { return []; }
}
function saveCustomMarkers(markers: CustomMarker[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(markers));
}

// ─── GPS позиция + скорость ───────────────────────────────────────────────────
interface GpsPos { lat: number; lng: number; speed: number | null }

function useGpsPosition() {
  const [pos, setPos] = React.useState<GpsPos | null>(null);
  React.useEffect(() => {
    if (!navigator.geolocation) return;
    const id = navigator.geolocation.watchPosition(
      (p) => setPos({
        lat:   p.coords.latitude,
        lng:   p.coords.longitude,
        speed: p.coords.speed != null ? Math.round(p.coords.speed * 3.6) : null,
      }),
      () => {},
      { enableHighAccuracy: true },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, []);
  return pos;
}

// ─── Расстояние Haversine (метры) ─────────────────────────────────────────────
function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R  = 6_371_000;
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lon2 - lon1) * Math.PI / 180;
  const a  = Math.sin(Δφ/2)**2 + Math.cos(φ1)*Math.cos(φ2)*Math.sin(Δλ/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ─── Настройки (localStorage) ─────────────────────────────────────────────────
const SETTINGS_KEY = 'dps_radar_settings_v1';
interface RadarSettings { showPosts: boolean; showCameras: boolean; showAccidents: boolean; speedLimit: number }
const DEFAULT_SETTINGS: RadarSettings = { showPosts: true, showCameras: true, showAccidents: true, speedLimit: 60 };

function loadSettings(): RadarSettings {
  try { return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}') }; }
  catch { return DEFAULT_SETTINGS; }
}
function saveSettings(s: RadarSettings) { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); }

// ─────────────────────────────────────────────────────────────────────────────
export default function MapPage() {
  const citySlug = React.useMemo(() => getCityFromUrl(), []);
  const cityConfig = CITY_CONFIG[citySlug] ?? CITY_CONFIG[DEFAULT_CITY];

  const mapRef           = React.useRef<L.Map | null>(null);
  const mapContainerRef  = React.useRef<HTMLDivElement>(null);
  const eventsLayerRef   = React.useRef<L.LayerGroup>(new L.LayerGroup());
  const customLayerRef   = React.useRef<L.LayerGroup>(new L.LayerGroup());
  const osmCameraLayerRef = React.useRef<L.LayerGroup>(new L.LayerGroup());
  const routeLayerRef    = React.useRef<L.GeoJSON | null>(null);

  // маршрут
  const [fromQuery, setFromQuery] = React.useState('');
  const [toQuery,   setToQuery]   = React.useState('');
  const [fromPoint, setFromPoint] = React.useState<GeocodeResult | null>(null);
  const [toPoint,   setToPoint]   = React.useState<GeocodeResult | null>(null);
  const [isSearchingFrom, setIsSearchingFrom] = React.useState(false);
  const [isSearchingTo,   setIsSearchingTo]   = React.useState(false);
  const [routeResult, setRouteResult] = React.useState<RouteResult | null>(null);
  const [isRouting,   setIsRouting]   = React.useState(false);

  // настройки
  const [settings,     setSettings]     = React.useState<RadarSettings>(loadSettings);
  const [showSettings, setShowSettings] = React.useState(false);

  // своя метка
  const [customMarkers,   setCustomMarkers]   = React.useState<CustomMarker[]>(loadCustomMarkers);
  const [isAddingMarker,  setIsAddingMarker]  = React.useState(false);
  const [pendingCoords,   setPendingCoords]   = React.useState<{lat:number;lng:number}|null>(null);
  const [newMarkerLabel,  setNewMarkerLabel]  = React.useState('');
  const isAddingRef = React.useRef(false); // чтобы читать текущее значение внутри обработчика

  // OSM камеры
  const [osmCameras, setOsmCameras] = React.useState<OsmCamera[]>([]);

  // GPS позиция
  const gps = useGpsPosition();
  const speed = gps?.speed ?? null;

  // Ближайшая камера (OSM + репортованные) и предупреждение
  interface NearestCam { distM: number; limitKmh: number; label: string }
  const [nearestCam, setNearestCam] = React.useState<NearestCam | null>(null);

  const WARN_DIST  = 500; // оранжевое предупреждение, м
  const ALERT_DIST = 200; // красная рамка, м

  const isSpeeding = nearestCam != null &&
    nearestCam.distM <= ALERT_DIST &&
    speed != null && speed > nearestCam.limitKmh;
  const isApproaching = nearestCam != null && nearestCam.distM <= WARN_DIST;

  const { data: fromResults } = useGeocodeSearch(fromQuery, citySlug);
  const { data: toResults   } = useGeocodeSearch(toQuery,   citySlug);

  const { data: events, refetch: refetchEvents } = useListDpsEvents({ city: citySlug });
  const { data: stats,  refetch: refetchStats  } = useGetDpsStats({ city: citySlug });

  React.useEffect(() => {
    const id = setInterval(() => { void refetchEvents(); void refetchStats(); }, 30_000);
    return () => clearInterval(id);
  }, [refetchEvents, refetchStats]);

  // Сохраняем настройки при изменении
  React.useEffect(() => { saveSettings(settings); }, [settings]);

  // ── Инициализация карты ────────────────────────────────────────────────────
  React.useEffect(() => {
    const WebApp = (window as any).Telegram?.WebApp;
    if (WebApp) { WebApp.ready(); WebApp.expand(); }

    if (mapContainerRef.current && !mapRef.current) {
      const map = L.map(mapContainerRef.current, {
        center: [cityConfig.lat, cityConfig.lng], zoom: 13, zoomControl: false,
      });
      mapRef.current = map;

      L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '',
        subdomains: 'abcd', maxZoom: 20,
      }).addTo(map);

      // Скрываем атрибуцию Leaflet полностью
      map.attributionControl.remove();

      L.control.zoom({ position: 'bottomright' }).addTo(map);
      eventsLayerRef.current.addTo(map);
      osmCameraLayerRef.current.addTo(map);
      customLayerRef.current.addTo(map);

      // Клик по карте — добавление своей метки
      map.on('click', (e: L.LeafletMouseEvent) => {
        if (!isAddingRef.current) return;
        setPendingCoords({ lat: e.latlng.lat, lng: e.latlng.lng });
        setNewMarkerLabel('');
        setIsAddingMarker(false);
        isAddingRef.current = false;
      });
    }

    return () => {
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Синхронизируем ref с state для использования внутри замыкания карты
  React.useEffect(() => { isAddingRef.current = isAddingMarker; }, [isAddingMarker]);

  // ── Загрузка OSM камер ─────────────────────────────────────────────────────
  React.useEffect(() => {
    fetchOsmCameras().then(cams => setOsmCameras(cams));
  }, []);

  // ── Отрисовка OSM камер на карте ──────────────────────────────────────────
  React.useEffect(() => {
    const layer = osmCameraLayerRef.current;
    layer.clearLayers();
    if (!settings.showCameras) return;
    osmCameras.forEach(cam => {
      const marker = L.marker([cam.lat, cam.lon], { icon: cameraIcon });
      const limit  = cam.maxspeed ? `${cam.maxspeed} км/ч` : 'не указан';
      const name   = cam.name ?? 'Камера фиксации скорости';
      marker.bindPopup(`
        <div style="min-width:160px">
          <div style="font-weight:700;margin-bottom:4px">📷 ${escHtml(name)}</div>
          <div style="font-size:.8em;color:#94a3b8">Лимит: ${escHtml(limit)}</div>
          ${cam.direction != null ? `<div style="font-size:.75em;color:#94a3b8">Направление: ${cam.direction}°</div>` : ''}
          <div style="font-size:.7em;color:#475569;margin-top:4px">Источник: OpenStreetMap</div>
        </div>
      `);
      marker.addTo(layer);
    });
  }, [osmCameras, settings.showCameras]);

  // ── Proximity: ближайшая камера ───────────────────────────────────────────
  React.useEffect(() => {
    if (!gps) { setNearestCam(null); return; }

    let best: NearestCam | null = null;

    // OSM камеры
    osmCameras.forEach(cam => {
      const d = haversineMeters(gps.lat, gps.lng, cam.lat, cam.lon);
      const limit = cam.maxspeed ? parseInt(cam.maxspeed) : settings.speedLimit;
      if (!best || d < best.distM)
        best = { distM: d, limitKmh: isNaN(limit) ? settings.speedLimit : limit, label: cam.name ?? 'Камера' };
    });

    // Репортованные камеры из базы
    events?.filter(e => e.type === 'camera').forEach(ev => {
      const d = haversineMeters(gps.lat, gps.lng, ev.lat, ev.lng);
      if (!best || d < best.distM)
        best = { distM: d, limitKmh: settings.speedLimit, label: 'Камера (сообщение)' };
    });

    setNearestCam(best && (best as NearestCam).distM <= WARN_DIST ? best : null);
  }, [gps, osmCameras, events, settings.speedLimit]);

  // Курсор «прицел» когда добавляем метку
  React.useEffect(() => {
    if (!mapRef.current) return;
    const el = mapRef.current.getContainer();
    el.style.cursor = isAddingMarker ? 'crosshair' : '';
  }, [isAddingMarker]);

  // ── Отрисовка событий (посты, камеры, аварии) ─────────────────────────────
  React.useEffect(() => {
    const layer = eventsLayerRef.current;
    layer.clearLayers();

    events?.forEach(event => {
      if (event.type === 'dps_post' && !settings.showPosts) return;
      if (event.type === 'camera'   && !settings.showCameras) return;
      if (event.type === 'accident' && !settings.showAccidents) return;

      const icon =
        event.type === 'dps_post' ? dpsIcon :
        event.type === 'camera'   ? cameraIcon :
        accidentIcon;

      const typeLabel =
        event.type === 'dps_post' ? '🚔 ДПС Пост' :
        event.type === 'camera'   ? '📷 Камера' :
        '🚗💥 Авария';

      const marker = L.marker([event.lat, event.lng], { icon });
      marker.bindPopup(`
        <div style="min-width:160px">
          <div style="font-weight:700;margin-bottom:4px">${escHtml(typeLabel)}</div>
          <div style="font-size:.8em;margin-bottom:4px">${escHtml(event.address)}</div>
          <div style="font-size:.75em;color:#94a3b8">Добавил: ${escHtml(event.author)}</div>
          <div style="font-size:.75em;color:#94a3b8">${escHtml(String(event.minutesAgo))} мин. назад</div>
        </div>
      `);
      marker.addTo(layer);
    });

    // Точки маршрута
    if (fromPoint) L.marker([parseFloat(fromPoint.lat), parseFloat(fromPoint.lon)], { icon: originIcon }).addTo(layer);
    if (toPoint)   L.marker([parseFloat(toPoint.lat),   parseFloat(toPoint.lon)],   { icon: destIcon   }).addTo(layer);
  }, [events, fromPoint, toPoint, settings.showPosts, settings.showCameras, settings.showAccidents]);

  // ── Свои метки ─────────────────────────────────────────────────────────────
  React.useEffect(() => {
    const layer = customLayerRef.current;
    layer.clearLayers();

    customMarkers.forEach(cm => {
      const marker = L.marker([cm.lat, cm.lng], { icon: customIcon });
      marker.bindPopup(`
        <div style="min-width:140px">
          <div style="font-weight:700;margin-bottom:6px">📍 ${escHtml(cm.label)}</div>
          <button
            onclick="window.dispatchEvent(new CustomEvent('deleteCustomMarker',{detail:'${cm.id}'}))"
            style="font-size:.75em;color:#f87171;cursor:pointer;border:none;background:none;padding:0"
          >🗑 Удалить метку</button>
        </div>
      `);
      marker.addTo(layer);
    });
  }, [customMarkers]);

  // Обработчик удаления через всплывающее событие
  React.useEffect(() => {
    const handler = (e: Event) => {
      const id = (e as CustomEvent<string>).detail;
      setCustomMarkers(prev => {
        const next = prev.filter(m => m.id !== id);
        saveCustomMarkers(next);
        return next;
      });
    };
    window.addEventListener('deleteCustomMarker', handler);
    return () => window.removeEventListener('deleteCustomMarker', handler);
  }, []);

  // ── Маршрут ────────────────────────────────────────────────────────────────
  React.useEffect(() => {
    if (!mapRef.current) return;
    if (routeLayerRef.current) { mapRef.current.removeLayer(routeLayerRef.current); routeLayerRef.current = null; }
    if (routeResult) {
      routeLayerRef.current = L.geoJSON(routeResult.geometry as any, {
        style: { color: '#3b82f6', weight: 5, opacity: .8 },
      }).addTo(mapRef.current);
      const bounds = routeLayerRef.current.getBounds();
      if (bounds.isValid()) mapRef.current.fitBounds(bounds, { padding: [50, 50] });
    }
  }, [routeResult]);

  const handleCalculateRoute = async () => {
    if (!fromPoint || !toPoint) return;
    setIsRouting(true);
    setRouteResult(null);
    const start = { lat: parseFloat(fromPoint.lat), lon: parseFloat(fromPoint.lon) };
    const end   = { lat: parseFloat(toPoint.lat),   lon: parseFloat(toPoint.lon)   };
    try {
      const baseRoute = await fetchOsrmRoute([start, end]);
      if (baseRoute && events) {
        // Избегаем посты ДПС (не камеры)
        const dpsPosts = events.filter(e => e.type === 'dps_post').map(e => ({ lat: e.lat, lng: e.lng }));
        const waypoints = calculateAvoidanceWaypoints(baseRoute.geometry.coordinates as [number,number][], dpsPosts);
        if (waypoints.length > 0) {
          const final = await fetchOsrmRoute([start, ...waypoints, end]);
          if (final) { setRouteResult(final); return; }
        }
      }
      setRouteResult(baseRoute);
    } catch (e) { console.error(e); }
    finally { setIsRouting(false); }
  };

  const confirmAddMarker = () => {
    if (!pendingCoords || !newMarkerLabel.trim()) return;
    const marker: CustomMarker = {
      id: Date.now().toString(),
      lat: pendingCoords.lat,
      lng: pendingCoords.lng,
      label: newMarkerLabel.trim(),
    };
    setCustomMarkers(prev => { const next = [...prev, marker]; saveCustomMarkers(next); return next; });
    setPendingCoords(null);
    setNewMarkerLabel('');
  };

  const fmt = {
    dist: (m: number) => m > 1000 ? `${(m/1000).toFixed(1)} км` : `${Math.round(m)} м`,
    time: (s: number) => { const m = Math.round(s/60); return m > 60 ? `${Math.floor(m/60)} ч ${m%60} мин` : `${m} мин`; },
  };

  return (
    <div className="relative w-full h-[100dvh] flex flex-col bg-background overflow-hidden">

      {/* ── Карта ─────────────────────────────────────────────────────── */}
      <div ref={mapContainerRef} className="absolute inset-0 z-0" />

      {/* ── Анимации ─────────────────────────────────────────────────────── */}
      <style>{`
        @keyframes speedAlert  { 0%,100%{opacity:1} 50%{opacity:.3} }
        @keyframes camApproach { 0%,100%{opacity:1} 50%{opacity:.6} }
      `}</style>

      {/* Красная рамка — превышение у камеры */}
      {isSpeeding && (
        <div className="absolute inset-0 z-50 pointer-events-none"
          style={{ boxShadow:'inset 0 0 70px 25px rgba(239,68,68,0.8)', animation:'speedAlert 0.5s ease-in-out infinite' }} />
      )}

      {/* Оранжевая рамка — приближение к камере без превышения */}
      {isApproaching && !isSpeeding && (
        <div className="absolute inset-0 z-50 pointer-events-none"
          style={{ boxShadow:'inset 0 0 50px 15px rgba(251,146,60,0.5)', animation:'camApproach 1.2s ease-in-out infinite' }} />
      )}

      {/* ── Баннер камеры — появляется при приближении ───────────────────── */}
      {isApproaching && nearestCam && (
        <div className="absolute z-40 pointer-events-none left-1/2 -translate-x-1/2"
          style={{ top: 88 }}>
          <div className={`flex items-center gap-2 px-4 py-2 rounded-2xl shadow-2xl font-bold text-sm border ${
            isSpeeding
              ? 'bg-red-600/95 border-red-400 text-white'
              : 'bg-orange-500/95 border-orange-300 text-white'
          }`}>
            <Camera className="w-4 h-4 shrink-0" />
            <span>
              {isSpeeding ? '⚠️ ПРЕВЫШЕНИЕ ' : ''}
              📷 {Math.round(nearestCam.distM)} м · лимит {nearestCam.limitKmh} км/ч
            </span>
          </div>
        </div>
      )}

      {/* ── Спидометр — правый нижний угол ──────────────────────────────── */}
      {speed != null && (
        <div className="absolute z-40 pointer-events-none" style={{ bottom: 80, right: 16 }}>
          <div className={`flex flex-col items-center justify-center rounded-2xl font-black leading-none shadow-xl border-2 ${
            isSpeeding
              ? 'bg-red-600 border-red-400 text-white'
              : isApproaching
                ? 'bg-orange-500 border-orange-300 text-white'
                : 'bg-card/95 border-border text-foreground'
          }`} style={{ width: 64, height: 64 }}>
            <span className="text-2xl">{speed}</span>
            <span className="text-[9px] font-semibold tracking-wide opacity-80 mt-0.5">км/ч</span>
          </div>
          {/* Лимит под спидометром */}
          {nearestCam && (
            <div className={`text-center text-[9px] font-bold mt-1 drop-shadow ${isSpeeding ? 'text-red-400' : 'text-orange-400'}`}>
              лим. {nearestCam.limitKmh}
            </div>
          )}
        </div>
      )}

      {/* ── Верхний блок: поиск ────────────────────────────────────────── */}
      <div className="relative z-10 w-full p-4 flex flex-col gap-2 pointer-events-none">
        <Card className="pointer-events-auto bg-card/90 backdrop-blur-md border-card-border shadow-xl">
          <CardContent className="p-3 flex flex-col gap-3">
            {/* Метка города */}
            <div className="text-xs text-muted-foreground font-medium text-center">
              📍 {cityConfig.name}
            </div>

            {/* От */}
            <div className="relative">
              <div className="flex items-center bg-input/50 rounded-md border border-border focus-within:border-ring px-3 py-2">
                <div className="w-3 h-3 rounded-full bg-blue-500 mr-3 shrink-0" />
                <input
                  type="text"
                  placeholder="Откуда..."
                  className="bg-transparent border-none outline-none flex-1 text-sm text-foreground placeholder:text-muted-foreground"
                  value={fromPoint ? fromPoint.display_name : fromQuery}
                  onChange={e => { setFromQuery(e.target.value); setFromPoint(null); setIsSearchingFrom(true); }}
                  onFocus={() => setIsSearchingFrom(true)}
                  onBlur={() => setTimeout(() => setIsSearchingFrom(false), 200)}
                />
              </div>
              {isSearchingFrom && fromResults && fromResults.length > 0 && (
                <div className="absolute top-full left-0 w-full mt-1 bg-popover border border-border rounded-md shadow-lg overflow-hidden z-50">
                  {fromResults.map((r, i) => (
                    <div key={i} className="p-2 text-sm hover:bg-accent cursor-pointer truncate border-b border-border/50 last:border-0"
                      onClick={() => { setFromPoint(r); setFromQuery(''); setIsSearchingFrom(false); }}>
                      {r.display_name}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* До */}
            <div className="relative">
              <div className="flex items-center bg-input/50 rounded-md border border-border focus-within:border-ring px-3 py-2">
                <div className="w-3 h-3 rounded-full bg-emerald-500 mr-3 shrink-0" />
                <input
                  type="text"
                  placeholder="Куда..."
                  className="bg-transparent border-none outline-none flex-1 text-sm text-foreground placeholder:text-muted-foreground"
                  value={toPoint ? toPoint.display_name : toQuery}
                  onChange={e => { setToQuery(e.target.value); setToPoint(null); setIsSearchingTo(true); }}
                  onFocus={() => setIsSearchingTo(true)}
                  onBlur={() => setTimeout(() => setIsSearchingTo(false), 200)}
                />
              </div>
              {isSearchingTo && toResults && toResults.length > 0 && (
                <div className="absolute top-full left-0 w-full mt-1 bg-popover border border-border rounded-md shadow-lg overflow-hidden z-50">
                  {toResults.map((r, i) => (
                    <div key={i} className="p-2 text-sm hover:bg-accent cursor-pointer truncate border-b border-border/50 last:border-0"
                      onClick={() => { setToPoint(r); setToQuery(''); setIsSearchingTo(false); }}>
                      {r.display_name}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <Button disabled={!fromPoint || !toPoint || isRouting} onClick={handleCalculateRoute}
              className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-semibold">
              <Navigation className="w-4 h-4 mr-2" />
              {isRouting ? 'Построение...' : 'Маршрут (минуя посты)'}
            </Button>
          </CardContent>
        </Card>

        {routeResult && (
          <Card className="pointer-events-auto bg-card/90 backdrop-blur-md border-card-border shadow-xl">
            <CardContent className="p-3 flex items-center justify-between">
              <div>
                <div className="text-xs text-muted-foreground uppercase font-semibold tracking-wider">В пути</div>
                <div className="font-bold text-lg text-emerald-400">{fmt.time(routeResult.duration)}</div>
              </div>
              <div className="text-right">
                <div className="text-xs text-muted-foreground uppercase font-semibold tracking-wider">Дистанция</div>
                <div className="font-bold text-lg text-foreground">{fmt.dist(routeResult.distance)}</div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      <div className="flex-1" />

      {/* ── Диалог ввода метки ────────────────────────────────────────── */}
      {pendingCoords && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-card border border-border rounded-2xl p-5 w-72 shadow-2xl">
            <div className="flex items-center gap-2 mb-3">
              <MapPin className="w-4 h-4 text-purple-400" />
              <span className="font-semibold text-sm">Название метки</span>
            </div>
            <input
              autoFocus
              type="text"
              placeholder="Например: Для встреч"
              className="w-full bg-input/60 border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-ring mb-4 text-foreground placeholder:text-muted-foreground"
              value={newMarkerLabel}
              onChange={e => setNewMarkerLabel(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') confirmAddMarker(); if (e.key === 'Escape') { setPendingCoords(null); setNewMarkerLabel(''); } }}
            />
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => { setPendingCoords(null); setNewMarkerLabel(''); }}>
                <X className="w-4 h-4 mr-1" /> Отмена
              </Button>
              <Button className="flex-1 bg-purple-600 hover:bg-purple-700 text-white" disabled={!newMarkerLabel.trim()} onClick={confirmAddMarker}>
                <Check className="w-4 h-4 mr-1" /> Сохранить
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Нижняя панель ─────────────────────────────────────────────── */}
      <div className="relative z-10 w-full p-3 pb-safe pointer-events-none">
        <div className="pointer-events-auto flex items-center gap-2 bg-card/90 backdrop-blur-md border border-card-border shadow-xl rounded-2xl px-3 py-2">
          {/* Статистика */}
          <div className="flex items-center gap-3 text-xs font-medium flex-1 min-w-0">
            {settings.showPosts && (
              <div className="flex items-center gap-1.5 text-amber-400 whitespace-nowrap">
                <div className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse shrink-0" />
                ДПС: {stats?.dpsPostCount ?? 0}
              </div>
            )}
            {settings.showCameras && (
              <div className="flex items-center gap-1.5 text-cyan-400 whitespace-nowrap">
                <div className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse shrink-0" />
                Камеры: {stats?.cameraCount ?? 0}
              </div>
            )}
            {settings.showAccidents && (
              <div className="flex items-center gap-1.5 text-destructive whitespace-nowrap">
                <div className="w-2 h-2 rounded-full bg-destructive animate-pulse shrink-0" />
                ДТП: {stats?.accidentCount ?? 0}
              </div>
            )}
          </div>

          {/* Кнопка: добавить метку */}
          <button
            onClick={() => {
              if (isAddingMarker) { setIsAddingMarker(false); return; }
              setPendingCoords(null);
              setIsAddingMarker(true);
            }}
            title={isAddingMarker ? 'Нажмите на карту' : 'Добавить свою метку'}
            className={`flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-xl border transition-colors shrink-0 ${
              isAddingMarker
                ? 'bg-purple-600 border-purple-500 text-white'
                : 'bg-white/5 border-white/10 text-purple-400 hover:bg-white/10'
            }`}
          >
            <MapPin className="w-3.5 h-3.5" />
            {isAddingMarker ? 'Нажмите на карту' : 'Метка'}
          </button>

          {/* Кнопка настроек */}
          <button
            onClick={() => setShowSettings(true)}
            title="Настройки"
            className="flex items-center justify-center w-8 h-8 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-colors shrink-0"
          >
            <Settings className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>
      </div>

      {/* ── Панель настроек (bottom sheet) ────────────────────────────── */}
      {showSettings && (
        <div className="absolute inset-0 z-50 flex items-end" onClick={() => setShowSettings(false)}>
          <div
            className="w-full bg-card border-t border-border rounded-t-3xl p-5 pb-8 shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-5">
              <span className="font-bold text-base">Настройки отображения</span>
              <button onClick={() => setShowSettings(false)} className="text-muted-foreground hover:text-foreground transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Легенда */}
            <div className="flex items-center gap-3 mb-5 text-[11px] text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-full bg-amber-400 inline-block" /> Пост ДПС (24px)
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-cyan-400 inline-block" /> Камера (16px)
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-full bg-red-500 inline-block" /> Авария (22px)
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-full bg-purple-500 inline-block" /> Моя метка
              </span>
            </div>

            {/* Тогглы */}
            {[
              { key: 'showPosts' as const,     label: '🚔 Посты ДПС' },
              { key: 'showCameras' as const,   label: '📷 Камеры фиксации' },
              { key: 'showAccidents' as const, label: '🚗💥 Аварии' },
            ].map(({ key, label }) => (
              <div key={key} className="flex items-center justify-between py-3 border-b border-border/40 last:border-0">
                <span className="text-sm">{label}</span>
                <button
                  onClick={() => setSettings(s => ({ ...s, [key]: !s[key] }))}
                  className={`w-12 h-6 rounded-full transition-colors relative ${settings[key] ? 'bg-primary' : 'bg-muted'}`}
                >
                  <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${settings[key] ? 'left-6' : 'left-0.5'}`} />
                </button>
              </div>
            ))}

            {/* Лимит скорости */}
            <div className="mt-4">
              <div className="text-sm font-medium mb-3">⚡ Лимит скорости (предупреждение)</div>
              <div className="flex gap-2">
                {[40, 60, 90, 110].map(lim => (
                  <button
                    key={lim}
                    onClick={() => setSettings(s => ({ ...s, speedLimit: lim }))}
                    className={`flex-1 py-2 text-sm font-bold rounded-xl border transition-colors ${
                      settings.speedLimit === lim
                        ? 'bg-primary border-primary text-primary-foreground'
                        : 'bg-white/5 border-white/10 text-muted-foreground hover:bg-white/10'
                    }`}
                  >
                    {lim}
                  </button>
                ))}
              </div>
            </div>

            {/* Свои метки: список */}
            {customMarkers.length > 0 && (
              <div className="mt-4">
                <div className="text-sm font-medium mb-2">📍 Мои метки</div>
                <div className="flex flex-col gap-1 max-h-32 overflow-y-auto">
                  {customMarkers.map(m => (
                    <div key={m.id} className="flex items-center justify-between bg-white/5 rounded-lg px-3 py-1.5">
                      <span className="text-sm text-purple-300">{m.label}</span>
                      <button onClick={() => setCustomMarkers(prev => { const next = prev.filter(x => x.id !== m.id); saveCustomMarkers(next); return next; })}
                        className="text-muted-foreground hover:text-red-400 transition-colors ml-2">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}


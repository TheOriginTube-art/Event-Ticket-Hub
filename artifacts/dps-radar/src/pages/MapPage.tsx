import React from 'react';
import * as L from 'leaflet';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Navigation, Settings, MapPin, X, Check, Trash2, Camera, Play, Square, AlertTriangle, Send, User, Users, LocateFixed } from 'lucide-react';
import { useListDpsEvents, useGetDpsStats } from '@workspace/api-client-react';
import { GeocodeResult, useGeocodeSearch } from '@/lib/nominatim';
import { fetchOsrmRoute, calculateAvoidanceWaypoints, RouteResult } from '@/lib/osrm';
import { fetchCamerasInBounds, OsmCamera, VIOLATION_LABELS, hasSpeed } from '@/lib/osmCameras';

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

// ─── Иконки (эмодзи) ─────────────────────────────────────────────────────────
const makeEmojiIcon = (emoji: string, size = 28) =>
  L.divIcon({
    className: '',
    html: `<div style="font-size:${size}px;line-height:1;filter:drop-shadow(0 1px 3px rgba(0,0,0,.7))">${emoji}</div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -size / 2],
  });

const dpsIcon          = makeEmojiIcon('🚔', 28);  // пост ДПС
const cameraIcon       = makeEmojiIcon('📷', 22);  // камера
const accidentIcon     = makeEmojiIcon('💥', 26);  // авария
const originIcon       = makeEmojiIcon('🔵', 22);  // откуда
const destIcon         = makeEmojiIcon('🏁', 24);  // куда
const customIcon       = makeEmojiIcon('📍', 26);  // своя метка

// Иконка текущей позиции пользователя (навигация)
const userLocationIcon = L.divIcon({
  className: '',
  html: `<div style="font-size:28px;line-height:1;filter:drop-shadow(0 1px 4px rgba(0,0,0,.8))">🚗</div>`,
  iconSize: [28, 28],
  iconAnchor: [14, 14],
});

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
interface RadarSettings { showPosts: boolean; showCameras: boolean; showAccidents: boolean }
const DEFAULT_SETTINGS: RadarSettings = { showPosts: true, showCameras: true, showAccidents: true };

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
  const eventsLayerRef    = React.useRef<L.LayerGroup>(new L.LayerGroup());
  const customLayerRef    = React.useRef<L.LayerGroup>(new L.LayerGroup());
  const osmCameraLayerRef = React.useRef<L.LayerGroup>(new L.LayerGroup());
  const routeLayerRef     = React.useRef<L.GeoJSON | null>(null);
  const userMarkerRef     = React.useRef<L.Marker | null>(null);

  // маршрут
  const [fromQuery, setFromQuery] = React.useState('');
  const [toQuery,   setToQuery]   = React.useState('');
  const [fromPoint, setFromPoint] = React.useState<GeocodeResult | null>(null);
  const [toPoint,   setToPoint]   = React.useState<GeocodeResult | null>(null);
  const [isSearchingFrom, setIsSearchingFrom] = React.useState(false);
  const [isSearchingTo,   setIsSearchingTo]   = React.useState(false);
  const [routeResult,   setRouteResult]   = React.useState<RouteResult | null>(null);
  const [isRouting,     setIsRouting]     = React.useState(false);
  const [isNavigating,  setIsNavigating]  = React.useState(false);

  // настройки
  const [settings,     setSettings]     = React.useState<RadarSettings>(loadSettings);
  const [showSettings,     setShowSettings]     = React.useState(false);
  const [showRouteSearch,  setShowRouteSearch]  = React.useState(false);

  // своя метка
  const [customMarkers,   setCustomMarkers]   = React.useState<CustomMarker[]>(loadCustomMarkers);
  const [isAddingMarker,  setIsAddingMarker]  = React.useState(false);
  const [pendingCoords,   setPendingCoords]   = React.useState<{lat:number;lng:number}|null>(null);
  const [newMarkerLabel,  setNewMarkerLabel]  = React.useState('');
  const isAddingRef = React.useRef(false);

  // OSM камеры
  const [osmCameras, setOsmCameras] = React.useState<OsmCamera[]>([]);

  // Профиль и друзья
  type TgProfile = { telegramId: number; firstName: string; lastName?: string | null; username?: string | null; photoUrl?: string | null; shareLocation: boolean; reportCount: number; friendCount: number }
  type Friend    = { telegramId: number; firstName: string; lastName?: string | null; username?: string | null; friendshipId: number }
  type FriendLoc = { telegramId: number; firstName: string; lastLat: number; lastLng: number; lastLocAt: string }

  const [showProfileSheet, setShowProfileSheet] = React.useState(false);
  const [tgProfile,   setTgProfile]   = React.useState<TgProfile | null>(null);
  const [friends,     setFriends]     = React.useState<Friend[]>([]);
  const [pendingFr,   setPendingFr]   = React.useState<Friend[]>([]);
  const [friendLocs,  setFriendLocs]  = React.useState<FriendLoc[]>([]);
  const [shareLocation, setShareLocation] = React.useState(false);
  const [addUsername, setAddUsername] = React.useState('');
  const [addStatus,   setAddStatus]   = React.useState<'idle'|'loading'|'ok'|'notfound'|'error'>('idle');
  const [addMsg,      setAddMsg]      = React.useState('');
  const [syncStatus,  setSyncStatus]  = React.useState<'idle'|'syncing'|'ok'|'error'>('idle');
  const [syncError,   setSyncError]   = React.useState('');
  const friendLocLayerRef = React.useRef<L.LayerGroup>(new L.LayerGroup());

  const BASE = (import.meta.env.BASE_URL as string) ?? '/dps-radar/';

  // Читаем initData — у Telegram он синхронно доступен, но берём через ref
  // чтобы не создавать лишних зависимостей в useEffect
  const tgInitData = React.useMemo(() => {
    const tg = (window as Record<string,any>).Telegram?.WebApp;
    const d = tg?.initData as string | undefined;
    // Пустая строка тоже не годится
    return d && d.length > 0 ? d : undefined;
  }, []);

  // Репортинг события
  const [showReportDialog, setShowReportDialog] = React.useState(false);
  const [reportType,   setReportType]   = React.useState<'dps_post' | 'accident'>('dps_post');
  const [reportAddress, setReportAddress] = React.useState('');
  const [reportStatus, setReportStatus] = React.useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [reportError,  setReportError]  = React.useState('');

  // GPS позиция
  const gps = useGpsPosition();
  const speed = gps?.speed ?? null;

  // Ближайшая камера (OSM + репортованные) и предупреждение
  interface NearestCam { distM: number; limitKmh: number; label: string; violations: string[] }
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

  // Синхронизируем ref с state
  React.useEffect(() => { isAddingRef.current = isAddingMarker; }, [isAddingMarker]);

  // ── Навигация: следим за GPS и ведём карту за пользователем ───────────────
  React.useEffect(() => {
    if (!isNavigating || !gps || !mapRef.current) return;
    const map = mapRef.current;
    // Центрируем карту на позиции
    map.setView([gps.lat, gps.lng], Math.max(map.getZoom(), 16), { animate: true, duration: 0.5 });
    // Маркер позиции
    if (!userMarkerRef.current) {
      userMarkerRef.current = L.marker([gps.lat, gps.lng], { icon: userLocationIcon, zIndexOffset: 1000 }).addTo(map);
    } else {
      userMarkerRef.current.setLatLng([gps.lat, gps.lng]);
    }
  }, [isNavigating, gps]);

  // Убираем маркер позиции при выходе из навигации
  React.useEffect(() => {
    if (!isNavigating && userMarkerRef.current && mapRef.current) {
      mapRef.current.removeLayer(userMarkerRef.current);
      userMarkerRef.current = null;
    }
  }, [isNavigating]);

  // ── Маршрут к своей метке через кастомное событие ──────────────────────────
  React.useEffect(() => {
    const handler = (e: Event) => {
      const { lat, lng, label } = (e as CustomEvent<{ lat: number; lng: number; label: string }>).detail;
      setToPoint({ lat: String(lat), lon: String(lng), display_name: label });
      setToQuery('');
      // Если GPS доступен — ставим «Откуда» = текущая позиция
      if (gps) {
        setFromPoint({ lat: String(gps.lat), lon: String(gps.lng), display_name: 'Моё местоположение' });
      }
      // Закрываем попапы
      mapRef.current?.closePopup();
    };
    window.addEventListener('routeToMarker', handler);
    return () => window.removeEventListener('routeToMarker', handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gps]);

  // ── Загрузка камер по видимой области ─────────────────────────────────────
  const loadCamerasForCurrentBounds = React.useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    const b = map.getBounds();
    fetchCamerasInBounds({
      minLat: b.getSouth(),
      maxLat: b.getNorth(),
      minLng: b.getWest(),
      maxLng: b.getEast(),
    }).then(cams => setOsmCameras(cams));
  }, []);

  // Загрузка при монтировании (карта уже готова после первого useEffect)
  React.useEffect(() => {
    // Небольшая задержка — карта рендерится асинхронно
    const t = setTimeout(loadCamerasForCurrentBounds, 300);
    return () => clearTimeout(t);
  }, [loadCamerasForCurrentBounds]);

  // Перезагрузка при перемещении/зуме карты (дебаунс 600мс)
  React.useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    let timer: ReturnType<typeof setTimeout>;
    const onMove = () => {
      clearTimeout(timer);
      timer = setTimeout(loadCamerasForCurrentBounds, 600);
    };
    map.on('moveend', onMove);
    map.on('zoomend', onMove);
    return () => {
      map.off('moveend', onMove);
      map.off('zoomend', onMove);
      clearTimeout(timer);
    };
  }, [loadCamerasForCurrentBounds]);

  // ── Отрисовка OSM камер на карте (только камеры скорости) ────────────────
  React.useEffect(() => {
    const layer = osmCameraLayerRef.current;
    layer.clearLayers();
    if (!settings.showCameras) return;
    osmCameras.filter(hasSpeed).forEach(cam => {
      const marker = L.marker([cam.lat, cam.lon], { icon: cameraIcon });
      const limit  = cam.maxspeed ? `${cam.maxspeed} км/ч` : '60 км/ч';
      const name   = cam.name ?? 'Камера фиксации скорости';
      const vLabels = (cam.violations ?? ['speed'])
        .map(v => VIOLATION_LABELS[v] ?? v).join(', ');
      marker.bindPopup(`
        <div style="min-width:160px">
          <div style="font-weight:700;margin-bottom:4px">📷 ${escHtml(name)}</div>
          <div style="font-size:.8em;color:#94a3b8">Лимит: ${escHtml(limit)}</div>
          <div style="font-size:.8em;color:#94a3b8;margin-top:2px">Фиксирует: ${escHtml(vLabels)}</div>
        </div>
      `);
      marker.addTo(layer);
    });
  }, [osmCameras, settings.showCameras]);

  // ── Proximity: ближайшая камера (все типы, включая ремень/стоп-линию) ─────
  React.useEffect(() => {
    if (!gps || !settings.showCameras) { setNearestCam(null); return; }

    let best: NearestCam | null = null;

    // Все камеры из БД — включая те что не показываем на карте
    osmCameras.forEach(cam => {
      const d = haversineMeters(gps.lat, gps.lng, cam.lat, cam.lon);
      const limit = cam.maxspeed ? parseInt(cam.maxspeed) : 60;
      if (!best || d < best.distM)
        best = {
          distM:      d,
          limitKmh:   isNaN(limit) ? 60 : limit,
          label:      cam.name ?? 'Камера',
          violations: cam.violations ?? ['speed'],
        };
    });

    // Репортованные камеры из базы
    events?.filter(e => e.type === 'camera').forEach(ev => {
      const d = haversineMeters(gps.lat, gps.lng, ev.lat, ev.lng);
      if (!best || d < best.distM)
        best = { distM: d, limitKmh: 60, label: 'Камера (сообщение)', violations: ['speed'] };
    });

    setNearestCam(best && (best as NearestCam).distM <= WARN_DIST ? best : null);
  }, [gps, osmCameras, events]);

  // Курсор «прицел» когда добавляем метку
  React.useEffect(() => {
    if (!mapRef.current) return;
    const el = mapRef.current.getContainer();
    el.style.cursor = isAddingMarker ? 'crosshair' : '';
  }, [isAddingMarker]);

  // ── Профиль: синхронизация ────────────────────────────────────────────────
  const syncProfile = React.useCallback(async () => {
    if (!tgInitData) {
      setSyncStatus('error');
      setSyncError('Откройте приложение через Telegram-бота, а не прямой ссылкой.');
      return;
    }
    setSyncStatus('syncing');
    setSyncError('');
    try {
      const r = await fetch(`${BASE}api/dps-radar/profile/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ initData: tgInitData }),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({})) as { error?: string };
        setSyncStatus('error');
        setSyncError(j.error ?? `Ошибка сервера ${r.status}`);
        return;
      }
      const p = await r.json() as TgProfile;
      setTgProfile(p);
      setShareLocation(p.shareLocation);
      setSyncStatus('ok');
    } catch (e) {
      setSyncStatus('error');
      setSyncError('Нет соединения с сервером.');
    }
  }, [tgInitData, BASE]);

  React.useEffect(() => { void syncProfile(); }, [syncProfile]);

  // ── GPS маяк: обновление позиции каждые 30 сек ────────────────────────────
  React.useEffect(() => {
    if (!tgInitData || !gps || !shareLocation) return;
    const post = () => fetch(`${BASE}api/dps-radar/profile/location`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ initData: tgInitData, lat: gps.lat, lng: gps.lng }),
    }).catch(() => {});
    post();
    const t = setInterval(post, 30_000);
    return () => clearInterval(t);
  }, [gps?.lat, gps?.lng, shareLocation, tgInitData]);

  // ── Локации друзей: загрузка и обновление каждые 30 сек ──────────────────
  React.useEffect(() => {
    if (!tgInitData) return;
    const load = () => fetch(`${BASE}api/dps-radar/friends/locations`, {
      headers: { 'x-init-data': tgInitData },
    }).then(r => r.ok ? r.json() : []).then(setFriendLocs).catch(() => {});
    load();
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, [tgInitData]);

  // ── Запросы дружбы: фоновый поллинг каждые 15 сек ────────────────────────
  React.useEffect(() => {
    if (!tgInitData) return;
    const poll = () =>
      fetch(`${BASE}api/dps-radar/friends`, { headers: { 'x-init-data': tgInitData } })
        .then(r => r.ok ? r.json() : null)
        .then((j: { friends: Friend[]; pending: Friend[] } | null) => {
          if (!j) return;
          // Показать уведомление если появился новый запрос
          setPendingFr(prev => {
            if (j.pending.length > prev.length) {
              // Новый запрос — вибрация если доступна
              try { window.navigator.vibrate?.(100); } catch {}
            }
            return j.pending;
          });
          setFriends(j.friends);
        })
        .catch(() => {});
    poll();
    const t = setInterval(poll, 15_000);
    return () => clearInterval(t);
  }, [tgInitData]);

  // ── Друзья на карте ───────────────────────────────────────────────────────
  React.useEffect(() => {
    const layer = friendLocLayerRef.current;
    layer.clearLayers();
    if (!mapRef.current) return;
    if (!layer['_map']) layer.addTo(mapRef.current);
    friendLocs.forEach(f => {
      const initials = (f.firstName?.[0] ?? '?').toUpperCase();
      const minsAgo  = Math.round((Date.now() - new Date(f.lastLocAt).getTime()) / 60_000);
      const icon = L.divIcon({
        className: '',
        html: `<div style="width:36px;height:36px;border-radius:50%;background:#3b82f6;border:2px solid white;display:flex;align-items:center;justify-content:center;color:white;font-weight:700;font-size:14px;box-shadow:0 2px 8px rgba(0,0,0,.5)">${initials}</div>`,
        iconSize:   [36, 36],
        iconAnchor: [18, 18],
      });
      const m = L.marker([f.lastLat, f.lastLng], { icon });
      m.bindPopup(`<div style="font-weight:600">${escHtml(f.firstName)}</div><div style="font-size:.8em;color:#94a3b8">${minsAgo} мин назад</div>`);
      m.addTo(layer);
    });
  }, [friendLocs]);

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
        <div style="min-width:160px">
          <div style="font-weight:700;margin-bottom:8px">📍 ${escHtml(cm.label)}</div>
          <button
            onclick="window.dispatchEvent(new CustomEvent('routeToMarker',{detail:{lat:${cm.lat},lng:${cm.lng},label:'${escHtml(cm.label)}'}}));this.closest('.leaflet-popup').querySelector('.leaflet-popup-close-button')?.click()"
            style="width:100%;margin-bottom:6px;padding:6px 10px;background:#3b82f6;color:#fff;border:none;border-radius:8px;font-size:.8em;font-weight:700;cursor:pointer"
          >🧭 Маршрут сюда</button>
          <button
            onclick="window.dispatchEvent(new CustomEvent('deleteCustomMarker',{detail:'${cm.id}'}))"
            style="width:100%;padding:4px;background:none;color:#f87171;border:none;font-size:.75em;cursor:pointer"
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

  // Сбросить маршрут полностью
  const clearRoute = React.useCallback(() => {
    setRouteResult(null);
    setFromPoint(null);
    setToPoint(null);
    setFromQuery('');
    setToQuery('');
    setIsNavigating(false);
    if (routeLayerRef.current && mapRef.current) {
      mapRef.current.removeLayer(routeLayerRef.current);
      routeLayerRef.current = null;
    }
  }, []);

  const handleCalculateRoute = React.useCallback(async () => {
    if (!fromPoint || !toPoint) return;
    setIsRouting(true);
    setRouteResult(null);
    const start = { lat: parseFloat(fromPoint.lat), lon: parseFloat(fromPoint.lon) };
    const end   = { lat: parseFloat(toPoint.lat),   lon: parseFloat(toPoint.lon)   };
    try {
      const baseRoute = await fetchOsrmRoute([start, end]);
      if (baseRoute && events) {
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
  }, [fromPoint, toPoint, events]);

  // Авто-расчёт при выборе обоих точек
  React.useEffect(() => {
    if (fromPoint && toPoint) void handleCalculateRoute();
  }, [fromPoint, toPoint]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Профиль: вспомогательные функции ────────────────────────────────────
  const loadFriends = React.useCallback(async () => {
    if (!tgInitData) return;
    const r = await fetch(`${BASE}api/dps-radar/friends`, { headers: { 'x-init-data': tgInitData } });
    if (!r.ok) return;
    const j = await r.json() as { friends: Friend[]; pending: Friend[] };
    setFriends(j.friends);
    setPendingFr(j.pending);
  }, [tgInitData]);

  React.useEffect(() => { if (showProfileSheet) void loadFriends(); }, [showProfileSheet, loadFriends]);

  const toggleSharing = async () => {
    if (!tgInitData) return;
    const next = !shareLocation;
    setShareLocation(next);
    await fetch(`${BASE}api/dps-radar/profile/sharing`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ initData: tgInitData, share: next }),
    }).catch(() => {});
    setTgProfile(p => p ? { ...p, shareLocation: next } : p);
  };

  const sendFriendRequest = async () => {
    if (!tgInitData || !addUsername.trim()) return;
    setAddStatus('loading');
    setAddMsg('');
    const r = await fetch(`${BASE}api/dps-radar/friends/request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ initData: tgInitData, username: addUsername.trim() }),
    });
    const j = await r.json() as { notFound?: boolean; inviteLink?: string; alreadyExists?: boolean; ok?: boolean };
    if (j.notFound) {
      setAddStatus('notfound');
      setAddMsg(j.inviteLink ?? '');
    } else if (j.alreadyExists) {
      setAddStatus('ok');
      setAddMsg('Заявка уже отправлена или вы уже друзья');
    } else if (j.ok) {
      setAddStatus('ok');
      setAddMsg('Заявка отправлена!');
      setAddUsername('');
      void loadFriends();
    } else {
      setAddStatus('error');
      setAddMsg('Ошибка, попробуйте ещё раз');
    }
  };

  const acceptFriend = async (id: number) => {
    if (!tgInitData) return;
    await fetch(`${BASE}api/dps-radar/friends/${id}/accept`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ initData: tgInitData }),
    });
    void loadFriends();
  };

  const removeFriend = async (id: number) => {
    if (!tgInitData) return;
    await fetch(`${BASE}api/dps-radar/friends/${id}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ initData: tgInitData }),
    });
    void loadFriends();
  };

  const submitReport = async () => {
    if (!gps) { setReportError('Включите геолокацию для отправки сообщений'); return; }
    if (!reportAddress.trim()) { setReportError('Укажите адрес'); return; }
    setReportStatus('loading');
    setReportError('');
    try {
      const base = import.meta.env.BASE_URL ?? '/dps-radar/';
      const res = await fetch(`${base}api/dps-radar/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: reportType,
          address: reportAddress.trim(),
          city: citySlug,
          userLat: gps.lat,
          userLng: gps.lng,
        }),
      });
      const json = await res.json();
      if (!res.ok) { setReportStatus('error'); setReportError(json.error ?? 'Ошибка сервера'); return; }
      setReportStatus('success');
      setReportAddress('');
      setTimeout(() => { setShowReportDialog(false); setReportStatus('idle'); }, 2000);
    } catch {
      setReportStatus('error');
      setReportError('Не удалось отправить. Проверьте соединение.');
    }
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
      {isApproaching && nearestCam && (() => {
        const v = nearestCam.violations ?? ['speed'];
        const isSpeedCam = v.includes('speed');
        const extras = v.filter(x => x !== 'speed')
          .map(x => VIOLATION_LABELS[x] ?? x);
        return (
          <div className="absolute z-40 pointer-events-none left-1/2 -translate-x-1/2"
            style={{ top: 88 }}>
            <div className={`flex flex-col items-center gap-0.5 px-4 py-2 rounded-2xl shadow-2xl font-bold text-sm border ${
              isSpeeding
                ? 'bg-red-600/95 border-red-400 text-white'
                : 'bg-orange-500/95 border-orange-300 text-white'
            }`}>
              <div className="flex items-center gap-2">
                <Camera className="w-4 h-4 shrink-0" />
                <span>
                  {isSpeeding ? '⚠️ ПРЕВЫШЕНИЕ · ' : ''}
                  📷 {Math.round(nearestCam.distM)} м
                  {isSpeedCam ? ` · лимит ${nearestCam.limitKmh} км/ч` : ''}
                </span>
              </div>
              {extras.length > 0 && (
                <div className="text-xs font-semibold opacity-90 tracking-wide">
                  ⚠️ {extras.join(' · ')}
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* ── Спидометр — правый нижний угол ──────────────────────────────── */}
      {speed != null && (
        <div className="absolute z-40 pointer-events-none" style={{ bottom: 104, right: 16 }}>
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

      {/* ── Навигационный HUD (поверх карты, заменяет поиск) ─────────────── */}
      {isNavigating && routeResult && (
        <div className="absolute z-30 top-0 left-0 right-0 p-3 flex flex-col gap-2 pointer-events-none">
          {/* Строка с информацией о маршруте */}
          <div className="pointer-events-auto flex items-center gap-3 bg-slate-900/95 backdrop-blur-md border border-slate-700 rounded-2xl px-4 py-3 shadow-2xl">
            <div className="flex-1 flex gap-5">
              <div>
                <div className="text-[10px] text-slate-400 uppercase font-semibold tracking-wider">Осталось</div>
                <div className="font-black text-lg text-emerald-400 leading-none">{fmt.time(routeResult.duration)}</div>
              </div>
              <div>
                <div className="text-[10px] text-slate-400 uppercase font-semibold tracking-wider">Дистанция</div>
                <div className="font-black text-lg text-white leading-none">{fmt.dist(routeResult.distance)}</div>
              </div>
              {toPoint && (
                <div className="flex-1 min-w-0">
                  <div className="text-[10px] text-slate-400 uppercase font-semibold tracking-wider">Куда</div>
                  <div className="text-sm text-slate-200 font-medium truncate leading-none mt-0.5">{toPoint.display_name}</div>
                </div>
              )}
            </div>
            <button
              onClick={() => setIsNavigating(false)}
              className="flex items-center gap-1.5 bg-red-600 hover:bg-red-700 text-white text-sm font-bold px-3 py-2 rounded-xl shrink-0 transition-colors"
            >
              <Square className="w-3.5 h-3.5 fill-white" />
              Стоп
            </button>
          </div>
        </div>
      )}

      {/* ── Кнопка маршрута — сверху по центру ───────────────────────────── */}
      {!isNavigating && (
        <div className="absolute z-20 top-3 left-1/2 -translate-x-1/2 pointer-events-auto flex items-center gap-2">
          <button
            onClick={() => setShowRouteSearch(true)}
            className={`flex items-center gap-2 px-4 py-2 rounded-2xl shadow-xl border text-sm font-semibold transition-colors ${
              routeResult
                ? 'bg-blue-600 border-blue-500 text-white'
                : 'bg-card/90 backdrop-blur-md border-border text-foreground hover:bg-card'
            }`}
          >
            <Navigation className="w-4 h-4" />
            {isRouting ? 'Строим...' : routeResult ? `${fmt.dist(routeResult.distance)} · ${fmt.time(routeResult.duration)}` : 'Маршрут'}
          </button>
          {/* Красная кнопка «Поехали!» + «Отменить» когда маршрут готов */}
          {routeResult && (
            <>
              <button
                onClick={() => { setIsNavigating(true); setShowRouteSearch(false); }}
                className="flex items-center gap-1.5 px-3 py-2 rounded-2xl shadow-xl border bg-emerald-500 border-emerald-400 text-white text-sm font-bold"
              >
                <Play className="w-3.5 h-3.5 fill-white" /> Поехали!
              </button>
              <button
                onClick={clearRoute}
                className="flex items-center justify-center w-9 h-9 rounded-2xl shadow-xl border bg-red-600/90 border-red-500 text-white"
                title="Отменить маршрут"
              >
                <X className="w-4 h-4" />
              </button>
            </>
          )}
        </div>
      )}

      {/* ── Bottom sheet: поиск маршрута ─────────────────────────────────── */}
      {showRouteSearch && !isNavigating && (
        <div className="absolute inset-0 z-40 flex items-end" onClick={() => setShowRouteSearch(false)}>
          <div
            className="w-full bg-card border-t border-border rounded-t-3xl p-5 shadow-2xl"
            style={{ paddingBottom: 'max(24px, env(safe-area-inset-bottom))' }}
            onClick={e => e.stopPropagation()}
          >
            {/* Шапка */}
            <div className="flex items-center justify-between mb-4">
              <span className="font-bold text-base">🧭 Маршрут · {cityConfig.name}</span>
              <button onClick={() => setShowRouteSearch(false)} className="text-muted-foreground hover:text-foreground">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* От */}
            <div className="relative mb-3">
              <div className="flex items-center bg-input/50 rounded-xl border border-border focus-within:border-ring px-3 py-2.5 gap-2">
                <div className="w-3 h-3 rounded-full bg-blue-500 shrink-0" />
                <input
                  type="text"
                  placeholder="Откуда..."
                  className="bg-transparent border-none outline-none flex-1 text-sm text-foreground placeholder:text-muted-foreground min-w-0"
                  value={fromPoint ? fromPoint.display_name : fromQuery}
                  onChange={e => { setFromQuery(e.target.value); setFromPoint(null); setIsSearchingFrom(true); }}
                  onFocus={() => setIsSearchingFrom(true)}
                  onBlur={() => setTimeout(() => setIsSearchingFrom(false), 200)}
                />
                {/* Кнопка «моё местоположение» */}
                <button
                  title="Использовать моё местоположение"
                  disabled={!gps}
                  onClick={async () => {
                    if (!gps) return;
                    // Пробуем реверс-геокодинг через Nominatim
                    try {
                      const r = await fetch(
                        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${gps.lat}&lon=${gps.lng}&accept-language=ru`,
                        { headers: { 'User-Agent': 'DPSRadarApp/1.0' } },
                      );
                      const j = await r.json() as { display_name?: string };
                      setFromPoint({ lat: String(gps.lat), lon: String(gps.lng), display_name: j.display_name ?? '📍 Моё местоположение' });
                    } catch {
                      setFromPoint({ lat: String(gps.lat), lon: String(gps.lng), display_name: '📍 Моё местоположение' });
                    }
                    setFromQuery('');
                    setIsSearchingFrom(false);
                  }}
                  className={`shrink-0 flex items-center justify-center w-7 h-7 rounded-lg transition-colors ${
                    gps
                      ? 'text-blue-400 bg-blue-500/15 hover:bg-blue-500/25 active:bg-blue-500/35'
                      : 'text-muted-foreground/40 cursor-not-allowed'
                  }`}
                >
                  <LocateFixed className="w-4 h-4" />
                </button>
              </div>
              {isSearchingFrom && fromResults && fromResults.length > 0 && (
                <div className="absolute bottom-full left-0 w-full mb-1 bg-popover border border-border rounded-xl shadow-lg overflow-hidden z-50">
                  {fromResults.map((r, i) => (
                    <div key={i} className="p-2.5 text-sm hover:bg-accent cursor-pointer truncate border-b border-border/50 last:border-0"
                      onClick={() => { setFromPoint(r); setFromQuery(''); setIsSearchingFrom(false); }}>
                      {r.display_name}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* До — поле или компактный чип когда выбрано */}
            <div className="relative mb-4">
              {toPoint ? (
                <div className="flex items-center bg-emerald-500/10 rounded-xl border border-emerald-500/40 px-3 py-2.5 gap-3">
                  <div className="w-3 h-3 rounded-full bg-emerald-500 shrink-0" />
                  <span className="flex-1 text-sm text-emerald-300 truncate">{toPoint.display_name.split(',')[0]}</span>
                  <button
                    onClick={() => { setToPoint(null); setToQuery(''); }}
                    className="shrink-0 text-red-400 hover:text-red-300 transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <>
                  <div className="flex items-center bg-input/50 rounded-xl border border-border focus-within:border-ring px-3 py-2.5">
                    <div className="w-3 h-3 rounded-full bg-emerald-500 mr-3 shrink-0" />
                    <input
                      type="text"
                      placeholder="Куда..."
                      autoFocus
                      className="bg-transparent border-none outline-none flex-1 text-sm text-foreground placeholder:text-muted-foreground"
                      value={toQuery}
                      onChange={e => { setToQuery(e.target.value); setIsSearchingTo(true); }}
                      onFocus={() => setIsSearchingTo(true)}
                      onBlur={() => setTimeout(() => setIsSearchingTo(false), 200)}
                    />
                  </div>
                  {isSearchingTo && toResults && toResults.length > 0 && (
                    <div className="absolute bottom-full left-0 w-full mb-1 bg-popover border border-border rounded-xl shadow-lg overflow-hidden z-50">
                      {toResults.map((r, i) => (
                        <div key={i} className="p-2.5 text-sm hover:bg-accent cursor-pointer truncate border-b border-border/50 last:border-0"
                          onClick={() => {
                            setToPoint(r); setToQuery(''); setIsSearchingTo(false);
                            // Авто-подставить GPS как «Откуда» если не выбрано
                            if (!fromPoint && gps) {
                              setFromPoint({ lat: String(gps.lat), lon: String(gps.lng), display_name: 'Моё местоположение' });
                            }
                          }}>
                          {r.display_name}
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Результат / Поехали — появляется сразу после расчёта */}
            {(isRouting || routeResult) && (
              <div className="flex items-center gap-3 bg-white/5 rounded-2xl px-4 py-3">
                {isRouting ? (
                  <span className="flex-1 text-sm text-muted-foreground">Строим маршрут...</span>
                ) : routeResult ? (
                  <>
                    <div className="flex gap-5 flex-1">
                      <div>
                        <div className="text-[10px] text-muted-foreground uppercase font-semibold tracking-wider">В пути</div>
                        <div className="font-bold text-base text-emerald-400">{fmt.time(routeResult.duration)}</div>
                      </div>
                      <div>
                        <div className="text-[10px] text-muted-foreground uppercase font-semibold tracking-wider">Расстояние</div>
                        <div className="font-bold text-base text-foreground">{fmt.dist(routeResult.distance)}</div>
                      </div>
                    </div>
                    <Button onClick={() => { setIsNavigating(true); setShowRouteSearch(false); }}
                      className="bg-emerald-500 hover:bg-emerald-600 text-white font-bold px-4 gap-2 shrink-0">
                      <Play className="w-4 h-4 fill-white" /> Поехали!
                    </Button>
                  </>
                ) : null}
              </div>
            )}
          </div>
        </div>
      )}

      <div className="flex-1" />

      {/* ── Диалог репортинга ─────────────────────────────────────────── */}
      {showReportDialog && (
        <div
          className="absolute inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm"
          onClick={e => { if (e.target === e.currentTarget) { setShowReportDialog(false); setReportStatus('idle'); setReportError(''); } }}
        >
          <div className="w-full max-w-md bg-card border-t border-border rounded-t-3xl p-5 shadow-2xl"
            style={{ paddingBottom: 'max(24px, env(safe-area-inset-bottom))' }}
            onClick={e => e.stopPropagation()}>
            {/* Ручка */}
            <div className="w-10 h-1 bg-muted-foreground/30 rounded-full mx-auto mb-4" />
            <div className="flex items-center gap-2 mb-4">
              <AlertTriangle className="w-4 h-4 text-amber-400" />
              <span className="font-bold text-base">Сообщить об инциденте</span>
            </div>

            {/* Выбор типа */}
            <div className="flex gap-2 mb-4">
              {([
                { value: 'dps_post' as const,  label: '🚔 Пост ДПС' },
                { value: 'accident' as const,   label: '💥 Авария' },
              ] as const).map(opt => (
                <button key={opt.value}
                  onClick={() => setReportType(opt.value)}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-semibold border transition-colors ${
                    reportType === opt.value
                      ? 'bg-amber-500/20 border-amber-400 text-amber-300'
                      : 'bg-muted/40 border-border text-muted-foreground hover:bg-muted/60'
                  }`}>
                  {opt.label}
                </button>
              ))}
            </div>

            {/* Адрес */}
            <div className="text-xs text-muted-foreground font-medium mb-1">
              Адрес или ориентир
            </div>
            <input
              autoFocus
              type="text"
              placeholder="Напр.: ул. Горького, 52 или пересечение Калинина/Амурской"
              className="w-full bg-input/60 border border-border rounded-xl px-3 py-2.5 text-sm outline-none focus:border-ring mb-3 text-foreground placeholder:text-muted-foreground"
              value={reportAddress}
              onChange={e => { setReportAddress(e.target.value); setReportError(''); }}
              onKeyDown={e => { if (e.key === 'Enter') void submitReport(); }}
            />

            {/* Статус */}
            {reportStatus === 'error' && (
              <div className="flex items-start gap-1.5 text-red-400 text-xs mb-3">
                <X className="w-3.5 h-3.5 shrink-0 mt-0.5" /> {reportError}
              </div>
            )}
            {reportStatus === 'success' && (
              <div className="flex items-center gap-1.5 text-emerald-400 text-xs mb-3">
                <Check className="w-3.5 h-3.5" /> Сообщение принято! Спасибо.
              </div>
            )}
            {!gps && reportStatus !== 'success' && (
              <div className="text-amber-400 text-xs mb-3">
                ⚠️ Включите геолокацию — она нужна для проверки вашего местоположения
              </div>
            )}

            {/* Кнопки */}
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1"
                onClick={() => { setShowReportDialog(false); setReportStatus('idle'); setReportError(''); setReportAddress(''); }}>
                <X className="w-4 h-4 mr-1" /> Отмена
              </Button>
              <Button
                className="flex-1 bg-amber-500 hover:bg-amber-600 text-white font-bold gap-1.5"
                disabled={!gps || !reportAddress.trim() || reportStatus === 'loading' || reportStatus === 'success'}
                onClick={() => void submitReport()}>
                {reportStatus === 'loading'
                  ? <><span className="animate-spin">⏳</span> Проверяем…</>
                  : <><Send className="w-4 h-4" /> Отправить</>}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Диалог ввода метки ────────────────────────────────────────── */}
      {pendingCoords && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-card border border-border rounded-2xl p-5 w-72 shadow-2xl">
            <div className="flex items-center gap-2 mb-3">
              <MapPin className="w-4 h-4 text-purple-400" />
              <span className="font-semibold text-sm">Название метки</span>
            </div>

            {/* GPS — быстро поставить в своё местоположение */}
            <button
              onClick={() => gps && setPendingCoords({ lat: gps.lat, lng: gps.lng })}
              disabled={!gps}
              className={`w-full flex items-center gap-2 text-xs px-3 py-2 rounded-lg border mb-3 transition-colors ${
                gps
                  ? 'bg-blue-500/10 border-blue-500/30 text-blue-400 active:bg-blue-500/20'
                  : 'bg-muted/30 border-border text-muted-foreground/50 cursor-not-allowed'
              }`}
            >
              <LocateFixed className="w-3.5 h-3.5 shrink-0" />
              <span>{gps ? 'Использовать моё местоположение' : 'GPS недоступен'}</span>
              {gps && (
                <span className="ml-auto font-mono opacity-60">
                  {gps.lat.toFixed(4)}, {gps.lng.toFixed(4)}
                </span>
              )}
            </button>

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

      {/* ── Нижняя панель (две строки, мобильная) ─────────────────────── */}
      <div
        className="relative z-10 w-full px-3 pointer-events-none"
        style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}
      >
        <div className="pointer-events-auto mb-3 bg-card/95 backdrop-blur-md border border-border shadow-xl rounded-2xl overflow-hidden">

          {/* Строка 1: статистика ─────────────────────────────────────── */}
          <div className="flex items-center gap-3 px-4 py-2 border-b border-border/30 text-xs font-medium">
            {settings.showPosts && (
              <span className="flex items-center gap-1.5 text-amber-400 whitespace-nowrap">
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse shrink-0" />
                ДПС: {stats?.dpsPostCount ?? 0}
              </span>
            )}
            {settings.showCameras && (
              <span className="flex items-center gap-1.5 text-cyan-400 whitespace-nowrap">
                <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse shrink-0" />
                Камеры: {stats?.cameraCount ?? 0}
              </span>
            )}
            {settings.showAccidents && (
              <span className="flex items-center gap-1.5 text-destructive whitespace-nowrap">
                <span className="w-2 h-2 rounded-full bg-destructive animate-pulse shrink-0" />
                ДТП: {stats?.accidentCount ?? 0}
              </span>
            )}
            {!settings.showPosts && !settings.showCameras && !settings.showAccidents && (
              <span className="text-muted-foreground">Все слои скрыты</span>
            )}
          </div>

          {/* Строка 2: действия ──────────────────────────────────────── */}
          <div className="flex items-center gap-2 px-3 py-2">
            {/* Сообщить */}
            <button
              onClick={() => { setShowReportDialog(true); setReportStatus('idle'); setReportError(''); }}
              className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-xl border bg-amber-500/10 border-amber-500/30 text-amber-400 active:bg-amber-500/25 transition-colors"
            >
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              <span>Сообщить</span>
            </button>

            {/* Профиль */}
            <button
              onClick={() => setShowProfileSheet(true)}
              className="relative flex items-center gap-1.5 text-xs px-3 py-2 rounded-xl border bg-blue-500/10 border-blue-500/30 text-blue-400 active:bg-blue-500/25 transition-colors"
            >
              <User className="w-3.5 h-3.5 shrink-0" />
              <span>Профиль</span>
              {pendingFr.length > 0 && (
                <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center leading-none">
                  {pendingFr.length}
                </span>
              )}
            </button>

            <div className="flex-1" />

            {/* Метка */}
            <button
              onClick={() => {
                if (isAddingMarker) { setIsAddingMarker(false); return; }
                setPendingCoords(null);
                setIsAddingMarker(true);
              }}
              className={`flex items-center gap-1.5 text-xs px-3 py-2 rounded-xl border transition-colors ${
                isAddingMarker
                  ? 'bg-purple-600 border-purple-500 text-white'
                  : 'bg-white/5 border-white/10 text-purple-400 active:bg-white/10'
              }`}
            >
              <MapPin className="w-3.5 h-3.5 shrink-0" />
              <span>{isAddingMarker ? 'Нажмите' : 'Метка'}</span>
            </button>

            {/* Настройки */}
            <button
              onClick={() => setShowSettings(true)}
              className="flex items-center justify-center w-9 h-9 rounded-xl bg-white/5 border border-white/10 active:bg-white/10 transition-colors shrink-0"
            >
              <Settings className="w-4 h-4 text-muted-foreground" />
            </button>
          </div>
        </div>
      </div>

      {/* ── Панель настроек (bottom sheet) ────────────────────────────── */}
      {showSettings && (
        <div className="absolute inset-0 z-50 flex items-end" onClick={() => setShowSettings(false)}>
          <div
            className="w-full bg-card border-t border-border rounded-t-3xl p-5 shadow-2xl"
            style={{ paddingBottom: 'max(24px, env(safe-area-inset-bottom))' }}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-5">
              <span className="font-bold text-base">Настройки отображения</span>
              <button onClick={() => setShowSettings(false)} className="text-muted-foreground hover:text-foreground transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Легенда */}
            <div className="flex items-center gap-3 mb-5 text-[11px] text-muted-foreground flex-wrap">
              <span className="flex items-center gap-1">🚔 Пост ДПС</span>
              <span className="flex items-center gap-1">📷 Камера</span>
              <span className="flex items-center gap-1">💥 Авария</span>
              <span className="flex items-center gap-1">📍 Моя метка</span>
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
      {/* ── Профиль (bottom sheet) ───────────────────────────────────────── */}
      {showProfileSheet && (
        <div className="absolute inset-0 z-50 flex items-end" onClick={() => setShowProfileSheet(false)}>
          <div
            className="w-full bg-card border-t border-border rounded-t-3xl p-5 shadow-2xl max-h-[88dvh] overflow-y-auto"
            style={{ paddingBottom: 'max(24px, env(safe-area-inset-bottom))' }}
            onClick={e => e.stopPropagation()}
          >
            <div className="w-10 h-1 bg-muted-foreground/30 rounded-full mx-auto mb-4" />

            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2 font-bold text-base">
                <User className="w-5 h-5 text-blue-400" />
                Профиль
              </div>
              <button onClick={() => setShowProfileSheet(false)} className="text-muted-foreground hover:text-foreground">
                <X className="w-5 h-5" />
              </button>
            </div>

            {tgProfile ? (
              <>
                {/* Аватар + имя */}
                <div className="flex items-center gap-4 mb-5">
                  {tgProfile.photoUrl ? (
                    <img src={tgProfile.photoUrl} alt="" className="w-14 h-14 rounded-full object-cover border-2 border-border" />
                  ) : (
                    <div className="w-14 h-14 rounded-full bg-blue-500/20 border-2 border-blue-500/30 flex items-center justify-center text-2xl font-bold text-blue-400">
                      {(tgProfile.firstName?.[0] ?? '?').toUpperCase()}
                    </div>
                  )}
                  <div>
                    <div className="font-bold text-base">{tgProfile.firstName}{tgProfile.lastName ? ` ${tgProfile.lastName}` : ''}</div>
                    {tgProfile.username && <div className="text-xs text-muted-foreground mt-0.5">@{tgProfile.username}</div>}
                  </div>
                </div>

                {/* Статистика */}
                <div className="flex gap-3 mb-5">
                  <div className="flex-1 bg-muted/40 rounded-xl p-3 text-center">
                    <div className="text-xl font-black text-amber-400">{tgProfile.reportCount}</div>
                    <div className="text-[11px] text-muted-foreground mt-0.5">Сообщений</div>
                  </div>
                  <div className="flex-1 bg-muted/40 rounded-xl p-3 text-center">
                    <div className="text-xl font-black text-blue-400">{tgProfile.friendCount}</div>
                    <div className="text-[11px] text-muted-foreground mt-0.5">Друзей</div>
                  </div>
                </div>

                {/* Шаринг местоположения */}
                <div className="flex items-center justify-between py-3 border-t border-border/40 mb-4">
                  <div>
                    <div className="text-sm font-medium">Делиться местоположением</div>
                    <div className="text-xs text-muted-foreground mt-0.5">Видно только вашим друзьям</div>
                  </div>
                  <button
                    onClick={() => void toggleSharing()}
                    className={`w-12 h-6 rounded-full transition-colors relative shrink-0 ${shareLocation ? 'bg-blue-500' : 'bg-muted'}`}
                  >
                    <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${shareLocation ? 'left-6' : 'left-0.5'}`} />
                  </button>
                </div>

                {/* Добавить друга */}
                <div className="mb-4">
                  <div className="text-sm font-semibold mb-2 flex items-center gap-1.5">
                    <Users className="w-4 h-4 text-blue-400" /> Добавить друга
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="@username в Telegram"
                      className="flex-1 bg-input/60 border border-border rounded-xl px-3 py-2 text-sm outline-none focus:border-ring text-foreground placeholder:text-muted-foreground"
                      value={addUsername}
                      onChange={e => { setAddUsername(e.target.value); setAddStatus('idle'); setAddMsg(''); }}
                      onKeyDown={e => { if (e.key === 'Enter') void sendFriendRequest(); }}
                    />
                    <Button
                      className="bg-blue-600 hover:bg-blue-700 text-white px-4"
                      disabled={!addUsername.trim() || addStatus === 'loading'}
                      onClick={() => void sendFriendRequest()}
                    >
                      {addStatus === 'loading' ? '…' : 'Найти'}
                    </Button>
                  </div>
                  {addStatus === 'ok' && <div className="text-emerald-400 text-xs mt-2">✓ {addMsg}</div>}
                  {addStatus === 'notfound' && (
                    <div className="text-xs mt-2 text-muted-foreground">
                      Пользователь не найден.{' '}
                      <a href={addMsg} target="_blank" rel="noreferrer" className="text-blue-400 underline">
                        Пригласить в ДПС Радар
                      </a>
                    </div>
                  )}
                  {addStatus === 'error' && <div className="text-red-400 text-xs mt-2">{addMsg}</div>}
                </div>

                {/* Входящие запросы */}
                {pendingFr.length > 0 && (
                  <div className="mb-4">
                    <div className="text-sm font-semibold mb-2 text-amber-400">Входящие запросы</div>
                    <div className="flex flex-col gap-2">
                      {pendingFr.map(f => (
                        <div key={f.friendshipId} className="flex items-center gap-3 bg-amber-500/10 border border-amber-500/20 rounded-xl px-3 py-2">
                          <div className="w-9 h-9 rounded-full bg-amber-500/20 flex items-center justify-center text-sm font-bold text-amber-400 shrink-0">
                            {(f.firstName?.[0] ?? '?').toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium truncate">{f.firstName}{f.lastName ? ` ${f.lastName}` : ''}</div>
                            {f.username && <div className="text-xs text-muted-foreground">@{f.username}</div>}
                          </div>
                          <div className="flex gap-1.5 shrink-0">
                            <button onClick={() => void acceptFriend(f.friendshipId)} className="text-xs px-2.5 py-1.5 rounded-lg bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-semibold">✓</button>
                            <button onClick={() => void removeFriend(f.friendshipId)} className="text-xs px-2.5 py-1.5 rounded-lg bg-red-500/10 text-red-400 border border-red-500/20">✕</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Список друзей */}
                <div>
                  <div className="text-sm font-semibold mb-2">Друзья ({friends.length})</div>
                  {friends.length === 0 ? (
                    <div className="text-xs text-muted-foreground py-3 text-center">Добавьте друзей, чтобы видеть их на карте</div>
                  ) : (
                    <div className="flex flex-col gap-2">
                      {friends.map(f => {
                        const loc = friendLocs.find(l => l.telegramId === f.telegramId);
                        const minsAgo = loc ? Math.round((Date.now() - new Date(loc.lastLocAt).getTime()) / 60_000) : null;
                        return (
                          <div key={f.friendshipId} className="flex items-center gap-3 bg-muted/30 rounded-xl px-3 py-2">
                            <div className="w-9 h-9 rounded-full bg-blue-500/20 flex items-center justify-center text-sm font-bold text-blue-400 shrink-0">
                              {(f.firstName?.[0] ?? '?').toUpperCase()}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium truncate">{f.firstName}{f.lastName ? ` ${f.lastName}` : ''}</div>
                              <div className="text-xs text-muted-foreground">
                                {minsAgo != null ? `📍 ${minsAgo} мин назад` : 'Геолокация недоступна'}
                              </div>
                            </div>
                            <button onClick={() => void removeFriend(f.friendshipId)} className="text-muted-foreground hover:text-red-400 transition-colors shrink-0">
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center gap-4 py-8">
                {syncStatus === 'syncing' && (
                  <>
                    <div className="w-10 h-10 rounded-full border-2 border-blue-400 border-t-transparent animate-spin" />
                    <span className="text-sm text-muted-foreground">Подключение к Telegram…</span>
                  </>
                )}
                {syncStatus === 'error' && (
                  <>
                    <div className="text-3xl">⚠️</div>
                    <div className="text-center">
                      <div className="text-sm font-semibold text-red-400 mb-1">Не удалось войти</div>
                      <div className="text-xs text-muted-foreground px-4">{syncError}</div>
                    </div>
                    <Button
                      className="bg-blue-600 hover:bg-blue-700 text-white gap-2"
                      onClick={() => void syncProfile()}
                    >
                      <User className="w-4 h-4" /> Войти заново
                    </Button>
                  </>
                )}
                {syncStatus === 'idle' && (
                  <div className="text-sm text-muted-foreground">Загрузка…</div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}


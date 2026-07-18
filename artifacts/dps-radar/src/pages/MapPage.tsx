import React from 'react';
import * as L from 'leaflet';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { AlertCircle, Navigation, Search } from 'lucide-react';
import { useListDpsEvents, useGetDpsStats } from '@workspace/api-client-react';
import { GeocodeResult, useGeocodeSearch } from '@/lib/nominatim';
import { fetchOsrmRoute, calculateAvoidanceWaypoints, RouteResult } from '@/lib/osrm';

/** Экранирует HTML-спецсимволы для безопасной вставки в innerHTML / bindPopup */
function escHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Create map marker icons
const createIcon = (color: string) => {
  return L.divIcon({
    className: 'custom-div-icon',
    html: `<div style="background-color: ${color}; width: 24px; height: 24px; border-radius: 50%; border: 3px solid #1e293b; box-shadow: 0 0 10px rgba(0,0,0,0.5);"></div>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
    popupAnchor: [0, -12],
  });
};

const dpsIcon = createIcon('hsl(45, 93%, 47%)'); // Amber/Yellow
const accidentIcon = createIcon('hsl(0, 84%, 60%)'); // Bright Red
const originIcon = createIcon('#3b82f6'); // Blue
const destIcon = createIcon('#10b981'); // Emerald

export default function MapPage() {
  const mapRef = React.useRef<L.Map | null>(null);
  const mapContainerRef = React.useRef<HTMLDivElement>(null);
  const markersRef = React.useRef<L.LayerGroup>(new L.LayerGroup());
  const routeLayerRef = React.useRef<L.GeoJSON | null>(null);

  const [fromQuery, setFromQuery] = React.useState('');
  const [toQuery, setToQuery] = React.useState('');
  
  const [fromPoint, setFromPoint] = React.useState<GeocodeResult | null>(null);
  const [toPoint, setToPoint] = React.useState<GeocodeResult | null>(null);
  
  const [isSearchingFrom, setIsSearchingFrom] = React.useState(false);
  const [isSearchingTo, setIsSearchingTo] = React.useState(false);

  const [routeResult, setRouteResult] = React.useState<RouteResult | null>(null);
  const [isRouting, setIsRouting] = React.useState(false);

  const { data: fromResults } = useGeocodeSearch(fromQuery);
  const { data: toResults } = useGeocodeSearch(toQuery);

  const { data: events, refetch: refetchEvents } = useListDpsEvents();
  const { data: stats, refetch: refetchStats } = useGetDpsStats();

  // Авто-обновление каждые 30 секунд
  React.useEffect(() => {
    const id = setInterval(() => {
      void refetchEvents();
      void refetchStats();
    }, 30_000);
    return () => clearInterval(id);
  }, [refetchEvents, refetchStats]);

  React.useEffect(() => {
    // Initialize WebApp SDK
    const WebApp = (window as any).Telegram?.WebApp;
    if (WebApp) {
      WebApp.ready();
      WebApp.expand();
      
      // Apply theme colors if needed to CSS vars (optional based on preference, 
      // but we specified dark tactical map so we might ignore theme params or partially use them)
    }

    if (mapContainerRef.current && !mapRef.current) {
      const map = L.map(mapContainerRef.current, {
        center: [50.2906, 127.5272],
        zoom: 13,
        zoomControl: false, // will add manually or not needed for mobile
      });
      mapRef.current = map;

      // Dark tactical map tiles (CartoDB Dark Matter)
      L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
        subdomains: 'abcd',
        maxZoom: 20
      }).addTo(map);

      L.control.zoom({ position: 'bottomright' }).addTo(map);
      markersRef.current.addTo(map);
    }

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  React.useEffect(() => {
    if (!mapRef.current) return;
    
    const layerGroup = markersRef.current;
    layerGroup.clearLayers();

    events?.forEach(event => {
      const icon = event.type === 'dps_post' ? dpsIcon : accidentIcon;
      const typeLabel = event.type === 'dps_post' ? '🚔 ДПС Пост' : '🚗💥 Авария';
      
      const marker = L.marker([event.lat, event.lng], { icon });
      marker.bindPopup(`
        <div class="p-3 bg-card text-card-foreground">
          <div class="font-bold mb-1">${escHtml(typeLabel)}</div>
          <div class="text-sm mb-1">${escHtml(event.address)}</div>
          <div class="text-xs text-muted-foreground">Добавил: ${escHtml(event.author)}</div>
          <div class="text-xs text-muted-foreground mt-1">${escHtml(String(event.minutesAgo))} минут назад</div>
        </div>
      `);
      marker.addTo(layerGroup);
    });

    if (fromPoint) {
      L.marker([parseFloat(fromPoint.lat), parseFloat(fromPoint.lon)], { icon: originIcon }).addTo(layerGroup);
    }
    if (toPoint) {
      L.marker([parseFloat(toPoint.lat), parseFloat(toPoint.lon)], { icon: destIcon }).addTo(layerGroup);
    }
  }, [events, fromPoint, toPoint]);

  // Update Route on map
  React.useEffect(() => {
    if (!mapRef.current) return;
    
    if (routeLayerRef.current) {
      mapRef.current.removeLayer(routeLayerRef.current);
      routeLayerRef.current = null;
    }

    if (routeResult) {
      routeLayerRef.current = L.geoJSON(routeResult.geometry as any, {
        style: {
          color: '#3b82f6', // Tailwind blue-500
          weight: 5,
          opacity: 0.8,
        }
      }).addTo(mapRef.current);

      // Zoom to route
      const bounds = routeLayerRef.current.getBounds();
      if (bounds.isValid()) {
        mapRef.current.fitBounds(bounds, { padding: [50, 50] });
      }
    }
  }, [routeResult]);

  const handleCalculateRoute = async () => {
    if (!fromPoint || !toPoint) return;
    
    setIsRouting(true);
    setRouteResult(null);

    const start = { lat: parseFloat(fromPoint.lat), lon: parseFloat(fromPoint.lon) };
    const end = { lat: parseFloat(toPoint.lat), lon: parseFloat(toPoint.lon) };
    
    try {
      // First get naive route
      const baseRoute = await fetchOsrmRoute([start, end]);
      
      if (baseRoute && events) {
        // Find DPS posts
        const dpsPosts = events.filter(e => e.type === 'dps_post').map(e => ({ lat: e.lat, lng: e.lng }));
        
        // Find required waypoints to avoid DPS
        const waypoints = calculateAvoidanceWaypoints(baseRoute.geometry.coordinates as [number, number][], dpsPosts);
        
        if (waypoints.length > 0) {
          const finalRoute = await fetchOsrmRoute([start, ...waypoints, end]);
          if (finalRoute) {
            setRouteResult(finalRoute);
            setIsRouting(false);
            return;
          }
        }
      }
      
      // If no waypoints needed or final route failed, use base route
      setRouteResult(baseRoute);
    } catch (e) {
      console.error(e);
    } finally {
      setIsRouting(false);
    }
  };

  const formatDistance = (meters: number) => {
    if (meters > 1000) return `${(meters / 1000).toFixed(1)} км`;
    return `${Math.round(meters)} м`;
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.round(seconds / 60);
    if (mins > 60) return `${Math.floor(mins / 60)} ч ${mins % 60} мин`;
    return `${mins} мин`;
  };

  return (
    <div className="relative w-full h-[100dvh] flex flex-col bg-background overflow-hidden">
      {/* Map Container */}
      <div ref={mapContainerRef} className="absolute inset-0 z-0" />

      {/* Top Search Overlay */}
      <div className="relative z-10 w-full p-4 flex flex-col gap-2 pointer-events-none">
        <Card className="pointer-events-auto bg-card/90 backdrop-blur-md border-card-border shadow-xl">
          <CardContent className="p-3 flex flex-col gap-3">
            <div className="relative">
              <div className="flex items-center bg-input/50 rounded-md border border-border focus-within:border-ring transition-colors px-3 py-2">
                <div className="w-3 h-3 rounded-full bg-blue-500 mr-3" />
                <input
                  type="text"
                  placeholder="Откуда..."
                  className="bg-transparent border-none outline-none flex-1 text-sm text-foreground placeholder:text-muted-foreground"
                  value={fromPoint ? fromPoint.display_name : fromQuery}
                  onChange={(e) => {
                    setFromQuery(e.target.value);
                    setFromPoint(null);
                    setIsSearchingFrom(true);
                  }}
                  onFocus={() => setIsSearchingFrom(true)}
                  onBlur={() => setTimeout(() => setIsSearchingFrom(false), 200)}
                />
              </div>
              
              {isSearchingFrom && fromResults && fromResults.length > 0 && (
                <div className="absolute top-full left-0 w-full mt-1 bg-popover border border-border rounded-md shadow-lg overflow-hidden z-50">
                  {fromResults.map((r, i) => (
                    <div 
                      key={i} 
                      className="p-2 text-sm hover:bg-accent cursor-pointer truncate border-b border-border/50 last:border-0"
                      onClick={() => {
                        setFromPoint(r);
                        setFromQuery('');
                        setIsSearchingFrom(false);
                      }}
                    >
                      {r.display_name}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="relative">
              <div className="flex items-center bg-input/50 rounded-md border border-border focus-within:border-ring transition-colors px-3 py-2">
                <div className="w-3 h-3 rounded-full bg-emerald-500 mr-3" />
                <input
                  type="text"
                  placeholder="Куда..."
                  className="bg-transparent border-none outline-none flex-1 text-sm text-foreground placeholder:text-muted-foreground"
                  value={toPoint ? toPoint.display_name : toQuery}
                  onChange={(e) => {
                    setToQuery(e.target.value);
                    setToPoint(null);
                    setIsSearchingTo(true);
                  }}
                  onFocus={() => setIsSearchingTo(true)}
                  onBlur={() => setTimeout(() => setIsSearchingTo(false), 200)}
                />
              </div>
              
              {isSearchingTo && toResults && toResults.length > 0 && (
                <div className="absolute top-full left-0 w-full mt-1 bg-popover border border-border rounded-md shadow-lg overflow-hidden z-50">
                  {toResults.map((r, i) => (
                    <div 
                      key={i} 
                      className="p-2 text-sm hover:bg-accent cursor-pointer truncate border-b border-border/50 last:border-0"
                      onClick={() => {
                        setToPoint(r);
                        setToQuery('');
                        setIsSearchingTo(false);
                      }}
                    >
                      {r.display_name}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <Button 
              disabled={!fromPoint || !toPoint || isRouting} 
              onClick={handleCalculateRoute}
              className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-semibold"
            >
              <Navigation className="w-4 h-4 mr-2" />
              {isRouting ? 'Построение...' : 'Маршрут'}
            </Button>
          </CardContent>
        </Card>

        {/* Route Stats Overlay */}
        {routeResult && (
          <Card className="pointer-events-auto bg-card/90 backdrop-blur-md border-card-border shadow-xl">
            <CardContent className="p-3 flex items-center justify-between">
              <div>
                <div className="text-xs text-muted-foreground uppercase font-semibold tracking-wider">В пути</div>
                <div className="font-bold text-lg text-emerald-400">{formatDuration(routeResult.duration)}</div>
              </div>
              <div className="text-right">
                <div className="text-xs text-muted-foreground uppercase font-semibold tracking-wider">Дистанция</div>
                <div className="font-bold text-lg text-foreground">{formatDistance(routeResult.distance)}</div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      <div className="flex-1" />

      {/* Bottom Stats Bar */}
      <div className="relative z-10 w-full p-4 pointer-events-none pb-safe">
        <div className="pointer-events-auto flex items-center justify-between bg-card/90 backdrop-blur-md border border-card-border shadow-xl rounded-full px-4 py-2">
          <div className="flex items-center gap-4 text-xs font-medium">
            <div className="flex items-center gap-1.5 text-primary">
              <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
              ДПС: {stats?.dpsPostCount || 0}
            </div>
            <div className="flex items-center gap-1.5 text-destructive">
              <div className="w-2 h-2 rounded-full bg-destructive animate-pulse" />
              Аварий: {stats?.accidentCount || 0}
            </div>
          </div>
          <div className="text-[10px] text-muted-foreground flex items-center gap-1 cursor-pointer pointer-events-auto" onClick={() => {
            refetchEvents();
            refetchStats();
          }}>
            Обновлено: только что
          </div>
        </div>
      </div>
    </div>
  );
}

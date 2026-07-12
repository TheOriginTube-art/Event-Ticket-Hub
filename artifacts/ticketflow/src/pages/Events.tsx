import { useState, useEffect } from "react";
import { useListEvents } from "@workspace/api-client-react";
import type { EventSortOrder } from "@workspace/api-zod";
import { Link, useLocation } from "wouter";
import { Search, Film, Theater, Star, MapPin, SlidersHorizontal } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { formatRubles } from "@/lib/utils";
import { useCity } from "@/lib/city-context";

const SORT_OPTIONS: { value: EventSortOrder | ""; label: string }[] = [
  { value: "", label: "По умолчанию" },
  { value: "dateAsc", label: "Сначала ближайшие" },
  { value: "priceAsc", label: "Сначала дешевле" },
  { value: "priceDesc", label: "Сначала дороже" },
  { value: "ratingDesc", label: "По рейтингу" },
];

export default function Events() {
  const [location, setLocation] = useLocation();
  const searchParams = new URLSearchParams(window.location.search);
  const { city: globalCity, setCity: setGlobalCity } = useCity();
  
  const typeParam = (searchParams.get("type") ?? undefined) as "movie" | "theater" | undefined;
  const [type, setType] = useState<"movie" | "theater" | undefined>(typeParam);
  const [search, setSearch] = useState(searchParams.get("search") || "");
  const [debouncedSearch, setDebouncedSearch] = useState(search);
  const [sort, setSort] = useState<EventSortOrder | "">((searchParams.get("sort") as EventSortOrder) || "");

  // The city filter on this page and the header's global city selector share
  // the same state, so picking a city in either place stays in sync.
  const urlCity = searchParams.get("city");
  const [hydratedFromUrl, setHydratedFromUrl] = useState(false);
  useEffect(() => {
    if (!hydratedFromUrl && urlCity) {
      setGlobalCity(urlCity);
    }
    setHydratedFromUrl(true);
  }, []);
  const city = globalCity;
  const setCity = setGlobalCity;

  // Simple debounce for search
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 500);
    return () => clearTimeout(timer);
  }, [search]);

  const { data: events, isLoading } = useListEvents({
    type,
    city: city || undefined,
    search: debouncedSearch || undefined,
    sort: sort || undefined,
  });

  const handleTypeChange = (newType: "movie" | "theater" | undefined) => {
    setType(newType);
    const params = new URLSearchParams(window.location.search);
    if (newType) params.set("type", newType);
    else params.delete("type");
    setLocation(`/events?${params.toString()}`, { replace: true });
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-bold mb-2">Афиша</h1>
          <p className="text-muted-foreground">Билеты на лучшие события в городе</p>
        </div>
        
        <div className="flex bg-secondary p-1 rounded-lg w-full md:w-auto">
          <button
            onClick={() => handleTypeChange(undefined)}
            className={`flex-1 md:flex-none px-6 py-2 rounded-md text-sm font-medium transition-colors ${!type ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
          >
            Все
          </button>
          <button
            onClick={() => handleTypeChange("movie")}
            className={`flex-1 md:flex-none px-6 py-2 rounded-md text-sm font-medium transition-colors ${type === 'movie' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
          >
            Кино
          </button>
          <button
            onClick={() => handleTypeChange("theater")}
            className={`flex-1 md:flex-none px-6 py-2 rounded-md text-sm font-medium transition-colors ${type === 'theater' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
          >
            Театр
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        {/* Filters Sidebar */}
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-card border border-white/5 rounded-xl p-5 space-y-6 sticky top-24">
            <div className="flex items-center gap-2 font-semibold pb-2 border-b border-white/5">
              <SlidersHorizontal className="w-4 h-4" />
              Фильтры
            </div>
            
            <div className="space-y-3">
              <label className="text-sm font-medium text-muted-foreground">Поиск</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input 
                  placeholder="Название события..." 
                  className="pl-9 bg-background/50 border-white/10"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </div>
            
            <div className="space-y-3">
              <label className="text-sm font-medium text-muted-foreground">Сортировка</label>
              <select
                className="flex h-11 w-full rounded-lg border border-white/10 bg-background/50 px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary appearance-none"
                style={{ colorScheme: "dark" }}
                value={sort}
                onChange={(e) => setSort(e.target.value as EventSortOrder | "")}
              >
                {SORT_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value} className="bg-[#101014] text-white">
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            {(search || city || sort) && (
              <Button 
                variant="outline" 
                className="w-full border-white/10" 
                onClick={() => {
                  setSearch("");
                  setCity("");
                  setSort("");
                }}
              >
                Сбросить фильтры
              </Button>
            )}
          </div>
        </div>

        {/* Events Grid */}
        <div className="lg:col-span-3">
          {isLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex flex-col gap-3">
                  <Skeleton className="aspect-[2/3] rounded-xl w-full" />
                  <Skeleton className="h-6 w-3/4" />
                  <Skeleton className="h-4 w-1/2" />
                </div>
              ))}
            </div>
          ) : events && events.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {events.map((event) => (
                <Link key={event.id} href={`/events/${event.id}`} className="group cursor-pointer">
                  <div className="relative aspect-[2/3] rounded-xl overflow-hidden mb-4 bg-secondary">
                    {event.posterUrl ? (
                      <img 
                        src={event.posterUrl} 
                        alt={event.title} 
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-secondary">
                        {event.type === 'movie' ? <Film className="w-12 h-12 text-muted" /> : <Theater className="w-12 h-12 text-muted" />}
                      </div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-60 group-hover:opacity-80 transition-opacity" />
                    
                    <div className="absolute top-3 left-3 flex gap-2">
                      <Badge variant={event.type === 'movie' ? 'cinema' : 'theater'} className="backdrop-blur-md bg-background/50 border-none">
                        {event.type === 'movie' ? 'Кино' : 'Театр'}
                      </Badge>
                    </div>
                    
                    {event.rating && (
                      <div className="absolute top-3 right-3 flex items-center gap-1 bg-black/50 backdrop-blur-md rounded-full px-2 py-1 text-xs font-bold text-white">
                        <Star className="w-3 h-3 text-yellow-500 fill-yellow-500" />
                        {event.rating.toFixed(1)}
                      </div>
                    )}
                  </div>
                  
                  <h3 className="font-bold text-lg leading-tight mb-1 group-hover:text-primary transition-colors">
                    {event.title}
                  </h3>
                  
                  <div className="flex items-center text-sm text-muted-foreground gap-3 mb-2">
                    {event.genre && <span>{event.genre}</span>}
                    {event.ageRating && <span className="px-1.5 py-0.5 border border-white/10 rounded text-[10px] leading-none">{event.ageRating}</span>}
                  </div>

                  {event.cities.length > 0 && (
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <MapPin className="w-3.5 h-3.5 shrink-0" />
                      <span className="truncate">{event.cities.join(", ")}</span>
                    </div>
                  )}
                  
                  <div className="mt-3">
                    <div className="text-sm font-medium">
                      от {formatRubles(event.minPriceCents)}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-20 text-center border border-white/5 rounded-xl bg-card/50">
              <Search className="w-12 h-12 text-muted mb-4" />
              <h3 className="text-lg font-bold mb-2">Ничего не найдено</h3>
              <p className="text-muted-foreground mb-6 max-w-md">
                По вашему запросу нет мероприятий. Попробуйте изменить фильтры или поискать что-то другое.
              </p>
              <Button onClick={() => { setSearch(""); setCity(""); setType(undefined); setSort(""); }}>
                Сбросить фильтры
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

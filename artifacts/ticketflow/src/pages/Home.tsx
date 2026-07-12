import { useGetHomeHighlights } from "@workspace/api-client-react";
import { Link } from "wouter";
import { Film, Theater, Music, ArrowRight, Star, Clock, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { formatRubles } from "@/lib/utils";
import { useCity } from "@/lib/city-context";
import { EVENT_TYPE_BADGE_VARIANT, EVENT_TYPE_LABELS } from "@/lib/event-types";
import { useSeo } from "@/lib/seo";

export default function Home() {
  const { city } = useCity();
  const { data: highlights, isLoading } = useGetHomeHighlights(city ? { city } : undefined);

  useSeo({
    description:
      "Афиша кино, театра и концертов в одном месте. Выбирайте места на карте зала и покупайте билеты онлайн без наценок.",
  });

  return (
    <div className="flex flex-col">
      {/* Hero Section */}
      <section className="relative pt-24 pb-32 overflow-hidden">
        <div className="absolute inset-0 z-0">
          <div className="absolute inset-0 bg-gradient-to-b from-background/20 via-background/80 to-background z-10" />
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-primary/20 blur-[120px] rounded-full opacity-50" />
        </div>
        
        <div className="container mx-auto px-4 relative z-20 text-center">
          <Badge className="mb-6 px-4 py-1.5 text-sm bg-primary/10 text-primary border-primary/20 backdrop-blur-sm">
            Афиша в один клик
          </Badge>
          <h1 className="text-5xl md:text-7xl font-bold tracking-tight mb-6 max-w-4xl mx-auto leading-tight">
            Лучшие места в городе <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-orange-400">
              уже ждут вас
            </span>
          </h1>
          <p className="text-xl text-muted-foreground mb-10 max-w-2xl mx-auto">
            Кино, театр и концерты без бесконечных поисков. Собрали все сеансы, чтобы вы могли купить билет прямо сейчас.
          </p>
          
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link href="/events?type=movie" className="w-full sm:w-auto">
              <Button size="lg" className="w-full gap-2 rounded-full">
                <Film className="w-5 h-5" />
                В кино
              </Button>
            </Link>
            <Link href="/events?type=theater" className="w-full sm:w-auto">
              <Button size="lg" variant="outline" className="w-full gap-2 rounded-full border-white/10 hover:bg-white/5">
                <Theater className="w-5 h-5" />
                В театр
              </Button>
            </Link>
            <Link href="/events?type=concert" className="w-full sm:w-auto">
              <Button size="lg" variant="outline" className="w-full gap-2 rounded-full border-white/10 hover:bg-white/5">
                <Music className="w-5 h-5" />
                На концерт
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="py-12 border-y border-white/5 bg-white/[0.02]">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            <div className="text-center">
              <div className="text-3xl font-bold text-white mb-2">
                {isLoading ? <Skeleton className="h-9 w-16 mx-auto" /> : highlights?.eventsCount || 0}
              </div>
              <div className="text-sm text-muted-foreground">Мероприятий</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-white mb-2">
                {isLoading ? <Skeleton className="h-9 w-16 mx-auto" /> : highlights?.totalUpcomingSessions || 0}
              </div>
              <div className="text-sm text-muted-foreground">Сеансов</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-white mb-2">
                {isLoading ? <Skeleton className="h-9 w-16 mx-auto" /> : highlights?.citiesCount || 0}
              </div>
              <div className="text-sm text-muted-foreground">Городов</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-white mb-2">0%</div>
              <div className="text-sm text-muted-foreground">Наценок сервиса</div>
            </div>
          </div>
        </div>
      </section>

      {/* Featured Events */}
      <section className="py-24">
        <div className="container mx-auto px-4">
          <div className="flex items-end justify-between mb-12">
            <div>
              <h2 className="text-3xl font-bold mb-2">В центре внимания</h2>
              <p className="text-muted-foreground">Самые ожидаемые премьеры недели</p>
            </div>
            <Link href="/events">
              <Button variant="ghost" className="gap-2 hidden md:flex">
                Все события
                <ArrowRight className="w-4 h-4" />
              </Button>
            </Link>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {isLoading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex flex-col gap-3">
                  <Skeleton className="aspect-[2/3] rounded-xl w-full" />
                  <Skeleton className="h-6 w-3/4" />
                  <Skeleton className="h-4 w-1/2" />
                </div>
              ))
            ) : highlights?.featuredEvents.map((event) => (
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
                      {event.type === 'movie' ? <Film className="w-12 h-12 text-muted" /> : event.type === 'theater' ? <Theater className="w-12 h-12 text-muted" /> : <Music className="w-12 h-12 text-muted" />}
                    </div>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-60 group-hover:opacity-80 transition-opacity" />
                  
                  <div className="absolute top-3 left-3 flex gap-2">
                    <Badge variant={EVENT_TYPE_BADGE_VARIANT[event.type]} className="backdrop-blur-md bg-background/50 border-none">
                      {EVENT_TYPE_LABELS[event.type]}
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
                
                <div className="mt-3">
                  <div className="text-sm font-medium">
                    от {formatRubles(event.minPriceCents)}
                  </div>
                </div>
              </Link>
            ))}
          </div>
          
          <div className="mt-8 md:hidden">
            <Link href="/events">
              <Button variant="outline" className="w-full gap-2 border-white/10">
                Все события
                <ArrowRight className="w-4 h-4" />
              </Button>
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}

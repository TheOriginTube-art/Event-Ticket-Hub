import { useEffect, useState } from "react";
import { useParams } from "wouter";
import { useGetEvent, useGetSession, useGetSessionSeats, useCreateCheckout } from "@workspace/api-client-react";
import type { Seat } from "@workspace/api-zod";
import { formatRubles, formatDate, formatTime } from "@/lib/utils";
import { Star, Clock, MapPin, Calendar, CreditCard, Loader2, AlertCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { SeatMap } from "@/components/SeatMap";
import { useAuth } from "@/lib/auth-context";
import { useCity } from "@/lib/city-context";

export default function EventDetail() {
  const { id } = useParams();
  const eventId = Number(id);
  
  const { data: event, isLoading: isEventLoading } = useGetEvent(eventId);
  
  const [selectedSessionId, setSelectedSessionId] = useState<number | null>(null);

  const { city } = useCity();
  // Locally overrides the global city filter on this page only, when the user
  // explicitly asks to see sessions in every city for this event.
  const [showAllCities, setShowAllCities] = useState(false);

  // Re-apply the city filter whenever the global city or the viewed event changes.
  useEffect(() => {
    setShowAllCities(false);
  }, [city, eventId]);

  const allSessions = event?.sessions ?? [];
  const cityFilteredSessions = city ? allSessions.filter((s) => s.venue.city === city) : allSessions;
  const isCityFilterActive = Boolean(city) && !showAllCities;
  const sessionsToShow = isCityFilterActive ? cityFilteredSessions : allSessions;
  const hasSessionsInOtherCities = isCityFilterActive && cityFilteredSessions.length === 0 && allSessions.length > 0;

  // Group sessions by date
  const groupedSessions = sessionsToShow.reduce((acc, session) => {
    const date = session.startsAt.split('T')[0];
    if (!acc[date]) acc[date] = [];
    acc[date].push(session);
    return acc;
  }, {} as Record<string, typeof sessionsToShow>);
  
  // Sort dates
  const sortedDates = Object.keys(groupedSessions).sort();

  if (isEventLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="md:col-span-1">
            <Skeleton className="w-full aspect-[2/3] rounded-xl" />
          </div>
          <div className="md:col-span-2 space-y-4">
            <Skeleton className="h-10 w-3/4" />
            <Skeleton className="h-6 w-1/4" />
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-64 w-full mt-8" />
          </div>
        </div>
      </div>
    );
  }

  if (!event) {
    return (
      <div className="container mx-auto px-4 py-20 text-center">
        <h1 className="text-2xl font-bold mb-2">Мероприятие не найдено</h1>
        <p className="text-muted-foreground">Возможно, оно было удалено или перемещено.</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
        {/* Left Column: Poster & Info */}
        <div className="lg:col-span-4 flex flex-col gap-6">
          <div className="relative aspect-[2/3] rounded-xl overflow-hidden shadow-2xl shadow-primary/5">
            {event.posterUrl ? (
              <img src={event.posterUrl} alt={event.title} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full bg-secondary flex items-center justify-center">
                <span className="text-muted-foreground">Нет постера</span>
              </div>
            )}
            <div className="absolute top-4 left-4">
              <Badge variant={event.type === 'movie' ? 'cinema' : 'theater'} className="backdrop-blur-md bg-background/50 border-none text-sm px-3 py-1">
                {event.type === 'movie' ? 'Кино' : 'Театр'}
              </Badge>
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-4 bg-card border border-white/5 rounded-xl p-5">
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">Рейтинг</div>
              <div className="flex items-center gap-1.5 font-semibold text-lg">
                <Star className="w-4 h-4 text-yellow-500 fill-yellow-500" />
                {event.rating ? event.rating.toFixed(1) : '—'}
              </div>
            </div>
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">Продолжительность</div>
              <div className="flex items-center gap-1.5 font-semibold text-lg">
                <Clock className="w-4 h-4 text-muted-foreground" />
                {event.durationMinutes ? `${event.durationMinutes} мин` : '—'}
              </div>
            </div>
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">Возраст</div>
              <div className="font-semibold text-lg">
                {event.ageRating || '0+'}
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Details & Sessions */}
        <div className="lg:col-span-8 flex flex-col gap-8">
          <div>
            <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-4 leading-tight">
              {event.title}
            </h1>
            <div className="flex flex-wrap items-center gap-3 text-muted-foreground mb-6">
              {event.genre && <span>{event.genre}</span>}
            </div>
            {event.description && (
              <p className="text-lg leading-relaxed text-foreground/80 whitespace-pre-line">
                {event.description}
              </p>
            )}
          </div>

          <div className="border-t border-white/5 pt-8">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
              <h2 className="text-2xl font-bold">Расписание сеансов</h2>
              {isCityFilterActive && cityFilteredSessions.length > 0 && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <MapPin className="w-4 h-4 text-primary shrink-0" />
                  <span>Показаны сеансы в городе «{city}»</span>
                  <button
                    type="button"
                    onClick={() => setShowAllCities(true)}
                    className="text-primary hover:underline font-medium"
                  >
                    Показать все города
                  </button>
                </div>
              )}
            </div>

            {hasSessionsInOtherCities ? (
              <div className="bg-card border border-white/5 rounded-xl p-8 text-center space-y-4">
                <p className="text-muted-foreground">
                  В городе «{city}» нет сеансов этого мероприятия.
                </p>
                <Button variant="outline" className="border-white/10" onClick={() => setShowAllCities(true)}>
                  Показать сеансы в других городах
                </Button>
              </div>
            ) : sortedDates.length === 0 ? (
              <div className="bg-card border border-white/5 rounded-xl p-8 text-center">
                <p className="text-muted-foreground">Нет доступных сеансов</p>
              </div>
            ) : (
              <div className="space-y-8">
                {sortedDates.map(date => (
                  <div key={date}>
                    <div className="flex items-center gap-2 mb-4">
                      <Calendar className="w-5 h-5 text-primary" />
                      <h3 className="text-xl font-semibold capitalize">
                        {formatDate(date)}
                      </h3>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {groupedSessions[date].map(session => (
                        <div 
                          key={session.id}
                          className={`
                            group relative overflow-hidden rounded-xl border transition-all duration-300
                            ${selectedSessionId === session.id 
                              ? 'border-primary/50 bg-primary/5 shadow-[0_0_20px_rgba(255,69,0,0.15)] ring-1 ring-primary/20' 
                              : 'border-white/5 bg-card hover:border-primary/30'}
                          `}
                        >
                          <button 
                            className="w-full text-left p-5 flex flex-col gap-3 relative z-10"
                            onClick={() => setSelectedSessionId(selectedSessionId === session.id ? null : session.id)}
                          >
                            <div className="flex justify-between items-start w-full">
                              <div className="text-2xl font-bold text-foreground">
                                {formatTime(session.startsAt)}
                              </div>
                              <div className="text-sm font-medium text-primary">
                                от {formatRubles(session.minPriceCents)}
                              </div>
                            </div>
                            
                            <div className="flex items-start gap-2 text-sm text-muted-foreground mt-1">
                              <MapPin className="w-4 h-4 shrink-0 mt-0.5" />
                              <div>
                                <span className="font-medium text-foreground/80">{session.venue.name}</span>
                                {session.hall && <span> • {session.hall}</span>}
                                <div className="text-xs opacity-70 truncate max-w-[200px]">{session.venue.address}</div>
                              </div>
                            </div>
                          </button>
                          
                          {/* Expanded Checkout Form Area */}
                          <div className={`
                            grid transition-all duration-300 ease-in-out
                            ${selectedSessionId === session.id ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}
                          `}>
                            <div className="overflow-hidden">
                              <div className="p-5 pt-0 border-t border-white/5 bg-background/50">
                                {selectedSessionId === session.id && (
                                  <SessionCheckout sessionId={session.id} />
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

const MAX_SEATS_PER_ORDER = 10;

function SessionCheckout({ sessionId }: { sessionId: number }) {
  const { data: seats, isLoading } = useGetSessionSeats(sessionId);
  const { user } = useAuth();
  const checkoutMutation = useCreateCheckout();

  const [selectedSeatIds, setSelectedSeatIds] = useState<number[]>([]);
  const [name, setName] = useState(user?.name ?? "");
  const [email, setEmail] = useState(user?.email ?? "");

  if (isLoading) {
    return <div className="py-4 text-center text-sm text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin mx-auto" /></div>;
  }

  if (!seats || seats.length === 0) {
    return <div className="py-4 text-center text-sm text-muted-foreground">Билеты недоступны</div>;
  }

  const selectedSeats = seats.filter((s) => selectedSeatIds.includes(s.id));
  const totalCents = selectedSeats.reduce((sum, s) => sum + s.priceCents, 0);

  const toggleSeat = (seat: Seat) => {
    if (seat.status === "sold") return;
    setSelectedSeatIds((prev) =>
      prev.includes(seat.id) ? prev.filter((id) => id !== seat.id) : [...prev, seat.id],
    );
  };

  const handleCheckout = (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedSeatIds.length === 0) return;

    checkoutMutation.mutate(
      {
        data: {
          sessionId,
          seatIds: selectedSeatIds,
          customerName: name,
          customerEmail: email,
        },
      },
      {
        onSuccess: (result) => {
          window.location.href = result.url;
        },
      },
    );
  };

  return (
    <div className="pt-4 space-y-6">
      <div className="space-y-3">
        <label className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Выберите места (макс. {MAX_SEATS_PER_ORDER})
        </label>
        <div className="bg-black/20 rounded-xl border border-white/5 p-4">
          <SeatMap
            seats={seats}
            selectedSeatIds={selectedSeatIds}
            onToggleSeat={toggleSeat}
            maxSelectable={MAX_SEATS_PER_ORDER}
          />
        </div>
      </div>

      {selectedSeats.length > 0 && (
        <form onSubmit={handleCheckout} className="space-y-5 animate-in fade-in slide-in-from-top-2 duration-300">
          <div className="flex flex-wrap gap-2">
            {selectedSeats.map((seat) => (
              <Badge key={seat.id} variant="outline" className="border-primary/30 text-primary">
                Ряд {seat.rowLabel}, место {seat.seatNumber} — {formatRubles(seat.priceCents)}
              </Badge>
            ))}
          </div>

          <div className="grid grid-cols-1 gap-4">
            <div className="space-y-2">
              <label className="text-xs text-muted-foreground ml-1">Ваши данные для билетов</label>
              <Input
                required
                placeholder="Имя Фамилия"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="bg-card"
              />
              <Input
                required
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="bg-card"
              />
            </div>
          </div>

          <div className="bg-black/30 rounded-lg p-4 flex items-center justify-between border border-white/5">
            <div>
              <div className="text-sm text-muted-foreground">К оплате</div>
              <div className="text-2xl font-bold">{formatRubles(totalCents)}</div>
            </div>
            <Button
              type="submit"
              size="lg"
              className="gap-2"
              disabled={checkoutMutation.isPending}
            >
              {checkoutMutation.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : <CreditCard className="w-5 h-5" />}
              Купить
            </Button>
          </div>

          {checkoutMutation.isError && (
            <div className="flex items-center gap-2 text-destructive text-sm bg-destructive/10 p-3 rounded-md">
              <AlertCircle className="w-4 h-4" />
              Произошла ошибка при создании заказа. Пожалуйста, попробуйте еще раз.
            </div>
          )}
        </form>
      )}
    </div>
  );
}

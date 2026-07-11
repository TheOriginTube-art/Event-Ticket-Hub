import { useState } from "react";
import { useParams } from "wouter";
import { useGetEvent, useGetSession, useCreateCheckout } from "@workspace/api-client-react";
import { formatRubles, formatDate, formatTime } from "@/lib/utils";
import { Star, Clock, MapPin, Calendar, CreditCard, ChevronRight, Loader2, AlertCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";

export default function EventDetail() {
  const { id } = useParams();
  const eventId = Number(id);
  
  const { data: event, isLoading: isEventLoading } = useGetEvent(eventId);
  
  const [selectedSessionId, setSelectedSessionId] = useState<number | null>(null);
  
  // Group sessions by date
  const groupedSessions = event?.sessions.reduce((acc, session) => {
    const date = session.startsAt.split('T')[0];
    if (!acc[date]) acc[date] = [];
    acc[date].push(session);
    return acc;
  }, {} as Record<string, typeof event.sessions>) || {};
  
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
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">Источник</div>
              <div className="font-semibold truncate">
                {event.sourceName}
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
            <h2 className="text-2xl font-bold mb-6">Расписание сеансов</h2>
            
            {sortedDates.length === 0 ? (
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

function SessionCheckout({ sessionId }: { sessionId: number }) {
  const { data: session, isLoading } = useGetSession(sessionId);
  const checkoutMutation = useCreateCheckout();
  
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");

  if (isLoading) {
    return <div className="py-4 text-center text-sm text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin mx-auto" /></div>;
  }

  if (!session || session.ticketCategories.length === 0) {
    return <div className="py-4 text-center text-sm text-muted-foreground">Билеты недоступны</div>;
  }

  const selectedCategory = session.ticketCategories.find(c => c.id === selectedCategoryId);

  const handleCheckout = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCategoryId) return;
    
    checkoutMutation.mutate({
      data: {
        sessionId,
        ticketCategoryId: selectedCategoryId,
        quantity,
        customerName: name,
        customerEmail: email,
      }
    }, {
      onSuccess: (result) => {
        window.location.href = result.url;
      }
    });
  };

  return (
    <div className="pt-4 space-y-6">
      <div className="space-y-3">
        <label className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Выберите категорию</label>
        <div className="grid grid-cols-1 gap-2">
          {session.ticketCategories.map(cat => {
            const available = cat.seatsAvailable > 0;
            const isSelected = selectedCategoryId === cat.id;
            return (
              <button
                key={cat.id}
                type="button"
                disabled={!available}
                onClick={() => setSelectedCategoryId(cat.id)}
                className={`
                  flex items-center justify-between p-3 rounded-lg border text-left transition-all
                  ${!available ? 'opacity-50 cursor-not-allowed border-white/5 bg-white/5' : 
                    isSelected ? 'border-primary bg-primary/10' : 'border-white/10 hover:border-white/20 bg-card'}
                `}
              >
                <div>
                  <div className="font-medium">{cat.name}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {available ? `Осталось мест: ${cat.seatsAvailable}` : 'Нет мест'}
                  </div>
                </div>
                <div className={`font-semibold ${isSelected ? 'text-primary' : ''}`}>
                  {formatRubles(cat.priceCents)}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {selectedCategory && (
        <form onSubmit={handleCheckout} className="space-y-5 animate-in fade-in slide-in-from-top-2 duration-300">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-xs text-muted-foreground ml-1">Количество</label>
              <div className="flex items-center border border-white/10 rounded-lg overflow-hidden h-11 bg-background/50">
                <button 
                  type="button"
                  className="px-4 h-full hover:bg-white/5 transition-colors border-r border-white/10"
                  onClick={() => setQuantity(Math.max(1, quantity - 1))}
                >-</button>
                <div className="flex-1 text-center font-medium">{quantity}</div>
                <button 
                  type="button"
                  className="px-4 h-full hover:bg-white/5 transition-colors border-l border-white/10"
                  onClick={() => setQuantity(Math.min(Math.min(10, selectedCategory.seatsAvailable), quantity + 1))}
                >+</button>
              </div>
            </div>
            
            <div className="space-y-2 sm:col-span-2">
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
                placeholder="Email для отправки билетов" 
                value={email} 
                onChange={(e) => setEmail(e.target.value)} 
                className="bg-card"
              />
            </div>
          </div>

          <div className="bg-black/30 rounded-lg p-4 flex items-center justify-between border border-white/5">
            <div>
              <div className="text-sm text-muted-foreground">К оплате</div>
              <div className="text-2xl font-bold">{formatRubles(selectedCategory.priceCents * quantity)}</div>
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

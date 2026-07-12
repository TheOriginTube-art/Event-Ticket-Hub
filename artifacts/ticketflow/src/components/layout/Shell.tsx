import { useState } from "react";
import { Link, useLocation, useRoute } from "wouter";
import { Ticket, Search, MapPin, ChevronDown, Check, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { useHealthCheck, useGetEvent, getGetEventQueryKey } from "@workspace/api-client-react";
import { useCity } from "@/lib/city-context";
import { RUSSIAN_CITIES } from "@/lib/russian-cities";
import { useAuth } from "@/lib/auth-context";

const SUPPORT_EMAIL = "ticketflowhelp@gmail.com";

function buildMailtoUrl(subject: string, body: string): string {
  return `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

/** Refund request mailto link. Pre-fills the event title when the user is currently viewing an event page. */
function useRefundMailto(): string {
  const [isEventPage, params] = useRoute("/events/:id");
  const eventId = isEventPage ? Number(params?.id) : NaN;
  const { data: event } = useGetEvent(eventId, {
    query: { queryKey: getGetEventQueryKey(eventId), enabled: isEventPage && !Number.isNaN(eventId) },
  });

  const subject = "Возврат билета";
  const body =
    isEventPage && event
      ? `Здравствуйте!\n\nПрошу оформить возврат билета на мероприятие «${event.title}».\n\nЕ-mail, указанный при заказе:\nНомер заказа (если известен):\nПричина возврата:\n`
      : `Здравствуйте!\n\nПрошу оформить возврат билета на мероприятие:\n\nЕ-mail, указанный при заказе:\nНомер заказа (если известен):\nПричина возврата:\n`;

  return buildMailtoUrl(subject, body);
}

const HELP_MAILTO = buildMailtoUrl(
  "Вопрос в поддержку TicketFlow",
  "Здравствуйте!\n\nОпишите, пожалуйста, ваш вопрос:\n",
);

function CitySelector() {
  const { city, setCity } = useCity();
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Выбор города"
          className="relative h-9 rounded-full border border-white/10 bg-white/5 pl-8 pr-7 text-sm font-medium text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary hover:border-white/20 transition-colors"
        >
          <MapPin className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <span>{city || "Все города"}</span>
          <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-0 bg-[#101014] border-white/10">
        <Command>
          <CommandInput placeholder="Поиск города..." />
          <CommandList>
            <CommandEmpty>Город не найден</CommandEmpty>
            <CommandGroup>
              <CommandItem
                value="Все города"
                onSelect={() => {
                  setCity("");
                  setOpen(false);
                }}
              >
                <Check className={cn("w-4 h-4", city === "" ? "opacity-100" : "opacity-0")} />
                Все города
              </CommandItem>
              {RUSSIAN_CITIES.map((c) => (
                <CommandItem
                  key={c}
                  value={c}
                  onSelect={() => {
                    setCity(c);
                    setOpen(false);
                  }}
                >
                  <Check className={cn("w-4 h-4", city === c ? "opacity-100" : "opacity-0")} />
                  {c}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function RefundLink() {
  const mailto = useRefundMailto();
  return (
    <a href={mailto} className="cursor-pointer hover:text-primary transition-colors">
      Возврат билетов
    </a>
  );
}

export function Shell({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { data: health } = useHealthCheck();
  const { user, isLoading: isAuthLoading } = useAuth();

  return (
    <div className="min-h-[100dvh] flex flex-col">
      <header className="sticky top-0 z-50 w-full border-b border-white/5 bg-background/80 backdrop-blur-xl supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 transition-opacity hover:opacity-80">
            <div className="bg-primary p-1.5 rounded-lg shadow-[0_0_15px_rgba(255,69,0,0.4)]">
              <Ticket className="w-5 h-5 text-white" />
            </div>
            <span className="font-bold text-xl tracking-tight">TicketFlow</span>
          </Link>
          
          <nav className="hidden md:flex items-center gap-6">
            <Link href="/" className={`text-sm font-medium transition-colors hover:text-primary ${location === '/' ? 'text-white' : 'text-muted-foreground'}`}>
              Главная
            </Link>
            <Link href="/events?type=movie" className={`text-sm font-medium transition-colors hover:text-primary ${location.includes('/events') && location.includes('movie') ? 'text-white' : 'text-muted-foreground'}`}>
              Кино
            </Link>
            <Link href="/events?type=theater" className={`text-sm font-medium transition-colors hover:text-primary ${location.includes('/events') && location.includes('theater') ? 'text-white' : 'text-muted-foreground'}`}>
              Театр
            </Link>
          </nav>
          
          <div className="flex items-center gap-3">
            <div className="hidden sm:block">
              <CitySelector />
            </div>
            <Link href="/events">
              <Button variant="ghost" size="icon" className="rounded-full">
                <Search className="w-5 h-5" />
              </Button>
            </Link>
            {isAuthLoading ? null : user ? (
              <>
                {user.isAdmin && (
                  <Link href="/admin/orders">
                    <Button variant="outline" className="hidden sm:flex rounded-full px-5 border-white/10 hover:border-primary/50 hover:bg-primary/10">
                      Админ
                    </Button>
                  </Link>
                )}
                <Link href="/account">
                  <Button variant="outline" className="hidden sm:flex rounded-full px-5 gap-2 border-white/10 hover:border-primary/50 hover:bg-primary/10">
                    <User className="w-4 h-4" />
                    {user.name.split(" ")[0]}
                  </Button>
                </Link>
              </>
            ) : (
              <Link href="/login">
                <Button variant="outline" className="hidden sm:flex rounded-full px-6 border-white/10 hover:border-primary/50 hover:bg-primary/10">
                  Войти
                </Button>
              </Link>
            )}
          </div>
        </div>
      </header>
      
      <main className="flex-1 flex flex-col">
        {children}
      </main>
      
      <footer className="border-t border-white/5 bg-background py-12 mt-auto">
        <div className="container mx-auto px-4 grid grid-cols-1 md:grid-cols-4 gap-8">
          <div className="col-span-1 md:col-span-2">
            <Link href="/" className="flex items-center gap-2 mb-4">
              <Ticket className="w-5 h-5 text-primary" />
              <span className="font-bold text-lg">TicketFlow</span>
            </Link>
            <p className="text-muted-foreground text-sm max-w-sm">
              Ваш персональный проводник в мир кино и театра. Покупайте билеты без наценок и переплат в два клика.
            </p>
          </div>
          <div>
            <h3 className="font-semibold mb-4">События</h3>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li><Link href="/events?type=movie" className="hover:text-primary transition-colors">Кино</Link></li>
              <li><Link href="/events?type=theater" className="hover:text-primary transition-colors">Спектакли</Link></li>
              <li><Link href="/events" className="hover:text-primary transition-colors">Все мероприятия</Link></li>
            </ul>
          </div>
          <div>
            <h3 className="font-semibold mb-4">Поддержка</h3>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li><a href={HELP_MAILTO} className="cursor-pointer hover:text-primary transition-colors">Помощь</a></li>
              <li><RefundLink /></li>
              <li><span className="cursor-pointer hover:text-primary transition-colors">Правила сервиса</span></li>
            </ul>
          </div>
        </div>
      </footer>
    </div>
  );
}

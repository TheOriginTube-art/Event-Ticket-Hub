import { useState } from "react";
import { Link, useLocation, useRoute } from "wouter";
import { Ticket, Search, MapPin, ChevronDown, Check, User, Menu, ShieldAlert, LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Sheet, SheetClose, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
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

const NAV_LINKS = [
  { href: "/", label: "Главная", match: (loc: string) => loc === "/" },
  { href: "/events?type=movie", label: "Кино", match: (loc: string) => loc.includes("/events") && loc.includes("movie") },
  { href: "/events?type=theater", label: "Театр", match: (loc: string) => loc.includes("/events") && loc.includes("theater") },
  { href: "/events?type=concert", label: "Концерты", match: (loc: string) => loc.includes("/events") && loc.includes("concert") },
];

function MobileNav({ location }: { location: string }) {
  const { user, isLoading: isAuthLoading, logout } = useAuth();
  const [, setLocation] = useLocation();
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="rounded-full md:hidden h-11 w-11" aria-label="Открыть меню">
          <Menu className="w-6 h-6" />
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-[85%] max-w-xs bg-[#101014] border-white/10 flex flex-col p-0">
        <SheetHeader className="p-5 border-b border-white/5 text-left">
          <SheetTitle className="flex items-center gap-2">
            <Ticket className="w-5 h-5 text-primary" />
            TicketFlow
          </SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-6">
          <nav className="flex flex-col gap-1">
            {NAV_LINKS.map((link) => (
              <SheetClose asChild key={link.href}>
                <Link
                  href={link.href}
                  className={`min-h-11 flex items-center px-3 -mx-3 rounded-lg text-base font-medium transition-colors ${
                    link.match(location) ? "text-white bg-white/5" : "text-muted-foreground hover:text-white hover:bg-white/5"
                  }`}
                >
                  {link.label}
                </Link>
              </SheetClose>
            ))}
          </nav>

          <div className="space-y-2">
            <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground px-1">Город</div>
            <CitySelector />
          </div>

          <div className="mt-auto flex flex-col gap-2 pt-4 border-t border-white/5">
            {isAuthLoading ? null : user ? (
              <>
                {user.isAdmin && (
                  <SheetClose asChild>
                    <Link href="/admin/orders">
                      <Button variant="outline" className="w-full h-11 justify-start gap-2 border-white/10">
                        <ShieldAlert className="w-4 h-4" />
                        Админ
                      </Button>
                    </Link>
                  </SheetClose>
                )}
                <SheetClose asChild>
                  <Link href="/account">
                    <Button variant="outline" className="w-full h-11 justify-start gap-2 border-white/10">
                      <User className="w-4 h-4" />
                      {user.name.split(" ")[0]}
                    </Button>
                  </Link>
                </SheetClose>
                <Button
                  variant="ghost"
                  className="w-full h-11 justify-start text-muted-foreground"
                  onClick={async () => {
                    setOpen(false);
                    await logout();
                    setLocation("/");
                  }}
                >
                  Выйти
                </Button>
              </>
            ) : (
              <SheetClose asChild>
                <Link href="/login">
                  <Button className="w-full h-11 justify-start gap-2">
                    <LogIn className="w-4 h-4" />
                    Войти
                  </Button>
                </Link>
              </SheetClose>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
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
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`text-sm font-medium transition-colors hover:text-primary ${link.match(location) ? "text-white" : "text-muted-foreground"}`}
              >
                {link.label}
              </Link>
            ))}
          </nav>
          
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="hidden md:block">
              <CitySelector />
            </div>
            <Link href="/events">
              <Button variant="ghost" size="icon" className="rounded-full h-11 w-11 sm:h-10 sm:w-10">
                <Search className="w-5 h-5" />
              </Button>
            </Link>
            {isAuthLoading ? null : user ? (
              <>
                {user.isAdmin && (
                  <Link href="/admin/orders">
                    <Button variant="outline" className="hidden md:flex rounded-full px-5 border-white/10 hover:border-primary/50 hover:bg-primary/10">
                      Админ
                    </Button>
                  </Link>
                )}
                <Link href="/account">
                  <Button variant="outline" className="hidden md:flex rounded-full px-5 gap-2 border-white/10 hover:border-primary/50 hover:bg-primary/10">
                    <User className="w-4 h-4" />
                    {user.name.split(" ")[0]}
                  </Button>
                </Link>
              </>
            ) : (
              <Link href="/login">
                <Button variant="outline" className="hidden md:flex rounded-full px-6 border-white/10 hover:border-primary/50 hover:bg-primary/10">
                  Войти
                </Button>
              </Link>
            )}
            <MobileNav location={location} />
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
              Ваш персональный проводник в мир кино, театра и концертов. Покупайте билеты без наценок и переплат в два клика.
            </p>
          </div>
          <div>
            <h3 className="font-semibold mb-4">События</h3>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li><Link href="/events?type=movie" className="hover:text-primary transition-colors">Кино</Link></li>
              <li><Link href="/events?type=theater" className="hover:text-primary transition-colors">Спектакли</Link></li>
              <li><Link href="/events?type=concert" className="hover:text-primary transition-colors">Концерты</Link></li>
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

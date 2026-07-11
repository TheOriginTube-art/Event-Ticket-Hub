import { Link, useLocation } from "wouter";
import { Ticket, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useHealthCheck } from "@workspace/api-client-react";

export function Shell({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { data: health } = useHealthCheck();

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
            <Link href="/events">
              <Button variant="ghost" size="icon" className="rounded-full">
                <Search className="w-5 h-5" />
              </Button>
            </Link>
            <Button variant="outline" className="hidden sm:flex rounded-full px-6 border-white/10 hover:border-primary/50 hover:bg-primary/10">
              Войти
            </Button>
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
              <li><span className="cursor-pointer hover:text-primary transition-colors">Помощь</span></li>
              <li><span className="cursor-pointer hover:text-primary transition-colors">Возврат билетов</span></li>
              <li><span className="cursor-pointer hover:text-primary transition-colors">Правила сервиса</span></li>
            </ul>
          </div>
        </div>
      </footer>
    </div>
  );
}

import { Link, useLocation } from "wouter";
import { ShieldAlert, LayoutDashboard, Film, MapPin, Users, ClipboardList, Settings } from "lucide-react";

const TABS = [
  { href: "/admin", label: "Аналитика", icon: LayoutDashboard },
  { href: "/admin/orders", label: "Заказы", icon: ClipboardList },
  { href: "/admin/events", label: "Мероприятия", icon: Film },
  { href: "/admin/venues", label: "Площадки", icon: MapPin },
  { href: "/admin/users", label: "Пользователи", icon: Users },
  { href: "/admin/settings", label: "Настройки", icon: Settings },
];

export function AdminNav() {
  const [location] = useLocation();

  return (
    <div className="mb-8">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center">
          <ShieldAlert className="w-6 h-6 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold leading-tight">Админ-панель</h1>
          <p className="text-sm text-muted-foreground">Управление TicketFlow</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2 border-b border-white/5 pb-4">
        {TABS.map((tab) => {
          const active = tab.href === "/admin" ? location === "/admin" : location.startsWith(tab.href);
          const Icon = tab.icon;
          return (
            <Link key={tab.href} href={tab.href}>
              <button
                className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium transition-colors border ${
                  active
                    ? "bg-primary text-white border-primary"
                    : "border-white/10 text-muted-foreground hover:text-white hover:border-white/30"
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {tab.label}
              </button>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

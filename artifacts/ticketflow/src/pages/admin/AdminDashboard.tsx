import { Loader2, TrendingUp, Ticket, ShoppingBag, CalendarClock } from "lucide-react";
import { useGetAdminAnalytics, getGetAdminAnalyticsQueryKey } from "@workspace/api-client-react";
import { formatRubles } from "@/lib/utils";
import { useRequireAdmin } from "@/lib/useRequireAdmin";
import { AdminNav } from "@/components/admin/AdminNav";
import { useSeo } from "@/lib/seo";

export default function AdminDashboard() {
  const { ready } = useRequireAdmin();
  useSeo({ title: "Админ: аналитика", description: "Аналитика продаж TicketFlow.", noindex: true });

  const { data, isLoading } = useGetAdminAnalytics(
    { days: 30 },
    { query: { queryKey: getGetAdminAnalyticsQueryKey({ days: 30 }), enabled: ready } },
  );

  if (!ready || isLoading) {
    return (
      <div className="container mx-auto px-4 py-32 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const maxRevenue = Math.max(1, ...(data?.dailyBreakdown.map((d) => d.revenueCents) ?? [0]));

  return (
    <div className="container mx-auto px-4 py-10">
      <AdminNav />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard icon={TrendingUp} label="Выручка (всего)" value={formatRubles(data?.totalRevenueCents ?? 0)} />
        <StatCard icon={Ticket} label="Билетов продано" value={String(data?.totalTicketsSold ?? 0)} />
        <StatCard icon={ShoppingBag} label="Заказов оплачено" value={String(data?.totalOrders ?? 0)} />
        <StatCard icon={CalendarClock} label="Предстоящих сеансов" value={String(data?.upcomingSessionsCount ?? 0)} />
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <div className="bg-card border border-white/5 rounded-xl p-6">
          <h2 className="font-bold text-lg mb-4">Выручка по дням (30 дней)</h2>
          {!data?.dailyBreakdown.length ? (
            <p className="text-sm text-muted-foreground">Нет данных за этот период</p>
          ) : (
            <div className="space-y-2">
              {data.dailyBreakdown.map((day) => (
                <div key={day.date} className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground w-20 shrink-0">{day.date}</span>
                  <div className="flex-1 h-6 bg-white/5 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary rounded-full"
                      style={{ width: `${Math.max(4, (day.revenueCents / maxRevenue) * 100)}%` }}
                    />
                  </div>
                  <span className="text-xs font-medium w-24 text-right shrink-0">{formatRubles(day.revenueCents)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-card border border-white/5 rounded-xl p-6">
          <h2 className="font-bold text-lg mb-4">Топ мероприятий по продажам</h2>
          {!data?.topEvents.length ? (
            <p className="text-sm text-muted-foreground">Пока нет оплаченных заказов</p>
          ) : (
            <div className="space-y-3">
              {data.topEvents.map((event, i) => (
                <div key={event.eventId} className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-xs text-muted-foreground w-5 shrink-0">{i + 1}</span>
                    <span className="text-sm font-medium truncate">{event.title}</span>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-xs text-muted-foreground">{event.ticketsSold} билетов</span>
                    <span className="text-sm font-semibold">{formatRubles(event.revenueCents)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value }: { icon: typeof TrendingUp; label: string; value: string }) {
  return (
    <div className="bg-card border border-white/5 rounded-xl p-5">
      <Icon className="w-5 h-5 text-primary mb-2" />
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-xs text-muted-foreground mt-0.5">{label}</div>
    </div>
  );
}

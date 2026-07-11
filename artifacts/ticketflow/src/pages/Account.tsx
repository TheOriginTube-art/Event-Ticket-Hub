import { Link, useLocation } from "wouter";
import { useEffect } from "react";
import { useGetMyOrders, getGetMyOrdersQueryKey } from "@workspace/api-client-react";
import { LogOut, Ticket, Calendar, MapPin, Loader2, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatRubles, formatDate, formatTime } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";

export default function Account() {
  const [, setLocation] = useLocation();
  const { user, isLoading: isAuthLoading, logout } = useAuth();
  const { data: orders, isLoading: isOrdersLoading } = useGetMyOrders({
    query: { queryKey: getGetMyOrdersQueryKey(), enabled: !!user },
  });

  useEffect(() => {
    if (!isAuthLoading && !user) {
      setLocation("/login");
    }
  }, [isAuthLoading, user, setLocation]);

  if (isAuthLoading || !user) {
    return (
      <div className="container mx-auto px-4 py-32 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-10">
      <div className="flex items-center justify-between mb-10 flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center">
            <User className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold leading-tight">{user.name}</h1>
            <p className="text-sm text-muted-foreground">{user.email}</p>
          </div>
        </div>
        <Button
          variant="outline"
          className="gap-2 border-white/10"
          onClick={async () => {
            await logout();
            setLocation("/");
          }}
        >
          <LogOut className="w-4 h-4" />
          Выйти
        </Button>
      </div>

      <h2 className="text-xl font-bold mb-6">История заказов</h2>

      {isOrdersLoading ? (
        <div className="py-16 flex justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : !orders || orders.length === 0 ? (
        <div className="bg-card border border-white/5 rounded-xl p-10 text-center">
          <Ticket className="w-10 h-10 text-muted mx-auto mb-3" />
          <p className="text-muted-foreground mb-4">У вас еще нет заказов</p>
          <Link href="/events">
            <Button>Найти билеты</Button>
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {orders.map((order) => (
            <Link
              key={order.id}
              href={`/checkout/success?orderId=${order.id}`}
              className="block bg-card border border-white/5 rounded-xl p-5 hover:border-primary/30 transition-colors"
            >
              <div className="flex justify-between items-start gap-4 flex-wrap">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm text-primary font-medium">Заказ #{order.id}</span>
                    <Badge variant={order.status === "paid" ? "cinema" : "outline"}>
                      {order.status === "paid"
                        ? "Оплачен"
                        : order.status === "cancelled"
                          ? "Отменен"
                          : order.status === "awaiting_confirmation"
                            ? "Ожидает подтверждения"
                            : "Ожидает оплаты"}
                    </Badge>
                  </div>
                  <h3 className="font-bold text-lg">{order.event.title}</h3>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1">
                    <Calendar className="w-3.5 h-3.5" />
                    {formatDate(order.session.startsAt)} • {formatTime(order.session.startsAt)}
                  </div>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <MapPin className="w-3.5 h-3.5" />
                    {order.session.venue.name}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {order.seats.length} {order.seats.length === 1 ? "билет" : "билета(ов)"}
                  </div>
                </div>
                <div className="text-xl font-bold">{formatRubles(order.totalAmountCents)}</div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

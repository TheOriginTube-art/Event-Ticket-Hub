import { useGetOrder } from "@workspace/api-client-react";
import { useLocation } from "wouter";
import { CheckCircle2, Ticket, Calendar, MapPin, Loader2, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { formatRubles, formatDate, formatTime } from "@/lib/utils";
import { useEffect, useState } from "react";

export default function CheckoutSuccess() {
  const searchParams = new URLSearchParams(window.location.search);
  const orderId = Number(searchParams.get("orderId"));
  
  const { data: order, isLoading, refetch } = useGetOrder(orderId, {
    query: {
      enabled: !!orderId,
    }
  });

  const [isPolling, setIsPolling] = useState(false);

  // Poll if order is pending
  useEffect(() => {
    let interval: NodeJS.Timeout;
    
    if (order?.status === 'pending') {
      setIsPolling(true);
      interval = setInterval(() => {
        refetch();
      }, 2000);
    } else {
      setIsPolling(false);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [order?.status, refetch]);

  if (!orderId) {
    return (
      <div className="container mx-auto px-4 py-20 text-center">
        <h1 className="text-2xl font-bold mb-4">Заказ не найден</h1>
        <Link href="/">
          <Button>На главную</Button>
        </Link>
      </div>
    );
  }

  if (isLoading || isPolling) {
    return (
      <div className="container mx-auto px-4 py-32 flex flex-col items-center justify-center">
        <Loader2 className="w-12 h-12 animate-spin text-primary mb-6" />
        <h1 className="text-2xl font-bold mb-2">Проверяем статус оплаты...</h1>
        <p className="text-muted-foreground text-center max-w-md">
          Пожалуйста, подождите. Мы получаем подтверждение от платежной системы. Обычно это занимает несколько секунд.
        </p>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="container mx-auto px-4 py-20 text-center">
        <h1 className="text-2xl font-bold mb-4">Ошибка загрузки заказа</h1>
        <Link href="/">
          <Button>На главную</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-16 flex flex-col items-center justify-center min-h-[70vh]">
      <div className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center mb-6 shadow-[0_0_30px_rgba(34,197,94,0.3)]">
        <CheckCircle2 className="w-8 h-8 text-green-500" />
      </div>
      
      <h1 className="text-4xl font-bold tracking-tight mb-2 text-center">Билеты успешно куплены!</h1>
      <p className="text-muted-foreground text-center max-w-md mb-10">
        Письмо с билетами отправлено на <span className="text-foreground font-medium">{order.customerEmail}</span>.
      </p>

      <div className="w-full max-w-lg bg-card border border-white/10 rounded-2xl overflow-hidden shadow-xl">
        <div className="p-6 border-b border-white/5 flex gap-4">
          {order.event.posterUrl ? (
            <img src={order.event.posterUrl} alt="" className="w-20 h-28 object-cover rounded-md" />
          ) : (
            <div className="w-20 h-28 bg-secondary rounded-md flex items-center justify-center">
              <Ticket className="w-8 h-8 text-muted" />
            </div>
          )}
          
          <div className="flex flex-col justify-center">
            <div className="text-sm text-primary font-medium mb-1">
              Заказ #{order.id}
            </div>
            <h3 className="font-bold text-xl leading-tight mb-2">{order.event.title}</h3>
            <div className="text-sm text-muted-foreground">
              {order.quantity} × {order.ticketCategory.name}
            </div>
          </div>
        </div>
        
        <div className="p-6 space-y-5 bg-background/30">
          <div className="flex items-start gap-3">
            <Calendar className="w-5 h-5 text-muted-foreground mt-0.5" />
            <div>
              <div className="font-medium">{formatDate(order.session.startsAt)}</div>
              <div className="text-sm text-muted-foreground">Начало в {formatTime(order.session.startsAt)}</div>
            </div>
          </div>
          
          <div className="flex items-start gap-3">
            <MapPin className="w-5 h-5 text-muted-foreground mt-0.5" />
            <div>
              <div className="font-medium">{order.session.venue.name} {order.session.hall ? `• ${order.session.hall}` : ''}</div>
              <div className="text-sm text-muted-foreground">{order.session.venue.address}</div>
            </div>
          </div>
        </div>

        <div className="p-6 border-t border-white/5 bg-secondary flex justify-between items-center">
          <div className="text-muted-foreground">Итого оплачено</div>
          <div className="text-2xl font-bold">{formatRubles(order.totalAmountCents)}</div>
        </div>
      </div>

      <div className="mt-10 flex gap-4">
        <Link href={`/events/${order.event.id}`}>
          <Button variant="outline" className="border-white/10">К странице мероприятия</Button>
        </Link>
        <Link href="/events">
          <Button className="gap-2">
            Искать еще билеты
            <ArrowRight className="w-4 h-4" />
          </Button>
        </Link>
      </div>
    </div>
  );
}

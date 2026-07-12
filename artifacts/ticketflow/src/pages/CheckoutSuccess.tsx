import { useGetOrder, getGetOrderQueryKey } from "@workspace/api-client-react";
import { useLocation } from "wouter";
import { CheckCircle2, Ticket, Calendar, MapPin, Loader2, ArrowRight, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { formatRubles, formatDate, formatTime } from "@/lib/utils";
import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { useSeo } from "@/lib/seo";

export default function CheckoutSuccess() {
  const searchParams = new URLSearchParams(window.location.search);
  const orderId = Number(searchParams.get("orderId"));

  useSeo({ title: "Билеты куплены", description: "Ваши билеты успешно куплены.", noindex: true });

  const { data: order, isLoading, refetch } = useGetOrder(orderId, {
    query: {
      queryKey: getGetOrderQueryKey(orderId),
      enabled: !!orderId,
    }
  });

  const [isPolling, setIsPolling] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Ozon QR orders are not paid yet when landing here (Stripe redirects here
  // only after real payment) -- send them to the QR payment page instead.
  useEffect(() => {
    if (order && order.paymentMethod === "ozon_qr" && order.status !== "paid") {
      window.location.href = `${import.meta.env.BASE_URL}checkout/pay?orderId=${order.id}`;
    }
  }, [order]);

  // Poll if the Stripe order is still pending (webhook/redirect race).
  useEffect(() => {
    let interval: NodeJS.Timeout;

    if (order?.status === 'pending' && order.paymentMethod === 'stripe') {
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
  }, [order?.status, order?.paymentMethod, refetch]);

  useEffect(() => {
    if (!order || order.status !== 'paid') return;

    const payload = JSON.stringify({
      orderId: order.id,
      event: order.event.title,
      session: order.session.startsAt,
      venue: order.session.venue.name,
      seats: order.seats.map((s) => `${s.rowLabel}${s.seatNumber}`),
    });

    QRCode.toDataURL(payload, { width: 260, margin: 1, color: { dark: "#0a0a0a", light: "#ffffff" } })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(null));
  }, [order]);

  const handleDownload = () => {
    if (!qrDataUrl || !order) return;
    const link = document.createElement("a");
    link.href = qrDataUrl;
    link.download = `ticketflow-order-${order.id}.png`;
    link.click();
  };

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
        Сохраните QR-код ниже — он понадобится на входе. Билеты также доступны в вашем&nbsp;
        <Link href="/account" className="text-primary hover:underline">личном кабинете</Link>.
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
              {order.seats.length} {order.seats.length === 1 ? "билет" : "билета(ов)"}
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

          <div className="flex flex-wrap gap-2 pt-1">
            {order.seats.map((seat) => (
              <span
                key={seat.id}
                className="text-xs px-2.5 py-1 rounded-full border border-white/10 bg-white/5 text-foreground/80"
              >
                {seat.categoryName} • ряд {seat.rowLabel}, место {seat.seatNumber}
              </span>
            ))}
          </div>

          {qrDataUrl && (
            <div className="flex flex-col items-center gap-3 pt-4 border-t border-white/5">
              <img src={qrDataUrl} alt="QR-код билета" className="w-48 h-48 rounded-lg bg-white p-2" />
              <Button variant="outline" size="sm" className="gap-2 border-white/10" onClick={handleDownload}>
                <Download className="w-4 h-4" />
                Скачать QR-код
              </Button>
            </div>
          )}
          <canvas ref={canvasRef} className="hidden" />
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

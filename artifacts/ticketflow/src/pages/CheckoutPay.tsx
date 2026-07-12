import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { Loader2, Clock, CheckCircle2, XCircle, QrCode, ExternalLink } from "lucide-react";
import {
  useGetOrder,
  getGetOrderQueryKey,
  useMarkOrderPaid,
  useGetPaymentSettings,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { formatRubles } from "@/lib/utils";
import { useQueryClient } from "@tanstack/react-query";
import { useSeo } from "@/lib/seo";

function useCountdown(expiresAt: string | null | undefined) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  if (!expiresAt) return null;
  const remainingMs = new Date(expiresAt).getTime() - now;
  return Math.max(0, remainingMs);
}

function formatCountdown(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export default function CheckoutPay() {
  const searchParams = new URLSearchParams(window.location.search);
  const orderId = Number(searchParams.get("orderId"));
  const queryClient = useQueryClient();

  useSeo({ title: "Оплата заказа", description: "Оплата заказа по QR-коду.", noindex: true });

  const { data: order, isLoading, refetch } = useGetOrder(orderId, {
    query: { queryKey: getGetOrderQueryKey(orderId), enabled: !!orderId },
  });
  const { data: paymentSettings } = useGetPaymentSettings();
  const markPaidMutation = useMarkOrderPaid();

  const remainingMs = useCountdown(order?.status === "pending" ? order.expiresAt : null);

  // Poll while awaiting the customer's "I paid" click or admin confirmation.
  useEffect(() => {
    if (!order || (order.status !== "pending" && order.status !== "awaiting_confirmation")) return;
    const interval = setInterval(() => refetch(), 4000);
    return () => clearInterval(interval);
  }, [order, refetch]);

  const handleMarkPaid = async () => {
    if (!orderId) return;
    await markPaidMutation.mutateAsync({ id: orderId });
    queryClient.setQueryData(getGetOrderQueryKey(orderId), (prev: unknown) =>
      prev && typeof prev === "object" ? { ...prev, status: "awaiting_confirmation" } : prev,
    );
    refetch();
  };

  const expired = useMemo(
    () => order?.status === "pending" && remainingMs !== null && remainingMs <= 0,
    [order, remainingMs],
  );

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

  if (isLoading || !order) {
    return (
      <div className="container mx-auto px-4 py-32 flex flex-col items-center justify-center">
        <Loader2 className="w-12 h-12 animate-spin text-primary" />
      </div>
    );
  }

  if (order.status === "paid") {
    window.location.href = `${import.meta.env.BASE_URL}checkout/success?orderId=${order.id}`;
    return null;
  }

  if (order.status === "cancelled" || expired) {
    return (
      <div className="container mx-auto px-4 py-24 flex flex-col items-center justify-center text-center">
        <div className="w-20 h-20 bg-destructive/10 rounded-full flex items-center justify-center mb-6">
          <XCircle className="w-10 h-10 text-destructive" />
        </div>
        <h1 className="text-3xl font-bold mb-4">Время на оплату истекло</h1>
        <p className="text-muted-foreground max-w-md mx-auto mb-10">
          Бронь мест снята. Пожалуйста, оформите заказ заново.
        </p>
        <Link href={`/events/${order.event.id}`}>
          <Button size="lg">Вернуться к событию</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-14 flex flex-col items-center">
      <div className="w-full max-w-lg bg-card border border-white/10 rounded-2xl overflow-hidden shadow-xl">
        <div className="p-6 border-b border-white/5">
          <div className="flex items-center justify-between mb-1">
            <h1 className="text-2xl font-bold">Оплата по QR-коду</h1>
            {order.status === "pending" && remainingMs !== null && (
              <div className="flex items-center gap-1.5 text-sm font-medium text-amber-400">
                <Clock className="w-4 h-4" />
                {formatCountdown(remainingMs)}
              </div>
            )}
          </div>
          <p className="text-sm text-muted-foreground">Заказ #{order.id} • {order.event.title}</p>
        </div>

        <div className="p-6 space-y-6">
          {order.status === "pending" && (
            <>
              <p className="text-sm text-muted-foreground text-center">
                Отсканируйте QR-код в приложении Ozon Банк (или другом банковском приложении с поддержкой СБП) и
                переведите точную сумму заказа. Места забронированы за вами на время, указанное на таймере.
              </p>

              <div className="flex justify-center">
                {paymentSettings?.ozonQrImageUrl ? (
                  <img
                    src={paymentSettings.ozonQrImageUrl}
                    alt="QR-код для оплаты через Ozon Банк"
                    className="w-64 h-64 object-contain rounded-xl bg-white p-3"
                  />
                ) : (
                  <div className="w-64 h-64 flex items-center justify-center rounded-xl bg-white/5 text-muted-foreground">
                    <QrCode className="w-12 h-12" />
                  </div>
                )}
              </div>

              {paymentSettings?.instructions && (
                <p className="text-sm text-muted-foreground text-center whitespace-pre-wrap">
                  {paymentSettings.instructions}
                </p>
              )}

              <div className="flex items-center justify-between px-4 py-3 rounded-xl bg-secondary">
                <span className="text-muted-foreground">Сумма к оплате</span>
                <span className="text-xl font-bold">{formatRubles(order.totalAmountCents)}</span>
              </div>

              <a
                href="https://finance.ozon.ru/apps/sbp/ozonbankpay/019f53c7-22b5-7598-b254-3d0a858ca676"
                target="_blank"
                rel="noopener noreferrer"
                className="block"
              >
                <Button size="lg" variant="outline" className="w-full gap-2 border-white/10">
                  <ExternalLink className="w-4 h-4" />
                  Оплатить онлайн
                </Button>
              </a>

              <Button
                size="lg"
                className="w-full"
                onClick={handleMarkPaid}
                disabled={markPaidMutation.isPending}
              >
                {markPaidMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  "Я оплатил(а)"
                )}
              </Button>
              {markPaidMutation.isError && (
                <p className="text-sm text-destructive text-center">
                  Не удалось отправить подтверждение. Попробуйте еще раз.
                </p>
              )}
            </>
          )}

          {order.status === "awaiting_confirmation" && (
            <div className="flex flex-col items-center gap-4 py-6 text-center">
              <Loader2 className="w-10 h-10 animate-spin text-primary" />
              <h2 className="text-xl font-semibold">Ожидаем подтверждения оплаты</h2>
              <p className="text-muted-foreground max-w-sm">
                Мы получили ваше уведомление об оплате. Как только администратор проверит перевод, билеты появятся
                в вашем личном кабинете, а эта страница обновится автоматически.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

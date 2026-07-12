import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Loader2, ShieldAlert, Check, X, RefreshCw, Settings } from "lucide-react";
import {
  useListAdminOrders,
  getListAdminOrdersQueryKey,
  useConfirmAdminOrder,
  useRejectAdminOrder,
} from "@workspace/api-client-react";
import type { ListAdminOrdersParams } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatRubles, formatDate, formatTime } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { useSeo } from "@/lib/seo";

const STATUS_TABS: { value: NonNullable<ListAdminOrdersParams["status"]>; label: string }[] = [
  { value: "awaiting_confirmation", label: "Ждут подтверждения" },
  { value: "pending", label: "Ждут оплаты" },
  { value: "paid", label: "Оплачены" },
  { value: "all", label: "Все" },
];

export default function AdminOrders() {
  const [, setLocation] = useLocation();
  const { user, isLoading: isAuthLoading } = useAuth();
  const [status, setStatus] = useState<NonNullable<ListAdminOrdersParams["status"]>>("awaiting_confirmation");
  const queryClient = useQueryClient();

  useSeo({ title: "Админ: заказы", description: "Управление заказами TicketFlow.", noindex: true });

  const { data: orders, isLoading } = useListAdminOrders(
    { status },
    { query: { queryKey: getListAdminOrdersQueryKey({ status }), enabled: !!user?.isAdmin, refetchInterval: 10000 } },
  );

  const confirmMutation = useConfirmAdminOrder();
  const rejectMutation = useRejectAdminOrder();

  useEffect(() => {
    if (!isAuthLoading && (!user || !user.isAdmin)) {
      setLocation("/");
    }
  }, [isAuthLoading, user, setLocation]);

  const refresh = () => queryClient.invalidateQueries({ queryKey: getListAdminOrdersQueryKey({ status }) });

  if (isAuthLoading || !user?.isAdmin) {
    return (
      <div className="container mx-auto px-4 py-32 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-10">
      <div className="flex items-center justify-between mb-8 flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center">
            <ShieldAlert className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold leading-tight">Заказы</h1>
            <p className="text-sm text-muted-foreground">Проверка и подтверждение оплаты по QR-коду</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" className="border-white/10" onClick={refresh} title="Обновить">
            <RefreshCw className="w-4 h-4" />
          </Button>
          <Link href="/admin/settings">
            <Button variant="outline" className="gap-2 border-white/10">
              <Settings className="w-4 h-4" />
              Настройки оплаты
            </Button>
          </Link>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mb-8">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.value}
            onClick={() => setStatus(tab.value)}
            className={`px-4 py-2 rounded-full text-sm font-medium transition-colors border ${
              status === tab.value
                ? "bg-primary text-white border-primary"
                : "border-white/10 text-muted-foreground hover:text-white hover:border-white/30"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="py-16 flex justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : !orders || orders.length === 0 ? (
        <div className="bg-card border border-white/5 rounded-xl p-10 text-center text-muted-foreground">
          Нет заказов в этой категории
        </div>
      ) : (
        <div className="space-y-4">
          {orders.map((order) => (
            <div key={order.id} className="bg-card border border-white/5 rounded-xl p-5">
              <div className="flex justify-between items-start gap-4 flex-wrap">
                <div>
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="text-sm text-primary font-medium">Заказ #{order.id}</span>
                    <Badge variant="outline">
                      {order.status === "paid"
                        ? "Оплачен"
                        : order.status === "cancelled"
                          ? "Отменен"
                          : order.status === "awaiting_confirmation"
                            ? "Ждет подтверждения"
                            : "Ждет оплаты"}
                    </Badge>
                    <Badge variant="secondary">{order.paymentMethod === "ozon_qr" ? "Ozon QR" : "Stripe"}</Badge>
                  </div>
                  <h3 className="font-bold text-lg">{order.event.title}</h3>
                  <div className="text-sm text-muted-foreground">
                    {formatDate(order.session.startsAt)} • {formatTime(order.session.startsAt)} •{" "}
                    {order.session.venue.name}
                  </div>
                  <div className="text-sm text-muted-foreground mt-1">
                    {order.customerName} • {order.customerEmail}
                  </div>
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {order.seats.map((seat) => (
                      <span
                        key={seat.id}
                        className="text-xs px-2 py-0.5 rounded-full border border-white/10 bg-white/5 text-foreground/80"
                      >
                        {seat.categoryName} • {seat.rowLabel}{seat.seatNumber}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="flex flex-col items-end gap-3">
                  <div className="text-xl font-bold">{formatRubles(order.totalAmountCents)}</div>
                  {(order.status === "pending" || order.status === "awaiting_confirmation") && (
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1.5 border-destructive/30 text-destructive hover:bg-destructive/10"
                        disabled={rejectMutation.isPending}
                        onClick={() => rejectMutation.mutate({ id: order.id }, { onSuccess: refresh })}
                      >
                        <X className="w-3.5 h-3.5" />
                        Отклонить
                      </Button>
                      <Button
                        size="sm"
                        className="gap-1.5"
                        disabled={confirmMutation.isPending}
                        onClick={() => confirmMutation.mutate({ id: order.id }, { onSuccess: refresh })}
                      >
                        <Check className="w-3.5 h-3.5" />
                        Подтвердить оплату
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Loader2, Check, X, RefreshCw, Download, Search } from "lucide-react";
import {
  useListAdminOrders,
  getListAdminOrdersQueryKey,
  useConfirmAdminOrder,
  useRejectAdminOrder,
} from "@workspace/api-client-react";
import type { ListAdminOrdersParams } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { formatRubles, formatDate, formatTime } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";
import { useQueryClient } from "@tanstack/react-query";
import { useSeo } from "@/lib/seo";
import { AdminNav } from "@/components/admin/AdminNav";

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
  const [search, setSearch] = useState("");
  const queryClient = useQueryClient();

  useSeo({ title: "Админ: заказы", description: "Управление заказами TicketFlow.", noindex: true });

  const queryParams: ListAdminOrdersParams = search.trim() ? { status, search: search.trim() } : { status };
  const { data: orders, isLoading } = useListAdminOrders(queryParams, {
    query: { queryKey: getListAdminOrdersQueryKey(queryParams), enabled: !!user?.isAdmin, refetchInterval: 10000 },
  });

  const exportUrl = `${import.meta.env.BASE_URL}api/admin/orders/export?status=${status}${search.trim() ? `&search=${encodeURIComponent(search.trim())}` : ""}`;

  const confirmMutation = useConfirmAdminOrder();
  const rejectMutation = useRejectAdminOrder();

  useEffect(() => {
    if (!isAuthLoading && (!user || !user.isAdmin)) {
      setLocation("/");
    }
  }, [isAuthLoading, user, setLocation]);

  const refresh = () => queryClient.invalidateQueries({ queryKey: getListAdminOrdersQueryKey(queryParams) });

  if (isAuthLoading || !user?.isAdmin) {
    return (
      <div className="container mx-auto px-4 py-32 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-10">
      <AdminNav />

      <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
        <h2 className="text-xl font-bold">Заказы</h2>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" className="border-white/10" onClick={refresh} title="Обновить">
            <RefreshCw className="w-4 h-4" />
          </Button>
          <a href={exportUrl} target="_blank" rel="noreferrer">
            <Button variant="outline" className="gap-2 border-white/10">
              <Download className="w-4 h-4" />
              Экспорт CSV
            </Button>
          </a>
        </div>
      </div>

      <div className="relative mb-4 max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Поиск по имени или e-mail"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
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

                <div className="flex flex-col items-stretch sm:items-end gap-3 w-full sm:w-auto">
                  <div className="text-xl font-bold sm:text-right">{formatRubles(order.totalAmountCents)}</div>
                  {(order.status === "pending" || order.status === "awaiting_confirmation") && (
                    <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
                      <Button
                        variant="outline"
                        className="gap-1.5 h-11 border-destructive/30 text-destructive hover:bg-destructive/10"
                        disabled={rejectMutation.isPending}
                        onClick={() => rejectMutation.mutate({ id: order.id }, { onSuccess: refresh })}
                      >
                        <X className="w-3.5 h-3.5" />
                        Отклонить
                      </Button>
                      <Button
                        className="gap-1.5 h-11"
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

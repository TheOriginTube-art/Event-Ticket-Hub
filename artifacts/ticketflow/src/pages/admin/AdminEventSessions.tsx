import { useState } from "react";
import { useParams, Link } from "wouter";
import { Loader2, ArrowLeft, Plus, Pencil, Trash2, Ban, CheckCircle2, Shuffle } from "lucide-react";
import {
  useListAdminEventSessions,
  getListAdminEventSessionsQueryKey,
  useListAdminVenues,
  getListAdminVenuesQueryKey,
  useCreateAdminSession,
  useUpdateAdminSession,
  useDeleteAdminSession,
  useUpdateAdminTicketCategory,
  useToggleAdminSeatBlock,
  useFillRandomSeats,
  useGetEvent,
  getGetEventQueryKey,
  useGetSessionSeats,
  getGetSessionSeatsQueryKey,
} from "@workspace/api-client-react";
import type { SessionSummary, Seat } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { formatRubles, formatDate, formatTime } from "@/lib/utils";
import { useRequireAdmin } from "@/lib/useRequireAdmin";
import { AdminNav } from "@/components/admin/AdminNav";
import { useQueryClient } from "@tanstack/react-query";
import { useSeo } from "@/lib/seo";

type Tier = { name: string; priceCents: string; seatsTotal: string };
const EMPTY_TIER: Tier = { name: "", priceCents: "", seatsTotal: "" };

function toLocalInputValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export default function AdminEventSessions() {
  const { ready } = useRequireAdmin();
  const params = useParams<{ id: string }>();
  const eventId = Number(params.id);
  useSeo({ title: "Админ: сеансы", description: "Управление сеансами мероприятия.", noindex: true });
  const queryClient = useQueryClient();

  const { data: event } = useGetEvent(eventId, {
    query: { queryKey: getGetEventQueryKey(eventId), enabled: ready && !Number.isNaN(eventId) },
  });
  const { data: sessions, isLoading } = useListAdminEventSessions(eventId, {
    query: { queryKey: getListAdminEventSessionsQueryKey(eventId), enabled: ready && !Number.isNaN(eventId) },
  });
  const { data: venues } = useListAdminVenues({
    query: { queryKey: getListAdminVenuesQueryKey(), enabled: ready },
  });

  const createMutation = useCreateAdminSession();
  const updateMutation = useUpdateAdminSession();
  const deleteMutation = useDeleteAdminSession();

  const refresh = () => queryClient.invalidateQueries({ queryKey: getListAdminEventSessionsQueryKey(eventId) });

  const [isCreating, setIsCreating] = useState(false);
  const [editingSession, setEditingSession] = useState<SessionSummary | null>(null);
  const [venueId, setVenueId] = useState<string>("");
  const [startsAt, setStartsAt] = useState("");
  const [hall, setHall] = useState("");
  const [tiers, setTiers] = useState<Tier[]>([{ ...EMPTY_TIER }]);
  const [formError, setFormError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [seatMapSessionId, setSeatMapSessionId] = useState<number | null>(null);

  const openCreate = () => {
    setVenueId(venues?.[0] ? String(venues[0].id) : "");
    setStartsAt(toLocalInputValue(new Date(Date.now() + 24 * 60 * 60 * 1000)));
    setHall("Зал 1");
    setTiers([{ ...EMPTY_TIER }]);
    setFormError(null);
    setIsCreating(true);
  };

  const openEdit = (session: SessionSummary) => {
    setVenueId(String(session.venue.id));
    setStartsAt(toLocalInputValue(new Date(session.startsAt)));
    setHall(session.hall ?? "");
    setFormError(null);
    setEditingSession(session);
  };

  const close = () => {
    setIsCreating(false);
    setEditingSession(null);
  };

  const submitCreate = async () => {
    setFormError(null);
    const parsedTiers = tiers.map((t) => ({
      name: t.name.trim(),
      priceCents: Math.round(Number(t.priceCents) * 100),
      seatsTotal: Number(t.seatsTotal),
    }));
    if (
      !venueId ||
      !startsAt ||
      !hall.trim() ||
      parsedTiers.length === 0 ||
      parsedTiers.some((t) => !t.name || !Number.isFinite(t.priceCents) || t.priceCents < 1 || !Number.isFinite(t.seatsTotal) || t.seatsTotal < 1)
    ) {
      setFormError("Заполните площадку, зал, дату и хотя бы одну ценовую категорию (цена и число мест)");
      return;
    }
    try {
      await createMutation.mutateAsync({
        data: {
          eventId,
          venueId: Number(venueId),
          startsAt: new Date(startsAt).toISOString(),
          hall: hall.trim(),
          ticketCategories: parsedTiers,
        },
      });
      refresh();
      close();
    } catch {
      setFormError("Не удалось создать сеанс");
    }
  };

  const submitEdit = async () => {
    setFormError(null);
    if (!editingSession || !venueId || !startsAt || !hall.trim()) {
      setFormError("Заполните все поля");
      return;
    }
    try {
      await updateMutation.mutateAsync({
        id: editingSession.id,
        data: { venueId: Number(venueId), startsAt: new Date(startsAt).toISOString(), hall: hall.trim() },
      });
      refresh();
      close();
    } catch {
      setFormError("Не удалось обновить сеанс");
    }
  };

  const handleDelete = async (session: SessionSummary) => {
    setDeleteError(null);
    if (!confirm("Удалить сеанс?")) return;
    try {
      await deleteMutation.mutateAsync({ id: session.id });
      refresh();
    } catch (e: unknown) {
      const message =
        e && typeof e === "object" && "error" in e && typeof (e as { error: unknown }).error === "string"
          ? (e as { error: string }).error
          : "Не удалось удалить сеанс";
      setDeleteError(message);
    }
  };

  if (!ready || isLoading) {
    return (
      <div className="container mx-auto px-4 py-32 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-10">
      <AdminNav />

      <Link href="/admin/events" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-white mb-4">
        <ArrowLeft className="w-4 h-4" />
        К мероприятиям
      </Link>

      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <h2 className="text-xl font-bold">Сеансы: {event?.title ?? `#${eventId}`}</h2>
        <Button className="gap-2" onClick={openCreate} disabled={!venues?.length}>
          <Plus className="w-4 h-4" />
          Добавить сеанс
        </Button>
      </div>
      {!venues?.length && <p className="text-sm text-amber-400 mb-4">Сначала добавьте хотя бы одну площадку.</p>}
      {deleteError && <div className="mb-4 text-sm text-destructive">{deleteError}</div>}

      <div className="space-y-3">
        {sessions?.map((session) => (
          <div key={session.id} className="bg-card border border-white/5 rounded-xl p-5">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div>
                <div className="font-bold">
                  {formatDate(String(session.startsAt))} • {formatTime(String(session.startsAt))}
                </div>
                <div className="text-sm text-muted-foreground">
                  {session.venue.name}, {session.venue.city} • {session.hall}
                </div>
                {session.minPriceCents != null && (
                  <div className="text-sm text-muted-foreground">от {formatRubles(session.minPriceCents)}</div>
                )}
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="border-white/10"
                  onClick={() => setSeatMapSessionId(seatMapSessionId === session.id ? null : session.id)}
                >
                  {seatMapSessionId === session.id ? "Скрыть места" : "Места"}
                </Button>
                <Button variant="outline" size="icon" className="border-white/10" onClick={() => openEdit(session)}>
                  <Pencil className="w-4 h-4" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  className="border-destructive/30 text-destructive hover:bg-destructive/10"
                  onClick={() => handleDelete(session)}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>
            {seatMapSessionId === session.id && <SeatMapEditor sessionId={session.id} />}
          </div>
        ))}
        {!sessions?.length && (
          <div className="bg-card border border-white/5 rounded-xl p-10 text-center text-muted-foreground">
            У этого мероприятия пока нет сеансов
          </div>
        )}
      </div>

      <Dialog open={isCreating} onOpenChange={(open) => !open && close()}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Новый сеанс</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Select value={venueId} onValueChange={setVenueId}>
              <SelectTrigger>
                <SelectValue placeholder="Площадка" />
              </SelectTrigger>
              <SelectContent>
                {venues?.map((v) => (
                  <SelectItem key={v.id} value={String(v.id)}>
                    {v.name} ({v.city})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
            <Input placeholder="Зал" value={hall} onChange={(e) => setHall(e.target.value)} />

            <div className="space-y-2">
              <label className="text-sm font-medium">Ценовые категории</label>
              {tiers.map((tier, i) => (
                <div key={i} className="flex gap-2">
                  <Input
                    placeholder="Название"
                    value={tier.name}
                    onChange={(e) => setTiers(tiers.map((t, idx) => (idx === i ? { ...t, name: e.target.value } : t)))}
                  />
                  <Input
                    type="number"
                    placeholder="Цена ₽"
                    className="w-28"
                    value={tier.priceCents}
                    onChange={(e) => setTiers(tiers.map((t, idx) => (idx === i ? { ...t, priceCents: e.target.value } : t)))}
                  />
                  <Input
                    type="number"
                    placeholder="Мест"
                    className="w-24"
                    value={tier.seatsTotal}
                    onChange={(e) => setTiers(tiers.map((t, idx) => (idx === i ? { ...t, seatsTotal: e.target.value } : t)))}
                  />
                  {tiers.length > 1 && (
                    <Button variant="ghost" size="icon" onClick={() => setTiers(tiers.filter((_, idx) => idx !== i))}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              ))}
              <Button variant="outline" size="sm" className="gap-1.5 border-white/10" onClick={() => setTiers([...tiers, { ...EMPTY_TIER }])}>
                <Plus className="w-3.5 h-3.5" />
                Добавить категорию
              </Button>
            </div>
            {formError && <p className="text-sm text-destructive">{formError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" className="border-white/10" onClick={close}>
              Отмена
            </Button>
            <Button onClick={submitCreate} disabled={createMutation.isPending}>
              {createMutation.isPending && <Loader2 className="w-4 h-4 animate-spin mr-1.5" />}
              Создать
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editingSession} onOpenChange={(open) => !open && close()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Редактировать сеанс</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Select value={venueId} onValueChange={setVenueId}>
              <SelectTrigger>
                <SelectValue placeholder="Площадка" />
              </SelectTrigger>
              <SelectContent>
                {venues?.map((v) => (
                  <SelectItem key={v.id} value={String(v.id)}>
                    {v.name} ({v.city})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
            <Input placeholder="Зал" value={hall} onChange={(e) => setHall(e.target.value)} />
            <p className="text-xs text-muted-foreground">
              Цены и количество мест меняются в разделе «Места» ниже — здесь можно изменить только площадку, зал и время.
            </p>
            {formError && <p className="text-sm text-destructive">{formError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" className="border-white/10" onClick={close}>
              Отмена
            </Button>
            <Button onClick={submitEdit} disabled={updateMutation.isPending}>
              {updateMutation.isPending && <Loader2 className="w-4 h-4 animate-spin mr-1.5" />}
              Сохранить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SeatMapEditor({ sessionId }: { sessionId: number }) {
  const queryClient = useQueryClient();
  const { data: seats, isLoading } = useGetSessionSeats(sessionId, {
    query: { queryKey: getGetSessionSeatsQueryKey(sessionId) },
  });
  const toggleMutation = useToggleAdminSeatBlock();
  const priceMutation = useUpdateAdminTicketCategory();
  const fillRandomMutation = useFillRandomSeats();
  const [priceEdits, setPriceEdits] = useState<Record<number, string>>({});
  const [fillMessage, setFillMessage] = useState<string | null>(null);

  const refresh = () => queryClient.invalidateQueries({ queryKey: getGetSessionSeatsQueryKey(sessionId) });

  const fillRandomly = async () => {
    setFillMessage(null);
    const result = await fillRandomMutation.mutateAsync({ id: sessionId });
    refresh();
    setFillMessage(result.filled > 0 ? `Продано мест: ${result.filled}` : "Свободных мест не осталось");
  };

  if (isLoading || !seats) {
    return (
      <div className="mt-4 flex justify-center py-6">
        <Loader2 className="w-5 h-5 animate-spin text-primary" />
      </div>
    );
  }

  const byCategory = new Map<string, Seat[]>();
  for (const seat of seats) {
    const list = byCategory.get(seat.categoryName) ?? [];
    list.push(seat);
    byCategory.set(seat.categoryName, list);
  }

  const statusColor: Record<string, string> = {
    available: "bg-white/10 hover:bg-white/20 text-foreground/70",
    sold: "bg-primary/40 text-white cursor-not-allowed",
    reserved: "bg-amber-500/40 text-white cursor-not-allowed",
    blocked: "bg-destructive/60 text-white hover:bg-destructive/80",
  };

  const savePrice = async (ticketCategoryId: number) => {
    const raw = priceEdits[ticketCategoryId];
    if (raw === undefined) return;
    const priceCents = Math.round(Number(raw) * 100);
    if (!Number.isFinite(priceCents) || priceCents < 1) return;
    await priceMutation.mutateAsync({ id: ticketCategoryId, data: { priceCents } });
    refresh();
    setPriceEdits((prev) => {
      const next = { ...prev };
      delete next[ticketCategoryId];
      return next;
    });
  };

  return (
    <div className="mt-4 pt-4 border-t border-white/5 space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 border-white/10"
          disabled={fillRandomMutation.isPending}
          onClick={fillRandomly}
        >
          {fillRandomMutation.isPending ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Shuffle className="w-3.5 h-3.5" />
          )}
          Заполнить рандомно
        </Button>
        {fillMessage && <span className="text-xs text-muted-foreground">{fillMessage}</span>}
      </div>
      {[...byCategory.entries()].map(([categoryName, categorySeats]) => {
        const ticketCategoryId = categorySeats[0]!.ticketCategoryId;
        return (
          <div key={categoryName}>
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <span className="text-sm font-medium">{categoryName}</span>
              <span className="text-xs text-muted-foreground">{formatRubles(categorySeats[0]!.priceCents)}</span>
              <Input
                type="number"
                placeholder="Новая цена ₽"
                className="w-32 h-8"
                value={priceEdits[ticketCategoryId] ?? ""}
                onChange={(e) => setPriceEdits((prev) => ({ ...prev, [ticketCategoryId]: e.target.value }))}
              />
              <Button
                size="sm"
                variant="outline"
                className="h-8 border-white/10"
                disabled={priceMutation.isPending || priceEdits[ticketCategoryId] === undefined}
                onClick={() => savePrice(ticketCategoryId)}
              >
                Изменить цену
              </Button>
            </div>
            <div className="flex flex-wrap gap-1">
              {categorySeats.map((seat) => (
                <button
                  key={seat.id}
                  title={`${seat.rowLabel}${seat.seatNumber} — ${seat.status}`}
                  disabled={seat.status === "sold" || seat.status === "reserved" || toggleMutation.isPending}
                  onClick={async () => {
                    await toggleMutation.mutateAsync({ id: seat.id });
                    refresh();
                  }}
                  className={`w-8 h-8 rounded text-[10px] font-medium flex items-center justify-center transition-colors ${statusColor[seat.status] ?? ""}`}
                >
                  {seat.status === "blocked" ? <Ban className="w-3.5 h-3.5" /> : `${seat.rowLabel}${seat.seatNumber}`}
                </button>
              ))}
            </div>
          </div>
        );
      })}
      <p className="text-xs text-muted-foreground flex items-center gap-1.5">
        <CheckCircle2 className="w-3.5 h-3.5" />
        Нажмите на свободное место, чтобы заблокировать его (технические работы и т.п.), или на заблокированное — чтобы снова открыть продажу.
      </p>
    </div>
  );
}

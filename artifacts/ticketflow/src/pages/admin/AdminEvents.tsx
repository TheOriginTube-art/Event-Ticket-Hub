import { useState } from "react";
import { Link } from "wouter";
import { Loader2, Plus, Pencil, Trash2, CalendarClock } from "lucide-react";
import {
  useListAdminEvents,
  getListAdminEventsQueryKey,
  useCreateAdminEvent,
  useUpdateAdminEvent,
  useDeleteAdminEvent,
} from "@workspace/api-client-react";
import type { AdminEvent, EventType } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useRequireAdmin } from "@/lib/useRequireAdmin";
import { AdminNav } from "@/components/admin/AdminNav";
import { useQueryClient } from "@tanstack/react-query";
import { useSeo } from "@/lib/seo";

type EventForm = {
  title: string;
  type: EventType;
  description: string;
  posterUrl: string;
  genre: string;
  durationMinutes: string;
  ageRating: string;
  rating: string;
  sourceName: string;
};

const EMPTY_FORM: EventForm = {
  title: "",
  type: "movie",
  description: "",
  posterUrl: "",
  genre: "",
  durationMinutes: "",
  ageRating: "",
  rating: "",
  sourceName: "TicketFlow",
};

const TYPE_LABELS: Record<EventType, string> = { movie: "Фильм", theater: "Спектакль", concert: "Концерт" };

export default function AdminEvents() {
  const { ready } = useRequireAdmin();
  useSeo({ title: "Админ: мероприятия", description: "Управление мероприятиями TicketFlow.", noindex: true });
  const queryClient = useQueryClient();

  const { data: events, isLoading } = useListAdminEvents({
    query: { queryKey: getListAdminEventsQueryKey(), enabled: ready },
  });
  const createMutation = useCreateAdminEvent();
  const updateMutation = useUpdateAdminEvent();
  const deleteMutation = useDeleteAdminEvent();

  const [editing, setEditing] = useState<AdminEvent | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [form, setForm] = useState<EventForm>(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const refresh = () => queryClient.invalidateQueries({ queryKey: getListAdminEventsQueryKey() });

  const openCreate = () => {
    setForm(EMPTY_FORM);
    setError(null);
    setIsCreating(true);
  };
  const openEdit = (event: AdminEvent) => {
    setForm({
      title: event.title,
      type: event.type,
      description: event.description,
      posterUrl: event.posterUrl,
      genre: event.genre,
      durationMinutes: String(event.durationMinutes),
      ageRating: event.ageRating,
      rating: String(event.rating),
      sourceName: event.sourceName,
    });
    setError(null);
    setEditing(event);
  };
  const close = () => {
    setIsCreating(false);
    setEditing(null);
  };

  const submit = async () => {
    setError(null);
    const durationMinutes = Number(form.durationMinutes);
    const rating = Number(form.rating);
    if (
      !form.title.trim() ||
      !form.description.trim() ||
      !form.posterUrl.trim() ||
      !form.genre.trim() ||
      !form.ageRating.trim() ||
      !form.sourceName.trim() ||
      !Number.isFinite(durationMinutes) ||
      durationMinutes < 1 ||
      !Number.isFinite(rating) ||
      rating < 0 ||
      rating > 10
    ) {
      setError("Проверьте, что все поля заполнены корректно (длительность ≥ 1 мин., рейтинг 0–10)");
      return;
    }

    const data = { ...form, durationMinutes, rating };
    try {
      if (editing) {
        await updateMutation.mutateAsync({ id: editing.id, data });
      } else {
        await createMutation.mutateAsync({ data });
      }
      refresh();
      close();
    } catch {
      setError("Не удалось сохранить мероприятие");
    }
  };

  const handleDelete = async (event: AdminEvent) => {
    setDeleteError(null);
    if (!confirm(`Удалить мероприятие «${event.title}»?`)) return;
    try {
      await deleteMutation.mutateAsync({ id: event.id });
      refresh();
    } catch (e: unknown) {
      const message =
        e && typeof e === "object" && "error" in e && typeof (e as { error: unknown }).error === "string"
          ? (e as { error: string }).error
          : "Не удалось удалить мероприятие";
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

      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold">Мероприятия ({events?.length ?? 0})</h2>
        <Button className="gap-2" onClick={openCreate}>
          <Plus className="w-4 h-4" />
          Добавить мероприятие
        </Button>
      </div>

      {deleteError && <div className="mb-4 text-sm text-destructive">{deleteError}</div>}

      <div className="grid md:grid-cols-2 gap-4">
        {events?.map((event) => (
          <div key={event.id} className="bg-card border border-white/5 rounded-xl p-5 flex gap-4">
            <img src={event.posterUrl} alt={event.title} className="w-16 h-24 object-cover rounded-lg shrink-0 bg-white/5" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <Badge variant="secondary">{TYPE_LABELS[event.type]}</Badge>
                <Badge variant="outline">{event.upcomingSessionsCount} сеансов</Badge>
              </div>
              <div className="font-bold truncate">{event.title}</div>
              <div className="text-sm text-muted-foreground truncate">{event.genre}</div>
              <div className="flex gap-2 mt-3">
                <Link href={`/admin/events/${event.id}/sessions`}>
                  <Button variant="outline" size="sm" className="gap-1.5 border-white/10">
                    <CalendarClock className="w-3.5 h-3.5" />
                    Сеансы
                  </Button>
                </Link>
                <Button variant="outline" size="icon" className="border-white/10 h-8 w-8" onClick={() => openEdit(event)}>
                  <Pencil className="w-3.5 h-3.5" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  className="border-destructive/30 text-destructive hover:bg-destructive/10 h-8 w-8"
                  onClick={() => handleDelete(event)}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <Dialog open={isCreating || !!editing} onOpenChange={(open) => !open && close()}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{editing ? "Редактировать мероприятие" : "Новое мероприятие"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input placeholder="Название" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            <Select value={form.type} onValueChange={(v: EventType) => setForm({ ...form, type: v })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="movie">Фильм</SelectItem>
                <SelectItem value="theater">Спектакль</SelectItem>
                <SelectItem value="concert">Концерт</SelectItem>
              </SelectContent>
            </Select>
            <Textarea
              placeholder="Описание"
              rows={3}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
            <Input
              placeholder="Ссылка на постер (https://...)"
              value={form.posterUrl}
              onChange={(e) => setForm({ ...form, posterUrl: e.target.value })}
            />
            <div className="grid grid-cols-2 gap-3">
              <Input placeholder="Жанр" value={form.genre} onChange={(e) => setForm({ ...form, genre: e.target.value })} />
              <Input
                placeholder="Возрастной рейтинг (16+)"
                value={form.ageRating}
                onChange={(e) => setForm({ ...form, ageRating: e.target.value })}
              />
              <Input
                type="number"
                placeholder="Длительность (мин.)"
                value={form.durationMinutes}
                onChange={(e) => setForm({ ...form, durationMinutes: e.target.value })}
              />
              <Input
                type="number"
                step="0.1"
                placeholder="Рейтинг (0–10)"
                value={form.rating}
                onChange={(e) => setForm({ ...form, rating: e.target.value })}
              />
            </div>
            <Input
              placeholder="Источник"
              value={form.sourceName}
              onChange={(e) => setForm({ ...form, sourceName: e.target.value })}
            />
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" className="border-white/10" onClick={close}>
              Отмена
            </Button>
            <Button onClick={submit} disabled={createMutation.isPending || updateMutation.isPending}>
              {(createMutation.isPending || updateMutation.isPending) && <Loader2 className="w-4 h-4 animate-spin mr-1.5" />}
              Сохранить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

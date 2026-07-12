import { useState } from "react";
import { Loader2, Plus, Pencil, Trash2 } from "lucide-react";
import {
  useListAdminVenues,
  getListAdminVenuesQueryKey,
  useCreateAdminVenue,
  useUpdateAdminVenue,
  useDeleteAdminVenue,
} from "@workspace/api-client-react";
import type { Venue } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useRequireAdmin } from "@/lib/useRequireAdmin";
import { AdminNav } from "@/components/admin/AdminNav";
import { useQueryClient } from "@tanstack/react-query";
import { useSeo } from "@/lib/seo";

type VenueForm = { name: string; city: string; address: string };
const EMPTY_FORM: VenueForm = { name: "", city: "", address: "" };

export default function AdminVenues() {
  const { ready } = useRequireAdmin();
  useSeo({ title: "Админ: площадки", description: "Управление площадками TicketFlow.", noindex: true });
  const queryClient = useQueryClient();

  const { data: venues, isLoading } = useListAdminVenues({
    query: { queryKey: getListAdminVenuesQueryKey(), enabled: ready },
  });
  const createMutation = useCreateAdminVenue();
  const updateMutation = useUpdateAdminVenue();
  const deleteMutation = useDeleteAdminVenue();

  const [editing, setEditing] = useState<Venue | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [form, setForm] = useState<VenueForm>(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const refresh = () => queryClient.invalidateQueries({ queryKey: getListAdminVenuesQueryKey() });

  const openCreate = () => {
    setForm(EMPTY_FORM);
    setError(null);
    setIsCreating(true);
  };
  const openEdit = (venue: Venue) => {
    setForm({ name: venue.name, city: venue.city, address: venue.address });
    setError(null);
    setEditing(venue);
  };
  const close = () => {
    setIsCreating(false);
    setEditing(null);
  };

  const submit = async () => {
    setError(null);
    if (!form.name.trim() || !form.city.trim() || !form.address.trim()) {
      setError("Заполните все поля");
      return;
    }
    try {
      if (editing) {
        await updateMutation.mutateAsync({ id: editing.id, data: form });
      } else {
        await createMutation.mutateAsync({ data: form });
      }
      refresh();
      close();
    } catch {
      setError("Не удалось сохранить площадку");
    }
  };

  const handleDelete = async (venue: Venue) => {
    setDeleteError(null);
    if (!confirm(`Удалить площадку «${venue.name}»?`)) return;
    try {
      await deleteMutation.mutateAsync({ id: venue.id });
      refresh();
    } catch (e: unknown) {
      const message =
        e && typeof e === "object" && "error" in e && typeof (e as { error: unknown }).error === "string"
          ? (e as { error: string }).error
          : "Не удалось удалить площадку";
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
        <h2 className="text-xl font-bold">Площадки ({venues?.length ?? 0})</h2>
        <Button className="gap-2" onClick={openCreate}>
          <Plus className="w-4 h-4" />
          Добавить площадку
        </Button>
      </div>

      {deleteError && <div className="mb-4 text-sm text-destructive">{deleteError}</div>}

      <div className="grid md:grid-cols-2 gap-4">
        {venues?.map((venue) => (
          <div key={venue.id} className="bg-card border border-white/5 rounded-xl p-5 flex items-start justify-between gap-4">
            <div>
              <div className="font-bold">{venue.name}</div>
              <div className="text-sm text-muted-foreground">{venue.city}</div>
              <div className="text-sm text-muted-foreground">{venue.address}</div>
            </div>
            <div className="flex gap-2 shrink-0">
              <Button variant="outline" size="icon" className="border-white/10" onClick={() => openEdit(venue)}>
                <Pencil className="w-4 h-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="border-destructive/30 text-destructive hover:bg-destructive/10"
                onClick={() => handleDelete(venue)}
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          </div>
        ))}
      </div>

      <Dialog open={isCreating || !!editing} onOpenChange={(open) => !open && close()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Редактировать площадку" : "Новая площадка"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input placeholder="Название" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <Input placeholder="Город" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
            <Input placeholder="Адрес" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
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

import { Loader2, ShieldCheck, ShieldOff } from "lucide-react";
import { useListAdminUsers, getListAdminUsersQueryKey, useUpdateAdminUser } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/lib/auth-context";
import { useRequireAdmin } from "@/lib/useRequireAdmin";
import { AdminNav } from "@/components/admin/AdminNav";
import { useQueryClient } from "@tanstack/react-query";
import { useSeo } from "@/lib/seo";

export default function AdminUsers() {
  const { ready } = useRequireAdmin();
  const { user: currentUser } = useAuth();
  useSeo({ title: "Админ: пользователи", description: "Управление пользователями TicketFlow.", noindex: true });
  const queryClient = useQueryClient();

  const { data: users, isLoading } = useListAdminUsers({
    query: { queryKey: getListAdminUsersQueryKey(), enabled: ready },
  });
  const updateMutation = useUpdateAdminUser();

  const refresh = () => queryClient.invalidateQueries({ queryKey: getListAdminUsersQueryKey() });

  const toggleAdmin = async (id: number, isAdmin: boolean) => {
    try {
      await updateMutation.mutateAsync({ id, data: { isAdmin: !isAdmin } });
      refresh();
    } catch {
      alert("Не удалось изменить права пользователя");
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

      <h2 className="text-xl font-bold mb-6">Пользователи ({users?.length ?? 0})</h2>

      <div className="space-y-3">
        {users?.map((u) => (
          <div key={u.id} className="bg-card border border-white/5 rounded-xl p-5 flex items-center justify-between gap-4 flex-wrap">
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold">{u.name}</span>
                {u.isAdmin && <Badge>Админ</Badge>}
              </div>
              <div className="text-sm text-muted-foreground">{u.email}</div>
              <div className="text-xs text-muted-foreground mt-1">
                Заказов: {u.ordersCount} • Регистрация: {new Intl.DateTimeFormat("ru-RU").format(new Date(u.createdAt))}
              </div>
            </div>
            <Button
              variant="outline"
              className="gap-2 border-white/10"
              disabled={updateMutation.isPending || (u.isAdmin && u.id === currentUser?.id)}
              onClick={() => toggleAdmin(u.id, u.isAdmin)}
            >
              {u.isAdmin ? <ShieldOff className="w-4 h-4" /> : <ShieldCheck className="w-4 h-4" />}
              {u.isAdmin ? "Снять права админа" : "Сделать админом"}
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}

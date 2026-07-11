import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Loader2, ShieldAlert, Save, ArrowLeft } from "lucide-react";
import { ObjectUploader } from "@workspace/object-storage-web";
import type { UppyFile } from "@uppy/core";
import {
  useGetPaymentSettings,
  getGetPaymentSettingsQueryKey,
  useUpdatePaymentSettings,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/lib/auth-context";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";

export default function AdminSettings() {
  const [, setLocation] = useLocation();
  const { user, isLoading: isAuthLoading } = useAuth();
  const queryClient = useQueryClient();

  const { data: settings, isLoading } = useGetPaymentSettings({
    query: { queryKey: getGetPaymentSettingsQueryKey(), enabled: !!user?.isAdmin },
  });
  const updateMutation = useUpdatePaymentSettings();

  const [instructions, setInstructions] = useState("");
  const [pendingObjectPath, setPendingObjectPath] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (settings) {
      setInstructions(settings.instructions ?? "");
      setPreviewUrl(settings.ozonQrImageUrl ?? null);
    }
  }, [settings]);

  useEffect(() => {
    if (!isAuthLoading && (!user || !user.isAdmin)) {
      setLocation("/");
    }
  }, [isAuthLoading, user, setLocation]);

  const handleSave = async () => {
    setSaved(false);
    const result = await updateMutation.mutateAsync({
      data: {
        instructions: instructions || null,
        ozonQrImagePath: pendingObjectPath ?? undefined,
      },
    });
    queryClient.setQueryData(getGetPaymentSettingsQueryKey(), result);
    setPendingObjectPath(null);
    setSaved(true);
  };

  if (isAuthLoading || !user?.isAdmin || isLoading) {
    return (
      <div className="container mx-auto px-4 py-32 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-10 max-w-2xl">
      <Link href="/admin/orders" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-white mb-6">
        <ArrowLeft className="w-4 h-4" />
        К заказам
      </Link>

      <div className="flex items-center gap-3 mb-8">
        <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center">
          <ShieldAlert className="w-6 h-6 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold leading-tight">Настройки оплаты</h1>
          <p className="text-sm text-muted-foreground">QR-код Ozon Банк, который видят покупатели при оплате</p>
        </div>
      </div>

      <div className="bg-card border border-white/5 rounded-xl p-6 space-y-6">
        <div>
          <label className="block text-sm font-medium mb-3">QR-код для оплаты</label>
          <div className="flex items-start gap-4 flex-wrap">
            {previewUrl && (
              <img src={previewUrl} alt="Текущий QR-код" className="w-40 h-40 object-contain rounded-lg bg-white p-2" />
            )}
            <ObjectUploader
              onGetUploadParameters={async (file: UppyFile<Record<string, unknown>, Record<string, unknown>>) => {
                const res = await fetch(`${import.meta.env.BASE_URL}api/storage/uploads/request-url`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  credentials: "include",
                  body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type }),
                });
                if (!res.ok) throw new Error("Не удалось получить ссылку для загрузки");
                const { uploadURL, objectPath } = await res.json();
                setPendingObjectPath(objectPath);
                if (file.data instanceof Blob) {
                  setPreviewUrl(URL.createObjectURL(file.data));
                }
                return { method: "PUT" as const, url: uploadURL, headers: { "Content-Type": file.type } };
              }}
            >
              Загрузить новый QR-код
            </ObjectUploader>
          </div>
          {pendingObjectPath && (
            <p className="text-xs text-amber-400 mt-2">Новый QR-код загружен. Нажмите «Сохранить», чтобы применить.</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">Инструкции для покупателя</label>
          <Textarea
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            placeholder="Например: переведите точную сумму заказа и укажите номер заказа в комментарии к переводу."
            rows={4}
            className="border-white/10"
          />
        </div>

        <div className="flex items-center gap-3">
          <Button className="gap-2" onClick={handleSave} disabled={updateMutation.isPending}>
            {updateMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Сохранить
          </Button>
          {saved && <span className="text-sm text-green-400">Сохранено</span>}
          {updateMutation.isError && (
            <span className="text-sm text-destructive">Не удалось сохранить настройки</span>
          )}
        </div>
      </div>
    </div>
  );
}

import { useState, useRef, useEffect, useCallback } from "react";
import { Bot, Plus, Send, Trash2, Loader2, MessageSquare, AlertCircle } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { useRequireAdmin } from "@/lib/useRequireAdmin";
import { AdminNav } from "@/components/admin/AdminNav";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useSeo } from "@/lib/seo";
import {
  useListOpenaiConversations,
  useCreateOpenaiConversation,
  useGetOpenaiConversation,
  useDeleteOpenaiConversation,
  getListOpenaiConversationsQueryKey,
  getGetOpenaiConversationQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export default function AdminAIConsultant() {
  const { ready } = useRequireAdmin();
  useSeo({ title: "ИИ-консультант", description: "ИИ-консультант для администраторов TicketFlow.", noindex: true });

  const queryClient = useQueryClient();

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [streamError, setStreamError] = useState<string | null>(null);
  const [streamingContent, setStreamingContent] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const { data: conversations, isLoading: convsLoading } = useListOpenaiConversations({
    query: { queryKey: getListOpenaiConversationsQueryKey(), enabled: ready },
  });

  const { data: conversation, isLoading: convLoading } = useGetOpenaiConversation(
    selectedId ?? 0,
    { query: { queryKey: getGetOpenaiConversationQueryKey(selectedId ?? 0), enabled: ready && selectedId != null } },
  );

  const createMutation = useCreateOpenaiConversation();
  const deleteMutation = useDeleteOpenaiConversation();

  // Прокрутка вниз при новых сообщениях
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [conversation?.messages, streamingContent]);

  const handleNewConversation = async () => {
    const title = `Диалог от ${new Date().toLocaleDateString("ru-RU")}`;
    const created = await createMutation.mutateAsync({ data: { title } });
    await queryClient.invalidateQueries({ queryKey: getListOpenaiConversationsQueryKey() });
    setSelectedId(created.id);
    setStreamingContent("");
    setStreamError(null);
  };

  const handleDelete = async (id: number) => {
    await deleteMutation.mutateAsync({ id });
    await queryClient.invalidateQueries({ queryKey: getListOpenaiConversationsQueryKey() });
    if (selectedId === id) {
      setSelectedId(null);
      setStreamingContent("");
    }
  };

  const handleSend = useCallback(async () => {
    if (!input.trim() || !selectedId || streaming) return;

    const content = input.trim();
    setInput("");
    setStreamError(null);
    setStreaming(true);
    setStreamingContent("");

    // Оптимистично добавляем сообщение пользователя в кэш
    const key = getGetOpenaiConversationQueryKey(selectedId);
    queryClient.setQueryData(key, (old: typeof conversation) => {
      if (!old) return old;
      return {
        ...old,
        messages: [
          ...old.messages,
          { id: -1, conversationId: selectedId, role: "user", content, createdAt: new Date().toISOString() },
        ],
      };
    });

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch(`${BASE}/api/openai/conversations/${selectedId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ content }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `HTTP ${res.status}`);
      }

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let full = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const parsed = JSON.parse(line.slice(6));
            if (parsed.error) throw new Error(parsed.error);
            if (parsed.content) {
              full += parsed.content;
              setStreamingContent(full);
            }
            if (parsed.done) {
              // Перезагружаем диалог из сервера
              await queryClient.invalidateQueries({ queryKey: key });
              setStreamingContent("");
            }
          } catch (e) {
            if ((e as Error).message !== "JSON") throw e;
          }
        }
      }
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      setStreamError((err as Error).message || "Ошибка при обращении к ИИ-консультанту");
      // Откатываем оптимистичное обновление
      await queryClient.invalidateQueries({ queryKey: key });
    } finally {
      setStreaming(false);
      setStreamingContent("");
      textareaRef.current?.focus();
    }
  }, [input, selectedId, streaming, queryClient]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const allMessages = conversation?.messages ?? [];
  if (!ready) {
    return (
      <div className="container mx-auto px-4 py-32 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-10">
      <AdminNav />

      <div className="flex gap-4 h-[calc(100vh-220px)] min-h-[500px]">
        {/* Левая панель: список диалогов */}
        <aside className="w-64 shrink-0 flex flex-col gap-2">
          <Button
            onClick={handleNewConversation}
            disabled={createMutation.isPending}
            className="w-full gap-2"
            size="sm"
          >
            {createMutation.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Plus className="w-4 h-4" />
            )}
            Новый диалог
          </Button>

          <div className="flex-1 overflow-y-auto space-y-1 pr-1">
            {convsLoading && (
              <div className="flex justify-center pt-6">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              </div>
            )}
            {!convsLoading && !conversations?.length && (
              <p className="text-xs text-muted-foreground text-center pt-6 px-2">
                Нет диалогов. Нажмите «Новый диалог», чтобы начать.
              </p>
            )}
            {conversations?.map((conv) => (
              <div
                key={conv.id}
                className={`group flex items-center gap-1 rounded-lg px-3 py-2 cursor-pointer text-sm transition-colors ${
                  selectedId === conv.id
                    ? "bg-primary text-white"
                    : "hover:bg-white/5 text-muted-foreground hover:text-white"
                }`}
                onClick={() => {
                  setSelectedId(conv.id);
                  setStreamingContent("");
                  setStreamError(null);
                }}
              >
                <MessageSquare className="w-3.5 h-3.5 shrink-0" />
                <span className="flex-1 truncate">{conv.title}</span>
                <button
                  className="opacity-0 group-hover:opacity-100 transition-opacity hover:text-destructive shrink-0"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDelete(conv.id);
                  }}
                  title="Удалить диалог"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </aside>

        {/* Правая панель: окно чата */}
        <div className="flex-1 flex flex-col bg-card border border-white/5 rounded-xl overflow-hidden">
          {/* Заголовок */}
          <div className="flex items-center gap-3 px-5 py-3 border-b border-white/5 shrink-0">
            <Bot className="w-5 h-5 text-primary" />
            <div>
              <h2 className="text-sm font-semibold leading-tight">
                {selectedId && conversation ? conversation.title : "ИИ-консультант"}
              </h2>
              <p className="text-xs text-muted-foreground">
                Фриланс · Инвестиции · Крипта · Личные финансы · Бизнес
              </p>
            </div>
          </div>

          {/* Область сообщений */}
          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            {!selectedId && (
              <div className="flex flex-col items-center justify-center h-full text-center gap-3 text-muted-foreground">
                <Bot className="w-12 h-12 opacity-30" />
                <p className="text-sm max-w-xs">
                  Выберите диалог слева или создайте новый, чтобы начать общение с ИИ-консультантом.
                </p>
              </div>
            )}

            {selectedId && convLoading && (
              <div className="flex justify-center pt-10">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            )}

            {selectedId && !convLoading && allMessages.length === 0 && !streamingContent && (
              <div className="flex flex-col items-center justify-center h-full text-center gap-3 text-muted-foreground">
                <Bot className="w-10 h-10 opacity-30" />
                <p className="text-sm max-w-sm">
                  Задайте любой вопрос. Например: «Как начать зарабатывать на фрилансе без вложений?» или
                  «Объясни стратегию диверсификации портфеля».
                </p>
              </div>
            )}

            {allMessages.map((msg) => (
              <MessageBubble key={msg.id} role={msg.role} content={msg.content} />
            ))}

            {/* Стриминговый ответ ИИ */}
            {streamingContent && (
              <MessageBubble role="assistant" content={streamingContent} streaming />
            )}

            {/* Индикатор ожидания ответа */}
            {streaming && !streamingContent && (
              <div className="flex gap-3">
                <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center shrink-0 mt-0.5">
                  <Bot className="w-3.5 h-3.5 text-primary" />
                </div>
                <div className="flex items-center gap-1.5 py-2">
                  <span className="w-1.5 h-1.5 bg-primary/60 rounded-full animate-bounce [animation-delay:0ms]" />
                  <span className="w-1.5 h-1.5 bg-primary/60 rounded-full animate-bounce [animation-delay:150ms]" />
                  <span className="w-1.5 h-1.5 bg-primary/60 rounded-full animate-bounce [animation-delay:300ms]" />
                </div>
              </div>
            )}

            {streamError && (
              <div className="flex items-start gap-2 text-destructive text-sm bg-destructive/10 rounded-lg px-4 py-3">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{streamError}</span>
              </div>
            )}

            <div ref={bottomRef} />
          </div>

          {/* Поле ввода */}
          <div className="shrink-0 border-t border-white/5 p-4">
            <div className="flex gap-2 items-end">
              <Textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={
                  selectedId
                    ? "Введите вопрос... (Enter — отправить, Shift+Enter — перенос строки)"
                    : "Сначала выберите или создайте диалог"
                }
                disabled={!selectedId || streaming}
                rows={2}
                className="flex-1 resize-none border-white/10 min-h-[52px] max-h-[160px]"
              />
              <Button
                onClick={handleSend}
                disabled={!selectedId || !input.trim() || streaming}
                size="icon"
                className="shrink-0 h-[52px] w-[52px]"
              >
                {streaming ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-2 text-center">
              ИИ-консультант — информационный инструмент. Не является финансовым советником. Все инвестиции несут риски.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function MessageBubble({
  role,
  content,
  streaming = false,
}: {
  role: string;
  content: string;
  streaming?: boolean;
}) {
  const isUser = role === "user";

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[75%] bg-primary text-white rounded-2xl rounded-tr-sm px-4 py-2.5 text-sm whitespace-pre-wrap">
          {content}
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-3">
      <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center shrink-0 mt-0.5">
        <Bot className="w-3.5 h-3.5 text-primary" />
      </div>
      <div className="flex-1 min-w-0">
        <div
          className={`prose prose-sm prose-invert max-w-none text-sm leading-relaxed ${
            streaming ? "after:content-['▍'] after:animate-pulse after:text-primary" : ""
          }`}
        >
          <ReactMarkdown>{content}</ReactMarkdown>
        </div>
      </div>
    </div>
  );
}

import { Router, type IRouter } from "express";
import { desc, eq, and } from "drizzle-orm";
import OpenAI from "openai";
import { db, conversations, messages } from "@workspace/db";
import {
  ListOpenaiConversationsResponse,
  CreateOpenaiConversationBody,
  CreateOpenaiConversationResponse,
  GetOpenaiConversationParams,
  GetOpenaiConversationResponse,
  DeleteOpenaiConversationParams,
  SendOpenaiMessageParams,
  SendOpenaiMessageBody,
} from "@workspace/api-zod";
import { requireAdmin } from "../../lib/auth";

const router: IRouter = Router();

const SYSTEM_PROMPT = `Ты — ИИ-консультант для администраторов платформы TicketFlow. Твоя роль — давать развёрнутые, пошаговые советы по следующим темам:
- Заработок на фрилансе (платформы, поиск клиентов, портфолио, ценообразование)
- Инвестиции (акции, облигации, ETF, диверсификация, долгосрочные стратегии)
- Криптовалюты (принципы работы, хранение, торговые стратегии, DeFi)
- Личные финансы (бюджетирование, накопления, пассивный доход)
- Бизнес и предпринимательство (запуск, масштабирование, маркетинг)

Обязательные правила:
1. Отвечай всегда на русском языке, развёрнуто и пошагово («от А до Я»).
2. При обсуждении инвестиций, крипты и ставок ВСЕГДА честно указывай на риски: возможность потери средств, волатильность, отсутствие гарантий дохода.
3. НИКОГДА не давай «гарантированных прогнозов» по ценам активов, курсам валют или доходности.
4. Отказывайся помогать с незаконными схемами: уклонение от налогов, мошенничество, отмывание денег и т.п.
5. Форматируй ответы с заголовками и списками — чтобы длинные инструкции были удобны для чтения.
6. Ты консультант, а не автономный агент: ты объясняешь и советуешь, но не совершаешь сделок и не управляешь счетами.`;

/** Создаём клиент OpenAI лениво — чтобы сервер стартовал даже без ключа */
function getOpenAIClient(): OpenAI | null {
  const apiKey =
    process.env.AI_INTEGRATIONS_OPENAI_API_KEY ?? process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  const baseURL = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
  return new OpenAI({ apiKey, ...(baseURL ? { baseURL } : {}) });
}

/** Список диалогов текущего администратора */
router.get("/openai/conversations", requireAdmin, async (req, res): Promise<void> => {
  const userId = req.user!.id;
  const rows = await db
    .select()
    .from(conversations)
    .where(eq(conversations.userId, userId))
    .orderBy(desc(conversations.createdAt));
  res.json(ListOpenaiConversationsResponse.parse(rows));
});

/** Создать новый диалог */
router.post("/openai/conversations", requireAdmin, async (req, res): Promise<void> => {
  const body = CreateOpenaiConversationBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const [row] = await db
    .insert(conversations)
    .values({ title: body.data.title, userId: req.user!.id })
    .returning();
  res.status(201).json(CreateOpenaiConversationResponse.parse(row));
});

/** Получить диалог вместе с сообщениями */
router.get("/openai/conversations/:id", requireAdmin, async (req, res): Promise<void> => {
  const params = GetOpenaiConversationParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [conversation] = await db
    .select()
    .from(conversations)
    .where(and(eq(conversations.id, params.data.id), eq(conversations.userId, req.user!.id)));
  if (!conversation) {
    res.status(404).json({ error: "Диалог не найден" });
    return;
  }
  const msgs = await db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, conversation.id))
    .orderBy(messages.createdAt);
  res.json(GetOpenaiConversationResponse.parse({ ...conversation, messages: msgs }));
});

/** Удалить диалог */
router.delete("/openai/conversations/:id", requireAdmin, async (req, res): Promise<void> => {
  const params = DeleteOpenaiConversationParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [deleted] = await db
    .delete(conversations)
    .where(and(eq(conversations.id, params.data.id), eq(conversations.userId, req.user!.id)))
    .returning();
  if (!deleted) {
    res.status(404).json({ error: "Диалог не найден" });
    return;
  }
  res.status(204).end();
});

/** Отправить сообщение и получить потоковый ответ ИИ */
router.post("/openai/conversations/:id/messages", requireAdmin, async (req, res): Promise<void> => {
  const params = SendOpenaiMessageParams.safeParse(req.params);
  const body = SendOpenaiMessageBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: (params.error ?? body.error)!.message });
    return;
  }

  const openai = getOpenAIClient();
  if (!openai) {
    res.status(503).json({ error: "ИИ-консультант не настроен: отсутствует ключ OPENAI_API_KEY" });
    return;
  }

  const [conversation] = await db
    .select()
    .from(conversations)
    .where(and(eq(conversations.id, params.data.id), eq(conversations.userId, req.user!.id)));
  if (!conversation) {
    res.status(404).json({ error: "Диалог не найден" });
    return;
  }

  // Сохраняем сообщение пользователя
  await db.insert(messages).values({
    conversationId: conversation.id,
    role: "user",
    content: body.data.content,
  });

  // История для контекста
  const history = await db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, conversation.id))
    .orderBy(messages.createdAt);

  const chatMessages = [
    { role: "system" as const, content: SYSTEM_PROMPT },
    ...history.map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    })),
  ];

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  let fullResponse = "";
  try {
    const stream = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      max_tokens: 8192,
      messages: chatMessages,
      stream: true,
    });

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) {
        fullResponse += content;
        res.write(`data: ${JSON.stringify({ content })}\n\n`);
      }
    }

    if (fullResponse) {
      await db.insert(messages).values({
        conversationId: conversation.id,
        role: "assistant",
        content: fullResponse,
      });
    }

    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
  } catch (err) {
    req.log.error({ err }, "Ошибка OpenAI");
    res.write(`data: ${JSON.stringify({ error: "Ошибка при обращении к ИИ" })}\n\n`);
  }

  res.end();
});

export default router;

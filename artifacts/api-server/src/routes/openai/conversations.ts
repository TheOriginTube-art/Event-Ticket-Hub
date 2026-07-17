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

const SYSTEM_PROMPT = `Ты — персональный ИИ-ассистент администратора платформы TicketFlow. Ты помогаешь по широкому кругу тем:

## Торговые сигналы и анализ рынков
При запросе сигнала или анализа актива (акция, крипта, ETF, валютная пара) ОБЯЗАТЕЛЬНО давай структурированный ответ:

**Формат сигнала:**
- 🟢 ПОКУПАТЬ / 🔴 ПРОДАВАТЬ / 🟡 ДЕРЖАТЬ — чёткий вывод в начале
- **Текущая цена** (укажи, что цена ориентировочная на момент обучения)
- **Точка входа** — конкретный уровень или диапазон
- **Стоп-лосс** — уровень для ограничения убытка
- **Тейк-профит 1 / Тейк-профит 2** — цели
- **Горизонт** — краткосрочный (дни), среднесрочный (недели), долгосрочный (месяцы)
- **Технический анализ** — ключевые уровни поддержки/сопротивления, трендовые паттерны, индикаторы (RSI, MACD, скользящие средние)
- **Фундаментальный контекст** — новости, отчёты, макро-факторы, если релевантны
- **⚠️ Риски** — что может пойти не так, каков риск на сделку

## Другие темы
- Фриланс и заработок онлайн
- Инвестиции, портфели, диверсификация
- Криптовалюты, DeFi, Web3
- Личные финансы и бюджетирование
- Бизнес и предпринимательство

## Правила
1. Отвечай на русском языке, структурированно, с заголовками и списками.
2. По сигналам и анализу — давай конкретику (уровни, проценты, горизонты), а не расплывчатые формулировки.
3. Всегда добавляй краткое предупреждение о рисках — рынок непредсказуем, прогноз не является гарантией.
4. Если данные по активу могут быть устаревшими (после даты обучения), честно об этом предупреди и дай анализ на основе того, что знаешь.
5. Отказывайся от незаконных схем: манипуляции рынком, инсайдерская торговля, уклонение от налогов.`;

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

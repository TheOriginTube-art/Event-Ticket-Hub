import { db, eventsTable, sessionsTable, ticketCategoriesTable, venuesTable } from "@workspace/db";
import { logger } from "./lib/logger";
import { getUncachableStripeClient } from "./stripeClient";

type PriceTier = { name: string; priceCents: number; seatsTotal: number };
type SessionDef = { venueName: string; hall: string; daysFromNow: number; hour: number; minute: number };
type EventDef = {
  title: string;
  type: "movie" | "theater";
  description: string;
  posterUrl: string;
  genre: string;
  durationMinutes: number;
  ageRating: string;
  rating: number;
  sourceName: string;
  priceTiers: PriceTier[];
  sessions: SessionDef[];
};

const MOVIE_TIERS: PriceTier[] = [
  { name: "Стандарт", priceCents: 45000, seatsTotal: 80 },
  { name: "VIP", priceCents: 85000, seatsTotal: 20 },
];

const THEATER_TIERS: PriceTier[] = [
  { name: "Балкон", priceCents: 120000, seatsTotal: 60 },
  { name: "Партер", priceCents: 350000, seatsTotal: 40 },
  { name: "Ложа", priceCents: 550000, seatsTotal: 10 },
];

const venueDefs = [
  { name: "Каро 11 Октябрь", city: "Москва", address: "Новый Арбат, 24" },
  { name: "Пионер", city: "Москва", address: "Кутузовский проспект, 21" },
  { name: "МХТ имени Чехова", city: "Москва", address: "Камергерский переулок, 3" },
  { name: "Формула Кино Заневский", city: "Санкт-Петербург", address: "Заневский проспект, 67" },
  { name: "БДТ имени Товстоногова", city: "Санкт-Петербург", address: "набережная реки Фонтанки, 65" },
];

const eventDefs: EventDef[] = [
  {
    title: "Дюна: Пророчество",
    type: "movie",
    description:
      "Эпическая научная фантастика о зарождении ордена Бене Гессерит за десять тысяч лет до событий Пола Атрейдеса.",
    posterUrl: "https://images.unsplash.com/photo-1506318137071-a8e063b4bec0?w=600",
    genre: "Фантастика",
    durationMinutes: 165,
    ageRating: "16+",
    rating: 8.7,
    sourceName: "Кинопоиск Афиша",
    priceTiers: MOVIE_TIERS,
    sessions: [
      { venueName: "Каро 11 Октябрь", hall: "Зал 3", daysFromNow: 1, hour: 19, minute: 0 },
      { venueName: "Каро 11 Октябрь", hall: "Зал 3", daysFromNow: 2, hour: 21, minute: 30 },
      { venueName: "Формула Кино Заневский", hall: "Зал 1", daysFromNow: 3, hour: 18, minute: 45 },
    ],
  },
  {
    title: "Легенда о драконе",
    type: "movie",
    description: "Фэнтезийное приключение о молодом кузнеце, который должен пробудить древнего дракона-хранителя.",
    posterUrl: "https://images.unsplash.com/photo-1465101162946-4377e57745c3?w=600",
    genre: "Фэнтези",
    durationMinutes: 128,
    ageRating: "12+",
    rating: 7.9,
    sourceName: "Афиша.ру",
    priceTiers: MOVIE_TIERS,
    sessions: [
      { venueName: "Пионер", hall: "Зал 2", daysFromNow: 1, hour: 17, minute: 15 },
      { venueName: "Пионер", hall: "Зал 2", daysFromNow: 4, hour: 20, minute: 0 },
    ],
  },
  {
    title: "Полуночный экспресс",
    type: "movie",
    description: "Напряжённый триллер о пассажирах ночного поезда, застрявших с убийцей среди них.",
    posterUrl: "https://images.unsplash.com/photo-1495563875577-593d2f6f3ecf?w=600",
    genre: "Триллер",
    durationMinutes: 110,
    ageRating: "18+",
    rating: 8.1,
    sourceName: "Kassir.ru",
    priceTiers: MOVIE_TIERS,
    sessions: [
      { venueName: "Каро 11 Октябрь", hall: "Зал 5", daysFromNow: 2, hour: 22, minute: 0 },
      { venueName: "Формула Кино Заневский", hall: "Зал 2", daysFromNow: 5, hour: 21, minute: 0 },
    ],
  },
  {
    title: "Смешные истории 3",
    type: "movie",
    description: "Третья часть народной комедийной франшизы о нелепых приключениях большой семьи.",
    posterUrl: "https://images.unsplash.com/photo-1517604931442-7e0c8ed2963c?w=600",
    genre: "Комедия",
    durationMinutes: 95,
    ageRating: "6+",
    rating: 7.2,
    sourceName: "Билетик.ру",
    priceTiers: MOVIE_TIERS,
    sessions: [
      { venueName: "Пионер", hall: "Зал 1", daysFromNow: 1, hour: 14, minute: 0 },
      { venueName: "Каро 11 Октябрь", hall: "Зал 1", daysFromNow: 3, hour: 15, minute: 30 },
    ],
  },
  {
    title: "Космический патруль",
    type: "movie",
    description: "Семейная анимация о команде юных космонавтов, спасающих галактику от забавных злодеев.",
    posterUrl: "https://images.unsplash.com/photo-1446776653964-20c1d3a81b06?w=600",
    genre: "Анимация",
    durationMinutes: 90,
    ageRating: "6+",
    rating: 8.4,
    sourceName: "Афиша.ру",
    priceTiers: MOVIE_TIERS,
    sessions: [
      { venueName: "Формула Кино Заневский", hall: "Зал 3", daysFromNow: 2, hour: 12, minute: 0 },
      { venueName: "Формула Кино Заневский", hall: "Зал 3", daysFromNow: 6, hour: 13, minute: 30 },
    ],
  },
  {
    title: "Чайка",
    type: "theater",
    description: "Классическая драма А. П. Чехова о любви, творчестве и несбывшихся мечтах.",
    posterUrl: "https://images.unsplash.com/photo-1503095396549-807759245b35?w=600",
    genre: "Драма",
    durationMinutes: 150,
    ageRating: "12+",
    rating: 9.1,
    sourceName: "Kassir.ru",
    priceTiers: THEATER_TIERS,
    sessions: [
      { venueName: "МХТ имени Чехова", hall: "Основная сцена", daysFromNow: 3, hour: 19, minute: 0 },
      { venueName: "МХТ имени Чехова", hall: "Основная сцена", daysFromNow: 10, hour: 19, minute: 0 },
    ],
  },
  {
    title: "Ревизор",
    type: "theater",
    description: "Бессмертная сатирическая комедия Н. В. Гоголя о чиновничьих нравах уездного города.",
    posterUrl: "https://images.unsplash.com/photo-1507676184212-d03ab07a01bf?w=600",
    genre: "Комедия",
    durationMinutes: 140,
    ageRating: "12+",
    rating: 8.6,
    sourceName: "Билетик.ру",
    priceTiers: THEATER_TIERS,
    sessions: [
      { venueName: "МХТ имени Чехова", hall: "Малая сцена", daysFromNow: 4, hour: 19, minute: 30 },
      { venueName: "БДТ имени Товстоногова", hall: "Основная сцена", daysFromNow: 8, hour: 19, minute: 0 },
    ],
  },
  {
    title: "Лебединое озеро",
    type: "theater",
    description: "Легендарный балет П. И. Чайковского о заколдованной принцессе-лебеди в исполнении ведущей труппы.",
    posterUrl: "https://images.unsplash.com/photo-1518834107812-67b0b7c58434?w=600",
    genre: "Балет",
    durationMinutes: 120,
    ageRating: "6+",
    rating: 9.4,
    sourceName: "Афиша.ру",
    priceTiers: THEATER_TIERS,
    sessions: [
      { venueName: "БДТ имени Товстоногова", hall: "Основная сцена", daysFromNow: 5, hour: 19, minute: 0 },
      { venueName: "БДТ имени Товстоногова", hall: "Основная сцена", daysFromNow: 12, hour: 19, minute: 0 },
    ],
  },
  {
    title: "Гамлет",
    type: "theater",
    description: "Шекспировская трагедия о датском принце, мести и цене истины, в новой сценической редакции.",
    posterUrl: "https://images.unsplash.com/photo-1516307365426-bea591f05011?w=600",
    genre: "Трагедия",
    durationMinutes: 180,
    ageRating: "16+",
    rating: 8.9,
    sourceName: "Kassir.ru",
    priceTiers: THEATER_TIERS,
    sessions: [
      { venueName: "МХТ имени Чехова", hall: "Основная сцена", daysFromNow: 6, hour: 19, minute: 0 },
      { venueName: "БДТ имени Товстоногова", hall: "Малая сцена", daysFromNow: 9, hour: 19, minute: 30 },
    ],
  },
];

function sessionDate(daysFromNow: number, hour: number, minute: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  d.setHours(hour, minute, 0, 0);
  return d;
}

/**
 * Seeds demo venues/events/sessions/ticket categories along with matching real
 * Stripe Products (per event) and Prices (per ticket tier). No-op if events
 * already exist. Runs at server boot so it always executes with a fresh,
 * correctly-bound Stripe connector token (unlike a standalone script, which
 * can pick up a stale identity token from a long-lived shell).
 */
export async function seedIfEmpty(): Promise<void> {
  const existing = await db.select().from(eventsTable).limit(1);
  if (existing.length > 0) {
    logger.info("Demo data already seeded, skipping.");
    return;
  }

  let stripe: Awaited<ReturnType<typeof getUncachableStripeClient>> | null = null;
  try {
    stripe = await getUncachableStripeClient();
    logger.info("Seeding demo venues, events and Stripe products/prices...");
  } catch (err) {
    logger.warn(
      { err },
      "Stripe is not connected yet -- seeding demo data without Stripe products/prices. Checkout will be unavailable until Stripe is connected and the data is re-seeded.",
    );
  }

  const venueIdByName = new Map<string, number>();
  for (const v of venueDefs) {
    const [row] = await db.insert(venuesTable).values(v).returning();
    if (row) venueIdByName.set(v.name, row.id);
  }

  for (const evt of eventDefs) {
    const product = stripe
      ? await stripe.products.create({
          name: evt.title,
          description: evt.description,
        })
      : null;

    const [eventRow] = await db
      .insert(eventsTable)
      .values({
        title: evt.title,
        type: evt.type,
        description: evt.description,
        posterUrl: evt.posterUrl,
        genre: evt.genre,
        durationMinutes: evt.durationMinutes,
        ageRating: evt.ageRating,
        rating: evt.rating,
        sourceName: evt.sourceName,
        stripeProductId: product?.id,
      })
      .returning();

    if (!eventRow) {
      throw new Error(`Failed to insert event ${evt.title}`);
    }

    const priceIdByTier = new Map<string, string>();
    if (stripe && product) {
      for (const tier of evt.priceTiers) {
        const price = await stripe.prices.create({
          product: product.id,
          unit_amount: tier.priceCents,
          currency: "rub",
          nickname: tier.name,
        });
        priceIdByTier.set(tier.name, price.id);
      }
    }

    for (const sess of evt.sessions) {
      const venueId = venueIdByName.get(sess.venueName);
      if (!venueId) {
        throw new Error(`Unknown venue ${sess.venueName}`);
      }

      const [sessionRow] = await db
        .insert(sessionsTable)
        .values({
          eventId: eventRow.id,
          venueId,
          hall: sess.hall,
          startsAt: sessionDate(sess.daysFromNow, sess.hour, sess.minute),
        })
        .returning();

      if (!sessionRow) {
        throw new Error(`Failed to insert session for ${evt.title}`);
      }

      for (const tier of evt.priceTiers) {
        await db.insert(ticketCategoriesTable).values({
          sessionId: sessionRow.id,
          name: tier.name,
          priceCents: tier.priceCents,
          seatsTotal: tier.seatsTotal,
          seatsAvailable: tier.seatsTotal,
          stripePriceId: priceIdByTier.get(tier.name),
        });
      }
    }

    logger.info(`Seeded "${evt.title}" with ${evt.sessions.length} session(s).`);
  }

  logger.info("Demo data seed complete.");
}

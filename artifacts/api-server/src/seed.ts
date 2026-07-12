import { db, eventsTable, seatsTable, sessionsTable, ticketCategoriesTable, venuesTable } from "@workspace/db";
import { logger } from "./lib/logger";
import { getUncachableStripeClient } from "./stripeClient";

const SEATS_PER_ROW = 12;
const ROW_LETTERS = "АБВГДЕЖЗИКЛМНОПРСТУФХЦЧШЩЭЮЯ";

/** Generates a rectangular grid of seats (rows of SEATS_PER_ROW) for one ticket category, continuing row letters from `startRowIndex`. Returns the next free row index. */
function buildSeatsForCategory(
  sessionId: number,
  ticketCategoryId: number,
  seatsTotal: number,
  startRowIndex: number,
): { seats: { sessionId: number; ticketCategoryId: number; rowLabel: string; seatNumber: number }[]; nextRowIndex: number } {
  const seats: { sessionId: number; ticketCategoryId: number; rowLabel: string; seatNumber: number }[] = [];
  let remaining = seatsTotal;
  let rowIndex = startRowIndex;

  while (remaining > 0) {
    const rowLabel = ROW_LETTERS[rowIndex % ROW_LETTERS.length] ?? String(rowIndex);
    const seatsInRow = Math.min(SEATS_PER_ROW, remaining);
    for (let seatNumber = 1; seatNumber <= seatsInRow; seatNumber++) {
      seats.push({ sessionId, ticketCategoryId, rowLabel, seatNumber });
    }
    remaining -= seatsInRow;
    rowIndex++;
  }

  return { seats, nextRowIndex: rowIndex };
}

type PriceTier = { name: string; priceCents: number; seatsTotal: number };
type SessionDef = { venueName: string; hall: string; daysFromNow: number; hour: number; minute: number };
type EventDef = {
  title: string;
  type: "movie" | "theater" | "concert";
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

const CONCERT_TIERS: PriceTier[] = [
  { name: "Танцпол", priceCents: 250000, seatsTotal: 70 },
  { name: "Партер", priceCents: 450000, seatsTotal: 50 },
  { name: "VIP-балкон", priceCents: 800000, seatsTotal: 20 },
];

const venueDefs = [
  { name: "Каро 11 Октябрь", city: "Москва", address: "Новый Арбат, 24" },
  { name: "Пионер", city: "Москва", address: "Кутузовский проспект, 21" },
  { name: "МХТ имени Чехова", city: "Москва", address: "Камергерский переулок, 3" },
  { name: "Формула Кино Заневский", city: "Санкт-Петербург", address: "Заневский проспект, 67" },
  { name: "БДТ имени Товстоногова", city: "Санкт-Петербург", address: "набережная реки Фонтанки, 65" },
  { name: "Синема Парк Кольцо", city: "Екатеринбург", address: "улица Щербакова, 4" },
  { name: "Свердловский театр драмы", city: "Екатеринбург", address: "проспект Ленина, 47" },
  { name: "Киномакс Родина", city: "Казань", address: "улица Пушкина, 15" },
  { name: "Казанский ТЮЗ", city: "Казань", address: "улица Островского, 10" },
  { name: "Синема Парк Мега", city: "Новосибирск", address: "Немировича-Данченко, 24" },
  { name: "Новосибирский театр \"Глобус\"", city: "Новосибирск", address: "улица Каменская, 1" },
];

const eventDefs: EventDef[] = [
  {
    title: "Дюна: Пророчество",
    type: "movie",
    description:
      "Эпическая научная фантастика о зарождении ордена Бене Гессерит за десять тысяч лет до событий Пола Атрейдеса.",
    posterUrl: "https://static.kinoafisha.info/k/series_posters/400/upload/series/posters/9/2/3/4329/699231631128.jpg",
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
      { venueName: "Совкино", hall: "Зал 2", daysFromNow: 2, hour: 19, minute: 30 },
    ],
  },
  {
    title: "Легенда о драконе",
    type: "movie",
    description: "Фэнтезийное приключение о молодом кузнеце, который должен пробудить древнего дракона-хранителя.",
    posterUrl: "https://i.kbd.so/film/93812/61d7e4f7b75daff22da02fcd20b5350d.jpeg",
    genre: "Фэнтези",
    durationMinutes: 128,
    ageRating: "12+",
    rating: 7.9,
    sourceName: "Афиша.ру",
    priceTiers: MOVIE_TIERS,
    sessions: [
      { venueName: "Пионер", hall: "Зал 2", daysFromNow: 1, hour: 17, minute: 15 },
      { venueName: "Пионер", hall: "Зал 2", daysFromNow: 4, hour: 20, minute: 0 },
      { venueName: "Совкино", hall: "Зал 1", daysFromNow: 4, hour: 17, minute: 45 },
    ],
  },
  {
    title: "Полуночный экспресс",
    type: "movie",
    description: "Напряжённый триллер о пассажирах ночного поезда, застрявших с убийцей среди них.",
    posterUrl:
      "https://resizer.mail.ru/p/57f22168-7f8f-56b1-b97e-28aaa65ca2c2/AQACvXG1nWXnmwHlYDvVZTP-VW5G83a60Vy0fuxN3oMHvky4MSVmLeBhZNByP33pMqbO05FfSBPO3dc-8OCK2D_lwq8.jpg",
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
    posterUrl:
      "https://upload.wikimedia.org/wikipedia/ru/f/fe/%D0%9F%D0%BE%D1%87%D1%82%D0%B8_%D1%81%D0%BC%D0%B5%D1%88%D0%BD%D0%B0%D1%8F_%D0%B8%D1%81%D1%82%D0%BE%D1%80%D0%B8%D1%8F.jpg",
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
    posterUrl: "https://cdn2.momjunction.com/wp-content/uploads/static-content/illustration_images/best_space_movies_for_kids_to_watch_illustration.jpg.webp",
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
    posterUrl: "https://s5.afisha.ru/mediastorage/16/e1/c4163d1f82a64e1f9aa28e4de116.jpg",
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
    posterUrl: "https://s2.afisha.ru/mediastorage/62/84/a0cdca01f0fb4c5c8bc2d3b08462.jpg",
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
    posterUrl: "https://s.afisha.ru/mediastorage/1c/63/08158273eef145fe96f94351631c.png",
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
    posterUrl: "https://s1.afisha.ru/mediastorage/4b/0e/ab797fb7c21b440f829e6f8f0e4b.jpg",
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
  {
    title: "Пила X",
    type: "movie",
    description: "Десятая часть культового хоррор-франчайза о изощрённых ловушках маньяка Джона Крамера.",
    posterUrl:
      "https://www.soyuz.ru/public/uploads/files/5/7628351/1005x558_2023100221214098f27129f5.jpg",
    genre: "Ужасы",
    durationMinutes: 118,
    ageRating: "18+",
    rating: 7.6,
    sourceName: "Kino Mail",
    priceTiers: MOVIE_TIERS,
    sessions: [
      { venueName: "Синема Парк Кольцо", hall: "Зал 2", daysFromNow: 2, hour: 21, minute: 0 },
      { venueName: "Киномакс Родина", hall: "Зал 1", daysFromNow: 4, hour: 22, minute: 30 },
      { venueName: "Гигант", hall: "Малый зал", daysFromNow: 3, hour: 22, minute: 0 },
    ],
  },
  {
    title: "Балерина",
    type: "movie",
    description: "Боевик-спин-офф о девушке из мира наёмных убийц, ищущей возмездия за гибель семьи.",
    posterUrl: "https://www.kinonews.ru/insimgs/2025/poster/poster134506_2.webp",
    genre: "Боевик",
    durationMinutes: 125,
    ageRating: "18+",
    rating: 7.8,
    sourceName: "Афиша.ру",
    priceTiers: MOVIE_TIERS,
    sessions: [
      { venueName: "Синема Парк Мега", hall: "Зал 4", daysFromNow: 1, hour: 20, minute: 15 },
      { venueName: "Синема Парк Кольцо", hall: "Зал 1", daysFromNow: 5, hour: 18, minute: 0 },
    ],
  },
  {
    title: "Нейробатя",
    type: "movie",
    description: "Российская комедия о неловком отце, который пытается наладить контакт с дочерью через ИИ-помощника.",
    posterUrl:
      "https://resizer.mail.ru/p/e8c7ce5b-7930-5135-a820-a51dd6199080/AQACA7cSNQngWN21fBdmtEREB7MqACCzENETSDxJMS9AmbioiIW4YGH268wu6tuexBmK3862sLIl_G_wTPHF06FOqEk.jpg",
    genre: "Комедия",
    durationMinutes: 100,
    ageRating: "12+",
    rating: 7.3,
    sourceName: "Sobaka.ru",
    priceTiers: MOVIE_TIERS,
    sessions: [
      { venueName: "Киномакс Родина", hall: "Зал 2", daysFromNow: 2, hour: 17, minute: 0 },
      { venueName: "Синема Парк Мега", hall: "Зал 1", daysFromNow: 7, hour: 19, minute: 45 },
    ],
  },
  {
    title: "Ночной трамвай",
    type: "theater",
    description: "Спектакль-променад по ночному городу, где зрители становятся пассажирами странного маршрута судьбы.",
    posterUrl: "https://kuda-kazan.ru/image/185/185//uploads/bfee4a145fb5c27b010f31a1429ca41b.jpg",
    genre: "Иммерсивный спектакль",
    durationMinutes: 90,
    ageRating: "16+",
    rating: 8.5,
    sourceName: "Kazan-tuz.ru",
    priceTiers: THEATER_TIERS,
    sessions: [
      { venueName: "Казанский ТЮЗ", hall: "Основная сцена", daysFromNow: 4, hour: 18, minute: 30 },
      { venueName: "Казанский ТЮЗ", hall: "Основная сцена", daysFromNow: 11, hour: 18, minute: 30 },
    ],
  },
  {
    title: "Ночь её откровений",
    type: "theater",
    description: "Искромётная комедия положений о женщине, решившей за одну ночь рассказать всю правду близким.",
    posterUrl: "https://s4.afisha.ru/mediastorage/72/9d/049374a342604926b229269f9d72.jpg",
    genre: "Комедия",
    durationMinutes: 130,
    ageRating: "16+",
    rating: 9.1,
    sourceName: "Афиша.ру",
    priceTiers: THEATER_TIERS,
    sessions: [
      { venueName: "Новосибирский театр \"Глобус\"", hall: "Основная сцена", daysFromNow: 5, hour: 19, minute: 0 },
      { venueName: "Новосибирский театр \"Глобус\"", hall: "Основная сцена", daysFromNow: 13, hour: 19, minute: 0 },
    ],
  },
  {
    title: "Подыскиваю жену, недорого!",
    type: "theater",
    description: "Водевильная комедия о незадачливом холостяке, который решил найти невесту через брачное объявление.",
    posterUrl: "https://s1.afisha.ru/mediastorage/44/3c/81ad2fbbc9df4064890d76793c44.jpg",
    genre: "Водевиль",
    durationMinutes: 110,
    ageRating: "12+",
    rating: 7.9,
    sourceName: "Kassy.ru",
    priceTiers: THEATER_TIERS,
    sessions: [
      { venueName: "Свердловский театр драмы", hall: "Малая сцена", daysFromNow: 3, hour: 19, minute: 0 },
      { venueName: "Свердловский театр драмы", hall: "Малая сцена", daysFromNow: 10, hour: 19, minute: 0 },
    ],
  },
];

/**
 * Additional real-world events sourced from other afisha sites (Afisha.ru,
 * Kinopoisk Afisha, Kassir.ru, MXAT.ru, Maly.ru) to broaden the catalog
 * beyond the original seed. Inserted lazily by `seedAdditionalEventsIfMissing`
 * (skips any title that already exists), so it's safe to run on a
 * database that was already seeded.
 */
const additionalEventDefs: EventDef[] = [
  {
    title: "Холоп 3",
    type: "movie",
    description:
      "Финал народной трилогии: избалованный богатый наследник вновь оказывается на грани перевоспитания — на этот раз приключения забрасывают героев в эпоху Петра I.",
    posterUrl: "https://static.kinoafisha.info/k/movie_posters/400/upload/movie_posters/1/1/1/8375111/147604663767.jpg",
    genre: "Комедия",
    durationMinutes: 116,
    ageRating: "12+",
    rating: 6.6,
    sourceName: "Афиша.ру",
    priceTiers: MOVIE_TIERS,
    sessions: [
      { venueName: "Каро 11 Октябрь", hall: "Зал 2", daysFromNow: 1, hour: 16, minute: 20 },
      { venueName: "Пионер", hall: "Зал 1", daysFromNow: 3, hour: 20, minute: 30 },
      { venueName: "Гигант", hall: "Большой зал", daysFromNow: 5, hour: 18, minute: 30 },
    ],
  },
  {
    title: "Колония",
    type: "movie",
    description:
      "На конференции по биотехнологиям происходит внезапный выброс неизвестного вируса, здание закрывают на карантин — и запертым внутри людям предстоит бороться за выживание.",
    posterUrl: "https://www.kinonews.ru/insimgs/2026/poster/poster141264_3.webp",
    genre: "Боевик",
    durationMinutes: 122,
    ageRating: "18+",
    rating: 7.4,
    sourceName: "Kino Mail",
    priceTiers: MOVIE_TIERS,
    sessions: [
      { venueName: "Синема Парк Кольцо", hall: "Зал 3", daysFromNow: 2, hour: 19, minute: 40 },
      { venueName: "Киномакс Родина", hall: "Зал 3", daysFromNow: 6, hour: 21, minute: 15 },
    ],
  },
  {
    title: "Кодекс Данте",
    type: "movie",
    description:
      "Эзотерический детектив-кейпер по роману Ника Тошеса: букинист случайно завладевает рукописью Данте и оказывается втянут в опасную охоту с участием мафии и Ватикана.",
    posterUrl: "https://static.kinoafisha.info/k/movie_posters/400/upload/movie_posters/4/3/7/8372734/800461579969.jpg",
    genre: "Драма",
    durationMinutes: 115,
    ageRating: "16+",
    rating: 6.9,
    sourceName: "Кинопоиск Афиша",
    priceTiers: MOVIE_TIERS,
    sessions: [
      { venueName: "Формула Кино Заневский", hall: "Зал 2", daysFromNow: 3, hour: 20, minute: 0 },
      { venueName: "Синема Парк Мега", hall: "Зал 2", daysFromNow: 8, hour: 18, minute: 30 },
    ],
  },
  {
    title: "Кабала святош",
    type: "theater",
    description:
      "Булгаковская пьеса о Мольере и всесильной кабале, решающей судьбы художников при дворе Короля-солнца — новая постановка МХТ с Константином Хабенским.",
    posterUrl: "https://s3.afisha.ru/mediastorage/d4/41/9e12596fb9034eb8b525b39741d4.jpg",
    genre: "Драма",
    durationMinutes: 170,
    ageRating: "16+",
    rating: 8.8,
    sourceName: "MXAT.ru",
    priceTiers: THEATER_TIERS,
    sessions: [
      { venueName: "МХТ имени Чехова", hall: "Основная сцена", daysFromNow: 7, hour: 19, minute: 0 },
      { venueName: "МХТ имени Чехова", hall: "Основная сцена", daysFromNow: 14, hour: 19, minute: 0 },
    ],
  },
  {
    title: "Две Анны",
    type: "theater",
    description:
      "Балетный проект MuzArts — история в танце о двух великих женщинах XX столетия, представленная ведущими солистами российского балета.",
    posterUrl: "https://live.mts.ru/image/536x360/dve-anny-4c8393ba-1f53-459f-b54b-5f6b6df41a20.jpg",
    genre: "Балет",
    durationMinutes: 110,
    ageRating: "12+",
    rating: 9.0,
    sourceName: "Maly.ru",
    priceTiers: THEATER_TIERS,
    sessions: [
      { venueName: "БДТ имени Товстоногова", hall: "Основная сцена", daysFromNow: 9, hour: 19, minute: 0 },
    ],
  },
  {
    title: "Актриса",
    type: "theater",
    description:
      "Трагикомедия современного театра антрепризы о звезде сцены, которой предстоит заново найти себя за кулисами собственной славы.",
    posterUrl:
      "https://s13.stc.all.kpcdn.net/afisha/msk/wp-content/uploads/sites/5/2025/01/img_20260126_1123051-600x600.jpg",
    genre: "Трагикомедия",
    durationMinutes: 90,
    ageRating: "16+",
    rating: 9.0,
    sourceName: "Яндекс Афиша",
    priceTiers: THEATER_TIERS,
    sessions: [
      { venueName: "Свердловский театр драмы", hall: "Малая сцена", daysFromNow: 5, hour: 19, minute: 0 },
      { venueName: "Казанский ТЮЗ", hall: "Основная сцена", daysFromNow: 12, hour: 19, minute: 30 },
    ],
  },
  {
    title: "Пасть",
    type: "movie",
    description:
      "Компания друзей отправляется в круиз по диким озёрам Луизианы, желая увидеть редких животных в естественной среде — и становится дичью сама.",
    posterUrl: "https://static.kinoafisha.info/k/movie_posters/400/upload/movie_posters/6/4/9/8384946/574544069493.jpg",
    genre: "Ужасы",
    durationMinutes: 92,
    ageRating: "18+",
    rating: 6.2,
    sourceName: "Kinoteatr.ru",
    priceTiers: MOVIE_TIERS,
    sessions: [
      { venueName: "Формула Кино Заневский", hall: "Зал 4", daysFromNow: 1, hour: 22, minute: 15 },
      { venueName: "Синема Парк Кольцо", hall: "Зал 5", daysFromNow: 4, hour: 21, minute: 30 },
      { venueName: "Хабаровск", hall: "Redcom", daysFromNow: 0, hour: 23, minute: 35 },
      { venueName: "Кинокосмос", hall: "Зал 2", daysFromNow: 1, hour: 20, minute: 0 },
    ],
  },
  {
    title: "Иллюзия убийства",
    type: "movie",
    description:
      "Испанский психологический триллер: похищенный брат возвращается домой с пугающими тайнами, и герою предстоит распутать клубок лжи ненадёжных рассказчиков.",
    posterUrl: "https://resizer.mail.ru/p/a17279b0-a7a9-5deb-8e7a-6c2338876ec5/AQACE-cwLTdrlWVQ3K7srfehhk0xPN9rzmD8vBcEDWQEyuI-wM_7rxHkZ7GpjH_8ulTVSYZYaXyaKpXBf0ADBkxWEdM.jpg",
    genre: "Детектив",
    durationMinutes: 108,
    ageRating: "18+",
    rating: 6.8,
    sourceName: "Lifehacker.ru",
    priceTiers: MOVIE_TIERS,
    sessions: [
      { venueName: "Каро 11 Октябрь", hall: "Зал 4", daysFromNow: 2, hour: 20, minute: 45 },
      { venueName: "Пионер", hall: "Зал 2", daysFromNow: 5, hour: 19, minute: 15 },
    ],
  },
  {
    title: "Майкл",
    type: "movie",
    description:
      "Масштабный музыкальный байопик о жизни и творчестве короля поп-музыки Майкла Джексона — от вундеркинда из Гэри, Индиана, до самого известного артиста планеты.",
    posterUrl: "https://s12.stc.all.kpcdn.net/afisha/msk/wp-content/uploads/sites/5/2023/01/kadr-iz-trejlera-filma-majkl-2026-1.jpg",
    genre: "Биография",
    durationMinutes: 127,
    ageRating: "18+",
    rating: 8.1,
    sourceName: "Кинопоиск Афиша",
    priceTiers: MOVIE_TIERS,
    sessions: [
      { venueName: "Каро 11 Октябрь", hall: "Зал 1", daysFromNow: 2, hour: 18, minute: 0 },
      { venueName: "Формула Кино Заневский", hall: "Зал 5", daysFromNow: 4, hour: 20, minute: 30 },
    ],
  },
  {
    title: "Мастер и Маргарита",
    type: "theater",
    description:
      "Рок-мюзикл по роману Булгакова: Москва, где сталкиваются Воланд и его свита, влюблённые Мастер и Маргарита, поэт Иван Бездомный и вся человеческая суета.",
    posterUrl: "https://peterburg.center/sites/default/files/img/event_m/2021-12/2021-12-26_07-59-37.png",
    genre: "Мюзикл",
    durationMinutes: 150,
    ageRating: "16+",
    rating: 8.9,
    sourceName: "Kuda-SPb.ru",
    priceTiers: THEATER_TIERS,
    sessions: [
      { venueName: "Театр ЛДМ", hall: "Новая-новая сцена", daysFromNow: 6, hour: 19, minute: 0 },
      { venueName: "Театр ЛДМ", hall: "Новая-новая сцена", daysFromNow: 13, hour: 19, minute: 0 },
    ],
  },
  {
    title: "Лолита",
    type: "theater",
    description:
      "Хоррор-мюзикл по мотивам романа Набокова: мрачная и завораживающая история одержимости, рассказанная языком современного музыкального театра.",
    posterUrl: "https://i2020.otzovik.com/2020/04/16/9838651/img/1279705_12608479_t.jpeg",
    genre: "Мюзикл",
    durationMinutes: 140,
    ageRating: "18+",
    rating: 8.3,
    sourceName: "Otzovik.com",
    priceTiers: THEATER_TIERS,
    sessions: [
      { venueName: "Театр ЛДМ", hall: "Основная сцена", daysFromNow: 8, hour: 19, minute: 30 },
    ],
  },
  {
    title: "Дон Кихот",
    type: "theater",
    description:
      "Гастроли Театра балета имени Л. Якобсона: искромётный испанский колорит и виртуозная классическая хореография в одном из самых зрелищных балетов репертуара.",
    posterUrl: "https://cdn.kassir.ru/spb/poster_1280_392/f3/f39682ab2b3dfe883450b376495dd4b7.jpg",
    genre: "Балет",
    durationMinutes: 135,
    ageRating: "6+",
    rating: 8.7,
    sourceName: "Alexandrinskytheatre.ru",
    priceTiers: THEATER_TIERS,
    sessions: [
      { venueName: "Александринский театр", hall: "Основная сцена", daysFromNow: 10, hour: 18, minute: 0 },
    ],
  },
  {
    title: "Женитьба",
    type: "theater",
    description:
      "Гоголевская комедия о нерешительном женихе Подколёсине, свахе и незадачливом сватовстве — острая сатира на страх перемен, разыгранная на исторической сцене.",
    posterUrl: "https://s.afisha.ru/mediastorage/82/42/47e397fe9e71412db794feb14282.jpg",
    genre: "Комедия",
    durationMinutes: 145,
    ageRating: "12+",
    rating: 8.4,
    sourceName: "Kassir.ru",
    priceTiers: THEATER_TIERS,
    sessions: [
      { venueName: "Александринский театр", hall: "Основная сцена", daysFromNow: 11, hour: 19, minute: 0 },
    ],
  },
  {
    title: "Когда я снова стану маленьким",
    type: "theater",
    description:
      "Музыкальный спектакль по произведениям Януша Корчака, лауреат «Золотой маски» — трогательная история о детстве, доверии и праве быть услышанным.",
    posterUrl: "https://s2.afisha.ru/mediastorage/a9/c7/d989fcc3502c4d5ca7d8e315c7a9.jpg",
    genre: "Музыкальный спектакль",
    durationMinutes: 80,
    ageRating: "6+",
    rating: 8.9,
    sourceName: "BDT.spb.ru",
    priceTiers: THEATER_TIERS,
    sessions: [
      { venueName: "БДТ имени Товстоногова", hall: "Малая сцена", daysFromNow: 6, hour: 12, minute: 0 },
    ],
  },
  {
    title: "Ничего не бойся, я с тобой",
    type: "theater",
    description:
      "Хит-мюзикл на песни легендарной группы «Секрет» — романтичная история любви, дружбы и рок-н-ролльной юности восьмидесятых.",
    posterUrl: "https://cdn.lifehacker.ru/wp-content/uploads/2026/04/Ap5ZQMoLZ4PJXKAb__Rq6quQpvHRsVj5KWawbpJ3k4kVoCnFhkv__hiqlSh9sX_WdAOefn1O6Dszqwpg_btjiQ3D3D_uid0filenameD0BCD18ED0B7D0B8D0BAD0BB2022D09DD0B8D187D0B5D0B3D0BE20D0BDD0B520D0B1D0BED0B9D181D18F2C20_1776174970.jpg",
    genre: "Мюзикл",
    durationMinutes: 150,
    ageRating: "12+",
    rating: 9.6,
    sourceName: "Яндекс Афиша",
    priceTiers: THEATER_TIERS,
    sessions: [
      { venueName: "МДМ", hall: "Основная сцена", daysFromNow: 7, hour: 19, minute: 0 },
      { venueName: "МДМ", hall: "Основная сцена", daysFromNow: 15, hour: 19, minute: 0 },
    ],
  },
  {
    title: "Кабаре",
    type: "theater",
    description:
      "Постановка Евгения Писарева по легендарному мюзиклу — Берлин на пороге больших перемен, кабаре «Кит-Кэт-Клуб» и судьбы, которые история уже не пощадит.",
    posterUrl: "https://s1.afisha.ru/mediastorage/48/f0/880b2cb7bc4a492a8911359ff048.jpg",
    genre: "Мюзикл",
    durationMinutes: 165,
    ageRating: "18+",
    rating: 9.0,
    sourceName: "Theatreofnations.ru",
    priceTiers: THEATER_TIERS,
    sessions: [
      { venueName: "Театр Наций", hall: "Основная сцена", daysFromNow: 9, hour: 19, minute: 0 },
      { venueName: "Театр Наций", hall: "Основная сцена", daysFromNow: 16, hour: 19, minute: 0 },
    ],
  },
  {
    title: "История игрушек 5",
    type: "movie",
    description:
      "Пятая часть легендарной франшизы Pixar — Вуди, Баз Лайтер и их друзья узнают, что смартфоны и планшеты стали новыми любимцами детей, и отправляются в трогательное приключение, чтобы доказать: настоящая дружба важнее любых гаджетов.",
    posterUrl: "https://cdn.moviefone.com/admin-uploads/highlights/images/toy-story-5-official-poster_1771524686.webp",
    genre: "Мультфильм",
    durationMinutes: 100,
    ageRating: "6+",
    rating: 7.5,
    sourceName: "Dvhab.ru",
    priceTiers: MOVIE_TIERS,
    sessions: [
      { venueName: "Совкино", hall: "Зал 1", daysFromNow: 0, hour: 15, minute: 0 },
      { venueName: "Гигант", hall: "Большой зал", daysFromNow: 1, hour: 17, minute: 30 },
    ],
  },
  {
    title: "Живая ярость",
    type: "movie",
    description:
      "Когда дочь мастера-ремесленника Ван Вэя похищает преступная группировка, тот самостоятельно отправляется на её поиски. Его единственным союзником становится Навин — неутомимый журналист, чья жена таинственно исчезла. Мужчинам из разных слоёв общества предстоит объединиться, чтобы вернуть близких.",
    posterUrl: "https://resizer.mail.ru/p/66d42bfd-219d-53cb-a188-8099a82efb42/AQACiWS69HpXo8nOQn2yT6wa3l4C_u9duir_decE0FL8cPIK_H_igLNCs4BVlgKBvtebR451KqhT1U3nDlKkQ4rPSBk.jpg",
    genre: "Боевик",
    durationMinutes: 110,
    ageRating: "18+",
    rating: 8.3,
    sourceName: "Newslab.ru",
    priceTiers: MOVIE_TIERS,
    sessions: [
      { venueName: "Гигант", hall: "Малый зал", daysFromNow: 2, hour: 21, minute: 0 },
    ],
  },
  {
    title: "Женщины Сергея Есенина, или Любовь хулигана",
    type: "theater",
    description:
      "Документальный спектакль, основанный на реальных событиях из жизни великого русского поэта Сергея Есенина и женщин, ставших его музами — драматичная история любви и творчества на фоне бурной эпохи.",
    posterUrl: "https://kirovdramteatr.ru/media/show/164_f0eefd04bbfd4c85706758da94a553.jpg",
    genre: "Документальный спектакль",
    durationMinutes: 120,
    ageRating: "16+",
    rating: 8.8,
    sourceName: "Habdrama.ru",
    priceTiers: THEATER_TIERS,
    sessions: [
      { venueName: "Хабаровский краевой театр драмы", hall: "Большая сцена", daysFromNow: 0, hour: 18, minute: 0 },
    ],
  },
  {
    title: "Сильва",
    type: "theater",
    description:
      "Оперетта Имре Кальмана о непростой любви оперной дивы и аристократа, готового ради избранницы бросить вызов сословным предрассудкам — одна из самых красивых и мелодичных опереточных историй XX века.",
    posterUrl: "https://www.belcanto.ru/media/images/composition/16080416.jpg",
    genre: "Оперетта",
    durationMinutes: 140,
    ageRating: "12+",
    rating: 8.6,
    sourceName: "Muzteatrkhv.ru",
    priceTiers: THEATER_TIERS,
    sessions: [
      { venueName: "Хабаровский краевой музыкальный театр", hall: "Основная сцена", daysFromNow: 5, hour: 19, minute: 0 },
    ],
  },
  {
    title: "Миньоны и Монстры",
    type: "movie",
    description:
      "Дерзкая, абсурдная и в то же время удивительно правдивая история о том, как миньоны покорили Голливуд, стали кинозвёздами, потеряли всё, выпустили монстров на свободу — и в конце концов были вынуждены объединиться, чтобы спасти планету от хаоса.",
    posterUrl: "https://www.impawards.com/2026/posters/minions_three.jpg",
    genre: "Мультфильм",
    durationMinutes: 90,
    ageRating: "6+",
    rating: 7.4,
    sourceName: "Dvhab.ru",
    priceTiers: MOVIE_TIERS,
    sessions: [
      { venueName: "Хабаровск", hall: "Зал 1", daysFromNow: 0, hour: 18, minute: 30 },
      { venueName: "Кинокосмос", hall: "Зал 1", daysFromNow: 1, hour: 16, minute: 0 },
    ],
  },
  {
    title: "Энола Холмс 3",
    type: "movie",
    description:
      "Детектив Энола Холмс оказывается на Мальте, где ей предстоит сложное и опасное расследование.",
    posterUrl: "https://www.impawards.com/2026/posters/enola_holmes_three.jpg",
    genre: "Детектив",
    durationMinutes: 105,
    ageRating: "12+",
    rating: 7.8,
    sourceName: "Dvhab.ru",
    priceTiers: MOVIE_TIERS,
    sessions: [
      { venueName: "Хабаровск", hall: "Зал 2", daysFromNow: 2, hour: 19, minute: 45 },
    ],
  },
  {
    title: "Папа, купи пёсика",
    type: "movie",
    description:
      "Милана получает долгожданный подарок от родителей — щенка Диппи. Но однажды на прогулке щенок теряется в парке и остаётся один на один с большим городом. Диппи знакомится с уличным Котом, крысой Бенгсом и даже влюбляется в чихуахуа Табби, пока Милана ведёт поиски любимого питомца.",
    posterUrl: "https://www.dvhab.ru/kino/kino/images/big_12780904.jpg",
    genre: "Мультфильм",
    durationMinutes: 90,
    ageRating: "6+",
    rating: 7.1,
    sourceName: "Dvhab.ru",
    priceTiers: MOVIE_TIERS,
    sessions: [
      { venueName: "Кинокосмос", hall: "Зал 3", daysFromNow: 0, hour: 14, minute: 0 },
    ],
  },
];

/** Extra venues referenced by `additionalEventDefs` that aren't in the original `venueDefs`. */
const additionalVenueDefs = [
  { name: "Театр ЛДМ", city: "Санкт-Петербург", address: "улица Профессора Попова, 47" },
  { name: "Александринский театр", city: "Санкт-Петербург", address: "площадь Островского, 6" },
  { name: "МДМ", city: "Москва", address: "Комсомольский проспект, 28" },
  { name: "Театр Наций", city: "Москва", address: "улица Петровка, 3" },
  { name: "Совкино", city: "Хабаровск", address: "улица Муравьева-Амурского, 34" },
  { name: "Гигант", city: "Хабаровск", address: "улица Муравьева-Амурского, 19" },
  { name: "Хабаровский краевой театр драмы", city: "Хабаровск", address: "улица Дзержинского, 44" },
  { name: "Хабаровский краевой музыкальный театр", city: "Хабаровск", address: "улица Карла Маркса, 64" },
  // Совкино и Гигант по данным dvhab.ru временно не работают -- добавляем
  // реально действующие сейчас кинотеатры Хабаровска для новых фильмов.
  { name: "Хабаровск", city: "Хабаровск", address: "улица Стрельникова, 4" },
  { name: "Кинокосмос", city: "Хабаровск", address: "улица Краснореченская, 102/3, МРЦ «Космопорт»" },
];

/** Concert venues referenced by `concertEventDefs`. */
const concertVenueDefs = [
  { name: "Крокус Сити Холл", city: "Москва", address: "МКАД, 66 км, вл4с1, Мякинино" },
  { name: "БКЗ Октябрьский", city: "Санкт-Петербург", address: "Лиговский проспект, 6" },
  { name: "А2 Green Concert", city: "Санкт-Петербург", address: "проспект Медиков, 3" },
  { name: "Казань Экспо", city: "Казань", address: "Оренбургский тракт, 8" },
];

/**
 * Real touring concerts sourced from afisha listings (Афиша.ру, KP.ru,
 * Ticketland) to seed the new "Концерты" event type alongside movies and
 * theater. Inserted lazily by `seedConcertsIfMissing` (skips titles that
 * already exist), so it's safe to run on an already-seeded database.
 */
const concertEventDefs: EventDef[] = [
  {
    title: "Руки Вверх! Юбилейный тур",
    type: "concert",
    description:
      "Сергей Жуков и группа «Руки Вверх!» отмечают юбилей на большой сцене — все главные хиты devяностых и двухтысячных в новой концертной программе.",
    posterUrl: "https://prostars.org/files/catalog/items/0/530x800/22/5e04ed3fb3999.png",
    genre: "Поп",
    durationMinutes: 120,
    ageRating: "6+",
    rating: 8.8,
    sourceName: "KP.ru Афиша",
    priceTiers: CONCERT_TIERS,
    sessions: [{ venueName: "Крокус Сити Холл", hall: "Основной зал", daysFromNow: 13, hour: 20, minute: 0 }],
  },
  {
    title: "Елена Ваенга. Большой концерт",
    type: "concert",
    description:
      "Елена Ваенга представляет большую сольную программу — искренняя эстрада и авторские песни, ставшие визитной карточкой одной из самых ярких артисток страны.",
    posterUrl: "https://kremlinpalace.org/images/events/1750163203.jpg",
    genre: "Эстрада",
    durationMinutes: 130,
    ageRating: "16+",
    rating: 9.0,
    sourceName: "KP.ru Афиша",
    priceTiers: CONCERT_TIERS,
    sessions: [{ venueName: "БКЗ Октябрьский", hall: "Большой зал", daysFromNow: 3, hour: 19, minute: 0 }],
  },
  {
    title: "Леонид Агутин с новой программой",
    type: "concert",
    description:
      "Леонид Агутин исполнит новую программу вместе с бэндом — от джазовых баллад до самых узнаваемых хитов последних тридцати лет.",
    posterUrl: "https://pic.rtbcdn.ru/video/2025-12-04/45/f8/45f84e2f341f9e5e6334ca9ff94df0f3.jpg",
    genre: "Поп",
    durationMinutes: 110,
    ageRating: "6+",
    rating: 8.7,
    sourceName: "KP.ru Афиша",
    priceTiers: CONCERT_TIERS,
    sessions: [{ venueName: "Крокус Сити Холл", hall: "Основной зал", daysFromNow: 6, hour: 19, minute: 0 }],
  },
  {
    title: "КняZz",
    type: "concert",
    description:
      "Рок-группа КняZz — готик-рок с оркестровым размахом и театральной подачей в исполнении Андрея Лефлера и его команды.",
    posterUrl: "https://amdm.ru/cs/images/artist/250/19376.jpg",
    genre: "Рок",
    durationMinutes: 100,
    ageRating: "12+",
    rating: 8.5,
    sourceName: "KP.ru Афиша",
    priceTiers: CONCERT_TIERS,
    sessions: [{ venueName: "А2 Green Concert", hall: "Основная сцена", daysFromNow: 7, hour: 19, minute: 0 }],
  },
  {
    title: "Мари Краймбрери",
    type: "concert",
    description:
      "Мари Краймбрери исполнит свои главные хиты и новые песни в большом сольном концерте с полноценным живым звуком.",
    posterUrl: "https://mkraimbrery.ru/wp-content/uploads/sites/15/mari-kraymbreri-afisha-i-bilety-na-kontsert.jpg",
    genre: "Поп",
    durationMinutes: 105,
    ageRating: "12+",
    rating: 8.6,
    sourceName: "Mos-Kassir.ru",
    priceTiers: CONCERT_TIERS,
    sessions: [{ venueName: "Крокус Сити Холл", hall: "Основной зал", daysFromNow: 1, hour: 20, minute: 0 }],
  },
  {
    title: "Олег Газманов",
    type: "concert",
    description:
      "Олег Газманов представляет большую концертную программу из главных хитов десятилетий — «Морячка», «Есаул», «Москва» и многое другое.",
    posterUrl: "https://www.gazmanov-bilet.ru/images/upload/gazmanov-1.jpeg",
    genre: "Поп",
    durationMinutes: 115,
    ageRating: "6+",
    rating: 8.4,
    sourceName: "Afisha.org.ru",
    priceTiers: CONCERT_TIERS,
    sessions: [{ venueName: "Казань Экспо", hall: "Главный зал", daysFromNow: 4, hour: 21, minute: 0 }],
  },
];

function sessionDate(daysFromNow: number, hour: number, minute: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  d.setHours(hour, minute, 0, 0);
  return d;
}

/** Inserts one event (with Stripe product/prices, sessions, ticket categories and seats) into the DB. */
async function insertEvent(
  evt: EventDef,
  stripe: Awaited<ReturnType<typeof getUncachableStripeClient>> | null,
  venueIdByName: Map<string, number>,
): Promise<void> {
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

    let rowIndex = 0;
    for (const tier of evt.priceTiers) {
      const [categoryRow] = await db
        .insert(ticketCategoriesTable)
        .values({
          sessionId: sessionRow.id,
          name: tier.name,
          priceCents: tier.priceCents,
          seatsTotal: tier.seatsTotal,
          stripePriceId: priceIdByTier.get(tier.name),
        })
        .returning();

      if (!categoryRow) {
        throw new Error(`Failed to insert ticket category ${tier.name} for ${evt.title}`);
      }

      const { seats, nextRowIndex } = buildSeatsForCategory(
        sessionRow.id,
        categoryRow.id,
        tier.seatsTotal,
        rowIndex,
      );
      rowIndex = nextRowIndex;
      if (seats.length > 0) {
        await db.insert(seatsTable).values(seats);
      }
    }
  }

  logger.info(`Seeded "${evt.title}" with ${evt.sessions.length} session(s).`);
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
    await insertEvent(evt, stripe, venueIdByName);
  }

  logger.info("Demo data seed complete.");
}

/**
 * Adds the extra afisha-sourced events (see `additionalEventDefs`) to an
 * already-seeded database, skipping any title that already exists. Safe to
 * call every boot.
 */
export async function seedAdditionalEventsIfMissing(): Promise<void> {
  const existingTitles = new Set((await db.select({ title: eventsTable.title }).from(eventsTable)).map((e) => e.title));
  const toInsert = additionalEventDefs.filter((evt) => !existingTitles.has(evt.title));
  if (toInsert.length === 0) {
    logger.info("Additional afisha events already seeded, skipping.");
    return;
  }

  let stripe: Awaited<ReturnType<typeof getUncachableStripeClient>> | null = null;
  try {
    stripe = await getUncachableStripeClient();
  } catch (err) {
    logger.warn({ err }, "Stripe is not connected -- seeding additional events without Stripe products/prices.");
  }

  const venues = await db.select().from(venuesTable);
  const venueIdByName = new Map(venues.map((v) => [v.name, v.id]));

  for (const v of additionalVenueDefs) {
    if (venueIdByName.has(v.name)) continue;
    const [row] = await db.insert(venuesTable).values(v).returning();
    if (row) venueIdByName.set(v.name, row.id);
  }

  logger.info(`Seeding ${toInsert.length} additional event(s) from other afisha sites...`);
  for (const evt of toInsert) {
    await insertEvent(evt, stripe, venueIdByName);
  }
  logger.info("Additional afisha events seed complete.");
}

/**
 * Adds real touring concerts (see `concertEventDefs`) to seed the new
 * "concert" event type, skipping any title that already exists. Safe to
 * call every boot.
 */
export async function seedConcertsIfMissing(): Promise<void> {
  const existingTitles = new Set((await db.select({ title: eventsTable.title }).from(eventsTable)).map((e) => e.title));
  const toInsert = concertEventDefs.filter((evt) => !existingTitles.has(evt.title));
  if (toInsert.length === 0) {
    logger.info("Concert events already seeded, skipping.");
    return;
  }

  let stripe: Awaited<ReturnType<typeof getUncachableStripeClient>> | null = null;
  try {
    stripe = await getUncachableStripeClient();
  } catch (err) {
    logger.warn({ err }, "Stripe is not connected -- seeding concerts without Stripe products/prices.");
  }

  const venues = await db.select().from(venuesTable);
  const venueIdByName = new Map(venues.map((v) => [v.name, v.id]));

  for (const v of concertVenueDefs) {
    if (venueIdByName.has(v.name)) continue;
    const [row] = await db.insert(venuesTable).values(v).returning();
    if (row) venueIdByName.set(v.name, row.id);
  }

  logger.info(`Seeding ${toInsert.length} concert event(s)...`);
  for (const evt of toInsert) {
    await insertEvent(evt, stripe, venueIdByName);
  }
  logger.info("Concert events seed complete.");
}

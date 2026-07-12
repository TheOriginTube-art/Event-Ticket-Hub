-- Совкино и Гигант по данным dvhab.ru сейчас закрыты ("НЕ РАБОТАЕТ"). Этот
-- скрипт добавляет реально работающие сейчас кинотеатры Хабаровска
-- ("Хабаровск" и "Кинокосмос") и реальный текущий репертуар (данные
-- dvhab.ru на 12.07.2026): "Пасть" (уже есть в каталоге, для других
-- городов), "Миньоны и Монстры", "Энола Холмс 3", "Папа, купи пёсика".
-- Существующие сеансы в Совкино/Гигант не трогаем (могут быть привязаны
-- к уже оплаченным заказам). Безопасно перезапускать.

-- 1. Новые кинотеатры
INSERT INTO venues (name, city, address)
SELECT 'Хабаровск', 'Хабаровск', 'улица Стрельникова, 4'
WHERE NOT EXISTS (SELECT 1 FROM venues WHERE name = 'Хабаровск' AND city = 'Хабаровск');

INSERT INTO venues (name, city, address)
SELECT 'Кинокосмос', 'Хабаровск', 'улица Краснореченская, 102/3, МРЦ «Космопорт»'
WHERE NOT EXISTS (SELECT 1 FROM venues WHERE name = 'Кинокосмос' AND city = 'Хабаровск');

-- 2. Новые фильмы (пропускаем, если уже есть)
INSERT INTO events (title, type, description, poster_url, genre, duration_minutes, age_rating, rating, source_name)
SELECT 'Миньоны и Монстры', 'movie',
  'Дерзкая, абсурдная и в то же время удивительно правдивая история о том, как миньоны покорили Голливуд, стали кинозвёздами, потеряли всё, выпустили монстров на свободу — и в конце концов были вынуждены объединиться, чтобы спасти планету от хаоса.',
  'https://www.dvhab.ru/kino/kino/images/w1500_57453900.jpeg', 'Мультфильм', 90, '6+', 7.4, 'Dvhab.ru'
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Миньоны и Монстры');

INSERT INTO events (title, type, description, poster_url, genre, duration_minutes, age_rating, rating, source_name)
SELECT 'Энола Холмс 3', 'movie',
  'Детектив Энола Холмс оказывается на Мальте, где ей предстоит сложное и опасное расследование.',
  'https://www.dvhab.ru/kino/kino/images/w1500_57442627.jpg', 'Детектив', 105, '12+', 7.8, 'Dvhab.ru'
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Энола Холмс 3');

INSERT INTO events (title, type, description, poster_url, genre, duration_minutes, age_rating, rating, source_name)
SELECT 'Папа, купи пёсика', 'movie',
  'Милана получает долгожданный подарок от родителей — щенка Диппи. Но однажды на прогулке щенок теряется в парке и остаётся один на один с большим городом. Диппи знакомится с уличным Котом, крысой Бенгсом и даже влюбляется в чихуахуа Табби, пока Милана ведёт поиски любимого питомца.',
  'https://www.dvhab.ru/kino/kino/images/big_12780904.jpg', 'Мультфильм', 90, '6+', 7.1, 'Dvhab.ru'
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Папа, купи пёсика');

-- 3. Сеансы + категории билетов + места
DO $$
DECLARE
  showing RECORD;
  v_session_id INTEGER;
  v_event_id INTEGER;
  v_venue_id INTEGER;
  v_category_id INTEGER;
  v_row_letters TEXT := 'АБВГДЕЖЗИКЛМНОПРСТУФХЦЧШЩЭЮЯ';
  v_row_index INTEGER;
  v_row_label TEXT;
  v_seats_in_row INTEGER;
  v_remaining INTEGER;
  v_row INTEGER;
BEGIN
  FOR showing IN
    SELECT * FROM (VALUES
      ('Пасть',               'Хабаровск',  'Redcom', date_trunc('day', now()) + interval '23 hours 35 minutes'),
      ('Пасть',               'Кинокосмос', 'Зал 2',  date_trunc('day', now()) + interval '1 day' + interval '20 hours'),
      ('Миньоны и Монстры',   'Хабаровск',  'Зал 1',  date_trunc('day', now()) + interval '18 hours 30 minutes'),
      ('Миньоны и Монстры',   'Кинокосмос', 'Зал 1',  date_trunc('day', now()) + interval '1 day' + interval '16 hours'),
      ('Энола Холмс 3',       'Хабаровск',  'Зал 2',  date_trunc('day', now()) + interval '2 days' + interval '19 hours 45 minutes'),
      ('Папа, купи пёсика',   'Кинокосмос', 'Зал 3',  date_trunc('day', now()) + interval '14 hours')
    ) AS t(title, venue_name, hall, starts_at)
  LOOP
    SELECT id INTO v_event_id FROM events WHERE title = showing.title;
    SELECT id INTO v_venue_id FROM venues WHERE name = showing.venue_name AND city = 'Хабаровск';

    IF v_event_id IS NULL OR v_venue_id IS NULL THEN
      RAISE NOTICE 'Skipping % at % -- event or venue not found', showing.title, showing.venue_name;
      CONTINUE;
    END IF;

    IF EXISTS (
      SELECT 1 FROM sessions
      WHERE event_id = v_event_id AND venue_id = v_venue_id AND hall = showing.hall
        AND date_trunc('minute', starts_at) = date_trunc('minute', showing.starts_at::timestamptz)
    ) THEN
      RAISE NOTICE 'Skipping % at % -- session already exists', showing.title, showing.venue_name;
      CONTINUE;
    END IF;

    INSERT INTO sessions (event_id, venue_id, hall, starts_at)
    VALUES (v_event_id, v_venue_id, showing.hall, showing.starts_at)
    RETURNING id INTO v_session_id;

    v_row_index := 0;

    INSERT INTO ticket_categories (session_id, name, price_cents, seats_total)
    VALUES (v_session_id, 'Стандарт', 45000, 80)
    RETURNING id INTO v_category_id;

    v_remaining := 80;
    WHILE v_remaining > 0 LOOP
      v_row_label := substr(v_row_letters, (v_row_index % length(v_row_letters)) + 1, 1);
      v_seats_in_row := LEAST(12, v_remaining);
      FOR v_row IN 1..v_seats_in_row LOOP
        INSERT INTO seats (session_id, ticket_category_id, row_label, seat_number) VALUES (v_session_id, v_category_id, v_row_label, v_row);
      END LOOP;
      v_remaining := v_remaining - v_seats_in_row;
      v_row_index := v_row_index + 1;
    END LOOP;

    INSERT INTO ticket_categories (session_id, name, price_cents, seats_total)
    VALUES (v_session_id, 'VIP', 85000, 20)
    RETURNING id INTO v_category_id;

    v_remaining := 20;
    WHILE v_remaining > 0 LOOP
      v_row_label := substr(v_row_letters, (v_row_index % length(v_row_letters)) + 1, 1);
      v_seats_in_row := LEAST(12, v_remaining);
      FOR v_row IN 1..v_seats_in_row LOOP
        INSERT INTO seats (session_id, ticket_category_id, row_label, seat_number) VALUES (v_session_id, v_category_id, v_row_label, v_row);
      END LOOP;
      v_remaining := v_remaining - v_seats_in_row;
      v_row_index := v_row_index + 1;
    END LOOP;

    RAISE NOTICE 'Added session for % at % on %', showing.title, showing.venue_name, showing.starts_at;
  END LOOP;
END $$;

-- Adds Khabarovsk cinema screenings for movies that were already in the
-- catalog for other cities, so Хабаровск gets more variety in the "Кино"
-- afisha section. Safe to re-run: skips any (event, venue, hall, starts_at)
-- combination that already exists.
DO $$
DECLARE
  showing RECORD;
  v_session_id INTEGER;
  v_event_id INTEGER;
  v_venue_id INTEGER;
  v_category_id INTEGER;
  v_row_letters TEXT := 'АБВГДЕЖЗИКЛМНОПРСТУФХЦЧШЩЭЮЯ';
  v_row_index INTEGER;
  v_seats_total INTEGER;
  v_row_label TEXT;
  v_seats_in_row INTEGER;
  v_remaining INTEGER;
  v_row INTEGER;
BEGIN
  FOR showing IN
    SELECT * FROM (VALUES
      ('Дюна: Пророчество', 'Совкино', 'Зал 2', date_trunc('day', now()) + interval '2 days' + interval '19 hours 30 minutes'),
      ('Пила X',            'Гигант',  'Малый зал', date_trunc('day', now()) + interval '3 days' + interval '22 hours'),
      ('Легенда о драконе', 'Совкино', 'Зал 1', date_trunc('day', now()) + interval '4 days' + interval '17 hours 45 minutes'),
      ('Холоп 3',           'Гигант',  'Большой зал', date_trunc('day', now()) + interval '5 days' + interval '18 hours 30 minutes')
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

    -- Стандарт: 80 seats
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

    -- VIP: 20 seats, continuing rows
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

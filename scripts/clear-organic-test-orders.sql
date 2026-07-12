-- Удаляет только синтетические "органические" заказы, которые каждый день
-- автоматически создаёт симулятор продаж (artifacts/api-server/src/lib/seatDemandSimulator.ts)
-- для наполнения афиши. Настоящие заказы покупателей не трогает, так как
-- у симулятора фиксированный список из 10 демо-покупателей с адресами
-- на @example.com — реальные покупатели не могут иметь именно эти email.
--
-- Безопасно выполнять повторно. Освобождённые места возвращаются в статус
-- available (если только их не заняли ещё каким-то другим заказом).

BEGIN;

WITH organic_orders AS (
  SELECT id FROM orders
  WHERE customer_email IN (
    'ivan.petrov@example.com',
    'maria.smirnova@example.com',
    'alexey.kuznetsov@example.com',
    'ekaterina.volkova@example.com',
    'dmitry.sokolov@example.com',
    'olga.popova@example.com',
    'sergey.lebedev@example.com',
    'anna.novikova@example.com',
    'nikolay.morozov@example.com',
    'tatyana.kozlova@example.com'
  )
),
deleted_order_seats AS (
  DELETE FROM order_seats
  WHERE order_id IN (SELECT id FROM organic_orders)
  RETURNING seat_id
),
deleted_orders AS (
  DELETE FROM orders
  WHERE id IN (SELECT id FROM organic_orders)
  RETURNING id
),
freed_seats AS (
  UPDATE seats
  SET status = 'available'
  WHERE id IN (SELECT seat_id FROM deleted_order_seats)
    AND status = 'sold'
  RETURNING id
)
SELECT
  (SELECT count(*) FROM deleted_orders) AS orders_deleted,
  (SELECT count(*) FROM freed_seats) AS seats_freed;

COMMIT;

SELECT count(*) AS orders_count, min(created_at) AS earliest, max(created_at) AS latest
FROM orders;

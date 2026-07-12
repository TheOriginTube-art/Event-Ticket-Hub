SELECT v.city, count(*) AS sessions_count
FROM sessions s
JOIN venues v ON v.id = s.venue_id
GROUP BY v.city
ORDER BY v.city;

SELECT e.id AS event_id, e.title, v.city, v.name AS venue, s.id AS session_id, s.starts_at
FROM events e
JOIN sessions s ON s.event_id = e.id
JOIN venues v ON v.id = s.venue_id
WHERE e.title ILIKE '%Живая%'
ORDER BY e.title, v.city;

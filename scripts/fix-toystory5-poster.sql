-- Fix "История игрушек 5" poster: was pointing to a Ukrainian-language poster
-- (kino-teatr.ua). Replaced with the official English-language Disney/Pixar poster.
UPDATE events
SET poster_url = 'https://cdn.moviefone.com/admin-uploads/highlights/images/toy-story-5-official-poster_1771524686.webp'
WHERE title = 'История игрушек 5';

SELECT id, title, poster_url FROM events WHERE title = 'История игрушек 5';

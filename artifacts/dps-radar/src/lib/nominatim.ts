import { useQuery } from '@tanstack/react-query';

const NOMINATIM_BASE_URL = 'https://nominatim.openstreetmap.org';

export interface GeocodeResult {
  lat: string;
  lon: string;
  display_name: string;
}

// City names for prepending to search queries
const CITY_NAMES: Record<string, string> = {
  blagoveshchensk: 'Благовещенск',
  khabarovsk: 'Хабаровск',
};

export function useGeocodeSearch(query: string, citySlug = 'blagoveshchensk') {
  const cityName = CITY_NAMES[citySlug] ?? 'Благовещенск';

  return useQuery({
    queryKey: ['geocode', citySlug, query],
    queryFn: async () => {
      if (!query || query.length < 3) return [];
      
      const params = new URLSearchParams({
        format: 'json',
        q: `${query}, ${cityName}`,
        limit: '5',
      });
      
      const res = await fetch(`${NOMINATIM_BASE_URL}/search?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to fetch from Nominatim');
      return (await res.json()) as GeocodeResult[];
    },
    enabled: query.length >= 3,
  });
}

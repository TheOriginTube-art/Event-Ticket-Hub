import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';

const NOMINATIM_BASE_URL = 'https://nominatim.openstreetmap.org';

export interface GeocodeResult {
  lat: string;
  lon: string;
  display_name: string;
}

export function useGeocodeSearch(query: string) {
  return useQuery({
    queryKey: ['geocode', query],
    queryFn: async () => {
      if (!query || query.length < 3) return [];
      
      const params = new URLSearchParams({
        format: 'json',
        q: `${query}, Благовещенск`,
        limit: '5',
      });
      
      const res = await fetch(`${NOMINATIM_BASE_URL}/search?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to fetch from Nominatim');
      return (await res.json()) as GeocodeResult[];
    },
    enabled: query.length >= 3,
  });
}

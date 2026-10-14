export interface LocationPoint {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  category?: string;
  address?: string;
  notes?: string;
  imageUrl?: string; // Base64 data URL or external URL
  images?: string[]; // Array of image URLs/data URLs
  createdAt: string; // ISO 8601 string
  updatedAt: string;
}

export type SortOption = 'newest' | 'oldest' | 'name-asc' | 'name-desc';

export interface LocationFilter {
  searchQuery: string;
  category: string;
  sortBy: SortOption;
}

export const DEFAULT_CATEGORIES = [
  'Survei',
  'Pelanggan',
  'Kantor',
  'Toko',
  'Restoran',
  'Gudang',
  'Pariwisata',
  'Lainnya',
] as const;

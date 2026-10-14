import { LocationPoint } from '@/types/location';
import { RoutePlan, ActiveRouteDraft } from '@/types/route';

const STORAGE_KEY_LOCATIONS = 'georoute_locations_v1';
const STORAGE_KEY_ROUTES = 'georoute_routes_v1';
const STORAGE_KEY_ACTIVE_ROUTE_DRAFT = 'georoute_active_route_draft_v1';
const STORAGE_KEY_INITIALIZED = 'georoute_initialized_v1';

// Seed sample locations in Bandar Lampung, Indonesia for testing
const INITIAL_SAMPLE_LOCATIONS: LocationPoint[] = [
  {
    id: 'loc_sample_1',
    name: 'Tugu Adipura (Gajah)',
    latitude: -5.426723,
    longitude: 105.258385,
    category: 'Survei',
    address: 'Jl. Raden Intan, Enggal, Bandar Lampung',
    notes: 'Titik nol / landmark pusat kota',
    createdAt: '2026-10-01T08:00:00.000Z',
    updatedAt: '2026-10-01T08:00:00.000Z',
  },
  {
    id: 'loc_sample_2',
    name: 'Kantor Pos Pahoman',
    latitude: -5.435889,
    longitude: 105.263541,
    category: 'Kantor',
    address: 'Jl. K.H. Ahmad Dahlan, Pahoman',
    notes: 'Pemberhentian logistik',
    createdAt: '2026-10-01T08:15:00.000Z',
    updatedAt: '2026-10-01T08:15:00.000Z',
  },
  {
    id: 'loc_sample_3',
    name: 'Pusat Logistik Teluk Betung',
    latitude: -5.448912,
    longitude: 105.271895,
    category: 'Gudang',
    address: 'Jl. Ikan Hiu, Teluk Betung Selatan',
    notes: 'Gudang distribusi selatan',
    createdAt: '2026-10-01T08:30:00.000Z',
    updatedAt: '2026-10-01T08:30:00.000Z',
  },
  {
    id: 'loc_sample_4',
    name: 'Toko Mitra Kedaton',
    latitude: -5.388145,
    longitude: 105.253908,
    category: 'Toko',
    address: 'Jl. Teuku Umar No. 42, Kedaton',
    notes: 'Kunjungan pengecekan stok display',
    createdAt: '2026-10-01T08:45:00.000Z',
    updatedAt: '2026-10-01T08:45:00.000Z',
  },
  {
    id: 'loc_sample_5',
    name: 'Pelanggan Rajabasa Baru',
    latitude: -5.366421,
    longitude: 105.242115,
    category: 'Pelanggan',
    address: 'Jl. ZA. Pagar Alam, Rajabasa',
    notes: 'Pemeriksaan koordinat POI pelanggan prioritas',
    createdAt: '2026-10-01T09:00:00.000Z',
    updatedAt: '2026-10-01T09:00:00.000Z',
  },
];

export function getStoredLocations(): LocationPoint[] {
  if (typeof window === 'undefined') return [];

  try {
    const raw = localStorage.getItem(STORAGE_KEY_LOCATIONS);
    if (!raw) {
      // First time initialization
      const initialized = localStorage.getItem(STORAGE_KEY_INITIALIZED);
      if (!initialized) {
        localStorage.setItem(STORAGE_KEY_LOCATIONS, JSON.stringify(INITIAL_SAMPLE_LOCATIONS));
        localStorage.setItem(STORAGE_KEY_INITIALIZED, 'true');
        return INITIAL_SAMPLE_LOCATIONS;
      }
      return [];
    }

    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.error('Error reading locations from localStorage:', error);
    return [];
  }
}

function triggerServerSync(locations?: LocationPoint[]) {
  if (typeof window === 'undefined') return;
  try {
    const locs = locations || getStoredLocations();
    window.dispatchEvent(new CustomEvent('georoute_local_change', { detail: { count: locs.length } }));
    fetch('/api/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ locations: locs, mode: 'replace' }),
    }).catch((e) => console.warn('Background sync failed:', e));
  } catch {
    // Ignore in offline mode
  }
}

export function saveLocationsToStorage(locations: LocationPoint[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY_LOCATIONS, JSON.stringify(locations));
    triggerServerSync(locations);
  } catch (error) {
    console.error('Failed to save locations to localStorage:', error);
    throw new Error('Penyimpanan lokal penuh atau tidak dapat diakses.');
  }
}

export function saveSingleLocation(
  locationData: Omit<LocationPoint, 'id' | 'createdAt' | 'updatedAt'>,
  existingId?: string
): LocationPoint {
  const locations = getStoredLocations();
  const now = new Date().toISOString();

  if (existingId) {
    // Update existing
    const index = locations.findIndex((l) => l.id === existingId);
    if (index === -1) {
      throw new Error('Lokasi yang ingin diperbarui tidak ditemukan.');
    }
    const updated: LocationPoint = {
      ...locations[index],
      ...locationData,
      updatedAt: now,
    };
    locations[index] = updated;
    saveLocationsToStorage(locations);
    return updated;
  }

  // Create new
  const newLocation: LocationPoint = {
    ...locationData,
    id: `loc_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    createdAt: now,
    updatedAt: now,
  };
  locations.unshift(newLocation);
  saveLocationsToStorage(locations);
  return newLocation;
}

export function deleteSingleLocation(id: string): void {
  const locations = getStoredLocations();
  const filtered = locations.filter((l) => l.id !== id);
  saveLocationsToStorage(filtered);
}

export function deleteMultipleLocations(ids: string[]): void {
  const set = new Set(ids);
  const locations = getStoredLocations();
  const filtered = locations.filter((l) => !set.has(l.id));
  saveLocationsToStorage(filtered);
}

export function findDuplicateLocationCoordinate(
  lat: number,
  lng: number,
  excludeId?: string,
  tolerance = 0.00005 // Approx ~5 meters tolerance
): LocationPoint | null {
  const locations = getStoredLocations();
  for (const loc of locations) {
    if (excludeId && loc.id === excludeId) continue;
    if (
      Math.abs(loc.latitude - lat) <= tolerance &&
      Math.abs(loc.longitude - lng) <= tolerance
    ) {
      return loc;
    }
  }
  return null;
}

// Routes storage
export function getStoredRoutes(): RoutePlan[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY_ROUTES);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.error('Error reading routes from localStorage:', error);
    return [];
  }
}

function triggerServerRouteSync(routes?: RoutePlan[]) {
  if (typeof window === 'undefined') return;
  try {
    const rts = routes || getStoredRoutes();
    fetch('/api/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ routes: rts, mode: 'merge' }),
    }).catch(() => {});
  } catch {
    // Ignore in offline mode
  }
}

export function saveRoutesToStorage(routes: RoutePlan[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY_ROUTES, JSON.stringify(routes));
    triggerServerRouteSync(routes);
  } catch (error) {
    console.error('Failed to save routes to localStorage:', error);
    throw new Error('Penyimpanan lokal penuh atau tidak dapat diakses.');
  }
}

export function saveSingleRoute(
  routeData: Omit<RoutePlan, 'id' | 'createdAt' | 'updatedAt'>,
  existingId?: string
): RoutePlan {
  const routes = getStoredRoutes();
  const now = new Date().toISOString();

  if (existingId) {
    const index = routes.findIndex((r) => r.id === existingId);
    if (index === -1) {
      throw new Error('Rute yang ingin diperbarui tidak ditemukan.');
    }
    const updated: RoutePlan = {
      ...routes[index],
      ...routeData,
      updatedAt: now,
    };
    routes[index] = updated;
    saveRoutesToStorage(routes);
    return updated;
  }

  const newRoute: RoutePlan = {
    ...routeData,
    id: `route_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    createdAt: now,
    updatedAt: now,
  };
  routes.unshift(newRoute);
  saveRoutesToStorage(routes);
  return newRoute;
}

export function deleteSingleRoute(id: string): void {
  const routes = getStoredRoutes();
  const filtered = routes.filter((r) => r.id !== id);
  saveRoutesToStorage(filtered);
}

// Active Route Draft Persistence
export function getActiveRouteDraft(): ActiveRouteDraft | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY_ACTIVE_ROUTE_DRAFT);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && Array.isArray(parsed.pointIds)) {
      return parsed as ActiveRouteDraft;
    }
    return null;
  } catch (error) {
    console.error('Error reading active route draft from localStorage:', error);
    return null;
  }
}

export function saveActiveRouteDraft(draft: ActiveRouteDraft): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY_ACTIVE_ROUTE_DRAFT, JSON.stringify(draft));
  } catch (error) {
    console.error('Failed to save active route draft to localStorage:', error);
  }
}

export function clearActiveRouteDraft(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(STORAGE_KEY_ACTIVE_ROUTE_DRAFT);
  } catch (error) {
    console.error('Failed to clear active route draft from localStorage:', error);
  }
}

import { LocationPoint } from '@/types/location';
import { RoutePlan } from '@/types/route';
import {
  getStoredLocations,
  getStoredRoutes,
  saveLocationsToStorage,
  saveRoutesToStorage,
} from './locationStorage';

export interface SyncResult {
  success: boolean;
  message: string;
  locationsCount: number;
  routesCount: number;
  lastSyncedAt: string;
}

type SyncListener = (result: SyncResult) => void;
const listeners = new Set<SyncListener>();

export function subscribeToSync(listener: SyncListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function notifyListeners(result: SyncResult) {
  listeners.forEach((fn) => {
    try {
      fn(result);
    } catch (e) {
      console.error('Error in sync listener:', e);
    }
  });
}

/**
 * Uploads an image to server and returns the server URL (/api/images/...).
 * Falls back to local dataUrl if offline.
 */
export async function uploadImageToServer(dataUrl: string): Promise<string> {
  if (!dataUrl || !dataUrl.startsWith('data:image/')) {
    return dataUrl;
  }

  try {
    const res = await fetch('/api/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: dataUrl }),
    });

    if (!res.ok) throw new Error('Upload failed with status ' + res.status);
    const data = await res.json();
    if (data.success && data.url) {
      return data.url;
    }
    return dataUrl;
  } catch (err) {
    console.warn('Failed to upload image to server (using local base64 fallback):', err);
    return dataUrl;
  }
}

/**
 * Perform bi-directional sync between device localStorage and server.
 * Ensures points and photos added on laptop appear on phone and vice versa.
 */
export async function syncWithServer(): Promise<SyncResult> {
  try {
    const localLocations = getStoredLocations();
    const localRoutes = getStoredRoutes();

    // 1. Fetch server state
    const res = await fetch('/api/sync', {
      method: 'GET',
      headers: { 'Cache-Control': 'no-cache' },
    });

    if (!res.ok) {
      throw new Error(`Server returned ${res.status}`);
    }

    const serverData = await res.json();
    if (!serverData.success) {
      throw new Error(serverData.error || 'Server sync failed');
    }

    const serverLocations: LocationPoint[] = Array.isArray(serverData.locations) ? serverData.locations : [];
    const serverRoutes: RoutePlan[] = Array.isArray(serverData.routes) ? serverData.routes : [];

    // 2. Merge locations
    // We create a unified map keyed by location ID
    const mergedLocMap = new Map<string, LocationPoint>();

    // Put server locations in first
    serverLocations.forEach((loc) => mergedLocMap.set(loc.id, loc));

    let localHasNewerChanges = false;

    // Check local locations
    localLocations.forEach((loc) => {
      const serverLoc = mergedLocMap.get(loc.id);
      if (!serverLoc) {
        // Location created locally, not yet on server
        mergedLocMap.set(loc.id, loc);
        localHasNewerChanges = true;
      } else {
        const localTime = new Date(loc.updatedAt || 0).getTime();
        const serverTime = new Date(serverLoc.updatedAt || 0).getTime();
        if (localTime > serverTime) {
          // Local has newer updates
          mergedLocMap.set(loc.id, loc);
          localHasNewerChanges = true;
        }
      }
    });

    const mergedLocations = Array.from(mergedLocMap.values());

    // 3. Merge routes
    const mergedRouteMap = new Map<string, RoutePlan>();
    serverRoutes.forEach((r) => mergedRouteMap.set(r.id, r));
    localRoutes.forEach((r) => {
      const serverR = mergedRouteMap.get(r.id);
      if (!serverR) {
        mergedRouteMap.set(r.id, r);
        localHasNewerChanges = true;
      } else {
        const localTime = new Date(r.updatedAt || 0).getTime();
        const serverTime = new Date(serverR.updatedAt || 0).getTime();
        if (localTime > serverTime) {
          mergedRouteMap.set(r.id, r);
          localHasNewerChanges = true;
        }
      }
    });

    const mergedRoutes = Array.from(mergedRouteMap.values());

    // Save to local storage
    saveLocationsToStorage(mergedLocations);
    saveRoutesToStorage(mergedRoutes);

    // 4. If local had newer changes or extra items, push back to server
    if (localHasNewerChanges || mergedLocations.length !== serverLocations.length) {
      try {
        await fetch('/api/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            locations: mergedLocations,
            routes: mergedRoutes,
            mode: 'replace',
          }),
        });
      } catch (pushErr) {
        console.warn('Failed to push merged data back to server:', pushErr);
      }
    }

    const nowIso = new Date().toISOString();
    const result: SyncResult = {
      success: true,
      message: 'Sinkronisasi berhasil! Data & foto terhubung dengan laptop/HP.',
      locationsCount: mergedLocations.length,
      routesCount: mergedRoutes.length,
      lastSyncedAt: nowIso,
    };

    notifyListeners(result);
    return result;
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Koneksi server gagal';
    console.warn('Sync failed:', errorMsg);
    const result: SyncResult = {
      success: false,
      message: `Sinkronisasi gagal: ${errorMsg}. Menggunakan data offline lokal.`,
      locationsCount: getStoredLocations().length,
      routesCount: getStoredRoutes().length,
      lastSyncedAt: new Date().toISOString(),
    };
    return result;
  }
}

/**
 * Pushes updated locations and routes immediately to server in background.
 */
export async function pushImmediateSync(
  locations: LocationPoint[],
  routes?: RoutePlan[]
): Promise<void> {
  try {
    const currentRoutes = routes || getStoredRoutes();
    await fetch('/api/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        locations,
        routes: currentRoutes,
        mode: 'replace',
      }),
    });
  } catch (err) {
    console.warn('Background sync push error:', err);
  }
}

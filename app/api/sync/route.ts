import { NextRequest, NextResponse } from 'next/server';
import {
  getServerLocations,
  saveServerLocations,
  getServerRoutes,
  saveServerRoutes,
  getServerMeta,
  processLocationImages,
} from '@/lib/serverStorage';
import { LocationPoint } from '@/types/location';
import { RoutePlan } from '@/types/route';

export async function GET() {
  try {
    const locations = getServerLocations();
    const routes = getServerRoutes();
    const meta = getServerMeta();

    return NextResponse.json({
      success: true,
      locations,
      routes,
      meta,
    });
  } catch (err) {
    console.error('API GET /api/sync error:', err);
    return NextResponse.json(
      { success: false, error: 'Gagal mengambil data sinkronisasi server' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const clientLocations: LocationPoint[] | undefined = body.locations;
    const clientRoutes: RoutePlan[] | undefined = body.routes;
    const clientMode: 'merge' | 'replace' = body.mode || 'merge';

    const currentLocations = getServerLocations();
    const currentRoutes = getServerRoutes();

    let finalLocations: LocationPoint[];

    if (clientMode === 'replace' && clientLocations) {
      finalLocations = clientLocations;
    } else if (clientLocations && Array.isArray(clientLocations)) {
      // Merge locations based on ID and updatedAt timestamp
      const locMap = new Map<string, LocationPoint>();
      currentLocations.forEach((loc) => locMap.set(loc.id, loc));

      clientLocations.forEach((clientLoc) => {
        const existing = locMap.get(clientLoc.id);
        if (!existing) {
          locMap.set(clientLoc.id, clientLoc);
        } else {
          // If client version is newer, overwrite
          const clientTime = new Date(clientLoc.updatedAt || 0).getTime();
          const serverTime = new Date(existing.updatedAt || 0).getTime();
          if (clientTime >= serverTime) {
            locMap.set(clientLoc.id, clientLoc);
          }
        }
      });

      finalLocations = Array.from(locMap.values());
    } else {
      finalLocations = currentLocations;
    }

    // Convert any base64 images to static image files on server
    const processedLocations = processLocationImages(finalLocations);
    saveServerLocations(processedLocations);

    // Process routes
    let finalRoutes: RoutePlan[];
    if (clientMode === 'replace' && clientRoutes) {
      finalRoutes = clientRoutes;
    } else if (clientRoutes && Array.isArray(clientRoutes)) {
      const routeMap = new Map<string, RoutePlan>();
      currentRoutes.forEach((r) => routeMap.set(r.id, r));
      clientRoutes.forEach((clientRoute) => {
        routeMap.set(clientRoute.id, clientRoute);
      });
      finalRoutes = Array.from(routeMap.values());
    } else {
      finalRoutes = currentRoutes;
    }

    saveServerRoutes(finalRoutes);
    const meta = getServerMeta();

    return NextResponse.json({
      success: true,
      locations: processedLocations,
      routes: finalRoutes,
      meta,
    });
  } catch (err) {
    console.error('API POST /api/sync error:', err);
    return NextResponse.json(
      { success: false, error: 'Gagal menyimpan data sinkronisasi server' },
      { status: 500 }
    );
  }
}

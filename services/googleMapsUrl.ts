import { RouteCoordinate, RouteSegment, TravelMode } from '@/types/route';

/**
 * Creates official Google Maps URL for single destination navigation
 * Pattern: https://www.google.com/maps/dir/?api=1&destination=LAT,LNG
 */
export function buildSingleLocationNavUrl(lat: number, lng: number): string {
  const dest = `${lat},${lng}`;
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(dest)}`;
}

/**
 * Creates official Google Maps URL for viewing/searching a single location with optional query label
 */
export function buildSingleLocationSearchUrl(lat: number, lng: number, label?: string): string {
  const query = label ? `${lat},${lng} (${label})` : `${lat},${lng}`;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

/**
 * Creates official Google Maps directions URL for multi-stop route
 * Pattern: https://www.google.com/maps/dir/?api=1&origin=LAT,LNG&destination=LAT,LNG&waypoints=LAT,LNG%7CLAT,LNG&travelmode=driving
 */
export function buildMultiStopRouteUrl(
  origin: { lat: number; lng: number; isCurrentLocation?: boolean },
  destination: { lat: number; lng: number },
  waypoints: { lat: number; lng: number }[] = [],
  travelMode: TravelMode = 'driving'
): string {
  const params = new URLSearchParams();
  params.set('api', '1');

  // If origin is current location and GPS coords are not yet retrieved (0,0),
  // omit numeric coordinates or use Current+Location so Google Maps defaults to device GPS
  if (origin.isCurrentLocation && origin.lat === 0 && origin.lng === 0) {
    params.set('origin', 'Current+Location');
  } else {
    params.set('origin', `${origin.lat},${origin.lng}`);
  }

  params.set('destination', `${destination.lat},${destination.lng}`);

  if (waypoints.length > 0) {
    // In Google Maps universal URLs, waypoints are pipe-separated ("|")
    // Filter out any invalid (0,0) waypoints
    const validWaypoints = waypoints.filter((w) => w.lat !== 0 || w.lng !== 0);
    if (validWaypoints.length > 0) {
      const waypointsStr = validWaypoints.map((w) => `${w.lat},${w.lng}`).join('|');
      params.set('waypoints', waypointsStr);
    }
  }

  params.set('travelmode', travelMode);

  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

/**
 * Maximum recommended waypoints per Google Maps URL (Google Maps mobile and universal URLs
 * recommend at most 9-10 intermediate waypoints per directions request).
 */
export const MAX_WAYPOINTS_PER_URL = 9;

/**
 * Splits a long route sequence into segmented legs when exceeding Google Maps limit
 */
export function splitRouteIntoSegments(
  points: RouteCoordinate[],
  travelMode: TravelMode = 'driving',
  maxWaypoints: number = MAX_WAYPOINTS_PER_URL
): RouteSegment[] {
  if (points.length < 2) return [];

  // If points fit within single directions request (origin + maxWaypoints + destination)
  const maxPointsPerSegment = maxWaypoints + 2;

  if (points.length <= maxPointsPerSegment) {
    const origin = points[0];
    const destination = points[points.length - 1];
    const waypoints = points.slice(1, -1);
    return [
      {
        segmentIndex: 1,
        totalSegments: 1,
        origin,
        destination,
        waypoints,
        googleMapsUrl: buildMultiStopRouteUrl(origin, destination, waypoints, travelMode),
        label: `Rute Lengkap (${points.length} Titik)`,
      },
    ];
  }

  // Need to break into overlapping chained segments
  const segments: RouteSegment[] = [];
  let startIndex = 0;
  let segmentNum = 1;

  while (startIndex < points.length - 1) {
    // End index is either startIndex + maxWaypoints + 1 or the last point
    const endIndex = Math.min(startIndex + maxWaypoints + 1, points.length - 1);
    const subPoints = points.slice(startIndex, endIndex + 1);

    const origin = subPoints[0];
    const destination = subPoints[subPoints.length - 1];
    const waypoints = subPoints.slice(1, -1);

    segments.push({
      segmentIndex: segmentNum,
      totalSegments: 0, // Will update below
      origin,
      destination,
      waypoints,
      googleMapsUrl: buildMultiStopRouteUrl(origin, destination, waypoints, travelMode),
      label: `Bagian ${segmentNum}: ${origin.label || `Titik #${startIndex + 1}`} → ${destination.label || `Titik #${endIndex + 1}`}`,
    });

    startIndex = endIndex;
    segmentNum++;
  }

  // Update totalSegments count
  return segments.map((seg) => ({
    ...seg,
    totalSegments: segments.length,
  }));
}

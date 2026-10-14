export type TravelMode = 'driving' | 'walking' | 'bicycling' | 'transit';

export interface RoutePlan {
  id: string;
  name: string;
  originId: string;
  waypointIds: string[];
  destinationId: string;
  travelMode: TravelMode;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface RouteCoordinate {
  lat: number;
  lng: number;
  label?: string;
  id?: string;
  imageUrl?: string;
}

export interface RouteSegment {
  segmentIndex: number;
  totalSegments: number;
  origin: RouteCoordinate;
  destination: RouteCoordinate;
  waypoints: RouteCoordinate[];
  googleMapsUrl: string;
  label: string;
}

export type GpsTrackingMode = 'live' | '5s' | '10s' | 'manual';

export interface ActiveRouteDraft {
  pointIds: string[];
  name: string;
  notes: string;
  travelMode: TravelMode;
  selectedSavedRouteId: string | null;
  isLocked: boolean;
  lockedOriginCoords: {
    lat: number;
    lng: number;
    label?: string;
    lockedAt?: string;
  } | null;
  gpsTrackingMode: GpsTrackingMode;
  updatedAt: string;
}

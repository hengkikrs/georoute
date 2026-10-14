'use client';

import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import L from 'leaflet';
import {
  Navigation,
  ExternalLink,
  MapPin,
  Layers,
  Route as RouteIcon,
  Car,
  Bike,
  Footprints,
  Compass,
  Crosshair,
  Sparkles,
  ChevronRight,
  Info,
} from 'lucide-react';
import { LocationPoint } from '@/types/location';
import { formatCoordinatePair, calculatePathDistanceKm } from '@/utils/coordinateValidation';
import { buildMultiStopRouteUrl, buildSingleLocationNavUrl } from '@/services/googleMapsUrl';
import { TravelMode } from '@/types/route';

export interface CameraRouteMapProps {
  currentLocation: LocationPoint;
  nextLocation?: LocationPoint | null;
  routeLocations?: LocationPoint[];
  opacity?: number; // 0.1 to 1.0 (transparency setting)
  interactive?: boolean;
  onSelectLocation?: (location: LocationPoint) => void;
}

export type RouteScopeMode = 'next_leg' | 'full_route' | 'from_gps';

export const CameraRouteMap: React.FC<CameraRouteMapProps> = ({
  currentLocation,
  nextLocation,
  routeLocations = [],
  opacity = 0.7,
  interactive = true,
  onSelectLocation,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerGroupRef = useRef<L.LayerGroup | null>(null);

  // Map view & route navigation state
  const [mapType, setMapType] = useState<'gmaps_embed' | 'streets' | 'hybrid'>('gmaps_embed');
  const [routeScope, setRouteScope] = useState<RouteScopeMode>('next_leg');
  const [travelMode, setTravelMode] = useState<TravelMode>('driving');

  // Road geometry from OSRM for Leaflet route
  const [roadPolylinePoints, setRoadPolylinePoints] = useState<[number, number][]>([]);
  const [roadDistanceKm, setRoadDistanceKm] = useState<string | null>(null);
  const [roadDurationMin, setRoadDurationMin] = useState<number | null>(null);
  const [isLoadingRoad, setIsLoadingRoad] = useState<boolean>(false);

  // User live GPS location (optional for 'from_gps')
  const [gpsCoords, setGpsCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [isGettingGps, setIsGettingGps] = useState<boolean>(false);

  // Normalized all stops
  const allStops = useMemo(() => {
    if (routeLocations && routeLocations.length > 0) return routeLocations;
    if (nextLocation) return [currentLocation, nextLocation];
    return [currentLocation];
  }, [routeLocations, currentLocation, nextLocation]);

  // Determine active origin and destination based on scope
  const { navOrigin, navDestination, navWaypoints, activeRouteLabel } = useMemo(() => {
    if (routeScope === 'from_gps' && gpsCoords) {
      const target = nextLocation || currentLocation;
      return {
        navOrigin: { latitude: gpsCoords.lat, longitude: gpsCoords.lng, name: 'Lokasi GPS Saya' },
        navDestination: target,
        navWaypoints: [] as LocationPoint[],
        activeRouteLabel: `GPS Saya ➔ ${target.name}`,
      };
    }

    if (routeScope === 'full_route' && allStops.length >= 2) {
      const origin = allStops[0];
      const destination = allStops[allStops.length - 1];
      const waypoints = allStops.slice(1, -1);
      return {
        navOrigin: origin,
        navDestination: destination,
        navWaypoints: waypoints,
        activeRouteLabel: `Seluruh Rute (${allStops.length} Titik: ${origin.name} ➔ ${destination.name})`,
      };
    }

    // Default: 'next_leg' (currentLocation -> nextLocation)
    if (nextLocation) {
      return {
        navOrigin: currentLocation,
        navDestination: nextLocation,
        navWaypoints: [] as LocationPoint[],
        activeRouteLabel: `${currentLocation.name} ➔ ${nextLocation.name}`,
      };
    }

    return {
      navOrigin: currentLocation,
      navDestination: currentLocation,
      navWaypoints: [] as LocationPoint[],
      activeRouteLabel: currentLocation.name,
    };
  }, [routeScope, gpsCoords, allStops, currentLocation, nextLocation]);

  // Straight line distance fallback
  const straightDistanceKm = useMemo(() => {
    if (navOrigin && navDestination && (navOrigin.latitude !== navDestination.latitude || navOrigin.longitude !== navDestination.longitude)) {
      const dist = calculatePathDistanceKm([
        { latitude: navOrigin.latitude, longitude: navOrigin.longitude },
        { latitude: navDestination.latitude, longitude: navDestination.longitude },
      ]);
      return dist > 0 ? dist.toFixed(2) : '0';
    }
    return null;
  }, [navOrigin, navDestination]);

  // Estimated travel duration (heuristic if OSRM duration not available)
  const estimatedMin = useMemo(() => {
    if (roadDurationMin !== null) return roadDurationMin;
    const distNum = parseFloat(roadDistanceKm || straightDistanceKm || '0');
    if (!distNum) return null;
    // Avg speeds: driving ~ 30 km/h in city (2 min/km), walking ~ 4.5 km/h (13 min/km), bike ~ 15 km/h (4 min/km)
    const factor = travelMode === 'walking' ? 13.3 : travelMode === 'bicycling' ? 4 : 2.5;
    return Math.max(1, Math.round(distNum * factor));
  }, [roadDurationMin, roadDistanceKm, straightDistanceKm, travelMode]);

  // Request live GPS if user clicks 'from_gps'
  const handleRequestLiveGps = useCallback(() => {
    if (!navigator.geolocation) return;
    setIsGettingGps(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGpsCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setIsGettingGps(false);
        setRouteScope('from_gps');
      },
      () => {
        setIsGettingGps(false);
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  }, []);

  // Fetch real road routing geometry from OSRM for Leaflet view
  useEffect(() => {
    let isMounted = true;
    const fetchRoadGeometry = async () => {
      try {
        setIsLoadingRoad(true);
        let coordsParam = '';

        if (routeScope === 'from_gps' && gpsCoords) {
          const target = nextLocation || currentLocation;
          coordsParam = `${gpsCoords.lng},${gpsCoords.lat};${target.longitude},${target.latitude}`;
        } else if (routeScope === 'full_route' && allStops.length >= 2) {
          // Max 10 points for reliable URL length
          const slicePoints = allStops.slice(0, 10);
          coordsParam = slicePoints.map((p) => `${p.longitude},${p.latitude}`).join(';');
        } else if (nextLocation) {
          coordsParam = `${currentLocation.longitude},${currentLocation.latitude};${nextLocation.longitude},${nextLocation.latitude}`;
        } else {
          setRoadPolylinePoints([]);
          setRoadDistanceKm(null);
          setRoadDurationMin(null);
          setIsLoadingRoad(false);
          return;
        }

        const res = await fetch(
          `https://router.project-osrm.org/route/v1/driving/${coordsParam}?overview=full&geometries=geojson`,
          { signal: AbortSignal.timeout(4000) }
        );

        if (!res.ok) throw new Error('OSRM fetch error');
        const data = await res.json();

        if (data.routes && data.routes[0] && isMounted) {
          const route = data.routes[0];
          const points = route.geometry.coordinates.map(
            ([lng, lat]: [number, number]) => [lat, lng] as [number, number]
          );
          setRoadPolylinePoints(points);
          setRoadDistanceKm((route.distance / 1000).toFixed(2));
          setRoadDurationMin(Math.round(route.duration / 60));
        }
      } catch {
        if (isMounted) {
          setRoadPolylinePoints([]);
        }
      } finally {
        if (isMounted) setIsLoadingRoad(false);
      }
    };

    fetchRoadGeometry();
    return () => {
      isMounted = false;
    };
  }, [routeScope, gpsCoords, allStops, currentLocation, nextLocation, travelMode]);

  // =========================================================================
  // Google Maps Directions Embed URL (Displays Route Path in iframe)
  // =========================================================================
  const gmapsDirectionsEmbedUrl = useMemo(() => {
    const dirFlag = travelMode === 'walking' ? 'w' : travelMode === 'bicycling' ? 'b' : 'd';

    if (routeScope === 'from_gps') {
      const target = nextLocation || currentLocation;
      if (gpsCoords) {
        return `https://maps.google.com/maps?saddr=${gpsCoords.lat},${gpsCoords.lng}&daddr=${target.latitude},${target.longitude}&dirflg=${dirFlag}&output=embed`;
      }
      return `https://maps.google.com/maps?saddr=Current+Location&daddr=${target.latitude},${target.longitude}&dirflg=${dirFlag}&output=embed`;
    }

    if (routeScope === 'full_route' && allStops.length >= 2) {
      const origin = allStops[0];
      const dest = allStops[allStops.length - 1];
      const intermediate = allStops.slice(1, -1);

      let waypointsStr = '';
      if (intermediate.length > 0) {
        // Legacy google maps directions syntax: +to:lat,lng+to:lat,lng
        waypointsStr = intermediate
          .map((w) => `+to:${w.latitude},${w.longitude}`)
          .join('');
      }

      return `https://maps.google.com/maps?saddr=${origin.latitude},${origin.longitude}&daddr=${dest.latitude},${dest.longitude}${waypointsStr}&dirflg=${dirFlag}&output=embed`;
    }

    // Next stop mode: origin currentLocation -> destination nextLocation
    if (nextLocation) {
      return `https://maps.google.com/maps?saddr=${currentLocation.latitude},${currentLocation.longitude}&daddr=${nextLocation.latitude},${nextLocation.longitude}&dirflg=${dirFlag}&output=embed`;
    }

    // Single point fallback: show location pin with embed
    return `https://maps.google.com/maps?q=${currentLocation.latitude},${currentLocation.longitude}&z=16&output=embed`;
  }, [routeScope, gpsCoords, allStops, currentLocation, nextLocation, travelMode]);

  // =========================================================================
  // Google Maps Direct Navigation Link (Turn-by-Turn in App)
  // =========================================================================
  const gmapsDirectAppUrl = useMemo(() => {
    if (routeScope === 'from_gps') {
      const target = nextLocation || currentLocation;
      if (gpsCoords) {
        return buildMultiStopRouteUrl(
          { lat: gpsCoords.lat, lng: gpsCoords.lng },
          { lat: target.latitude, lng: target.longitude },
          [],
          travelMode
        );
      }
      return buildMultiStopRouteUrl(
        { lat: 0, lng: 0, isCurrentLocation: true },
        { lat: target.latitude, lng: target.longitude },
        [],
        travelMode
      );
    }

    if (routeScope === 'full_route' && allStops.length >= 2) {
      const origin = allStops[0];
      const dest = allStops[allStops.length - 1];
      const waypoints = allStops.slice(1, -1).map((w) => ({ lat: w.latitude, lng: w.longitude }));
      return buildMultiStopRouteUrl(
        { lat: origin.latitude, lng: origin.longitude },
        { lat: dest.latitude, lng: dest.longitude },
        waypoints,
        travelMode
      );
    }

    if (nextLocation) {
      return buildMultiStopRouteUrl(
        { lat: currentLocation.latitude, lng: currentLocation.longitude },
        { lat: nextLocation.latitude, lng: nextLocation.longitude },
        [],
        travelMode
      );
    }

    return buildSingleLocationNavUrl(currentLocation.latitude, currentLocation.longitude);
  }, [routeScope, gpsCoords, allStops, currentLocation, nextLocation, travelMode]);

  // =========================================================================
  // Leaflet Map Initialization and Layer Rendering (streets & hybrid)
  // =========================================================================
  useEffect(() => {
    if (mapType === 'gmaps_embed') return;
    if (!containerRef.current) return;

    const el = containerRef.current as HTMLElement & { _leaflet_id?: number };
    if (el._leaflet_id && !mapRef.current) {
      delete el._leaflet_id;
    }

    if (!mapRef.current) {
      const map = L.map(containerRef.current, {
        center: [currentLocation.latitude, currentLocation.longitude],
        zoom: 15,
        zoomControl: false,
        attributionControl: false,
        dragging: interactive,
        touchZoom: interactive,
        scrollWheelZoom: interactive,
        doubleClickZoom: interactive,
      });

      const tileUrl =
        mapType === 'hybrid'
          ? 'https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}'
          : 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';

      L.tileLayer(tileUrl, {
        maxZoom: 19,
        opacity: 1,
      }).addTo(map);

      const layerGroup = L.layerGroup().addTo(map);
      layerGroupRef.current = layerGroup;
      mapRef.current = map;
    }

    const map = mapRef.current;
    const layerGroup = layerGroupRef.current;
    if (!map || !layerGroup) return;

    layerGroup.clearLayers();

    const pointsToFit: [number, number][] = [];

    // Render Markers based on routeScope
    if (routeScope === 'full_route' && allStops.length >= 2) {
      allStops.forEach((stop, index) => {
        const isCurrent = stop.id === currentLocation.id;
        const isNext = nextLocation && stop.id === nextLocation.id;
        const pos: [number, number] = [stop.latitude, stop.longitude];
        pointsToFit.push(pos);

        const badgeColor = isCurrent
          ? 'background: #059669; border-color: #34d399;'
          : isNext
          ? 'background: #2563eb; border-color: #60a5fa;'
          : 'background: #1e293b; border-color: #94a3b8;';

        const markerHtml = `
          <div style="position: relative; display: flex; align-items: center; justify-content: center;">
            ${
              isCurrent
                ? '<div style="position: absolute; width: 34px; height: 34px; background: rgba(16, 185, 129, 0.4); border-radius: 50%; animation: ping 2s cubic-bezier(0, 0, 0.2, 1) infinite;"></div>'
                : ''
            }
            <div style="width: 28px; height: 28px; ${badgeColor} border: 2.5px solid white; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: white; font-weight: 800; font-size: 11px; box-shadow: 0 4px 6px rgba(0,0,0,0.4);">
              ${index + 1}
            </div>
          </div>
        `;

        const icon = L.divIcon({
          html: markerHtml,
          className: `custom-marker-stop-${index}`,
          iconSize: [34, 34],
          iconAnchor: [17, 17],
        });

        const marker = L.marker(pos, { icon }).addTo(layerGroup);
        marker.bindPopup(
          `<div style="font-family: inherit; font-size: 12px; line-height: 1.4;">
            <b style="color: ${isCurrent ? '#059669' : '#2563eb'};">Stop #${index + 1}: ${stop.name}</b><br/>
            <span style="font-size: 10px; color: #64748b;">${stop.latitude.toFixed(5)}, ${stop.longitude.toFixed(5)}</span>
            ${stop.category ? `<br/><span style="display:inline-block; margin-top:2px; padding: 1px 5px; background: #f1f5f9; border-radius: 4px; font-size: 9px;">${stop.category}</span>` : ''}
          </div>`
        );
      });
    } else {
      // Next leg mode
      const p1: [number, number] = [currentLocation.latitude, currentLocation.longitude];
      pointsToFit.push(p1);

      const marker1Html = `
        <div style="position: relative; display: flex; align-items: center; justify-content: center;">
          <div style="position: absolute; width: 34px; height: 34px; background: rgba(16, 185, 129, 0.35); border-radius: 50%; animation: ping 2s cubic-bezier(0, 0, 0.2, 1) infinite;"></div>
          <div style="width: 28px; height: 28px; background: #059669; border: 2.5px solid white; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: white; font-weight: bold; font-size: 11px; box-shadow: 0 4px 6px rgba(0,0,0,0.3);">
            1
          </div>
        </div>
      `;
      const icon1 = L.divIcon({
        html: marker1Html,
        className: 'custom-camera-marker-1',
        iconSize: [34, 34],
        iconAnchor: [17, 17],
      });
      L.marker(p1, { icon: icon1 })
        .bindPopup(`<b>Titik Saat Ini:</b><br/>${currentLocation.name}`)
        .addTo(layerGroup);

      if (nextLocation) {
        const p2: [number, number] = [nextLocation.latitude, nextLocation.longitude];
        pointsToFit.push(p2);

        const marker2Html = `
          <div style="position: relative; display: flex; align-items: center; justify-content: center;">
            <div style="position: absolute; width: 34px; height: 34px; background: rgba(59, 130, 246, 0.3); border-radius: 50%;"></div>
            <div style="width: 28px; height: 28px; background: #2563eb; border: 2.5px solid white; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: white; font-weight: bold; font-size: 11px; box-shadow: 0 4px 6px rgba(0,0,0,0.3);">
              2
            </div>
          </div>
        `;
        const icon2 = L.divIcon({
          html: marker2Html,
          className: 'custom-camera-marker-2',
          iconSize: [34, 34],
          iconAnchor: [17, 17],
        });
        L.marker(p2, { icon: icon2 })
          .bindPopup(`<b>Titik Selanjutnya:</b><br/>${nextLocation.name}`)
          .addTo(layerGroup);
      }
    }

    // Render GPS marker if available in 'from_gps' mode
    if (routeScope === 'from_gps' && gpsCoords) {
      const gpsPos: [number, number] = [gpsCoords.lat, gpsCoords.lng];
      pointsToFit.push(gpsPos);

      const gpsHtml = `
        <div style="position: relative; display: flex; align-items: center; justify-content: center;">
          <div style="position: absolute; width: 36px; height: 36px; background: rgba(239, 68, 68, 0.35); border-radius: 50%; animation: ping 1.5s cubic-bezier(0, 0, 0.2, 1) infinite;"></div>
          <div style="width: 28px; height: 28px; background: #dc2626; border: 2.5px solid white; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: white; font-weight: bold; font-size: 11px; box-shadow: 0 4px 6px rgba(0,0,0,0.3);">
            GPS
          </div>
        </div>
      `;
      const gpsIcon = L.divIcon({
        html: gpsHtml,
        className: 'custom-gps-marker',
        iconSize: [36, 36],
        iconAnchor: [18, 18],
      });
      L.marker(gpsPos, { icon: gpsIcon }).bindPopup('<b>Posisi GPS Saya</b>').addTo(layerGroup);
    }

    // Draw Route Polyline
    if (roadPolylinePoints.length >= 2) {
      // Glow background line
      L.polyline(roadPolylinePoints, {
        color: '#38bdf8',
        weight: 7,
        opacity: 0.45,
      }).addTo(layerGroup);

      // Main route polyline
      L.polyline(roadPolylinePoints, {
        color: '#0284c7',
        weight: 4.5,
        opacity: 0.95,
      }).addTo(layerGroup);
    } else if (pointsToFit.length >= 2) {
      // Fallback dashed line connecting points directly
      L.polyline(pointsToFit, {
        color: '#0284c7',
        weight: 4,
        opacity: 0.85,
        dashArray: '8, 6',
      }).addTo(layerGroup);
    }

    // Auto fit bounds
    if (pointsToFit.length >= 2) {
      const bounds = L.latLngBounds(pointsToFit);
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 16 });
    } else if (pointsToFit.length === 1) {
      map.setView(pointsToFit[0], 16);
    }

    setTimeout(() => {
      map.invalidateSize();
    }, 200);
  }, [
    mapType,
    routeScope,
    currentLocation,
    nextLocation,
    allStops,
    roadPolylinePoints,
    gpsCoords,
    interactive,
  ]);

  // Clean up Leaflet on unmount
  useEffect(() => {
    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  const displayDistance = roadDistanceKm || straightDistanceKm;

  return (
    <div className="relative w-full h-full min-h-[300px] rounded-2xl overflow-hidden border border-slate-700/60 shadow-lg bg-slate-900/90 flex flex-col">
      {/* ===================== MAP VIEWPORT ===================== */}
      <div
        className="relative flex-1 w-full h-full transition-opacity duration-200"
        style={{ opacity: Math.max(0.15, Math.min(1, opacity)) }}
      >
        {mapType === 'gmaps_embed' ? (
          <div className="relative w-full h-full bg-slate-950">
            <iframe
              title="Navigasi Rute Google Maps"
              src={gmapsDirectionsEmbedUrl}
              className="w-full h-full border-0"
              loading="lazy"
              allow="geolocation"
            />

            {/* In-Frame Google Maps Route Badge */}
            <div className="absolute top-2.5 left-2.5 z-10 pointer-events-none">
              <div className="px-2.5 py-1 rounded-lg bg-black/85 backdrop-blur-md text-white text-[11px] font-semibold border border-white/20 shadow-md flex items-center gap-1.5 pointer-events-auto">
                <span className="w-2 h-2 rounded-full bg-teal-400 animate-pulse" />
                <span className="text-teal-300 font-bold">Rute Google Maps Aktif</span>
                {displayDistance && (
                  <span className="px-1.5 py-0.2 rounded bg-teal-500/30 text-teal-200 font-mono text-[10px] border border-teal-400/40">
                    {displayDistance} km
                  </span>
                )}
                {estimatedMin && (
                  <span className="text-[10px] text-slate-300">
                    (~{estimatedMin} mnt)
                  </span>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div ref={containerRef} className="w-full h-full" />
        )}
      </div>

      {/* ===================== FLOATING TOP CONTROLS & SWITCHERS ===================== */}
      <div className="absolute top-2.5 left-2.5 right-2.5 flex flex-wrap items-center justify-between pointer-events-none gap-2 z-20">
        {/* Left: Route Scope Badges */}
        <div className="pointer-events-auto flex items-center gap-1 p-0.5 rounded-xl bg-black/80 backdrop-blur-md border border-white/20 shadow-md">
          <button
            type="button"
            onClick={() => setRouteScope('next_leg')}
            className={`px-2 py-1 rounded-lg text-[10px] font-bold transition flex items-center gap-1 ${
              routeScope === 'next_leg'
                ? 'bg-teal-600 text-white shadow-xs'
                : 'text-slate-300 hover:text-white'
            }`}
            title="Navigasi ke titik stop berikutnya"
          >
            <ChevronRight className="w-3 h-3 text-teal-300" />
            <span>Stop Berikutnya</span>
          </button>

          {allStops.length > 2 && (
            <button
              type="button"
              onClick={() => setRouteScope('full_route')}
              className={`px-2 py-1 rounded-lg text-[10px] font-bold transition flex items-center gap-1 ${
                routeScope === 'full_route'
                  ? 'bg-sky-600 text-white shadow-xs'
                  : 'text-slate-300 hover:text-white'
              }`}
              title="Tampilkan seluruh rute dengan semua perhentian"
            >
              <RouteIcon className="w-3 h-3 text-sky-300" />
              <span>Semua Rute ({allStops.length})</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleRequestLiveGps}
            className={`px-2 py-1 rounded-lg text-[10px] font-bold transition flex items-center gap-1 ${
              routeScope === 'from_gps'
                ? 'bg-amber-600 text-white shadow-xs'
                : 'text-slate-300 hover:text-white'
            }`}
            title="Navigasi langsung dari lokasi GPS perangkat saat ini"
          >
            <Crosshair className={`w-3 h-3 ${isGettingGps ? 'animate-spin' : ''}`} />
            <span>Dari GPS</span>
          </button>
        </div>

        {/* Right: Map Type & Mode Switcher */}
        <div className="pointer-events-auto flex items-center gap-1 p-0.5 rounded-xl bg-black/80 backdrop-blur-md border border-white/20 shadow-md ml-auto">
          <button
            type="button"
            onClick={() => setMapType('gmaps_embed')}
            className={`px-2.5 py-1 rounded-lg text-[10px] font-extrabold transition flex items-center gap-1 ${
              mapType === 'gmaps_embed'
                ? 'bg-gradient-to-r from-teal-500 to-emerald-600 text-white shadow-xs'
                : 'text-slate-300 hover:text-white'
            }`}
            title="Tampilkan Navigasi Rute Resmi Google Maps (Interaktif)"
          >
            <Navigation className="w-3 h-3 text-teal-200" />
            <span>Rute G-Maps</span>
          </button>

          <button
            type="button"
            onClick={() => setMapType('streets')}
            className={`px-2 py-1 rounded-lg text-[10px] font-medium transition ${
              mapType === 'streets'
                ? 'bg-teal-600 text-white font-bold'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            Peta
          </button>

          <button
            type="button"
            onClick={() => setMapType('hybrid')}
            className={`px-2 py-1 rounded-lg text-[10px] font-medium transition ${
              mapType === 'hybrid'
                ? 'bg-teal-600 text-white font-bold'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            Satelit
          </button>
        </div>
      </div>

      {/* ===================== BOTTOM NAVIGATION HUD & DIRECT ACTION ===================== */}
      <div className="absolute bottom-2.5 left-2.5 right-2.5 z-20 pointer-events-auto">
        <div className="p-2.5 rounded-xl bg-black/85 backdrop-blur-md border border-white/20 shadow-2xl flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
          {/* Route Status Summary */}
          <div className="min-w-0 flex-1 text-white">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse flex-shrink-0" />
              <p className="text-xs font-bold truncate">
                {activeRouteLabel}
              </p>
            </div>

            <div className="flex items-center gap-2 text-[10px] text-slate-300 mt-0.5 flex-wrap">
              {displayDistance && (
                <span className="font-mono text-teal-300 font-bold">
                  📏 {displayDistance} km
                </span>
              )}
              {estimatedMin && (
                <span className="text-sky-300">
                  ⏱️ ~{estimatedMin} menit ({travelMode === 'driving' ? 'berkendara' : travelMode === 'walking' ? 'jalan' : 'sepeda'})
                </span>
              )}
              {isLoadingRoad && (
                <span className="text-teal-400 animate-pulse text-[9px]">
                  (Menghitung rute jalan...)
                </span>
              )}
            </div>
          </div>

          {/* Travel Mode Toggle + Big Launch Google Maps Button */}
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {/* Travel Mode Selector */}
            <div className="flex items-center gap-0.5 p-0.5 rounded-lg bg-slate-900 border border-slate-700">
              <button
                type="button"
                onClick={() => setTravelMode('driving')}
                className={`p-1.5 rounded-md text-[10px] transition ${
                  travelMode === 'driving'
                    ? 'bg-teal-600 text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
                title="Mobil / Motor"
              >
                <Car className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setTravelMode('walking')}
                className={`p-1.5 rounded-md text-[10px] transition ${
                  travelMode === 'walking'
                    ? 'bg-teal-600 text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
                title="Jalan Kaki"
              >
                <Footprints className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setTravelMode('bicycling')}
                className={`p-1.5 rounded-md text-[10px] transition ${
                  travelMode === 'bicycling'
                    ? 'bg-teal-600 text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
                title="Sepeda"
              >
                <Bike className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Launch Native Google Maps Turn-by-Turn Navigation */}
            <a
              href={gmapsDirectAppUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-gradient-to-r from-teal-500 to-emerald-600 hover:from-teal-600 hover:to-emerald-700 active:scale-95 text-white text-xs font-extrabold shadow-lg transition flex-shrink-0"
              title="Buka Navigasi Suara Belokan-demi-Belokan di Aplikasi Google Maps"
            >
              <Navigation className="w-3.5 h-3.5 animate-pulse" />
              <span>Buka di Google Maps</span>
              <ExternalLink className="w-3 h-3 opacity-90" />
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};

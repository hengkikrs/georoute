'use client';

import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import {
  Route as RouteIcon,
  Navigation,
  ArrowUp,
  ArrowDown,
  Trash2,
  Sparkles,
  Save,
  Car,
  Footprints,
  Bike,
  Bus,
  ExternalLink,
  Split,
  MapPin,
  FolderOpen,
  PlusCircle,
  CheckCheck,
  Crosshair,
  RefreshCw,
  Camera,
  Lock,
  Unlock,
  Radio,
  Timer,
  RotateCcw,
  Download,
} from 'lucide-react';
import { LocationPoint } from '@/types/location';
import { RoutePlan, TravelMode, RouteCoordinate, GpsTrackingMode } from '@/types/route';

export const CURRENT_LOCATION_ID = '__CURRENT_LOCATION__';
import {
  formatCoordinatePair,
  calculatePathDistanceKm,
} from '@/utils/coordinateValidation';
import {
  buildMultiStopRouteUrl,
  splitRouteIntoSegments,
  MAX_WAYPOINTS_PER_URL,
} from '@/services/googleMapsUrl';
import { optimizeWaypointsOrder } from '@/services/routeOptimizer';
import {
  saveSingleRoute,
  getStoredRoutes,
  deleteSingleRoute,
  getActiveRouteDraft,
  saveActiveRouteDraft,
  clearActiveRouteDraft,
} from '@/services/locationStorage';
import { exportEditedPhotosCsv, downloadFile } from '@/services/csvService';
import { ImageViewerModal } from '@/components/ImageViewerModal';
import { RouteCameraModal } from '@/components/RouteCameraModal';

interface RouteBuilderProps {
  locations: LocationPoint[];
  preselectedLocationIds?: string[];
  onViewRouteOnMap: (points: RouteCoordinate[]) => void;
  onShowToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
  onLocationUpdated?: () => void;
}

export const RouteBuilder: React.FC<RouteBuilderProps> = ({
  locations,
  preselectedLocationIds = [],
  onViewRouteOnMap,
  onShowToast,
  onLocationUpdated,
}) => {
  // Saved routes
  const [savedRoutes, setSavedRoutes] = useState<RoutePlan[]>([]);
  const [selectedSavedRouteId, setSelectedSavedRouteId] = useState<string | null>(null);

  // Active builder state: ordered list of location IDs
  const [routePointIds, setRoutePointIds] = useState<string[]>(() => {
    if (preselectedLocationIds && preselectedLocationIds.length >= 2) {
      return preselectedLocationIds;
    }
    const draft = getActiveRouteDraft();
    if (draft && draft.pointIds && draft.pointIds.length > 0) {
      return draft.pointIds;
    }
    return [];
  });

  const [routeName, setRouteName] = useState(() => {
    if (preselectedLocationIds && preselectedLocationIds.length >= 2) {
      return `Rute ${new Date().toLocaleDateString('id-ID')}`;
    }
    const draft = getActiveRouteDraft();
    return draft?.name || '';
  });

  const [routeNotes, setRouteNotes] = useState(() => {
    const draft = getActiveRouteDraft();
    return draft?.notes || '';
  });

  const [travelMode, setTravelMode] = useState<TravelMode>(() => {
    const draft = getActiveRouteDraft();
    return draft?.travelMode || 'driving';
  });

  // Route lock state
  const [isRouteLocked, setIsRouteLocked] = useState<boolean>(() => {
    const draft = getActiveRouteDraft();
    return Boolean(draft?.isLocked);
  });

  const [lockedOriginCoords, setLockedOriginCoords] = useState<{
    lat: number;
    lng: number;
    label?: string;
    lockedAt?: string;
  } | null>(() => {
    const draft = getActiveRouteDraft();
    return draft?.lockedOriginCoords || null;
  });

  // GPS tracking mode & real-time telemetry
  const [gpsTrackingMode, setGpsTrackingMode] = useState<GpsTrackingMode>(() => {
    const draft = getActiveRouteDraft();
    return draft?.gpsTrackingMode || 'manual';
  });

  const [lastGpsUpdate, setLastGpsUpdate] = useState<{
    lat: number;
    lng: number;
    accuracy?: number;
    timestamp: number;
    timeString: string;
  } | null>(null);
  const [gpsCountdown, setGpsCountdown] = useState<number>(0);

  // Live GPS coordinates for Current Location origin
  const [currentLocationCoords, setCurrentLocationCoords] = useState<{
    lat: number;
    lng: number;
    accuracy?: number;
  } | null>(null);
  const [isLocating, setIsLocating] = useState(false);

  // State to track which route segment is currently expanded to view details
  const [expandedSegmentIndex, setExpandedSegmentIndex] = useState<number | null>(1);
  const [viewerImage, setViewerImage] = useState<{ url: string; title: string; subtitle?: string } | null>(null);

  // Route Camera Modal state
  const [cameraModalOpen, setCameraModalOpen] = useState(false);
  const [cameraModalInitialLocation, setCameraModalInitialLocation] = useState<LocationPoint | null>(null);

  // Watch & interval timers for GPS tracking
  const watchIdRef = useRef<number | null>(null);
  const intervalTimerRef = useRef<NodeJS.Timeout | null>(null);
  const countdownTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Initial load: Load saved routes list from storage
  useEffect(() => {
    const timer = setTimeout(() => {
      setSavedRoutes(getStoredRoutes());
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  // Track previous preselectedLocationIds to update when new external selection arrives
  const prevPreselectedKeyRef = useRef<string>(
    preselectedLocationIds ? preselectedLocationIds.join(',') : ''
  );
  useEffect(() => {
    const key = preselectedLocationIds ? preselectedLocationIds.join(',') : '';
    if (preselectedLocationIds && preselectedLocationIds.length > 0 && key !== prevPreselectedKeyRef.current) {
      prevPreselectedKeyRef.current = key;
      setRoutePointIds(preselectedLocationIds);
      setRouteName(`Rute ${new Date().toLocaleDateString('id-ID')}`);
      setSelectedSavedRouteId(null);
      setIsRouteLocked(false);
      setLockedOriginCoords(null);
    }
  }, [preselectedLocationIds]);

  // Persist active route draft to localStorage on any state modification
  useEffect(() => {
    if (routePointIds.length > 0) {
      saveActiveRouteDraft({
        pointIds: routePointIds,
        name: routeName,
        notes: routeNotes,
        travelMode,
        selectedSavedRouteId,
        isLocked: isRouteLocked,
        lockedOriginCoords,
        gpsTrackingMode,
        updatedAt: new Date().toISOString(),
      });
    } else {
      clearActiveRouteDraft();
    }
  }, [
    routePointIds,
    routeName,
    routeNotes,
    travelMode,
    selectedSavedRouteId,
    isRouteLocked,
    lockedOriginCoords,
    gpsTrackingMode,
  ]);

  // Lookup map for fast location resolution
  const locationMap = useMemo(() => {
    const map = new Map<string, LocationPoint>();
    locations.forEach((loc) => map.set(loc.id, loc));
    return map;
  }, [locations]);

  // Ordered list of actual LocationPoint objects in current route
  const routeLocationPoints = useMemo(() => {
    return routePointIds
      .map((id) => locationMap.get(id))
      .filter((loc): loc is LocationPoint => Boolean(loc));
  }, [routePointIds, locationMap]);

  // Available locations not yet in route
  const unaddedLocations = useMemo(() => {
    const addedSet = new Set(routePointIds);
    return locations.filter((loc) => !addedSet.has(loc.id));
  }, [locations, routePointIds]);

  // Resolved route coordinates & locations
  const resolvedRoutePoints: (RouteCoordinate & {
    missing?: boolean;
    isCurrentLocation?: boolean;
    isLockedOrigin?: boolean;
    accuracy?: number;
  })[] = useMemo(() => {
    return routePointIds.map((id, index) => {
      const isFirst = index === 0;

      if (id === CURRENT_LOCATION_ID) {
        // If route is locked, prioritize the locked origin coordinates!
        if (isRouteLocked && lockedOriginCoords && isFirst) {
          return {
            id: CURRENT_LOCATION_ID,
            lat: lockedOriginCoords.lat,
            lng: lockedOriginCoords.lng,
            label: lockedOriginCoords.label || 'Titik Awal Terkunci (GPS Semula)',
            isCurrentLocation: true,
            isLockedOrigin: true,
            accuracy: currentLocationCoords?.accuracy,
          };
        }

        if (currentLocationCoords) {
          return {
            id: CURRENT_LOCATION_ID,
            lat: currentLocationCoords.lat,
            lng: currentLocationCoords.lng,
            label: 'Lokasi Saya Saat Ini (GPS)',
            isCurrentLocation: true,
            accuracy: currentLocationCoords.accuracy,
          };
        }

        return {
          id: CURRENT_LOCATION_ID,
          lat: 0,
          lng: 0,
          label: isLocating ? 'Lokasi Saya (Mencari sinyal GPS...)' : 'Lokasi Saya Saat Ini (GPS)',
          isCurrentLocation: true,
          missing: false,
        };
      }

      const loc = locationMap.get(id);
      if (loc) {
        return {
          id: loc.id,
          lat: loc.latitude,
          lng: loc.longitude,
          label: loc.name,
          imageUrl: loc.imageUrl || (loc.images && loc.images[0]),
        };
      }

      return {
        id,
        lat: 0,
        lng: 0,
        label: `(Lokasi ID ${id.substring(0, 8)} telah dihapus)`,
        missing: true,
      };
    });
  }, [routePointIds, locationMap, currentLocationCoords, isRouteLocked, lockedOriginCoords, isLocating]);

  const validRouteCoords = useMemo(() => {
    return resolvedRoutePoints
      .filter((p) => !p.missing)
      .map((p) => ({
        id: p.id,
        lat: p.lat,
        lng: p.lng,
        label: p.label,
        imageUrl: p.imageUrl,
        isCurrentLocation: p.isCurrentLocation,
      }));
  }, [resolvedRoutePoints]);

  // Keep ref of onViewRouteOnMap callback to prevent re-triggering effect on parent re-renders
  const onViewRouteOnMapRef = useRef(onViewRouteOnMap);
  useEffect(() => {
    onViewRouteOnMapRef.current = onViewRouteOnMap;
  });

  // Sync with interactive map ONLY when coordinates actually change to prevent infinite loops
  const lastEmittedCoordsKeyRef = useRef<string>('');
  useEffect(() => {
    const mappableCoords = validRouteCoords.filter((c) => c.lat !== 0 || c.lng !== 0);
    const key = mappableCoords
      .map((c) => `${c.id}:${c.lat.toFixed(6)}:${c.lng.toFixed(6)}`)
      .join('|');

    if (key !== lastEmittedCoordsKeyRef.current) {
      lastEmittedCoordsKeyRef.current = key;
      if (mappableCoords.length >= 2) {
        onViewRouteOnMapRef.current(mappableCoords);
      } else if (lastEmittedCoordsKeyRef.current !== '') {
        onViewRouteOnMapRef.current([]);
      }
    }
  }, [validRouteCoords]);

  // Calculate straight-line distance
  const totalDistanceKm = useMemo(() => {
    const coordsWithGps = validRouteCoords.filter((c) => c.lat !== 0 || c.lng !== 0);
    if (coordsWithGps.length < 2) return 0;
    return calculatePathDistanceKm(
      coordsWithGps.map((c) => ({ latitude: c.lat, longitude: c.lng }))
    );
  }, [validRouteCoords]);

  // Calculate distance between locked origin and live position
  const distanceFromLockedOriginMeters = useMemo(() => {
    if (!isRouteLocked || !lockedOriginCoords || !currentLocationCoords) return null;
    const distKm = calculatePathDistanceKm([
      { latitude: lockedOriginCoords.lat, longitude: lockedOriginCoords.lng },
      { latitude: currentLocationCoords.lat, longitude: currentLocationCoords.lng },
    ]);
    return Math.round(distKm * 1000);
  }, [isRouteLocked, lockedOriginCoords, currentLocationCoords]);

  // Waypoints count
  const waypointCount = Math.max(0, validRouteCoords.length - 2);
  const exceedsWaypointLimit = waypointCount > MAX_WAYPOINTS_PER_URL;

  // Multi-segment legs if route is long
  const routeSegments = useMemo(() => {
    if (validRouteCoords.length < 2) return [];
    return splitRouteIntoSegments(validRouteCoords, travelMode, MAX_WAYPOINTS_PER_URL);
  }, [validRouteCoords, travelMode]);

  // Full single Google Maps URL
  const fullGoogleMapsUrl = useMemo(() => {
    if (validRouteCoords.length < 2) return '';
    const origin = validRouteCoords[0];
    const destination = validRouteCoords[validRouteCoords.length - 1];
    const waypoints = validRouteCoords.slice(1, -1);
    return buildMultiStopRouteUrl(origin, destination, waypoints, travelMode);
  }, [validRouteCoords, travelMode]);

  // Fetch current GPS position on demand
  const handleFetchCurrentLocation = useCallback((
    onSuccess?: (coords: { lat: number; lng: number; accuracy?: number }) => void,
    silent: boolean = false
  ) => {
    if (typeof window === 'undefined' || !navigator.geolocation) {
      if (!silent) onShowToast('Perangkat tidak mendukung geolokasi GPS.', 'error');
      return;
    }

    if (!silent) setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const coords = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: Math.round(position.coords.accuracy),
        };
        setCurrentLocationCoords(coords);
        const now = Date.now();
        setLastGpsUpdate({
          ...coords,
          timestamp: now,
          timeString: new Date(now).toLocaleTimeString('id-ID'),
        });
        setIsLocating(false);
        if (onSuccess) {
          onSuccess(coords);
        }
      },
      (error) => {
        setIsLocating(false);
        if (!silent) {
          let msg = 'Gagal mendeteksi lokasi saat ini.';
          if (error.code === error.PERMISSION_DENIED) {
            msg = 'Izin akses lokasi ditolak oleh browser. Harap aktifkan izin lokasi.';
          } else if (error.code === error.POSITION_UNAVAILABLE) {
            msg = 'Sinyal GPS tidak tersedia.';
          } else if (error.code === error.TIMEOUT) {
            msg = 'Permintaan lokasi GPS kedaluwarsa.';
          }
          onShowToast(msg, 'error');
        }
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 3000 }
    );
  }, [onShowToast]);

  // Handle GPS Tracking Modes: Live (watchPosition) vs Auto-Refresh (5s / 10s) vs Manual
  useEffect(() => {
    // Clear previous watchers & timers
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    if (intervalTimerRef.current !== null) {
      clearInterval(intervalTimerRef.current);
      intervalTimerRef.current = null;
    }
    if (countdownTimerRef.current !== null) {
      clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }

    if (typeof window === 'undefined' || !navigator.geolocation) return;

    if (gpsTrackingMode === 'live') {
      const id = navigator.geolocation.watchPosition(
        (position) => {
          const coords = {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
            accuracy: Math.round(position.coords.accuracy),
          };
          setCurrentLocationCoords(coords);
          const now = Date.now();
          setLastGpsUpdate({
            ...coords,
            timestamp: now,
            timeString: new Date(now).toLocaleTimeString('id-ID'),
          });
          setIsLocating(false);
        },
        (error) => {
          setIsLocating(false);
          console.warn('GPS watch error:', error);
        },
        { enableHighAccuracy: true, maximumAge: 2000, timeout: 12000 }
      );
      watchIdRef.current = id;
    } else if (gpsTrackingMode === '5s' || gpsTrackingMode === '10s') {
      const intervalMs = gpsTrackingMode === '5s' ? 5000 : 10000;
      const initialSeconds = gpsTrackingMode === '5s' ? 5 : 10;

      // Perform initial query asynchronously
      const initGpsTimer = setTimeout(() => {
        handleFetchCurrentLocation(undefined, true);
      }, 0);

      // Setup periodic interval
      intervalTimerRef.current = setInterval(() => {
        handleFetchCurrentLocation(undefined, true);
        setGpsCountdown(initialSeconds);
      }, intervalMs);

      // 1-second countdown ticker
      countdownTimerRef.current = setInterval(() => {
        setGpsCountdown((prev) => (prev <= 1 ? initialSeconds : prev - 1));
      }, 1000);

      return () => {
        clearTimeout(initGpsTimer);
        if (intervalTimerRef.current !== null) {
          clearInterval(intervalTimerRef.current);
          intervalTimerRef.current = null;
        }
        if (countdownTimerRef.current !== null) {
          clearInterval(countdownTimerRef.current);
          countdownTimerRef.current = null;
        }
      };
    }

    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      if (intervalTimerRef.current !== null) {
        clearInterval(intervalTimerRef.current);
        intervalTimerRef.current = null;
      }
      if (countdownTimerRef.current !== null) {
        clearInterval(countdownTimerRef.current);
        countdownTimerRef.current = null;
      }
    };
  }, [gpsTrackingMode, handleFetchCurrentLocation]);

  // Handlers for reordering (Disabled if locked for point 0)
  const handleMoveUp = (index: number) => {
    if (index <= 0) return;
    if (isRouteLocked && (index === 1 || index === 0)) {
      onShowToast('Titik awal sedang terkunci. Buka kunci rute jika ingin memindahkan titik awal.', 'info');
      return;
    }
    const updated = [...routePointIds];
    const temp = updated[index - 1];
    updated[index - 1] = updated[index];
    updated[index] = temp;
    setRoutePointIds(updated);
  };

  const handleMoveDown = (index: number) => {
    if (index >= routePointIds.length - 1) return;
    if (isRouteLocked && index === 0) {
      onShowToast('Titik awal sedang terkunci. Buka kunci rute jika ingin memindahkan titik awal.', 'info');
      return;
    }
    const updated = [...routePointIds];
    const temp = updated[index + 1];
    updated[index + 1] = updated[index];
    updated[index] = temp;
    setRoutePointIds(updated);
  };

  const handleRemovePoint = (index: number) => {
    if (isRouteLocked && index === 0) {
      onShowToast('Titik awal sedang terkunci. Buka kunci rute terlebih dahulu untuk menghapusnya.', 'info');
      return;
    }
    const updated = routePointIds.filter((_, i) => i !== index);
    setRoutePointIds(updated);
  };

  const handleAddLocationToRoute = (locationId: string) => {
    if (!locationId) return;
    if (routePointIds.includes(locationId)) {
      onShowToast('Lokasi ini sudah ada di dalam rute.', 'info');
      return;
    }
    setRoutePointIds([...routePointIds, locationId]);
  };

  const handleAddAllLocationsToRoute = () => {
    if (unaddedLocations.length === 0) {
      onShowToast('Semua lokasi yang tersedia sudah ada di dalam rute.', 'info');
      return;
    }
    const unaddedIds = unaddedLocations.map((l) => l.id);
    setRoutePointIds((prev) => [...prev, ...unaddedIds]);
    onShowToast(`${unaddedIds.length} lokasi berhasil ditambahkan ke rute!`, 'success');
  };

  const handleSetCurrentLocationAsOrigin = (mode: 'replace' | 'prepend' = 'replace') => {
    if (isRouteLocked) {
      onShowToast('Rute sedang terkunci. Buka kunci rute jika ingin mengganti titik awal.', 'info');
      return;
    }

    if (routePointIds[0] === CURRENT_LOCATION_ID) {
      handleFetchCurrentLocation((coords) => {
        onShowToast(`Koordinat GPS diperbarui: ${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)} (±${coords.accuracy}m).`, 'success');
      });
      return;
    }

    const filtered = routePointIds.filter((id) => id !== CURRENT_LOCATION_ID);

    if (mode === 'replace' && filtered.length > 0) {
      setRoutePointIds([CURRENT_LOCATION_ID, ...filtered.slice(1)]);
    } else {
      setRoutePointIds([CURRENT_LOCATION_ID, ...filtered]);
    }

    onShowToast('Titik awal diatur ke Lokasi Saat Ini (GPS). Mendeteksi koordinat...', 'info');

    handleFetchCurrentLocation((coords) => {
      onShowToast(`Lokasi GPS aktif sebagai titik awal (${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)} • akurasi ±${coords.accuracy}m).`, 'success');
    });
  };

  // Toggle Route Lock (Kunci Rute / Buka Kunci)
  const handleToggleLockRoute = () => {
    if (isRouteLocked) {
      setIsRouteLocked(false);
      setLockedOriginCoords(null);
      onShowToast('Kunci rute dibuka. Titik awal dan urutan dapat disesuaikan kembali.', 'info');
    } else {
      if (validRouteCoords.length < 2) {
        onShowToast('Tambahkan minimal 2 titik ke rute sebelum mengunci rute.', 'info');
        return;
      }

      const isCurrentLocOrigin = routePointIds[0] === CURRENT_LOCATION_ID;

      if (isCurrentLocOrigin) {
        if (currentLocationCoords) {
          const nowStr = new Date().toLocaleTimeString('id-ID');
          setLockedOriginCoords({
            lat: currentLocationCoords.lat,
            lng: currentLocationCoords.lng,
            label: `Titik Awal Terkunci (GPS pukul ${nowStr})`,
            lockedAt: nowStr,
          });
          setIsRouteLocked(true);
          onShowToast('🔒 Rute & Titik Awal Berhasil Dikunci! Titik awal tidak akan bergeser saat Anda berjalan.', 'success');
        } else {
          onShowToast('Mengambil koordinat GPS awal untuk dikunci...', 'info');
          handleFetchCurrentLocation((coords) => {
            const nowStr = new Date().toLocaleTimeString('id-ID');
            setLockedOriginCoords({
              lat: coords.lat,
              lng: coords.lng,
              label: `Titik Awal Terkunci (GPS pukul ${nowStr})`,
              lockedAt: nowStr,
            });
            setIsRouteLocked(true);
            onShowToast('🔒 Rute & Titik Awal Berhasil Dikunci! Titik awal tidak akan bergeser saat Anda berjalan.', 'success');
          });
        }
      } else {
        setIsRouteLocked(true);
        onShowToast('🔒 Rute Berhasil Dikunci! Titik awal dan urutan rute aman dari perubahan.', 'success');
      }
    }
  };

  // Reset current route draft
  const handleResetRoute = () => {
    if (routePointIds.length === 0) return;
    const confirmed = window.confirm('Kosongkan daftar titik pada rute ini dan mulai dari awal?');
    if (!confirmed) return;

    setRoutePointIds([]);
    setSelectedSavedRouteId(null);
    setRouteName('');
    setRouteNotes('');
    setIsRouteLocked(false);
    setLockedOriginCoords(null);
    clearActiveRouteDraft();
    onViewRouteOnMapRef.current([]);
    onShowToast('Daftar titik rute berhasil dikosongkan. Rute baru siap dibuat.', 'info');
  };

  // Optimize Waypoint Order (TSP Heuristic)
  const handleOptimizeOrder = () => {
    if (isRouteLocked) {
      onShowToast('Rute sedang terkunci. Buka kunci rute terlebih dahulu untuk mengoptimalkan urutan.', 'info');
      return;
    }

    if (validRouteCoords.length < 3) {
      onShowToast('Optimasi membutuhkan minimal 3 titik (Awal, Perhentian, dan Akhir).', 'info');
      return;
    }

    const origin = validRouteCoords[0];
    const destination = validRouteCoords[validRouteCoords.length - 1];
    const waypoints = validRouteCoords.slice(1, -1);

    const optimized = optimizeWaypointsOrder(origin, waypoints, destination);

    const newOrderIds = [
      origin.id!,
      ...optimized.map((pt) => pt.id!),
      destination.id!,
    ];

    setRoutePointIds(newOrderIds);
    onShowToast('Urutan perhentian dioptimalkan untuk jarak terpendek.', 'success');
  };

  // Save current route
  const handleSaveRoute = () => {
    if (validRouteCoords.length < 2) {
      onShowToast('Rute harus memiliki minimal 2 titik (Awal dan Tujuan).', 'error');
      return;
    }

    const finalName = routeName.trim() || `Rute ${new Date().toLocaleDateString('id-ID')}`;
    const originId = validRouteCoords[0].id!;
    const destinationId = validRouteCoords[validRouteCoords.length - 1].id!;
    const waypointIds = validRouteCoords.slice(1, -1).map((w) => w.id!);

    try {
      const saved = saveSingleRoute(
        {
          name: finalName,
          originId,
          destinationId,
          waypointIds,
          travelMode,
          notes: routeNotes.trim(),
        },
        selectedSavedRouteId || undefined
      );

      const all = getStoredRoutes();
      setSavedRoutes(all);
      setSelectedSavedRouteId(saved.id);
      onShowToast(`Rute "${saved.name}" berhasil disimpan!`, 'success');
    } catch (err) {
      onShowToast(err instanceof Error ? err.message : 'Gagal menyimpan rute.', 'error');
    }
  };

  // Load a saved route
  const handleLoadSavedRoute = (route: RoutePlan) => {
    const ids = [route.originId, ...route.waypointIds, route.destinationId];
    setRoutePointIds(ids);
    setRouteName(route.name);
    setRouteNotes(route.notes || '');
    setTravelMode(route.travelMode || 'driving');
    setSelectedSavedRouteId(route.id);
    setIsRouteLocked(false);
    setLockedOriginCoords(null);
    onShowToast(`Rute "${route.name}" dimuat ke perencana.`, 'info');
  };

  // Delete a saved route
  const handleDeleteSavedRoute = (id: string, name: string) => {
    deleteSingleRoute(id);
    const updated = getStoredRoutes();
    setSavedRoutes(updated);
    if (selectedSavedRouteId === id) {
      setSelectedSavedRouteId(null);
    }
    onShowToast(`Rute "${name}" dihapus.`, 'info');
  };

  const handleOpenRouteCamera = (locationId?: string) => {
    let targetLoc = locationId ? locationMap.get(locationId) : null;
    if (!targetLoc && routeLocationPoints.length > 0) {
      targetLoc = routeLocationPoints[0];
    }
    if (!targetLoc && locations.length > 0) {
      targetLoc = locations[0];
    }
    if (!targetLoc) {
      onShowToast('Tambahkan titik ke dalam rute terlebih dahulu untuk membuka kamera rute.', 'info');
      return;
    }
    setCameraModalInitialLocation(targetLoc);
    setCameraModalOpen(true);
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-4 space-y-4 pb-24">
      {/* 1. Route Setup & Storage Header */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-teal-100 text-teal-700 flex items-center justify-center flex-shrink-0">
              <RouteIcon className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-slate-900 leading-tight">
                  Perencana Rute Multi-Lokasi
                </h2>
                {routePointIds.length > 0 && (
                  <span className="px-2 py-0.5 rounded-full bg-teal-50 text-teal-700 text-[10px] font-bold border border-teal-200">
                    Draft Tersimpan Otomatis
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-500">
                Susun titik kunjungan, kunci rute perjalanan, dan pantau GPS live secara realtime
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 flex-wrap">
            {/* Saved Routes Selector */}
            {savedRoutes.length > 0 && (
              <div className="relative">
                <select
                  value={selectedSavedRouteId || ''}
                  onChange={(e) => {
                    const target = savedRoutes.find((r) => r.id === e.target.value);
                    if (target) handleLoadSavedRoute(target);
                  }}
                  className="text-xs bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-700 focus:outline-none focus:border-teal-600"
                >
                  <option value="">📁 Muat Rute ({savedRoutes.length})</option>
                  {savedRoutes.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Reset Button */}
            {routePointIds.length > 0 && (
              <button
                type="button"
                onClick={handleResetRoute}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:text-rose-600 hover:border-rose-300 text-xs font-semibold transition"
                title="Hapus daftar titik pada rute ini"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset Rute</span>
              </button>
            )}
          </div>
        </div>

        {/* Route Name & Travel Mode */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1 border-t border-slate-100">
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">
              Nama Rute
            </label>
            <input
              type="text"
              value={routeName}
              onChange={(e) => setRouteName(e.target.value)}
              placeholder="Contoh: Rute Kunjungan Lapangan A"
              className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:border-teal-600 focus:outline-none"
            />
          </div>

          {/* Travel Mode Selector */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">
              Moda Transportasi
            </label>
            <div className="grid grid-cols-4 gap-1">
              {[
                { id: 'driving' as TravelMode, label: 'Mobil', icon: Car },
                { id: 'walking' as TravelMode, label: 'Jalan', icon: Footprints },
                { id: 'bicycling' as TravelMode, label: 'Sepeda', icon: Bike },
                { id: 'transit' as TravelMode, label: 'Transit', icon: Bus },
              ].map((m) => {
                const Icon = m.icon;
                const isSelected = travelMode === m.id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setTravelMode(m.id)}
                    className={`flex items-center justify-center gap-1 py-1.5 px-1 rounded-lg text-xs font-medium transition ${
                      isSelected
                        ? 'bg-teal-600 text-white shadow-xs'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    <span className="hidden xs:inline text-[11px]">{m.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* 2. GPS Live & Auto-Refresh Monitor Card */}
      <div className="bg-white p-3.5 sm:p-4 rounded-2xl border border-slate-200 shadow-xs space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${
              gpsTrackingMode === 'live'
                ? 'bg-emerald-100 text-emerald-700'
                : gpsTrackingMode !== 'manual'
                ? 'bg-sky-100 text-sky-700'
                : 'bg-slate-100 text-slate-700'
            }`}>
              <Radio className={`w-4 h-4 ${gpsTrackingMode === 'live' ? 'animate-pulse' : ''}`} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-xs font-bold text-slate-900 leading-tight">
                  Pelacakan GPS Live & Auto-Refresh
                </h3>
                {gpsTrackingMode === 'live' && (
                  <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-extrabold border border-emerald-300">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
                    LIVE REALTIME
                  </span>
                )}
                {(gpsTrackingMode === '5s' || gpsTrackingMode === '10s') && (
                  <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-sky-100 text-sky-800 text-[10px] font-bold border border-sky-300">
                    <Timer className="w-3 h-3 text-sky-600" />
                    Auto {gpsCountdown}s
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-500">
                Pantau koordinat GPS secara berkala atau realtime saat survei lapangan
              </p>
            </div>
          </div>

          {/* Mode Selector Buttons */}
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs">
            <button
              type="button"
              onClick={() => {
                setGpsTrackingMode('live');
                onShowToast('Pelacakan GPS Live Realtime diaktifkan.', 'success');
              }}
              className={`px-2.5 py-1 rounded-lg font-bold transition flex items-center gap-1 ${
                gpsTrackingMode === 'live'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
              title="Perbarui koordinat terus-menerus mengikuti pergerakan perangkat"
            >
              <span>⚡ Live</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setGpsTrackingMode('5s');
                setGpsCountdown(5);
                onShowToast('Auto-refresh GPS per 5 detik diaktifkan.', 'info');
              }}
              className={`px-2.5 py-1 rounded-lg font-bold transition flex items-center gap-1 ${
                gpsTrackingMode === '5s'
                  ? 'bg-sky-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
              title="Perbarui koordinat GPS otomatis setiap 5 detik"
            >
              <span>⏱️ 5 Detik</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setGpsTrackingMode('10s');
                setGpsCountdown(10);
                onShowToast('Auto-refresh GPS per 10 detik diaktifkan.', 'info');
              }}
              className={`px-2.5 py-1 rounded-lg font-bold transition flex items-center gap-1 ${
                gpsTrackingMode === '10s'
                  ? 'bg-sky-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
              title="Perbarui koordinat GPS otomatis setiap 10 detik"
            >
              <span>⏱️ 10 Detik</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setGpsTrackingMode('manual');
                onShowToast('Mode GPS diubah ke Manual.', 'info');
              }}
              className={`px-2 py-1 rounded-lg font-semibold transition ${
                gpsTrackingMode === 'manual'
                  ? 'bg-slate-700 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
              title="Hanya perbarui ketika tombol Segarkan ditekan"
            >
              Manual
            </button>
          </div>
        </div>

        {/* Telemetry info row */}
        <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2 flex-wrap min-w-0">
            {currentLocationCoords ? (
              <>
                <span className="font-mono text-slate-800 font-bold bg-slate-100 px-2 py-1 rounded-lg border border-slate-200">
                  📍 {formatCoordinatePair(currentLocationCoords.lat, currentLocationCoords.lng)}
                </span>
                {currentLocationCoords.accuracy && (
                  <span className="text-[11px] px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 font-semibold">
                    Akurasi ±{currentLocationCoords.accuracy}m
                  </span>
                )}
                {lastGpsUpdate && (
                  <span className="text-[11px] text-slate-400">
                    Diperbarui: {lastGpsUpdate.timeString}
                  </span>
                )}
              </>
            ) : (
              <span className="text-slate-500 italic flex items-center gap-1">
                {isLocating ? 'Mendeteksi sinyal GPS...' : 'Belum mendeteksi koordinat GPS'}
              </span>
            )}
          </div>

          <button
            type="button"
            disabled={isLocating}
            onClick={() => handleFetchCurrentLocation(undefined, false)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 active:bg-slate-300 text-slate-700 font-bold text-xs transition"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLocating ? 'animate-spin text-teal-600' : ''}`} />
            <span>Segarkan GPS</span>
          </button>
        </div>

        {/* Live position vs Locked Origin comparison (when locked and user moved) */}
        {isRouteLocked && lockedOriginCoords && currentLocationCoords && (
          <div className="mt-2 p-2.5 rounded-xl bg-amber-50/90 border border-amber-300 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-amber-900">
            <div className="space-y-0.5">
              <div className="flex items-center gap-1.5 font-bold">
                <Lock className="w-3.5 h-3.5 text-amber-700" />
                <span>Titik Awal Terkunci:</span>
                <span className="font-mono text-[11px]">
                  {formatCoordinatePair(lockedOriginCoords.lat, lockedOriginCoords.lng)}
                </span>
              </div>
              <p className="text-[11px] text-amber-800">
                Posisi live Anda saat ini terdeteksi bergerak, tetapi titik awal rute tetap terkunci di koordinat semula.
              </p>
            </div>

            {distanceFromLockedOriginMeters !== null && (
              <span className="px-2.5 py-1 rounded-lg bg-amber-200/90 text-amber-950 font-bold text-xs whitespace-nowrap self-start sm:self-auto border border-amber-300">
                🏃 Bergerak ±{distanceFromLockedOriginMeters < 1000 ? `${distanceFromLockedOriginMeters} m` : `${(distanceFromLockedOriginMeters / 1000).toFixed(2)} km`}
              </span>
            )}
          </div>
        )}
      </div>

      {/* 3. Route Lock Status Banner */}
      {isRouteLocked ? (
        <div className="bg-gradient-to-r from-amber-50 via-emerald-50 to-slate-50 p-3.5 sm:p-4 rounded-2xl border border-amber-300/90 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start sm:items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-500 text-white flex items-center justify-center flex-shrink-0 shadow-xs">
              <Lock className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="text-xs sm:text-sm font-extrabold text-amber-950">
                  Rute & Titik Awal Terkunci
                </h4>
                <span className="px-2 py-0.5 rounded-full bg-amber-200 text-amber-900 text-[10px] font-extrabold border border-amber-300">
                  TERKUNCI
                </span>
              </div>
              <p className="text-[11px] text-amber-900/90 leading-tight mt-0.5">
                Meskipun Anda sudah berjalan/berpindah lokasi, titik awal dan urutan perhentian tetap dibekukan di posisi semula.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleToggleLockRoute}
            className="flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl bg-white hover:bg-slate-50 border border-amber-300 text-amber-900 text-xs font-bold shadow-xs transition"
          >
            <Unlock className="w-3.5 h-3.5" />
            <span>Buka Kunci Rute</span>
          </button>
        </div>
      ) : validRouteCoords.length >= 2 ? (
        <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200 flex items-center justify-between gap-2.5 text-xs">
          <div className="flex items-center gap-2 min-w-0">
            <Unlock className="w-4 h-4 text-slate-500 flex-shrink-0" />
            <p className="text-[11px] text-slate-600 truncate">
              Rute belum dikunci. Aktifkan <strong>Kunci Rute</strong> agar titik awal tidak bergeser saat Anda bepergian.
            </p>
          </div>
          <button
            type="button"
            onClick={handleToggleLockRoute}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 active:bg-amber-700 text-white text-xs font-bold shadow-xs transition flex-shrink-0"
          >
            <Lock className="w-3.5 h-3.5" />
            <span>Kunci Rute</span>
          </button>
        </div>
      ) : null}

      {/* 4. Route Order & Stops List */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <h3 className="text-xs font-bold text-slate-800">
              Urutan Kunjungan ({routePointIds.length} Titik)
            </h3>
            {validRouteCoords.length >= 2 && (
              <span className="text-[11px] text-teal-700 font-semibold bg-teal-50 px-2 py-0.5 rounded-full border border-teal-200">
                ±{totalDistanceKm.toFixed(1)} km
              </span>
            )}
            {isRouteLocked && (
              <span className="text-[10px] text-amber-800 font-bold bg-amber-100 px-2 py-0.5 rounded-full border border-amber-300 flex items-center gap-1">
                <Lock className="w-3 h-3" />
                Terkunci
              </span>
            )}
          </div>

          {/* Action Toolbar */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {/* Start from GPS Location Button */}
            {!isRouteLocked && routePointIds[0] !== CURRENT_LOCATION_ID && (
              <button
                type="button"
                disabled={isLocating}
                onClick={() => handleSetCurrentLocationAsOrigin('prepend')}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 text-xs font-semibold transition shadow-2xs"
                title="Mulai rute dari posisi GPS Anda saat ini"
              >
                <Crosshair className={`w-3.5 h-3.5 text-emerald-600 ${isLocating ? 'animate-spin' : ''}`} />
                <span className="hidden sm:inline">Mulai dari</span>
                <span>Lokasi Saya</span>
              </button>
            )}

            {/* Add All Locations Button */}
            {!isRouteLocked && unaddedLocations.length > 0 && (
              <button
                type="button"
                onClick={handleAddAllLocationsToRoute}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-teal-50 hover:bg-teal-100 text-teal-800 border border-teal-200 text-xs font-semibold transition"
                title="Tambahkan semua lokasi yang tersedia ke rute"
              >
                <PlusCircle className="w-3.5 h-3.5 text-teal-600" />
                <span>+ Semua</span>
                <span className="text-[10px] bg-teal-200/70 text-teal-900 px-1.5 py-0.2 rounded-full font-bold">
                  {unaddedLocations.length}
                </span>
              </button>
            )}

            {/* Optimize Button */}
            {!isRouteLocked && validRouteCoords.length >= 3 && (
              <button
                type="button"
                onClick={handleOptimizeOrder}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-teal-50 hover:bg-teal-100 text-teal-800 border border-teal-200 text-xs font-semibold transition"
                title="Optimalkan urutan perhentian menggunakan algoritma jarak terpendek (TSP)"
              >
                <Sparkles className="w-3.5 h-3.5 text-teal-600" />
                <span>Optimalkan</span>
              </button>
            )}

            {/* Kunci / Buka Kunci Rute Button */}
            {validRouteCoords.length >= 2 && (
              <button
                type="button"
                onClick={handleToggleLockRoute}
                className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold transition shadow-2xs ${
                  isRouteLocked
                    ? 'bg-amber-100 text-amber-900 border border-amber-300 hover:bg-amber-200'
                    : 'bg-amber-500 text-white hover:bg-amber-600'
                }`}
                title={isRouteLocked ? 'Buka kunci rute untuk memodifikasi' : 'Kunci rute agar titik awal tidak bergeser'}
              >
                {isRouteLocked ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
                <span>{isRouteLocked ? 'Terkunci' : 'Kunci Rute'}</span>
              </button>
            )}

            {/* Camera & Route HUD Button */}
            {routeLocationPoints.length >= 1 && (
              <button
                type="button"
                onClick={() => handleOpenRouteCamera()}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-700 active:bg-teal-800 text-white text-xs font-bold shadow-xs transition"
                title="Buka Kamera Navigasi & Peta Rute Google Maps Transparan"
              >
                <Camera className="w-3.5 h-3.5" />
                <span>Kamera & Rute</span>
              </button>
            )}
          </div>
        </div>

        {/* Empty state or list */}
        {routePointIds.length === 0 ? (
          <div className="p-6 text-center border-2 border-dashed border-slate-200 rounded-xl bg-slate-50/50 space-y-3">
            <div className="w-10 h-10 rounded-full bg-teal-50 text-teal-600 flex items-center justify-center mx-auto">
              <MapPin className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs font-bold text-slate-800">Belum Ada Titik Dalam Rute</p>
              <p className="text-[11px] text-slate-500 max-w-sm mx-auto leading-relaxed mt-0.5">
                Mulai rute dari posisi GPS Anda saat ini atau pilih titik awal dari daftar lokasi yang tersimpan. Rute akan otomatis disimpan saat Anda keluar aplikasi.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-2 pt-1">
              <button
                type="button"
                disabled={isLocating}
                onClick={() => handleSetCurrentLocationAsOrigin('prepend')}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white text-xs font-semibold shadow-xs transition"
              >
                <Crosshair className={`w-4 h-4 ${isLocating ? 'animate-spin' : ''}`} />
                <span>Mulai dari Lokasi Saya Saat Ini (GPS)</span>
              </button>

              {locations.length > 0 && (
                <button
                  type="button"
                  onClick={handleAddAllLocationsToRoute}
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 active:bg-teal-800 text-white text-xs font-semibold shadow-xs transition"
                >
                  <PlusCircle className="w-4 h-4" />
                  <span>Tambahkan Semua ({locations.length} Lokasi) ke Rute</span>
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {resolvedRoutePoints.map((point, index) => {
              const isFirst = index === 0;
              const isLast = index === resolvedRoutePoints.length - 1;

              return (
                <div
                  key={`${point.id}-${index}`}
                  className={`flex items-center justify-between p-2.5 rounded-xl border transition-all ${
                    point.missing
                      ? 'bg-rose-50 border-rose-200 text-rose-800'
                      : isFirst
                      ? point.isLockedOrigin
                        ? 'bg-amber-50/80 border-amber-300'
                        : 'bg-emerald-50/70 border-emerald-300'
                      : isLast
                      ? 'bg-rose-50/50 border-rose-300'
                      : 'bg-slate-50 border-slate-200'
                  }`}
                >
                  {/* Left: Badge & Name */}
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    <span
                      className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                        isFirst
                          ? point.isLockedOrigin
                            ? 'bg-amber-600 text-white'
                            : 'bg-emerald-600 text-white'
                          : isLast
                          ? 'bg-rose-600 text-white'
                          : 'bg-teal-600 text-white'
                      }`}
                    >
                      {isFirst ? (point.isLockedOrigin ? '🔒' : 'A') : isLast ? 'B' : index}
                    </span>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span
                          className={`text-[10px] font-bold uppercase tracking-wider ${
                            point.isLockedOrigin
                              ? 'text-amber-900 bg-amber-200/90 px-1.5 py-0.2 rounded font-extrabold flex items-center gap-1'
                              : point.isCurrentLocation
                              ? 'text-emerald-800 bg-emerald-100/90 px-1.5 py-0.2 rounded font-extrabold'
                              : 'text-slate-500'
                          }`}
                        >
                          {isFirst
                            ? point.isLockedOrigin
                              ? 'Titik Awal Terkunci (Tetap)'
                              : point.isCurrentLocation
                              ? 'Titik Awal • Lokasi Saat Ini (GPS)'
                              : 'Titik Awal'
                            : isLast
                            ? 'Tujuan Akhir'
                            : `Perhentian #${index}`}
                        </span>

                        {point.isCurrentLocation && point.accuracy && (
                          <span className="text-[10px] text-emerald-800 font-semibold bg-emerald-200/80 px-1.5 py-0.2 rounded">
                            ±{point.accuracy}m
                          </span>
                        )}
                      </div>

                      <p className="text-xs font-bold text-slate-900 truncate flex items-center gap-1 mt-0.5">
                        {point.isCurrentLocation && (
                          <Crosshair className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />
                        )}
                        <span>{point.label}</span>
                      </p>

                      {!point.missing && (point.lat !== 0 || point.lng !== 0) && (
                        <p className="text-[10px] font-mono text-slate-500">
                          {formatCoordinatePair(point.lat, point.lng)}
                        </p>
                      )}

                      {/* Controls on Titik Awal when not locked */}
                      {!isRouteLocked && isFirst && !point.isCurrentLocation && (
                        <div className="pt-1.5 flex items-center gap-1.5">
                          <button
                            type="button"
                            disabled={isLocating}
                            onClick={() => handleSetCurrentLocationAsOrigin('replace')}
                            className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-800 hover:text-emerald-900 bg-white hover:bg-emerald-50 border border-emerald-300 px-2 py-0.5 rounded-lg transition shadow-2xs"
                            title="Ganti titik awal ini dengan lokasi GPS Anda saat ini"
                          >
                            <Crosshair className={`w-3 h-3 text-emerald-600 ${isLocating ? 'animate-spin' : ''}`} />
                            <span>{isLocating ? 'Mencari GPS...' : 'Gunakan Lokasi Saat Ini'}</span>
                          </button>
                        </div>
                      )}

                      {!isRouteLocked && isFirst && point.isCurrentLocation && (
                        <div className="pt-1.5 flex items-center gap-1.5 flex-wrap">
                          <button
                            type="button"
                            onClick={() => {
                              const filtered = routePointIds.filter((id) => id !== CURRENT_LOCATION_ID);
                              setRoutePointIds(filtered);
                              onShowToast('Titik awal dikembalikan ke titik lokasi tersimpan.', 'info');
                            }}
                            className="inline-flex items-center gap-1 text-[10px] font-medium text-slate-600 hover:text-slate-900 bg-white border border-slate-200 px-2 py-0.5 rounded-lg transition"
                          >
                            <span>Ganti ke Titik Tersimpan</span>
                          </button>
                        </div>
                      )}
                    </div>

                    {point.imageUrl && (
                      <div
                        onClick={() =>
                          setViewerImage({
                            url: point.imageUrl!,
                            title: point.label || 'Foto Lokasi',
                          })
                        }
                        className="w-10 h-10 rounded-lg overflow-hidden border border-slate-200 bg-slate-100 flex-shrink-0 cursor-pointer hover:ring-2 hover:ring-teal-400 transition ml-1"
                        title="Klik untuk melihat foto"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={point.imageUrl}
                          alt={point.label}
                          className="w-full h-full object-cover"
                        />
                      </div>
                    )}
                  </div>

                  {/* Right: Camera, Reorder & Remove Controls */}
                  <div className="flex items-center gap-1 flex-shrink-0 ml-2">
                    {/* Camera Button for this waypoint */}
                    {point.id !== CURRENT_LOCATION_ID && (
                      <button
                        type="button"
                        onClick={() => handleOpenRouteCamera(point.id)}
                        className="p-1.5 rounded-lg border border-teal-200 bg-teal-50 text-teal-700 hover:bg-teal-100 transition"
                        title="Buka Kamera Titik & Peta Rute Google Maps"
                      >
                        <Camera className="w-3.5 h-3.5" />
                      </button>
                    )}

                    {point.isCurrentLocation && !isRouteLocked && (
                      <button
                        type="button"
                        disabled={isLocating}
                        onClick={() => handleSetCurrentLocationAsOrigin('replace')}
                        className="p-1.5 rounded-lg border border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition"
                        title="Perbarui koordinat GPS lokasi saat ini"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${isLocating ? 'animate-spin' : ''}`} />
                      </button>
                    )}

                    <button
                      disabled={isFirst || (isRouteLocked && index === 1)}
                      onClick={() => handleMoveUp(index)}
                      className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 disabled:opacity-30 disabled:pointer-events-none transition"
                      title="Geser Naik"
                    >
                      <ArrowUp className="w-3.5 h-3.5" />
                    </button>
                    <button
                      disabled={isLast || (isRouteLocked && isFirst)}
                      onClick={() => handleMoveDown(index)}
                      className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 disabled:opacity-30 disabled:pointer-events-none transition"
                      title="Geser Turun"
                    >
                      <ArrowDown className="w-3.5 h-3.5" />
                    </button>
                    <button
                      disabled={isRouteLocked && isFirst}
                      onClick={() => handleRemovePoint(index)}
                      className="p-1.5 rounded-lg border border-slate-200 bg-white text-rose-600 hover:bg-rose-50 hover:border-rose-300 disabled:opacity-30 disabled:pointer-events-none transition"
                      title={isRouteLocked && isFirst ? 'Titik awal terkunci' : 'Hapus dari Rute'}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Add more locations to route picker */}
        {!isRouteLocked && unaddedLocations.length > 0 ? (
          <div className="pt-2.5 border-t border-slate-100 space-y-2">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
              <select
                onChange={(e) => {
                  if (e.target.value === '__ALL__') {
                    handleAddAllLocationsToRoute();
                  } else if (e.target.value === '__CURRENT_LOCATION__') {
                    handleSetCurrentLocationAsOrigin('prepend');
                  } else if (e.target.value) {
                    handleAddLocationToRoute(e.target.value);
                  }
                  e.target.value = '';
                }}
                defaultValue=""
                className="flex-1 text-xs bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-700 focus:outline-none focus:border-teal-600 font-medium"
              >
                <option value="" disabled>
                  + Tambah lokasi ke rute ({unaddedLocations.length} tersedia)...
                </option>
                <option value="__ALL__" className="font-bold text-teal-800 bg-teal-50">
                  ⚡ Tambahkan Semua ({unaddedLocations.length} Lokasi Tersedia)
                </option>
                {routePointIds[0] !== CURRENT_LOCATION_ID && (
                  <option value="__CURRENT_LOCATION__" className="font-bold text-emerald-800 bg-emerald-50">
                    📍 Mulai dari Lokasi Saya Saat Ini (GPS)
                  </option>
                )}
                {unaddedLocations.map((loc) => (
                  <option key={loc.id} value={loc.id}>
                    {loc.name} ({loc.category || 'Survei'})
                  </option>
                ))}
              </select>

              <button
                type="button"
                onClick={handleAddAllLocationsToRoute}
                className="flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 active:bg-teal-800 text-white text-xs font-semibold whitespace-nowrap shadow-xs transition"
                title="Tambahkan seluruh lokasi yang tersedia ke dalam rute"
              >
                <PlusCircle className="w-3.5 h-3.5" />
                <span>+ Tambah Semua ({unaddedLocations.length})</span>
              </button>
            </div>
          </div>
        ) : locations.length > 0 && !isRouteLocked ? (
          <div className="pt-2 border-t border-slate-100 flex items-center gap-2 text-xs text-teal-800 bg-teal-50/60 p-2.5 rounded-xl border border-teal-200">
            <CheckCheck className="w-4 h-4 text-teal-600 flex-shrink-0" />
            <span>Semua {locations.length} lokasi tersimpan sudah dimasukkan ke dalam rute ini.</span>
          </div>
        ) : null}
      </div>

      {/* 5. Google Maps Actions & Segmentation Notice */}
      {validRouteCoords.length >= 2 && (
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
              <Navigation className="w-4 h-4 text-teal-600" />
              Buka Navigasi di Google Maps
            </h4>
            <span className="text-[11px] text-slate-500 font-medium">
              Moda: {travelMode === 'driving' ? 'Mobil' : travelMode === 'walking' ? 'Jalan Kaki' : travelMode === 'bicycling' ? 'Sepeda' : 'Transit'}
            </span>
          </div>

          {/* Waypoint Limit & Segmentation Alert */}
          {exceedsWaypointLimit ? (
            <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-300 text-xs text-amber-900 space-y-2">
              <div className="flex items-start gap-2">
                <Split className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold">Rute Dibagi Menjadi Beberapa Bagian</p>
                  <p className="mt-0.5 text-amber-800 leading-relaxed">
                    Google Maps membatasi maksimal {MAX_WAYPOINTS_PER_URL} titik perhentian per tautan. Rute Anda ({validRouteCoords.length} titik) telah dibagi menjadi <strong>{routeSegments.length} bagian bersambung</strong> agar tidak ada titik yang terlewat.
                  </p>
                </div>
              </div>

              {/* Segmented Accordion List */}
              <div className="space-y-2.5 pt-1">
                {routeSegments.map((segment) => {
                  const isExpanded = expandedSegmentIndex === segment.segmentIndex;
                  const segmentStops = [
                    segment.origin,
                    ...segment.waypoints,
                    segment.destination,
                  ];

                  return (
                    <div
                      key={segment.segmentIndex}
                      className="rounded-xl border border-amber-200/90 bg-white overflow-hidden shadow-2xs transition-all"
                    >
                      {/* Segment Header Clickable */}
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedSegmentIndex((prev) =>
                            prev === segment.segmentIndex ? null : segment.segmentIndex
                          )
                        }
                        className={`w-full p-3 flex items-center justify-between text-left transition ${
                          isExpanded
                            ? 'bg-amber-100/60 border-b border-amber-200'
                            : 'hover:bg-amber-50/60'
                        }`}
                      >
                        <div className="min-w-0 flex-1 pr-2">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-200 text-amber-900">
                              Bagian {segment.segmentIndex} dari {segment.totalSegments}
                            </span>
                            <span className="text-[11px] text-slate-500 font-medium">
                              ({segmentStops.length} titik perhentian)
                            </span>
                          </div>
                          <p className="text-xs font-bold text-slate-800 truncate mt-1">
                            {segment.origin.label} → {segment.destination.label}
                          </p>
                        </div>

                        <div className="flex items-center gap-2">
                          <span className="text-[11px] text-amber-800 font-bold hidden sm:inline">
                            {isExpanded ? 'Tutup Detail' : 'Lihat Titik'}
                          </span>
                        </div>
                      </button>

                      {/* Segment Detail Content */}
                      {isExpanded && (
                        <div className="p-3 bg-amber-50/40 space-y-3 animate-in fade-in">
                          <ol className="space-y-1.5">
                            {segmentStops.map((stop, sIdx) => {
                              const isFirstStop = sIdx === 0;
                              const isLastStop = sIdx === segmentStops.length - 1;

                              return (
                                <li
                                  key={`${stop.id}-${sIdx}`}
                                  className="flex items-center justify-between text-xs bg-white p-2 rounded-lg border border-amber-100 shadow-2xs"
                                >
                                  <div className="flex items-center gap-2 min-w-0 flex-1">
                                    <span
                                      className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0 ${
                                        isFirstStop
                                          ? 'bg-emerald-600'
                                          : isLastStop
                                          ? 'bg-rose-600'
                                          : 'bg-amber-600'
                                      }`}
                                    >
                                      {isFirstStop ? 'S' : isLastStop ? 'E' : sIdx}
                                    </span>
                                    <span className="truncate font-medium text-slate-800">
                                      {stop.label}
                                    </span>
                                  </div>

                                  <div className="flex items-center gap-1.5 flex-shrink-0 ml-2">
                                    {stop.imageUrl && (
                                      <button
                                        type="button"
                                        onClick={() =>
                                          setViewerImage({
                                            url: stop.imageUrl!,
                                            title: stop.label || 'Foto Lokasi',
                                          })
                                        }
                                        className="text-[10px] text-teal-700 hover:text-teal-900 bg-teal-50 px-1.5 py-0.5 rounded font-semibold border border-teal-200"
                                      >
                                        Foto
                                      </button>
                                    )}
                                    <span className="text-[10px] font-mono text-slate-500">
                                      {formatCoordinatePair(stop.lat, stop.lng)}
                                    </span>
                                  </div>
                                </li>
                              );
                            })}
                          </ol>

                          {/* Direct Google Maps Navigation Button under this segment */}
                          <div className="pt-2 border-t border-slate-200 space-y-1.5">
                            <a
                              href={segment.googleMapsUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center justify-center gap-2 w-full py-2 px-3 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs shadow-xs transition"
                            >
                              <Navigation className="w-3.5 h-3.5" />
                              <span>Buka Bagian #{segment.segmentIndex} di Google Maps</span>
                              <ExternalLink className="w-3 h-3 opacity-80" />
                            </a>

                            <button
                              type="button"
                              onClick={() => {
                                const firstStopId = segment.origin.id !== CURRENT_LOCATION_ID ? segment.origin.id : undefined;
                                handleOpenRouteCamera(firstStopId);
                              }}
                              className="flex items-center justify-center gap-1.5 w-full py-1.5 px-3 rounded-lg bg-slate-900 hover:bg-black text-white font-semibold text-xs transition"
                            >
                              <Camera className="w-3.5 h-3.5 text-teal-400" />
                              <span>Kamera & Peta HUD Bagian #{segment.segmentIndex}</span>
                            </button>

                            <p className="text-[10px] text-slate-500 text-center mt-1">
                              Tautan ini langsung membuka rute Google Maps untuk perhentian di Bagian #{segment.segmentIndex}.
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div>
              <a
                href={fullGoogleMapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 w-full py-3 px-4 rounded-xl bg-teal-600 hover:bg-teal-700 active:bg-teal-800 text-white font-bold text-xs sm:text-sm shadow-md transition"
              >
                <Navigation className="w-4 h-4" />
                <span>Buka Rute Lengkap di Google Maps</span>
                <ExternalLink className="w-3.5 h-3.5 opacity-70" />
              </a>

              <button
                type="button"
                onClick={() => handleOpenRouteCamera()}
                className="flex items-center justify-center gap-2 w-full py-2.5 px-4 rounded-xl bg-slate-900 hover:bg-black text-white font-bold text-xs sm:text-sm shadow-md transition mt-2"
              >
                <Camera className="w-4 h-4 text-teal-400" />
                <span>Buka Kamera Rute & Panduan Navigasi HUD</span>
              </button>

              <div className="flex gap-2 mt-2">
                <button
                  type="button"
                  onClick={() => {
                    const csvData = exportEditedPhotosCsv(routeLocationPoints, false);
                    const dateStr = new Date().toISOString().split('T')[0];
                    downloadFile(csvData, `georoute_rute_titik_foto_${dateStr}.csv`, 'text/csv;charset=utf-8;');
                    onShowToast('CSV titik rute & foto berhasil diunduh.', 'success');
                  }}
                  className="w-full flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl border border-purple-200 bg-purple-50/90 hover:bg-purple-100 text-purple-900 text-xs font-semibold transition shadow-2xs"
                  title="Unduh CSV ringkasan titik dan status foto rute ini"
                >
                  <Download className="w-3.5 h-3.5 text-purple-600" />
                  <span>Unduh CSV Titik Rute & Foto ({routeLocationPoints.length})</span>
                </button>
              </div>

              <p className="text-[11px] text-slate-500 text-center mt-2 leading-relaxed">
                Tautan membuka aplikasi Google Maps pada HP Anda dengan urutan waypoint yang telah ditentukan.
              </p>
            </div>
          )}

          {/* Save Route Action */}
          <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
            <button
              onClick={handleSaveRoute}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition"
            >
              <Save className="w-3.5 h-3.5" />
              <span>Simpan ke Daftar Rute</span>
            </button>

            {selectedSavedRouteId && (
              <button
                onClick={() => {
                  setRoutePointIds([]);
                  setSelectedSavedRouteId(null);
                  setRouteName('');
                  setIsRouteLocked(false);
                  setLockedOriginCoords(null);
                  clearActiveRouteDraft();
                }}
                className="text-xs text-slate-500 hover:text-slate-800 font-medium"
              >
                Buat Rute Baru
              </button>
            )}
          </div>
        </div>
      )}

      {/* 6. Saved Routes List */}
      {savedRoutes.length > 0 && (
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs space-y-3">
          <h3 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
            <FolderOpen className="w-4 h-4 text-teal-600" />
            Daftar Rute Tersimpan ({savedRoutes.length})
          </h3>

          <div className="space-y-2">
            {savedRoutes.map((saved) => {
              const stopCount = 2 + (saved.waypointIds?.length || 0);
              const isCurrent = selectedSavedRouteId === saved.id;

              return (
                <div
                  key={saved.id}
                  className={`p-3 rounded-xl border flex items-center justify-between gap-2 transition ${
                    isCurrent
                      ? 'bg-teal-50/70 border-teal-300'
                      : 'bg-slate-50/60 border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div
                    onClick={() => handleLoadSavedRoute(saved)}
                    className="min-w-0 flex-1 cursor-pointer"
                  >
                    <h4 className="text-xs font-bold text-slate-900 truncate">{saved.name}</h4>
                    <p className="text-[11px] text-slate-500">
                      {stopCount} titik • Moda:{' '}
                      {saved.travelMode === 'driving'
                        ? 'Mobil'
                        : saved.travelMode === 'walking'
                        ? 'Jalan'
                        : saved.travelMode === 'bicycling'
                        ? 'Sepeda'
                        : 'Transit'}
                    </p>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => handleLoadSavedRoute(saved)}
                      className="px-2.5 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold transition"
                    >
                      Buka
                    </button>
                    <button
                      onClick={() => handleDeleteSavedRoute(saved.id, saved.name)}
                      className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-rose-50 hover:text-rose-600 transition"
                      title="Hapus Rute"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Full Screen Image Viewer Modal */}
      <ImageViewerModal
        isOpen={Boolean(viewerImage)}
        onClose={() => setViewerImage(null)}
        imageUrl={viewerImage?.url || null}
        title={viewerImage?.title || 'Foto Lokasi'}
        subtitle={viewerImage?.subtitle}
      />

      {/* Route Camera & Google Maps HUD Modal */}
      <RouteCameraModal
        isOpen={cameraModalOpen}
        onClose={() => setCameraModalOpen(false)}
        initialLocation={cameraModalInitialLocation}
        routeLocations={routeLocationPoints}
        onPhotoSaved={() => {
          onLocationUpdated?.();
        }}
        onShowToast={onShowToast}
      />
    </div>
  );
};

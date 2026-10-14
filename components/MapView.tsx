'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import L from 'leaflet';
import {
  Crosshair,
  Maximize2,
  ZoomIn,
  ZoomOut,
  MapPin,
  ExternalLink,
  PlusCircle,
  Navigation,
  AlertTriangle,
  Camera,
} from 'lucide-react';
import { LocationPoint } from '@/types/location';
import { RouteCoordinate } from '@/types/route';
import { formatCoordinatePair } from '@/utils/coordinateValidation';
import { buildSingleLocationNavUrl, buildMultiStopRouteUrl } from '@/services/googleMapsUrl';

interface MapViewProps {
  locations: LocationPoint[];
  focusedLocationId?: string | null;
  activeRoutePoints?: RouteCoordinate[];
  onOpenAddModalWithCoords: (coords: { lat: number; lng: number }) => void;
  onEditLocation: (location: LocationPoint) => void;
  onAddToRoute: (location: LocationPoint) => void;
  onOpenRouteCamera?: (location: LocationPoint) => void;
}

export const MapView: React.FC<MapViewProps> = ({
  locations,
  focusedLocationId,
  activeRoutePoints,
  onOpenAddModalWithCoords,
  onEditLocation,
  onAddToRoute,
  onOpenRouteCamera,
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const leafletMapRef = useRef<L.Map | null>(null);
  const markersLayerRef = useRef<L.LayerGroup | null>(null);
  const routePolylineRef = useRef<L.Polyline | null>(null);
  const userLocationMarkerRef = useRef<L.CircleMarker | null>(null);
  const pickedMarkerRef = useRef<L.Marker | null>(null);

  const [pickedCoords, setPickedCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [tileError, setTileError] = useState(false);
  const hasFittedInitialBoundsRef = useRef(false);

  const onAddToRouteRef = useRef(onAddToRoute);
  const onEditLocationRef = useRef(onEditLocation);
  const onOpenRouteCameraRef = useRef(onOpenRouteCamera);
  useEffect(() => {
    onAddToRouteRef.current = onAddToRoute;
    onEditLocationRef.current = onEditLocation;
    onOpenRouteCameraRef.current = onOpenRouteCamera;
  });

  // Initialize Map instance once on mount
  useEffect(() => {
    if (!mapContainerRef.current) return;
    if (leafletMapRef.current) return;

    const container = mapContainerRef.current as HTMLElement & { _leaflet_id?: number };
    // Guard against stale leaflet id if DOM container was remounted
    if (container._leaflet_id) {
      delete container._leaflet_id;
    }

    // Default center around Bandar Lampung / Indonesia
    const defaultLat = -5.426723;
    const defaultLng = 105.258385;

    const map = L.map(container, {
      center: [defaultLat, defaultLng],
      zoom: 13,
      zoomControl: false, // Ergonomic mobile and desktop floating zoom controls
    });

    const tileLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap kontributor',
    });

    tileLayer.on('tileerror', () => {
      setTileError(true);
    });

    tileLayer.addTo(map);

    const markersGroup = L.layerGroup().addTo(map);
    markersLayerRef.current = markersGroup;
    leafletMapRef.current = map;

    // Ensure Leaflet calculates dimensions accurately on mobile, desktop, and window resize
    const invalidate = () => {
      if (leafletMapRef.current) {
        leafletMapRef.current.invalidateSize();
      }
    };

    setTimeout(invalidate, 100);
    setTimeout(invalidate, 300);

    window.addEventListener('resize', invalidate);

    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined' && container) {
      resizeObserver = new ResizeObserver(() => {
        invalidate();
      });
      resizeObserver.observe(container);
    }

    // Map click handler to pick coordinates
    map.on('click', (e: L.LeafletMouseEvent) => {
      const { lat, lng } = e.latlng;
      setPickedCoords({ lat, lng });

      if (pickedMarkerRef.current) {
        pickedMarkerRef.current.setLatLng([lat, lng]);
      } else {
        const pickIcon = L.divIcon({
          className: '',
          html: `
            <div style="background-color: #f59e0b; width: 30px; height: 30px; border-radius: 9999px; border: 3px solid #ffffff; box-shadow: 0 4px 10px rgba(0,0,0,0.3); display: flex; align-items: center; justify-content: center; color: white;">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 2v20M2 12h20"/></svg>
            </div>
          `,
          iconSize: [30, 30],
          iconAnchor: [15, 15],
        });
        const marker = L.marker([lat, lng], { icon: pickIcon }).addTo(map);
        pickedMarkerRef.current = marker;
      }
    });

    return () => {
      window.removeEventListener('resize', invalidate);
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
      if (leafletMapRef.current) {
        leafletMapRef.current.remove();
        leafletMapRef.current = null;
      }
    };
  }, []);

  // Update Markers when locations or active route changes
  useEffect(() => {
    if (!leafletMapRef.current || !markersLayerRef.current) return;

    const markersGroup = markersLayerRef.current;
    markersGroup.clearLayers();

    // Map route points for quick lookup of route status
    const routePointMap = new Map<string, { role: 'origin' | 'waypoint' | 'destination'; index: number }>();
    if (activeRoutePoints && activeRoutePoints.length > 0) {
      activeRoutePoints.forEach((rp, idx) => {
        if (!rp.id) return;
        if (idx === 0) {
          routePointMap.set(rp.id, { role: 'origin', index: 1 });
        } else if (idx === activeRoutePoints.length - 1) {
          routePointMap.set(rp.id, { role: 'destination', index: activeRoutePoints.length });
        } else {
          routePointMap.set(rp.id, { role: 'waypoint', index: idx + 1 });
        }
      });
    }

    locations.forEach((loc) => {
      const routeInfo = routePointMap.get(loc.id);

      let pinHtml = '';
      if (routeInfo?.role === 'origin') {
        pinHtml = `
          <div style="background-color: #059669; width: 32px; height: 32px; border-radius: 9999px; border: 3px solid #ffffff; box-shadow: 0 4px 8px rgba(0,0,0,0.35); display: flex; align-items: center; justify-content: center; color: #ffffff; font-weight: bold; font-size: 13px;">
            Awal
          </div>
        `;
      } else if (routeInfo?.role === 'destination') {
        pinHtml = `
          <div style="background-color: #e11d48; width: 32px; height: 32px; border-radius: 9999px; border: 3px solid #ffffff; box-shadow: 0 4px 8px rgba(0,0,0,0.35); display: flex; align-items: center; justify-content: center; color: #ffffff; font-weight: bold; font-size: 13px;">
            Akhir
          </div>
        `;
      } else if (routeInfo?.role === 'waypoint') {
        pinHtml = `
          <div style="background-color: #2563eb; width: 30px; height: 30px; border-radius: 9999px; border: 3px solid #ffffff; box-shadow: 0 4px 8px rgba(0,0,0,0.35); display: flex; align-items: center; justify-content: center; color: #ffffff; font-weight: bold; font-size: 12px;">
            ${routeInfo.index}
          </div>
        `;
      } else {
        // Default POI marker
        pinHtml = `
          <div style="background-color: #0f766e; width: 28px; height: 28px; border-radius: 9999px; border: 2.5px solid #ffffff; box-shadow: 0 3px 6px rgba(0,0,0,0.3); display: flex; align-items: center; justify-content: center; color: #ffffff;">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
          </div>
        `;
      }

      const customIcon = L.divIcon({
        className: 'custom-pin',
        html: pinHtml,
        iconSize: [32, 32],
        iconAnchor: [16, 16],
        popupAnchor: [0, -18],
      });

      const marker = L.marker([loc.latitude, loc.longitude], { icon: customIcon });

      // Popup Content
      const navUrl = buildSingleLocationNavUrl(loc.latitude, loc.longitude);
      const popupDiv = document.createElement('div');
      popupDiv.className = 'text-slate-800 text-xs space-y-2';

      const imgHtml = loc.imageUrl
        ? `<div style="margin-bottom: 6px; border-radius: 8px; overflow: hidden; max-height: 110px; background: #f8fafc; border: 1px solid #e2e8f0;">
             <img src="${loc.imageUrl}" alt="${loc.name}" style="width: 100%; height: 95px; object-fit: cover; display: block;" />
           </div>`
        : '';

      popupDiv.innerHTML = `
        ${imgHtml}
        <div class="border-b border-slate-100 pb-1.5">
          <div class="flex items-center gap-1.5">
            <span class="inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold bg-teal-100 text-teal-800">
              ${loc.category || 'Survei'}
            </span>
          </div>
          <h4 class="font-bold text-sm text-slate-900 mt-1 leading-tight">${loc.name}</h4>
          <p class="font-mono text-[11px] text-slate-500 mt-0.5">${formatCoordinatePair(loc.latitude, loc.longitude)}</p>
          ${loc.address ? `<p class="text-[11px] text-slate-600 mt-1">${loc.address}</p>` : ''}
          ${loc.notes ? `<p class="text-[11px] text-slate-500 italic mt-0.5">Catatan: ${loc.notes}</p>` : ''}
        </div>
        <div class="flex flex-col gap-1.5 pt-1">
          <a href="${navUrl}" target="_blank" rel="noopener noreferrer" 
             style="display: flex; align-items: center; justify-content: center; gap: 4px; padding: 6px 10px; border-radius: 8px; background-color: #0f766e; color: #ffffff; font-weight: 600; text-decoration: none; font-size: 11px;">
            <span>Navigasi di Google Maps</span>
          </a>
          <div style="display: flex; gap: 4px;">
            <button id="btn-add-route-${loc.id}" 
                    style="flex: 1; padding: 5px 8px; border-radius: 8px; border: 1px solid #cbd5e1; background: #ffffff; font-size: 11px; font-weight: 500; cursor: pointer;">
              + Rute
            </button>
            <button id="btn-edit-${loc.id}" 
                    style="flex: 1; padding: 5px 8px; border-radius: 8px; border: 1px solid #cbd5e1; background: #f8fafc; font-size: 11px; font-weight: 500; cursor: pointer;">
              Edit
            </button>
          </div>
          <button id="btn-camera-${loc.id}" 
                  style="width: 100%; padding: 5px 8px; border-radius: 8px; border: 1px solid #0f766e; background: #f0fdfa; color: #0f766e; font-size: 11px; font-weight: 600; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 4px;">
            <span>📷 Kamera Titik & Panduan Rute</span>
          </button>
        </div>
      `;

      marker.bindPopup(popupDiv);

      marker.on('popupopen', () => {
        const btnAdd = document.getElementById(`btn-add-route-${loc.id}`);
        if (btnAdd) {
          btnAdd.onclick = () => {
            onAddToRouteRef.current(loc);
            marker.closePopup();
          };
        }
        const btnEdit = document.getElementById(`btn-edit-${loc.id}`);
        if (btnEdit) {
          btnEdit.onclick = () => {
            onEditLocationRef.current(loc);
            marker.closePopup();
          };
        }
        const btnCamera = document.getElementById(`btn-camera-${loc.id}`);
        if (btnCamera) {
          btnCamera.onclick = () => {
            onOpenRouteCameraRef.current?.(loc);
            marker.closePopup();
          };
        }
      });

      marker.addTo(markersGroup);

      if (focusedLocationId && loc.id === focusedLocationId) {
        leafletMapRef.current?.setView([loc.latitude, loc.longitude], 15);
        marker.openPopup();
      }
    });

    // Update active route polyline
    if (routePolylineRef.current) {
      leafletMapRef.current.removeLayer(routePolylineRef.current);
      routePolylineRef.current = null;
    }

    if (activeRoutePoints && activeRoutePoints.length >= 2) {
      const latLngs = activeRoutePoints.map((pt) => [pt.lat, pt.lng] as [number, number]);
      const polyline = L.polyline(latLngs, {
        color: '#0284c7',
        weight: 5,
        opacity: 0.8,
        dashArray: '8, 8',
      }).addTo(leafletMapRef.current);
      routePolylineRef.current = polyline;
    }

    // Auto fit bounds on initial load if locations exist and user hasn't focused a location
    if (!hasFittedInitialBoundsRef.current && locations.length > 0 && !focusedLocationId) {
      hasFittedInitialBoundsRef.current = true;
      try {
        const bounds = L.latLngBounds(locations.map((l) => [l.latitude, l.longitude]));
        leafletMapRef.current.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 });
      } catch (e) {
        // Safe fallback
      }
    }
  }, [locations, focusedLocationId, activeRoutePoints]);

  // Handle Geolocation (Lokasi Saya)
  const handleGetCurrentLocation = useCallback(() => {
    if (!leafletMapRef.current) return;
    setGeoError(null);

    if (!navigator.geolocation) {
      setGeoError('Perangkat tidak mendukung geolokasi GPS.');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude, accuracy } = position.coords;
        const map = leafletMapRef.current;
        if (!map) return;

        if (userLocationMarkerRef.current) {
          map.removeLayer(userLocationMarkerRef.current);
        }

        const userMarker = L.circleMarker([latitude, longitude], {
          radius: 9,
          fillColor: '#0284c7',
          color: '#ffffff',
          weight: 3,
          opacity: 1,
          fillOpacity: 0.9,
        }).addTo(map);

        userMarker.bindPopup(`
          <div style="font-size: 11px;">
            <strong>Lokasi Anda Saat Ini</strong><br/>
            Akurasi: ±${Math.round(accuracy)}m<br/>
            ${latitude.toFixed(6)}, ${longitude.toFixed(6)}
          </div>
        `).openPopup();

        userLocationMarkerRef.current = userMarker;
        map.setView([latitude, longitude], 15);
      },
      (error) => {
        let msg = 'Gagal mendeteksi lokasi.';
        if (error.code === error.PERMISSION_DENIED) {
          msg = 'Izin akses lokasi ditolak oleh browser.';
        } else if (error.code === error.POSITION_UNAVAILABLE) {
          msg = 'Sinyal GPS atau lokasi tidak tersedia.';
        } else if (error.code === error.TIMEOUT) {
          msg = 'Waktu permintaan lokasi habis.';
        }
        setGeoError(msg);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 10000 }
    );
  }, []);

  // Fit All Bounds
  const handleFitAllMarkers = () => {
    if (!leafletMapRef.current || locations.length === 0) return;
    const bounds = L.latLngBounds(locations.map((l) => [l.latitude, l.longitude]));
    leafletMapRef.current.fitBounds(bounds, { padding: [40, 40], maxZoom: 16 });
  };

  const handleZoomIn = () => {
    leafletMapRef.current?.zoomIn();
  };

  const handleZoomOut = () => {
    leafletMapRef.current?.zoomOut();
  };

  return (
    <div className="relative w-full h-[calc(100vh-8.5rem)] min-h-[420px] bg-slate-100 overflow-hidden">
      {/* Map Container */}
      <div ref={mapContainerRef} className="w-full h-full" />

      {/* Tile Error Alert */}
      {tileError && (
        <div className="absolute top-3 left-3 right-3 z-20 p-2.5 rounded-xl bg-amber-500/95 text-white text-xs shadow-md flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            <span>Tile peta gagal dimuat. Periksa koneksi internet Anda.</span>
          </div>
          <button
            onClick={() => setTileError(false)}
            className="text-white/80 hover:text-white px-2 py-0.5 rounded font-bold"
          >
            Tutup
          </button>
        </div>
      )}

      {/* Geolocation Error Alert */}
      {geoError && (
        <div className="absolute top-3 left-3 right-3 z-20 p-2.5 rounded-xl bg-rose-600 text-white text-xs shadow-md flex items-center justify-between">
          <span>{geoError}</span>
          <button
            onClick={() => setGeoError(null)}
            className="text-white/80 hover:text-white px-2 py-0.5 font-bold"
          >
            ✕
          </button>
        </div>
      )}

      {/* Ergonomic Floating Controls (Right side) */}
      <div className="absolute right-3 top-3 z-20 flex flex-col gap-2">
        <button
          onClick={handleGetCurrentLocation}
          title="Lokasi Saya"
          className="w-10 h-10 rounded-xl bg-white shadow-md border border-slate-200 text-slate-700 hover:text-teal-700 hover:bg-slate-50 flex items-center justify-center transition active:scale-95"
        >
          <Crosshair className="w-5 h-5 text-teal-600" />
        </button>

        <button
          onClick={handleFitAllMarkers}
          title="Tampilkan Semua Titik"
          className="w-10 h-10 rounded-xl bg-white shadow-md border border-slate-200 text-slate-700 hover:text-teal-700 hover:bg-slate-50 flex items-center justify-center transition active:scale-95"
        >
          <Maximize2 className="w-4 h-4" />
        </button>

        <div className="flex flex-col bg-white rounded-xl shadow-md border border-slate-200 overflow-hidden">
          <button
            onClick={handleZoomIn}
            title="Perbesar"
            className="w-10 h-9 text-slate-700 hover:bg-slate-50 flex items-center justify-center border-b border-slate-100 active:scale-95 transition"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
          <button
            onClick={handleZoomOut}
            title="Perkecil"
            className="w-10 h-9 text-slate-700 hover:bg-slate-50 flex items-center justify-center active:scale-95 transition"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Tap Map Hint Pill */}
      <div className="absolute top-3 left-3 z-20 pointer-events-none">
        <div className="bg-slate-900/80 backdrop-blur-sm text-white px-3 py-1.5 rounded-full text-[11px] font-medium shadow-md flex items-center gap-1.5">
          <MapPin className="w-3.5 h-3.5 text-teal-400" />
          <span>Ketuk peta untuk ambil koordinat</span>
        </div>
      </div>

      {/* Active Route Floating Banner on MapView */}
      {activeRoutePoints && activeRoutePoints.length >= 2 && !pickedCoords && (
        <div className="absolute bottom-4 left-3 right-3 z-20 max-w-md mx-auto bg-slate-900/90 backdrop-blur-md rounded-2xl shadow-xl border border-teal-500/40 p-3 text-white animate-in fade-in slide-in-from-bottom-2">
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="w-2.5 h-2.5 rounded-full bg-teal-400 animate-pulse flex-shrink-0" />
              <span className="text-xs font-bold text-teal-300 truncate">
                Rute Aktif ({activeRoutePoints.length} Titik)
              </span>
            </div>
            <span className="text-[10px] text-slate-300 font-mono bg-slate-800 px-2 py-0.5 rounded-md border border-slate-700 truncate max-w-[170px]">
              {activeRoutePoints[0].label || 'Awal'} ➔ {activeRoutePoints[activeRoutePoints.length - 1].label || 'Akhir'}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <a
              href={buildMultiStopRouteUrl(
                { lat: activeRoutePoints[0].lat, lng: activeRoutePoints[0].lng },
                { lat: activeRoutePoints[activeRoutePoints.length - 1].lat, lng: activeRoutePoints[activeRoutePoints.length - 1].lng },
                activeRoutePoints.slice(1, -1).map((w) => ({ lat: w.lat, lng: w.lng })),
                'driving'
              )}
              target="_blank"
              rel="noopener noreferrer"
              className="py-2 px-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 active:bg-teal-800 text-white text-[11px] font-bold flex items-center justify-center gap-1.5 shadow-sm transition"
              title="Buka navigasi seluruh rute di aplikasi Google Maps"
            >
              <Navigation className="w-3.5 h-3.5" />
              <span>Navigasi G-Maps</span>
              <ExternalLink className="w-3 h-3 opacity-80" />
            </a>

            <button
              onClick={() => {
                const firstLoc = locations.find((l) => l.id === activeRoutePoints[0].id) || locations[0];
                if (firstLoc) {
                  onOpenRouteCamera?.(firstLoc);
                }
              }}
              className="py-2 px-2.5 rounded-xl bg-gradient-to-r from-sky-600 to-teal-600 hover:from-sky-700 hover:to-teal-700 text-white text-[11px] font-bold flex items-center justify-center gap-1.5 shadow-sm transition"
              title="Buka Mode Kamera & Panduan Rute untuk rute ini"
            >
              <Camera className="w-3.5 h-3.5" />
              <span>Mode Kamera</span>
            </button>
          </div>
        </div>
      )}

      {/* Picked Coordinates Action Bar */}
      {pickedCoords && (
        <div className="absolute bottom-4 left-3 right-3 z-30 max-w-sm mx-auto bg-white rounded-2xl shadow-xl border border-teal-200 p-3.5 animate-in fade-in slide-in-from-bottom-2">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-ping" />
              <span className="text-xs font-bold text-slate-900">Titik Dipilih dari Peta</span>
            </div>
            <button
              onClick={() => {
                setPickedCoords(null);
                if (pickedMarkerRef.current && leafletMapRef.current) {
                  leafletMapRef.current.removeLayer(pickedMarkerRef.current);
                  pickedMarkerRef.current = null;
                }
              }}
              className="text-xs text-slate-400 hover:text-slate-600 font-semibold"
            >
              Batal
            </button>
          </div>
          <p className="font-mono text-xs text-slate-600 mb-3 bg-slate-50 p-2 rounded-lg border border-slate-200">
            {formatCoordinatePair(pickedCoords.lat, pickedCoords.lng)}
          </p>
          <button
            onClick={() => {
              onOpenAddModalWithCoords(pickedCoords);
              setPickedCoords(null);
              if (pickedMarkerRef.current && leafletMapRef.current) {
                leafletMapRef.current.removeLayer(pickedMarkerRef.current);
                pickedMarkerRef.current = null;
              }
            }}
            className="w-full py-2.5 px-3 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold flex items-center justify-center gap-1.5 shadow-sm transition"
          >
            <PlusCircle className="w-4 h-4" />
            <span>Gunakan Koordinat Ini untuk Tambah Lokasi</span>
          </button>
        </div>
      )}
    </div>
  );
};

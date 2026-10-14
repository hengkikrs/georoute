'use client';

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  X,
  Camera,
  Navigation,
  ExternalLink,
  MapPin,
  Check,
  ArrowRight,
  Maximize2,
  Sliders,
  Layers,
  Image as ImageIcon,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
  Loader2,
  Sparkles,
  RotateCcw,
  ClipboardPaste,
  Download,
} from 'lucide-react';
import dynamic from 'next/dynamic';
import { LocationPoint } from '@/types/location';
import { formatCoordinatePair, calculatePathDistanceKm } from '@/utils/coordinateValidation';
import { processAndCompressImage } from '@/lib/imageUtils';
import { saveSingleLocation } from '@/services/locationStorage';
import { buildMultiStopRouteUrl, buildSingleLocationNavUrl } from '@/services/googleMapsUrl';
import { ImageViewerModal } from '@/components/ImageViewerModal';
import { exportEditedPhotosCsv, downloadFile } from '@/services/csvService';
import { uploadImageToServer } from '@/services/cloudSyncService';

// Dynamically import CameraRouteMap to avoid Leaflet SSR issues
const CameraRouteMap = dynamic(
  () => import('@/components/CameraRouteMap').then((mod) => mod.CameraRouteMap),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-full min-h-[260px] bg-slate-900/90 rounded-2xl flex flex-col items-center justify-center text-teal-400 gap-2">
        <div className="w-6 h-6 border-2 border-teal-500 border-t-transparent rounded-full animate-spin" />
        <span className="text-xs">Memuat Rute Google Maps...</span>
      </div>
    ),
  }
);

export type CameraViewMode = 'split' | 'overlay' | 'camera_only' | 'map_only';

interface RouteCameraModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialLocation: LocationPoint | null;
  routeLocations?: LocationPoint[]; // Full ordered route stops
  onPhotoSaved?: (updatedLocation: LocationPoint) => void;
  onShowToast?: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

export const RouteCameraModal: React.FC<RouteCameraModalProps> = ({
  isOpen,
  onClose,
  initialLocation,
  routeLocations = [],
  onPhotoSaved,
  onShowToast,
}) => {
  // Current active location being photographed
  const [overrideLocId, setOverrideLocId] = useState<string | null>(null);
  const activeLocId = overrideLocId ?? initialLocation?.id ?? null;
  const setActiveLocId = (id: string | null) => {
    setOverrideLocId(id);
    setCapturedPhotoUrl(null);
  };

  // Derived current stop and next stop
  const orderedLocations = useMemo(() => {
    if (routeLocations && routeLocations.length > 0) return routeLocations;
    if (initialLocation) return [initialLocation];
    return [];
  }, [routeLocations, initialLocation]);

  const currentIndex = useMemo(() => {
    if (!activeLocId) return 0;
    const idx = orderedLocations.findIndex((l) => l.id === activeLocId);
    return idx >= 0 ? idx : 0;
  }, [orderedLocations, activeLocId]);

  const currentLocation = useMemo(() => {
    return orderedLocations[currentIndex] || initialLocation || null;
  }, [orderedLocations, currentIndex, initialLocation]);

  const nextLocation = useMemo(() => {
    if (currentIndex + 1 < orderedLocations.length) {
      return orderedLocations[currentIndex + 1];
    }
    return null;
  }, [orderedLocations, currentIndex]);

  // View mode & transparency
  const [viewMode, setViewMode] = useState<CameraViewMode>('split');
  const [mapOpacity, setMapOpacity] = useState<number>(0.65); // Default "agak transparan" (65%)

  // Captured photo preview state
  const [capturedPhotoUrl, setCapturedPhotoUrl] = useState<string | null>(null);
  const [isProcessingPhoto, setIsProcessingPhoto] = useState<boolean>(false);
  const [isSavingPhoto, setIsSavingPhoto] = useState<boolean>(false);
  const [fullViewerUrl, setFullViewerUrl] = useState<string | null>(null);

  // File input refs for native camera intent & gallery
  const nativeCameraInputRef = useRef<HTMLInputElement>(null);
  const nativeGalleryInputRef = useRef<HTMLInputElement>(null);

  // Calculate distance between current and next location
  const distanceToNextKm = useMemo(() => {
    if (!currentLocation || !nextLocation) return null;
    const dist = calculatePathDistanceKm([
      { latitude: currentLocation.latitude, longitude: currentLocation.longitude },
      { latitude: nextLocation.latitude, longitude: nextLocation.longitude },
    ]);
    return dist > 0 ? dist.toFixed(2) : '0';
  }, [currentLocation, nextLocation]);

  // Google Maps navigation url
  const gmapsNavUrl = useMemo(() => {
    if (!currentLocation) return '#';
    if (nextLocation) {
      return buildMultiStopRouteUrl(
        { lat: currentLocation.latitude, lng: currentLocation.longitude },
        { lat: nextLocation.latitude, lng: nextLocation.longitude },
        [],
        'driving'
      );
    }
    return buildSingleLocationNavUrl(currentLocation.latitude, currentLocation.longitude);
  }, [currentLocation, nextLocation]);

  // Common photo processor for camera, gallery, or clipboard paste
  const processAndSetCapturedPhoto = useCallback(
    async (file: File, sourceName = 'Foto') => {
      setIsProcessingPhoto(true);
      try {
        const compressed = await processAndCompressImage(file, {
          maxWidth: 1280,
          maxHeight: 1280,
          quality: 0.82,
        });
        setCapturedPhotoUrl(compressed);
        onShowToast?.(`${sourceName} berhasil diambil dan siap disimpan!`, 'success');
      } catch (err) {
        console.error('File compression error:', err);
        onShowToast?.(`Gagal memproses gambar (${sourceName}).`, 'error');
      } finally {
        setIsProcessingPhoto(false);
      }
    },
    [onShowToast, setCapturedPhotoUrl]
  );

  // Handle native camera capture or gallery selection
  const handlePhotoFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await processAndSetCapturedPhoto(file, 'Foto');
    e.target.value = '';
  };

  // Trigger camera intent directly
  const handleTriggerCamera = () => {
    nativeCameraInputRef.current?.click();
  };

  // Trigger gallery picker directly
  const handleTriggerGallery = () => {
    nativeGalleryInputRef.current?.click();
  };

  // Handle paste from clipboard / screenshot
  const handlePasteFromClipboard = async () => {
    try {
      if (!navigator.clipboard || !navigator.clipboard.read) {
        onShowToast?.('Gunakan tombol Ctrl+V (atau Cmd+V) di keyboard untuk menempelkan screenshot langsung.', 'info');
        return;
      }
      const items = await navigator.clipboard.read();
      let found = false;
      for (const item of items) {
        for (const type of item.types) {
          if (type.startsWith('image/')) {
            const blob = await item.getType(type);
            const file = new File([blob], `screenshot_${Date.now()}.png`, { type });
            await processAndSetCapturedPhoto(file, 'Screenshot dari clipboard');
            found = true;
            break;
          }
        }
        if (found) break;
      }
      if (!found) {
        onShowToast?.('Tidak ada gambar di clipboard. Copy screenshot terlebih dahulu, lalu klik tombol ini atau tekan Ctrl+V.', 'info');
      }
    } catch (err) {
      console.warn('Clipboard read error:', err);
      onShowToast?.('Silakan tekan Ctrl+V di keyboard untuk menempelkan foto.', 'info');
    }
  };

  // Global Ctrl+V listener while RouteCameraModal is open
  useEffect(() => {
    if (!isOpen) return;

    const handlePaste = async (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.type.startsWith('image/')) {
          e.preventDefault();
          const file = item.getAsFile();
          if (file) {
            await processAndSetCapturedPhoto(file, 'Screenshot (Ctrl+V)');
            break;
          }
        }
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [isOpen, processAndSetCapturedPhoto]);

  // Save photo to current location and sync to server for HP & Laptop
  const handleSavePhoto = async (advanceToNext: boolean = false) => {
    if (!currentLocation || !capturedPhotoUrl) return;

    setIsSavingPhoto(true);
    try {
      let finalPhotoUrl = capturedPhotoUrl;
      try {
        const serverUrl = await uploadImageToServer(capturedPhotoUrl);
        if (serverUrl && serverUrl !== capturedPhotoUrl) {
          finalPhotoUrl = serverUrl;
        }
      } catch {
        // fallback
      }

      const updated = saveSingleLocation(
        {
          ...currentLocation,
          imageUrl: finalPhotoUrl,
          images: [finalPhotoUrl],
        },
        currentLocation.id
      );

      onPhotoSaved?.(updated);
      onShowToast?.(`Foto berhasil disimpan untuk "${currentLocation.name}" (Tersinkron ke HP & Laptop)!`, 'success');
      setCapturedPhotoUrl(null);

      // Advance to next stop if requested
      if (advanceToNext && nextLocation) {
        setActiveLocId(nextLocation.id);
        onShowToast?.(`Beralih ke Titik Selanjutnya: "${nextLocation.name}"`, 'info');
      }
    } catch (err) {
      console.error('Save photo error:', err);
      onShowToast?.('Gagal menyimpan foto.', 'error');
    } finally {
      setIsSavingPhoto(false);
    }
  };

  // Download photo CSV for route locations
  const handleDownloadPhotoCsv = (onlyWithPhotos = false) => {
    const listToExport = orderedLocations.length > 0 ? orderedLocations : (currentLocation ? [currentLocation] : []);
    const csvContent = exportEditedPhotosCsv(listToExport, onlyWithPhotos);
    const dateStr = new Date().toISOString().split('T')[0];
    const filename = onlyWithPhotos
      ? `georoute_rute_foto_${dateStr}.csv`
      : `georoute_panduan_rute_lengkap_${dateStr}.csv`;
    downloadFile(csvContent, filename, 'text/csv;charset=utf-8;');
    onShowToast?.('File CSV hasil foto rute berhasil diunduh.', 'success');
  };

  if (!isOpen || !currentLocation) return null;

  // Active display image (either newly captured or existing on location)
  const displayImage = capturedPhotoUrl || currentLocation.imageUrl || null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/85 backdrop-blur-md p-0 sm:p-4 overflow-hidden">
      {/* Modal Dialog Card */}
      <div
        className="w-full max-w-5xl h-[92dvh] sm:h-[90vh] max-h-[96dvh] rounded-t-3xl sm:rounded-3xl bg-slate-950 border border-slate-800 text-slate-100 shadow-2xl flex flex-col overflow-hidden animate-in fade-in slide-in-from-bottom-4 sm:zoom-in-95"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ===================== MODAL HEADER (Sticky Top) ===================== */}
        <div className="px-4 pt-2.5 pb-3 sm:px-6 sm:py-3.5 bg-slate-900 border-b border-slate-800 flex-shrink-0 z-20">
          {/* Mobile drag handle bar */}
          <div className="w-10 h-1 bg-slate-700/80 rounded-full mx-auto mb-2 sm:hidden" />

          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-teal-500/20 text-teal-400 border border-teal-500/30 flex items-center justify-center flex-shrink-0">
                <Camera className="w-4 h-4 sm:w-5 sm:h-5" />
              </div>
              <div className="min-w-0">
                <h2 className="text-sm sm:text-base font-bold text-white flex items-center gap-2 truncate">
                  <span className="truncate">Kamera Titik & Panduan Rute</span>
                  <span className="hidden sm:inline-block px-2 py-0.5 rounded-full bg-teal-500/20 text-teal-300 text-[11px] font-semibold border border-teal-500/30 flex-shrink-0">
                    Google Maps HUD
                  </span>
                </h2>
                <p className="text-[11px] text-slate-400 truncate">
                  Foto titik lokasi dengan panduan rute Google Maps (transparan / berdampingan)
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                type="button"
                onClick={() => handleDownloadPhotoCsv(true)}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-purple-900/60 hover:bg-purple-900/90 text-purple-200 border border-purple-700/50 text-xs font-semibold transition"
                title="Unduh CSV Hasil Foto yang sudah diedit/didokumentasikan"
              >
                <Download className="w-3.5 h-3.5 text-purple-400" />
                <span className="hidden sm:inline">CSV Foto</span>
              </button>

              <a
                href={gmapsNavUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-2.5 py-1.5 sm:px-3 sm:py-1.5 rounded-xl bg-teal-600/90 hover:bg-teal-600 text-white text-xs font-semibold shadow-sm transition"
                title="Buka rute di aplikasi Google Maps"
              >
                <Navigation className="w-3.5 h-3.5" />
                <span className="hidden xs:inline sm:inline">Google Maps</span>
                <ExternalLink className="w-3 h-3 opacity-80" />
              </a>

              <button
                type="button"
                onClick={onClose}
                className="p-1.5 sm:p-2 rounded-xl bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700 transition"
                title="Tutup Modal"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>

        {/* ===================== SCROLLABLE CONTENT BODY (Fully Responsive on Mobile) ===================== */}
        <div className="flex-1 overflow-y-auto overscroll-contain p-3 sm:p-5 space-y-3.5 sm:space-y-4 pb-16 sm:pb-8">
          {/* 1. Controls, Mode & Transparency Toolbar */}
          <div className="bg-slate-900/90 border border-slate-800/90 p-2.5 sm:p-3 rounded-2xl flex flex-col gap-2.5 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2.5">
              {/* Mode Switcher Tabs */}
              <div className="grid grid-cols-2 xs:flex sm:flex items-center gap-1 bg-slate-800/80 p-1 rounded-xl border border-slate-700/60 w-full xs:w-auto">
                <button
                  type="button"
                  onClick={() => setViewMode('split')}
                  className={`px-2.5 py-1.5 rounded-lg font-semibold transition text-center ${
                    viewMode === 'split'
                      ? 'bg-teal-600 text-white shadow-xs'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Berdampingan
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('overlay')}
                  className={`px-2.5 py-1.5 rounded-lg font-semibold flex items-center justify-center gap-1 transition text-center ${
                    viewMode === 'overlay'
                      ? 'bg-teal-600 text-white shadow-xs'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Layers className="w-3.5 h-3.5" />
                  <span>Overlay</span>
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('camera_only')}
                  className={`px-2.5 py-1.5 rounded-lg font-semibold transition text-center ${
                    viewMode === 'camera_only'
                      ? 'bg-teal-600 text-white shadow-xs'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Hanya Kamera
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('map_only')}
                  className={`px-2.5 py-1.5 rounded-lg font-semibold transition text-center ${
                    viewMode === 'map_only'
                      ? 'bg-teal-600 text-white shadow-xs'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Hanya Peta
                </button>
              </div>

              {/* Multi-Stop Stepper Navigation (if multiple locations in route) */}
              {orderedLocations.length > 1 && (
                <div className="flex items-center gap-1 bg-slate-800/80 px-2 py-1 rounded-xl border border-slate-700/60 ml-auto">
                  <button
                    type="button"
                    disabled={currentIndex === 0}
                    onClick={() => {
                      if (currentIndex > 0) {
                        setActiveLocId(orderedLocations[currentIndex - 1].id);
                      }
                    }}
                    className="p-1 rounded-lg text-slate-300 hover:text-white disabled:opacity-30 disabled:pointer-events-none"
                    title="Titik Sebelumnya"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="text-[11px] font-bold text-teal-300 px-1 whitespace-nowrap">
                    Stop {currentIndex + 1} / {orderedLocations.length}
                  </span>
                  <button
                    type="button"
                    disabled={currentIndex >= orderedLocations.length - 1}
                    onClick={() => {
                      if (currentIndex < orderedLocations.length - 1) {
                        setActiveLocId(orderedLocations[currentIndex + 1].id);
                      }
                    }}
                    className="p-1 rounded-lg text-slate-300 hover:text-white disabled:opacity-30 disabled:pointer-events-none"
                    title="Titik Selanjutnya"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>

            {/* Transparency Control Slider & Presets */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-800/70">
              <div className="flex items-center gap-2 flex-1 min-w-[200px]">
                <Sliders className="w-3.5 h-3.5 text-teal-400 flex-shrink-0" />
                <span className="text-[11px] text-slate-300 font-medium whitespace-nowrap">
                  Transparansi Peta:
                </span>
                <input
                  type="range"
                  min="0.2"
                  max="1.0"
                  step="0.05"
                  value={mapOpacity}
                  onChange={(e) => setMapOpacity(parseFloat(e.target.value))}
                  className="flex-1 max-w-[140px] sm:max-w-[200px] accent-teal-500 cursor-pointer"
                />
                <span className="font-mono text-teal-400 font-bold text-[11px] w-9 text-right">
                  {Math.round(mapOpacity * 100)}%
                </span>
              </div>

              {/* Quick transparency presets */}
              <div className="flex items-center gap-1">
                {[0.4, 0.65, 0.85, 1.0].map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setMapOpacity(preset)}
                    className={`px-2 py-0.5 rounded-md text-[10px] font-semibold transition ${
                      Math.abs(mapOpacity - preset) < 0.05
                        ? 'bg-teal-500/30 text-teal-300 border border-teal-500/50'
                        : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {Math.round(preset * 100)}%
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* 2. Side-by-Side Location Cards (Point #1 and Point #2) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* Card 1: Titik Sedang Difoto (Point #1 / Active Target) */}
            <div className="p-3 sm:p-3.5 rounded-2xl bg-gradient-to-br from-emerald-950/60 to-slate-900 border border-emerald-500/40 shadow-inner flex flex-col justify-between gap-2.5">
              <div>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[10px] font-extrabold uppercase tracking-wide">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                    <span>Titik Sedang Difoto • Stop #{currentIndex + 1}</span>
                  </div>

                  {currentLocation.category && (
                    <span className="px-2 py-0.5 rounded-md bg-slate-800 text-slate-300 text-[10px] font-medium border border-slate-700">
                      {currentLocation.category}
                    </span>
                  )}
                </div>

                <h3 className="text-sm sm:text-base font-extrabold text-white mt-1.5 truncate">
                  {currentLocation.name}
                </h3>

                <p className="text-[11px] font-mono text-emerald-300/80 mt-0.5">
                  {formatCoordinatePair(currentLocation.latitude, currentLocation.longitude)}
                </p>

                {currentLocation.address && (
                  <p className="text-[11px] text-slate-300 line-clamp-1 mt-1">
                    📍 {currentLocation.address}
                  </p>
                )}
              </div>

              {/* Photo Status on Card 1 */}
              <div className="pt-2 border-t border-emerald-500/20 flex items-center justify-between gap-2">
                {currentLocation.imageUrl || capturedPhotoUrl ? (
                  <div className="flex items-center gap-2">
                    <div
                      onClick={() =>
                        setFullViewerUrl(capturedPhotoUrl || currentLocation.imageUrl!)
                      }
                      className="w-8 h-8 rounded-lg overflow-hidden border border-emerald-400/50 bg-slate-800 cursor-pointer hover:ring-2 hover:ring-emerald-400 transition"
                      title="Klik untuk melihat foto"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={capturedPhotoUrl || currentLocation.imageUrl}
                        alt={currentLocation.name}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div>
                      <span className="text-[10px] font-bold text-emerald-400 flex items-center gap-1">
                        <ShieldCheck className="w-3 h-3" />
                        {capturedPhotoUrl ? 'Foto Baru Terambil' : 'Foto Sudah Tersimpan'}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          setFullViewerUrl(capturedPhotoUrl || currentLocation.imageUrl!)
                        }
                        className="text-[10px] text-slate-400 hover:text-emerald-300 underline"
                      >
                        Lihat Foto Penuh
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 text-[11px] text-emerald-300/90 font-medium">
                    <Sparkles className="w-3.5 h-3.5 text-teal-400 flex-shrink-0" />
                    <span className="line-clamp-1">Siap difoto. Ketuk tombol kamera untuk memfoto.</span>
                  </div>
                )}

                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <a
                    href={buildSingleLocationNavUrl(currentLocation.latitude, currentLocation.longitude)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 px-2 py-1 rounded-lg bg-teal-800/80 hover:bg-teal-700 text-teal-200 text-xs font-semibold transition shadow-xs"
                    title="Buka Navigasi Google Maps ke titik ini"
                  >
                    <Navigation className="w-3 h-3 text-teal-300" />
                    <span>Navigasi</span>
                  </a>

                  <button
                    type="button"
                    onClick={handleTriggerCamera}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-600/90 hover:bg-emerald-600 text-white text-xs font-bold transition flex-shrink-0 shadow-xs"
                  >
                    <Camera className="w-3.5 h-3.5" />
                    <span>Foto</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Card 2: Titik Selanjutnya (Point #2 / Stop Kedua / Foto Setelah Ini) */}
            <div className="p-3 sm:p-3.5 rounded-2xl bg-gradient-to-br from-sky-950/50 to-slate-900 border border-sky-500/40 shadow-inner flex flex-col justify-between gap-2.5">
              {nextLocation ? (
                <>
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-sky-500/20 text-sky-300 border border-sky-500/40 text-[10px] font-extrabold uppercase tracking-wide">
                        <ArrowRight className="w-3 h-3 text-sky-400" />
                        <span>Titik Selanjutnya • Stop #{currentIndex + 2}</span>
                      </div>

                      {distanceToNextKm && (
                        <span className="px-2 py-0.5 rounded-md bg-sky-500/30 text-sky-200 font-mono text-[10px] font-bold border border-sky-400/30">
                          📏 ±{distanceToNextKm} km
                        </span>
                      )}
                    </div>

                    <h3 className="text-sm sm:text-base font-extrabold text-white mt-1.5 truncate">
                      {nextLocation.name}
                    </h3>

                    <p className="text-[11px] font-mono text-sky-300/80 mt-0.5">
                      {formatCoordinatePair(nextLocation.latitude, nextLocation.longitude)}
                    </p>

                    {nextLocation.address && (
                      <p className="text-[11px] text-slate-300 line-clamp-1 mt-1">
                        🏁 {nextLocation.address}
                      </p>
                    )}
                  </div>

                  <div className="pt-2 border-t border-sky-500/20 flex items-center justify-between gap-2">
                    <span className="text-[10px] text-slate-400 line-clamp-1">
                      Titik perhentian kedua atau foto setelah ini
                    </span>

                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <a
                        href={buildSingleLocationNavUrl(nextLocation.latitude, nextLocation.longitude)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 px-2 py-1 rounded-lg bg-sky-800/80 hover:bg-sky-700 text-sky-200 text-xs font-semibold transition shadow-xs"
                        title="Buka Navigasi Google Maps ke titik ini"
                      >
                        <Navigation className="w-3 h-3 text-sky-300" />
                        <span>Navigasi</span>
                      </a>

                      <button
                        type="button"
                        onClick={() => {
                          setActiveLocId(nextLocation.id);
                          onShowToast?.(`Beralih memfoto titik: "${nextLocation.name}"`, 'info');
                        }}
                        className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-sky-600/80 hover:bg-sky-600 text-white text-xs font-bold transition shadow-xs flex-shrink-0"
                        title="Ganti ke titik ini sebagai target foto saat ini"
                      >
                        <span>Pilih Titik Ini</span>
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </>
              ) : (
                <div className="h-full min-h-[90px] flex flex-col items-center justify-center text-center p-3 text-slate-400 gap-1.5">
                  <Check className="w-6 h-6 text-emerald-400" />
                  <h4 className="text-xs font-bold text-slate-200">Titik Terakhir dalam Rute</h4>
                  <p className="text-[10px] text-slate-400">
                    Tidak ada titik perhentian kedua setelah ini.
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* 3. Main Viewport Display: Responsive Camera & Google Maps Container */}
          <div className="w-full">
            {/* Split Mode: Stack on mobile, side-by-side on desktop */}
            {viewMode === 'split' && (
              <div className="flex flex-col md:grid md:grid-cols-2 gap-3.5">
                {/* Camera Viewport */}
                <div className="w-full h-[280px] sm:h-[340px] md:h-[420px] relative rounded-2xl overflow-hidden bg-slate-900 border border-slate-800 flex items-center justify-center shadow-lg">
                  {displayImage ? (
                    /* Display Captured or Stored Photo */
                    <div className="relative w-full h-full flex items-center justify-center bg-black group">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={displayImage}
                        alt={currentLocation.name}
                        className="w-full h-full object-cover"
                      />

                      {/* Survey Stamp Watermark */}
                      <div className="absolute top-3 left-3 right-3 flex items-start justify-between pointer-events-none z-10 gap-2">
                        <div className="px-2.5 py-1.5 rounded-xl bg-black/80 backdrop-blur-md border border-white/20 text-white text-[11px] max-w-[85%] shadow-lg">
                          <p className="font-extrabold text-teal-400 flex items-center gap-1.5 truncate">
                            <MapPin className="w-3.5 h-3.5 flex-shrink-0" />
                            <span className="truncate">{currentLocation.name}</span>
                          </p>
                          <p className="font-mono text-[10px] text-slate-300">
                            {formatCoordinatePair(currentLocation.latitude, currentLocation.longitude)}
                          </p>
                        </div>

                        <button
                          type="button"
                          onClick={() => setFullViewerUrl(displayImage)}
                          className="pointer-events-auto p-2 rounded-xl bg-black/75 hover:bg-black/95 text-white border border-white/20 backdrop-blur-md transition shadow-md"
                          title="Lihat Penuh"
                        >
                          <Maximize2 className="w-4 h-4" />
                        </button>
                      </div>

                      {/* Retake & Replace Overlay Buttons */}
                      <div className="absolute bottom-3 left-3 right-3 flex items-center justify-center pointer-events-auto z-10 gap-1.5 flex-wrap">
                        <button
                          type="button"
                          onClick={handlePasteFromClipboard}
                          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-purple-600/95 hover:bg-purple-600 active:bg-purple-700 text-white text-xs font-bold shadow-xl backdrop-blur-md transition"
                          title="Paste screenshot baru dari clipboard (Ctrl+V)"
                        >
                          <ClipboardPaste className="w-3.5 h-3.5 text-purple-200" />
                          <span>Paste Screenshot</span>
                        </button>
                        <button
                          type="button"
                          onClick={handleTriggerCamera}
                          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-teal-600/95 hover:bg-teal-600 active:bg-teal-700 text-white text-xs font-bold shadow-xl backdrop-blur-md transition"
                        >
                          <Camera className="w-3.5 h-3.5" />
                          <span>Foto Ulang</span>
                        </button>
                        <button
                          type="button"
                          onClick={handleTriggerGallery}
                          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-900/90 hover:bg-black text-slate-200 text-xs font-semibold border border-white/20 backdrop-blur-md transition"
                        >
                          <ImageIcon className="w-3.5 h-3.5 text-sky-400" />
                          <span>Galeri</span>
                        </button>
                      </div>
                    </div>
                  ) : (
                    /* Ready to Snap Photo Viewfinder HUD */
                    <div
                      className="relative w-full h-full flex flex-col items-center justify-center p-4 bg-radial from-slate-900 to-slate-950 cursor-pointer select-none"
                      onClick={handleTriggerCamera}
                    >
                      {/* Viewfinder crosshair HUD reticle */}
                      <div className="absolute inset-5 sm:inset-8 border border-teal-500/30 rounded-2xl pointer-events-none flex items-center justify-center">
                        <div className="w-5 h-5 border-t-2 border-l-2 border-teal-400 absolute top-0 left-0" />
                        <div className="w-5 h-5 border-t-2 border-r-2 border-teal-400 absolute top-0 right-0" />
                        <div className="w-5 h-5 border-b-2 border-l-2 border-teal-400 absolute bottom-0 left-0" />
                        <div className="w-5 h-5 border-b-2 border-r-2 border-teal-400 absolute bottom-0 right-0" />

                        {/* Center focus circle */}
                        <div className="w-14 h-14 rounded-full border border-teal-400/40 flex items-center justify-center">
                          <div className="w-2 h-2 rounded-full bg-teal-400 animate-ping" />
                        </div>
                      </div>

                      {/* Top HUD Badge */}
                      <div className="absolute top-3 left-3 right-3 flex items-center justify-between pointer-events-none z-10">
                        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-black/75 backdrop-blur-md text-white text-[11px] font-semibold border border-white/20">
                          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                          <span>Kamera Siap</span>
                        </div>

                        <div className="pointer-events-auto flex items-center gap-1">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handlePasteFromClipboard();
                            }}
                            className="px-2.5 py-1 rounded-lg bg-purple-900/80 hover:bg-purple-800 text-purple-200 text-[11px] font-semibold border border-purple-500/40 flex items-center gap-1 transition"
                            title="Paste Screenshot (Ctrl+V)"
                          >
                            <ClipboardPaste className="w-3.5 h-3.5 text-purple-300" />
                            <span>Paste (Ctrl+V)</span>
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleTriggerGallery();
                            }}
                            className="px-2.5 py-1 rounded-lg bg-black/75 hover:bg-black text-white text-[11px] font-semibold border border-white/20 flex items-center gap-1.5 transition"
                            title="Pilih dari Galeri"
                          >
                            <ImageIcon className="w-3.5 h-3.5 text-sky-400" />
                            <span>Galeri</span>
                          </button>
                        </div>
                      </div>

                      {/* Center Content: Camera Trigger & Paste Buttons */}
                      <div className="z-10 flex flex-col items-center justify-center text-center gap-2.5 max-w-xs">
                        <div className="w-14 h-14 rounded-2xl bg-teal-500/20 text-teal-300 border-2 border-teal-400/60 shadow-2xl flex items-center justify-center hover:scale-105 active:scale-95 transition">
                          <Camera className="w-7 h-7 text-teal-400" />
                        </div>

                        <div>
                          <h4 className="text-xs sm:text-sm font-bold text-white">Ambil Foto Titik Ini</h4>
                          <p className="text-[11px] text-teal-300/90 font-medium truncate max-w-[220px]">
                            {currentLocation.name}
                          </p>
                        </div>

                        <div className="flex flex-wrap items-center justify-center gap-2">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleTriggerCamera();
                            }}
                            className="flex items-center justify-center gap-1.5 py-2.5 px-4 rounded-xl bg-gradient-to-r from-teal-500 to-emerald-600 hover:from-teal-600 hover:to-emerald-700 active:scale-95 text-white font-extrabold text-xs shadow-xl transition"
                          >
                            <Camera className="w-4 h-4" />
                            <span>Kamera</span>
                          </button>

                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handlePasteFromClipboard();
                            }}
                            className="flex items-center justify-center gap-1.5 py-2.5 px-3.5 rounded-xl bg-purple-600 hover:bg-purple-700 active:scale-95 text-white font-bold text-xs shadow-xl transition"
                            title="Paste screenshot (Ctrl+V)"
                          >
                            <ClipboardPaste className="w-3.5 h-3.5 text-purple-200" />
                            <span>Paste Screenshot</span>
                          </button>
                        </div>
                      </div>

                      {/* Processing Overlay */}
                      {isProcessingPhoto && (
                        <div className="absolute inset-0 bg-black/80 backdrop-blur-xs flex flex-col items-center justify-center text-teal-400 gap-2 z-30">
                          <Loader2 className="w-8 h-8 animate-spin" />
                          <span className="text-xs font-semibold text-white">
                            Mengoptimalkan Foto...
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Google Maps Route Viewport */}
                <div className="w-full h-[280px] sm:h-[340px] md:h-[420px]">
                  <CameraRouteMap
                    currentLocation={currentLocation}
                    nextLocation={nextLocation}
                    routeLocations={orderedLocations}
                    opacity={mapOpacity}
                    interactive={true}
                    onSelectLocation={(loc) => {
                      setActiveLocId(loc.id);
                      onShowToast?.(`Beralih memfoto titik: "${loc.name}"`, 'info');
                    }}
                  />
                </div>
              </div>
            )}

            {/* Overlay Mode: Camera base + transparent Google Maps floating on top */}
            {viewMode === 'overlay' && (
              <div className="relative w-full h-[360px] sm:h-[440px] md:h-[500px] rounded-2xl overflow-hidden bg-slate-900 border border-slate-800 shadow-xl">
                {/* Base layer: Camera viewport / image */}
                <div className="absolute inset-0 flex items-center justify-center">
                  {displayImage ? (
                    <div className="relative w-full h-full">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={displayImage}
                        alt={currentLocation.name}
                        className="w-full h-full object-cover"
                      />
                    </div>
                  ) : (
                    <div
                      className="w-full h-full flex flex-col items-center justify-center bg-radial from-slate-900 to-slate-950 p-4 cursor-pointer select-none"
                      onClick={handleTriggerCamera}
                    >
                      <div className="w-14 h-14 rounded-2xl bg-teal-500/20 text-teal-300 border border-teal-400/50 flex items-center justify-center mb-2">
                        <Camera className="w-7 h-7 text-teal-400" />
                      </div>
                      <p className="text-xs font-bold text-white">Mode Overlay Transparan</p>
                      <p className="text-[11px] text-slate-400 mt-0.5">Ketuk untuk mengambil foto kamera</p>
                    </div>
                  )}
                </div>

                {/* Transparent Google Maps Overlay floating on top */}
                <div className="absolute inset-0 z-10 pointer-events-auto">
                  <CameraRouteMap
                    currentLocation={currentLocation}
                    nextLocation={nextLocation}
                    routeLocations={orderedLocations}
                    opacity={mapOpacity}
                    interactive={true}
                    onSelectLocation={(loc) => {
                      setActiveLocId(loc.id);
                      onShowToast?.(`Beralih memfoto titik: "${loc.name}"`, 'info');
                    }}
                  />
                </div>

                {/* Floating bottom action buttons in overlay mode */}
                <div className="absolute bottom-3 left-3 right-3 z-20 flex items-center justify-center gap-2 pointer-events-auto">
                  <button
                    type="button"
                    onClick={handleTriggerCamera}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold shadow-xl backdrop-blur-md transition"
                  >
                    <Camera className="w-4 h-4" />
                    <span>Ambil Foto</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleTriggerGallery}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-black/80 hover:bg-black text-slate-200 text-xs font-semibold border border-white/20 backdrop-blur-md transition"
                  >
                    <ImageIcon className="w-4 h-4 text-sky-400" />
                    <span>Galeri</span>
                  </button>
                </div>
              </div>
            )}

            {/* Camera Only Mode */}
            {viewMode === 'camera_only' && (
              <div className="w-full h-[340px] sm:h-[420px] md:h-[480px] relative rounded-2xl overflow-hidden bg-slate-900 border border-slate-800 flex items-center justify-center shadow-lg">
                {displayImage ? (
                  <div className="relative w-full h-full flex items-center justify-center bg-black group">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={displayImage}
                      alt={currentLocation.name}
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute bottom-3 left-3 right-3 flex items-center justify-center pointer-events-auto z-10 gap-2">
                      <button
                        type="button"
                        onClick={handleTriggerCamera}
                        className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold shadow-xl transition"
                      >
                        <Camera className="w-4 h-4" />
                        <span>Foto Ulang</span>
                      </button>
                      <button
                        type="button"
                        onClick={handleTriggerGallery}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-900/90 text-slate-200 text-xs font-semibold border border-white/20 transition"
                      >
                        <ImageIcon className="w-4 h-4 text-sky-400" />
                        <span>Galeri</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  <div
                    className="relative w-full h-full flex flex-col items-center justify-center p-4 bg-radial from-slate-900 to-slate-950 cursor-pointer select-none"
                    onClick={handleTriggerCamera}
                  >
                    <div className="w-16 h-16 rounded-3xl bg-teal-500/20 text-teal-300 border-2 border-teal-400/60 shadow-2xl flex items-center justify-center mb-3">
                      <Camera className="w-8 h-8 text-teal-400" />
                    </div>
                    <h4 className="text-sm font-bold text-white">Ambil Foto Titik Ini</h4>
                    <p className="text-xs text-teal-300/90 font-medium mt-1 mb-3">
                      {currentLocation.name}
                    </p>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleTriggerCamera();
                      }}
                      className="flex items-center gap-2 py-2.5 px-6 rounded-2xl bg-gradient-to-r from-teal-500 to-emerald-600 hover:from-teal-600 text-white font-extrabold text-sm shadow-xl transition"
                    >
                      <Camera className="w-4 h-4" />
                      <span>Buka Kamera Sekarang</span>
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Map Only Mode */}
            {viewMode === 'map_only' && (
              <div className="w-full h-[360px] sm:h-[450px] md:h-[520px]">
                <CameraRouteMap
                  currentLocation={currentLocation}
                  nextLocation={nextLocation}
                  routeLocations={orderedLocations}
                  opacity={mapOpacity}
                  interactive={true}
                  onSelectLocation={(loc) => {
                    setActiveLocId(loc.id);
                    onShowToast?.(`Beralih memfoto titik: "${loc.name}"`, 'info');
                  }}
                />
              </div>
            )}
          </div>

          {/* 4. Captured Photo Action & Advance Banner (Appears when photo is taken) */}
          {capturedPhotoUrl && (
            <div className="p-3.5 sm:p-4 rounded-2xl bg-slate-900 border border-teal-500/40 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-xl animate-in slide-in-from-bottom-2">
              <div className="flex items-center gap-3 w-full sm:w-auto">
                <div
                  onClick={() => setFullViewerUrl(capturedPhotoUrl)}
                  className="w-12 h-12 rounded-xl overflow-hidden border-2 border-teal-400 bg-black flex-shrink-0 cursor-pointer shadow-md"
                  title="Lihat foto penuh"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={capturedPhotoUrl}
                    alt="Hasil Foto"
                    className="w-full h-full object-cover"
                  />
                </div>

                <div className="min-w-0">
                  <h4 className="text-xs sm:text-sm font-bold text-white flex items-center gap-1.5 truncate">
                    <Check className="w-4 h-4 text-teal-400 flex-shrink-0" />
                    <span>Foto Baru Siap Disimpan!</span>
                  </h4>
                  <p className="text-[11px] text-slate-400 truncate">
                    Untuk titik &quot;{currentLocation.name}&quot;
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 w-full sm:w-auto justify-end flex-wrap">
                <button
                  type="button"
                  onClick={handleTriggerCamera}
                  className="flex items-center gap-1 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Foto Ulang</span>
                </button>

                <button
                  type="button"
                  disabled={isSavingPhoto}
                  onClick={() => handleSavePhoto(false)}
                  className="flex items-center gap-1 px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 active:scale-95 text-white text-xs font-bold shadow-md transition disabled:opacity-50"
                >
                  {isSavingPhoto && <Loader2 className="w-3 h-3 animate-spin" />}
                  <span>Simpan Foto</span>
                </button>

                {nextLocation && (
                  <button
                    type="button"
                    disabled={isSavingPhoto}
                    onClick={() => handleSavePhoto(true)}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-teal-500 to-sky-600 hover:from-teal-600 hover:to-sky-700 active:scale-95 text-white text-xs font-bold shadow-md transition disabled:opacity-50"
                  >
                    <span>Simpan & Lanjut Stop #{currentIndex + 2}</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          )}

          {/* 5. Mobile Quick Action Guide Bar */}
          <div className="p-3 rounded-2xl bg-slate-900/60 border border-slate-800/80 flex flex-wrap items-center justify-between gap-2.5 text-xs text-slate-300">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-teal-400" />
              <span className="text-[11px] text-slate-300">
                Gunakan kamera native untuk foto resolusi tinggi ber-GPS
              </span>
            </div>
            <div className="flex items-center gap-2 ml-auto">
              <button
                type="button"
                onClick={handleTriggerGallery}
                className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-semibold border border-slate-700 transition"
              >
                Pilih dari Galeri
              </button>
              <button
                type="button"
                onClick={handleTriggerCamera}
                className="px-3 py-1 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-[11px] font-bold transition flex items-center gap-1"
              >
                <Camera className="w-3 h-3" />
                <span>Buka Kamera</span>
              </button>
            </div>
          </div>
        </div>

        {/* Hidden Native Camera & Gallery File Inputs */}
        <input
          ref={nativeCameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={handlePhotoFileSelected}
        />
        <input
          ref={nativeGalleryInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handlePhotoFileSelected}
        />
      </div>

      {/* Full Screen Image Viewer Modal */}
      <ImageViewerModal
        isOpen={Boolean(fullViewerUrl)}
        onClose={() => setFullViewerUrl(null)}
        imageUrl={fullViewerUrl}
        title={currentLocation.name}
        subtitle={formatCoordinatePair(currentLocation.latitude, currentLocation.longitude)}
      />
    </div>
  );
};

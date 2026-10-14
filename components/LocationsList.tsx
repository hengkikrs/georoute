'use client';
import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import {
  Search,
  Filter,
  ArrowUpDown,
  CheckSquare,
  Square,
  Navigation,
  Copy,
  Check,
  Edit2,
  Trash2,
  Route,
  MapPin,
  ExternalLink,
  Plus,
  Camera,
  Image as ImageIcon,
  Maximize2,
  Loader2,
  X,
  ClipboardPaste,
  Download,
  Sparkles,
  CheckCircle2,
} from 'lucide-react';
import { LocationPoint, SortOption, DEFAULT_CATEGORIES } from '@/types/location';
import { formatCoordinatePair } from '@/utils/coordinateValidation';
import { buildSingleLocationNavUrl } from '@/services/googleMapsUrl';
import { processAndCompressImage } from '@/lib/imageUtils';
import { ImageViewerModal } from '@/components/ImageViewerModal';
import { RouteCameraModal } from '@/components/RouteCameraModal';
import { saveSingleLocation } from '@/services/locationStorage';
import { exportEditedPhotosCsv, downloadFile } from '@/services/csvService';
import { uploadImageToServer } from '@/services/cloudSyncService';

interface LocationsListProps {
  locations: LocationPoint[];
  selectedLocationIds: string[];
  onToggleSelectLocation: (id: string) => void;
  onSelectAllLocations: (ids: string[]) => void;
  onClearSelection: () => void;
  onEditLocation: (location: LocationPoint) => void;
  onRequestDeleteLocation: (location: LocationPoint) => void;
  onRequestBatchDelete: (ids: string[]) => void;
  onViewOnMap: (locationId: string) => void;
  onCreateRouteFromSelected: (ids: string[]) => void;
  onOpenAddModal: () => void;
  onShowToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
  onLocationUpdated?: () => void;
}

export const LocationsList: React.FC<LocationsListProps> = ({
  locations,
  selectedLocationIds,
  onToggleSelectLocation,
  onSelectAllLocations,
  onClearSelection,
  onEditLocation,
  onRequestDeleteLocation,
  onRequestBatchDelete,
  onViewOnMap,
  onCreateRouteFromSelected,
  onOpenAddModal,
  onShowToast,
  onLocationUpdated,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [sortBy, setSortBy] = useState<SortOption>('newest');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Photo viewer & quick photo modal states
  const [photoViewerLocation, setPhotoViewerLocation] = useState<LocationPoint | null>(null);
  const [quickPhotoModalLocation, setQuickPhotoModalLocation] = useState<LocationPoint | null>(null);
  const [routeCameraTargetLoc, setRouteCameraTargetLoc] = useState<LocationPoint | null>(null);
  const [isProcessingPhoto, setIsProcessingPhoto] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);

  const quickCameraInputRef = useRef<HTMLInputElement>(null);
  const quickGalleryInputRef = useRef<HTMLInputElement>(null);

  const handleProcessAndSaveQuickPhoto = useCallback(
    async (file: File, sourceName = 'Foto') => {
      if (!quickPhotoModalLocation) return;

      setIsProcessingPhoto(true);
      setPhotoError(null);

      try {
        const compressed = await processAndCompressImage(file, {
          maxWidth: 1200,
          maxHeight: 1200,
          quality: 0.8,
        });

        // Upload to server so it is visible on laptop & phone immediately
        let finalImageUrl = compressed;
        try {
          const serverUrl = await uploadImageToServer(compressed);
          if (serverUrl && serverUrl !== compressed) {
            finalImageUrl = serverUrl;
          }
        } catch {
          // fallback to base64
        }

        const updated = saveSingleLocation(
          {
            name: quickPhotoModalLocation.name,
            latitude: quickPhotoModalLocation.latitude,
            longitude: quickPhotoModalLocation.longitude,
            category: quickPhotoModalLocation.category,
            address: quickPhotoModalLocation.address,
            notes: quickPhotoModalLocation.notes,
            imageUrl: finalImageUrl,
            images: [finalImageUrl],
          },
          quickPhotoModalLocation.id
        );

        setQuickPhotoModalLocation(updated);
        onLocationUpdated?.();
        onShowToast(`${sourceName} untuk "${updated.name}" berhasil disimpan dan disinkronkan!`, 'success');
      } catch (err) {
        console.error('Error updating photo:', err);
        setPhotoError(err instanceof Error ? err.message : 'Gagal memproses gambar');
      } finally {
        setIsProcessingPhoto(false);
      }
    },
    [quickPhotoModalLocation, onLocationUpdated, onShowToast]
  );

  const handleQuickPhotoFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await handleProcessAndSaveQuickPhoto(file, 'Foto');
    e.target.value = '';
  };

  const handleQuickPasteFromClipboard = async () => {
    try {
      if (!navigator.clipboard || !navigator.clipboard.read) {
        onShowToast('Silakan tekan tombol Ctrl+V (atau Cmd+V) di keyboard untuk mempaste screenshot.', 'info');
        return;
      }
      const items = await navigator.clipboard.read();
      let found = false;
      for (const item of items) {
        for (const type of item.types) {
          if (type.startsWith('image/')) {
            const blob = await item.getType(type);
            const file = new File([blob], `screenshot_${Date.now()}.png`, { type });
            await handleProcessAndSaveQuickPhoto(file, 'Screenshot dari clipboard');
            found = true;
            break;
          }
        }
        if (found) break;
      }
      if (!found) {
        onShowToast('Tidak ada gambar di clipboard. Salin (copy) screenshot terlebih dahulu lalu klik Paste atau tekan Ctrl+V.', 'info');
      }
    } catch (err) {
      console.warn('Clipboard read error, fallback to Ctrl+V:', err);
      onShowToast('Tekan Ctrl+V (atau Cmd+V) di keyboard untuk menempelkan screenshot langsung.', 'info');
    }
  };

  // Global Ctrl+V listener while quick photo modal is open
  useEffect(() => {
    if (!quickPhotoModalLocation) return;

    const handlePaste = async (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.type.startsWith('image/')) {
          e.preventDefault();
          const file = item.getAsFile();
          if (file) {
            await handleProcessAndSaveQuickPhoto(file, 'Screenshot (Ctrl+V)');
            break;
          }
        }
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [quickPhotoModalLocation, handleProcessAndSaveQuickPhoto]);

  // Download CSV of edited photos
  const handleDownloadEditedPhotosCsv = (onlyWithPhotos: boolean) => {
    const csvContent = exportEditedPhotosCsv(locations, onlyWithPhotos);
    const dateStr = new Date().toISOString().split('T')[0];
    const filename = onlyWithPhotos
      ? `georoute_hasil_foto_${dateStr}.csv`
      : `georoute_semua_titik_dokumentasi_${dateStr}.csv`;
    downloadFile(csvContent, filename, 'text/csv;charset=utf-8;');
    const count = onlyWithPhotos
      ? locations.filter((l) => Boolean(l.imageUrl || (l.images && l.images.length > 0))).length
      : locations.length;
    onShowToast(`CSV hasil foto berhasil diunduh (${count} titik).`, 'success');
  };

  const handleRemovePhoto = (loc: LocationPoint) => {
    try {
      const updated = saveSingleLocation(
        {
          name: loc.name,
          latitude: loc.latitude,
          longitude: loc.longitude,
          category: loc.category,
          address: loc.address,
          notes: loc.notes,
          imageUrl: undefined,
          images: [],
        },
        loc.id
      );
      setQuickPhotoModalLocation(updated);
      onLocationUpdated?.();
      onShowToast(`Foto untuk "${loc.name}" telah dihapus`, 'info');
    } catch (err) {
      console.error('Error removing photo:', err);
      setPhotoError('Gagal menghapus foto.');
    }
  };

  // Extract all existing unique categories
  const categoriesList = useMemo(() => {
    const set = new Set<string>();
    DEFAULT_CATEGORIES.forEach((c) => set.add(c));
    locations.forEach((l) => {
      if (l.category) set.add(l.category);
    });
    return Array.from(set);
  }, [locations]);

  // Filtered and Sorted locations
  const filteredLocations = useMemo(() => {
    return locations
      .filter((loc) => {
        // Search filter (name, address, notes)
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase().trim();
          const matchName = loc.name.toLowerCase().includes(q);
          const matchAddress = loc.address?.toLowerCase().includes(q);
          const matchNotes = loc.notes?.toLowerCase().includes(q);
          const matchCategory = loc.category?.toLowerCase().includes(q);
          if (!matchName && !matchAddress && !matchNotes && !matchCategory) {
            return false;
          }
        }

        // Category filter
        if (selectedCategory !== 'all') {
          if (loc.category !== selectedCategory) {
            return false;
          }
        }

        return true;
      })
      .sort((a, b) => {
        if (sortBy === 'newest') {
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        }
        if (sortBy === 'oldest') {
          return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        }
        if (sortBy === 'name-asc') {
          return a.name.localeCompare(b.name, 'id');
        }
        if (sortBy === 'name-desc') {
          return b.name.localeCompare(a.name, 'id');
        }
        return 0;
      });
  }, [locations, searchQuery, selectedCategory, sortBy]);

  const allVisibleSelected =
    filteredLocations.length > 0 &&
    filteredLocations.every((loc) => selectedLocationIds.includes(loc.id));

  const handleSelectAllVisible = () => {
    if (allVisibleSelected) {
      onClearSelection();
    } else {
      onSelectAllLocations(filteredLocations.map((l) => l.id));
    }
  };

  const handleCopyCoord = (loc: LocationPoint, e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(`${loc.latitude}, ${loc.longitude}`);
    setCopiedId(loc.id);
    onShowToast(`Koordinat ${loc.name} disalin ke clipboard`, 'success');
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-4 space-y-4 pb-24">
      {/* Search and Filters Bar */}
      <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs space-y-3">
        {/* Search Input */}
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cari lokasi berdasarkan nama, alamat, atau catatan..."
            className="w-full pl-9 pr-3.5 py-2.5 text-xs sm:text-sm rounded-xl border border-slate-200 bg-slate-50/70 focus:bg-white focus:border-teal-600 focus:outline-none transition"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-slate-600 font-bold"
            >
              ✕
            </button>
          )}
        </div>

        {/* Filter & Sort Controls */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-100">
          {/* Category Dropdown */}
          <div className="flex items-center gap-1.5 min-w-[130px]">
            <Filter className="w-3.5 h-3.5 text-slate-500" />
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="text-xs bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-slate-700 focus:outline-none focus:border-teal-600"
            >
              <option value="all">Semua Kategori</option>
              {categoriesList.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>

          {/* Sort Dropdown */}
          <div className="flex items-center gap-1.5 min-w-[130px]">
            <ArrowUpDown className="w-3.5 h-3.5 text-slate-500" />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortOption)}
              className="text-xs bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-slate-700 focus:outline-none focus:border-teal-600"
            >
              <option value="newest">Terbaru Ditambahkan</option>
              <option value="oldest">Terlama Ditambahkan</option>
              <option value="name-asc">Nama (A - Z)</option>
              <option value="name-desc">Nama (Z - A)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Batch Actions & Stats Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-1">
        <div className="flex items-center gap-2">
          <button
            onClick={handleSelectAllVisible}
            className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 hover:text-teal-700 transition"
          >
            {allVisibleSelected ? (
              <CheckSquare className="w-4 h-4 text-teal-600" />
            ) : (
              <Square className="w-4 h-4 text-slate-400" />
            )}
            <span>
              {allVisibleSelected ? 'Batalkan Pilih Semua' : 'Pilih Semua'} ({filteredLocations.length})
            </span>
          </button>

          {selectedLocationIds.length > 0 && (
            <span className="text-xs text-teal-700 font-bold bg-teal-50 px-2 py-0.5 rounded-full border border-teal-200">
              {selectedLocationIds.length} dipilih
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          {/* Download Edited Photos CSV */}
          <button
            onClick={() => handleDownloadEditedPhotosCsv(true)}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-purple-200 bg-purple-50 text-purple-800 text-xs font-semibold hover:bg-purple-100 transition shadow-2xs"
            title="Download CSV ringkasan foto dokumentasi survei"
          >
            <Download className="w-3.5 h-3.5 text-purple-600" />
            <span className="hidden xs:inline">Unduh CSV Foto</span>
            <span className="xs:hidden">CSV Foto</span>
            <span className="px-1.5 py-0.2 rounded-full bg-purple-200/70 text-[10px] font-bold text-purple-900 ml-0.5">
              {locations.filter((l) => Boolean(l.imageUrl || (l.images && l.images.length > 0))).length}
            </span>
          </button>

          {selectedLocationIds.length > 0 ? (
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => onCreateRouteFromSelected(selectedLocationIds)}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-teal-600 text-white text-xs font-semibold hover:bg-teal-700 transition shadow-xs"
              >
                <Route className="w-3.5 h-3.5" />
                <span>Buat Rute ({selectedLocationIds.length})</span>
              </button>
              <button
                onClick={() => onRequestBatchDelete(selectedLocationIds)}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-rose-50 text-rose-700 border border-rose-200 text-xs font-semibold hover:bg-rose-100 transition"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Hapus ({selectedLocationIds.length})</span>
              </button>
            </div>
          ) : filteredLocations.length >= 2 ? (
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => onCreateRouteFromSelected(filteredLocations.map((l) => l.id))}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-teal-50 border border-teal-200 text-teal-800 text-xs font-semibold hover:bg-teal-100 transition"
                title="Jadikan seluruh lokasi dalam daftar sebagai rute perjalanan"
              >
                <Route className="w-3.5 h-3.5 text-teal-600" />
                <span>Rute Semua ({filteredLocations.length})</span>
              </button>
            </div>
          ) : null}
        </div>
      </div>

      {/* Locations Cards List */}
      {filteredLocations.length === 0 ? (
        <div className="p-8 text-center bg-white rounded-2xl border border-slate-200 shadow-xs">
          <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-3">
            <MapPin className="w-6 h-6" />
          </div>
          <h3 className="text-sm font-bold text-slate-800">
            {locations.length === 0 ? 'Belum Ada Lokasi Tersimpan' : 'Tidak Ada Lokasi yang Cocok'}
          </h3>
          <p className="mt-1 text-xs text-slate-500 max-w-sm mx-auto">
            {locations.length === 0
              ? 'Mulai dengan menambahkan titik lokasi survei atau impor file CSV.'
              : 'Coba ubah kata kunci pencarian atau reset filter kategori.'}
          </p>
          {locations.length === 0 && (
            <button
              onClick={onOpenAddModal}
              className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-teal-600 text-white text-xs font-semibold hover:bg-teal-700 transition shadow-xs"
            >
              <Plus className="w-4 h-4" />
              <span>Tambah Lokasi Pertama</span>
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {filteredLocations.map((loc) => {
            const isSelected = selectedLocationIds.includes(loc.id);
            const navUrl = buildSingleLocationNavUrl(loc.latitude, loc.longitude);

            return (
              <div
                key={loc.id}
                onClick={() => onToggleSelectLocation(loc.id)}
                className={`relative p-4 rounded-2xl border transition-all cursor-pointer select-none bg-white ${
                  isSelected
                    ? 'border-teal-500 ring-2 ring-teal-100 shadow-md'
                    : 'border-slate-200 hover:border-slate-300 shadow-xs'
                }`}
              >
                {/* Header Row: Checkbox, Name, Category and Photo Thumbnail */}
                <div className="flex items-start justify-between gap-2.5">
                  <div className="flex items-start gap-2.5 min-w-0 flex-1">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleSelectLocation(loc.id);
                      }}
                      className="mt-0.5 text-slate-400 hover:text-teal-600 transition flex-shrink-0"
                    >
                      {isSelected ? (
                        <CheckSquare className="w-5 h-5 text-teal-600" />
                      ) : (
                        <Square className="w-5 h-5" />
                      )}
                    </button>
                    <div className="min-w-0 flex-1">
                      <h3 className="text-sm font-bold text-slate-900 leading-snug truncate">
                        {loc.name}
                      </h3>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold bg-teal-50 text-teal-800 border border-teal-200">
                          {loc.category || 'Survei'}
                        </span>
                        <span className="text-[11px] font-mono text-slate-500">
                          {formatCoordinatePair(loc.latitude, loc.longitude)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Photo Thumbnail on Card */}
                  {loc.imageUrl && (
                    <div
                      onClick={(e) => {
                        e.stopPropagation();
                        setPhotoViewerLocation(loc);
                      }}
                      className="relative w-12 h-12 rounded-xl overflow-hidden border border-slate-200 bg-slate-100 flex-shrink-0 cursor-pointer group shadow-2xs hover:ring-2 hover:ring-teal-400 transition"
                      title="Klik untuk melihat foto"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={loc.imageUrl}
                        alt={loc.name}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                      />
                      <div className="absolute inset-0 bg-black/25 opacity-0 group-hover:opacity-100 transition flex items-center justify-center text-white">
                        <Maximize2 className="w-3.5 h-3.5" />
                      </div>
                    </div>
                  )}
                </div>

                {/* Optional Address & Notes */}
                {(loc.address || loc.notes) && (
                  <div className="mt-2.5 pt-2 border-t border-slate-100 text-xs text-slate-600 space-y-1">
                    {loc.address && (
                      <p className="line-clamp-1 text-[11px] text-slate-600">
                        📍 {loc.address}
                      </p>
                    )}
                    {loc.notes && (
                      <p className="line-clamp-2 text-[11px] text-slate-500 italic bg-slate-50 p-1.5 rounded-lg">
                        Catatan: {loc.notes}
                      </p>
                    )}
                  </div>
                )}

                {/* Action Buttons Row */}
                <div className="mt-3.5 pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-1.5">
                  <div className="flex items-center gap-1.5">
                    {/* Direct Google Maps Nav */}
                    <a
                      href={navUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold shadow-xs transition"
                      title="Buka Navigasi di Google Maps"
                    >
                      <Navigation className="w-3.5 h-3.5" />
                      <span>Navigasi</span>
                      <ExternalLink className="w-3 h-3 opacity-60" />
                    </a>

                    {/* Quick Photo Button */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setQuickPhotoModalLocation(loc);
                      }}
                      className={`flex items-center gap-1 px-2 py-1.5 rounded-lg border text-xs font-medium transition ${
                        loc.imageUrl
                          ? 'border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                          : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
                      }`}
                      title={loc.imageUrl ? 'Kelola foto lokasi' : 'Tambahkan foto (kamera / galeri)'}
                    >
                      <Camera className={`w-3.5 h-3.5 ${loc.imageUrl ? 'text-emerald-600' : 'text-teal-600'}`} />
                      <span className="hidden xs:inline">{loc.imageUrl ? 'Foto' : '+ Foto'}</span>
                    </button>

                    {/* Copy Coordinates */}
                    <button
                      type="button"
                      onClick={(e) => handleCopyCoord(loc, e)}
                      className="flex items-center gap-1 px-2 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-medium transition"
                      title="Salin koordinat"
                    >
                      {copiedId === loc.id ? (
                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                      <span className="hidden sm:inline">Salin</span>
                    </button>

                    {/* View on Leaflet Map */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onViewOnMap(loc.id);
                      }}
                      className="px-2 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-medium transition"
                      title="Lihat titik ini di peta aplikasi"
                    >
                      <MapPin className="w-3.5 h-3.5 text-teal-600" />
                    </button>
                  </div>

                  {/* Edit & Delete */}
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onEditLocation(loc);
                      }}
                      className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-teal-700 transition"
                      title="Edit lokasi"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onRequestDeleteLocation(loc);
                      }}
                      className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-rose-50 hover:text-rose-600 hover:border-rose-200 transition"
                      title="Hapus lokasi"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Hidden file inputs for Camera and Gallery */}
      <input
        ref={quickCameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleQuickPhotoFile}
      />
      <input
        ref={quickGalleryInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleQuickPhotoFile}
      />

      {/* Quick Photo Modal */}
      {quickPhotoModalLocation && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setQuickPhotoModalLocation(null)}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden space-y-4 p-5 animate-in fade-in zoom-in-95"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-teal-100 text-teal-700 flex items-center justify-center">
                  <Camera className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 leading-tight">Foto Titik Lokasi</h3>
                  <p className="text-[11px] text-slate-500 truncate max-w-[200px]">
                    {quickPhotoModalLocation.name}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setQuickPhotoModalLocation(null)}
                className="p-1 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {photoError && (
              <p className="text-xs text-rose-600 bg-rose-50 p-2 rounded-lg border border-rose-200">
                {photoError}
              </p>
            )}

            {isProcessingPhoto ? (
              <div className="p-6 rounded-xl border border-dashed border-teal-300 bg-teal-50/60 flex flex-col items-center justify-center gap-2 text-teal-800 text-xs font-medium">
                <Loader2 className="w-5 h-5 animate-spin text-teal-600" />
                <span>Memproses dan mengoptimalkan gambar...</span>
              </div>
            ) : quickPhotoModalLocation.imageUrl ? (
              <div className="space-y-3">
                <div className="relative rounded-xl overflow-hidden border border-slate-200 bg-slate-900/5 max-h-48 flex items-center justify-center">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={quickPhotoModalLocation.imageUrl}
                    alt={quickPhotoModalLocation.name}
                    className="w-full h-40 object-cover cursor-pointer hover:opacity-95 transition"
                    onClick={() => {
                      setPhotoViewerLocation(quickPhotoModalLocation);
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setPhotoViewerLocation(quickPhotoModalLocation);
                    }}
                    className="absolute bottom-2 left-2 flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-black/65 hover:bg-black/85 text-white text-[11px] font-medium backdrop-blur-xs transition"
                  >
                    <Maximize2 className="w-3.5 h-3.5" />
                    Lihat Penuh
                  </button>
                </div>

                <div className="grid grid-cols-3 gap-1.5">
                  <button
                    type="button"
                    onClick={handleQuickPasteFromClipboard}
                    className="flex items-center justify-center gap-1 py-2 px-1.5 rounded-xl border border-purple-200 bg-purple-50/80 hover:bg-purple-100 text-purple-900 text-[11px] font-semibold transition"
                    title="Paste screenshot baru dari clipboard"
                  >
                    <ClipboardPaste className="w-3.5 h-3.5 text-purple-600 flex-shrink-0" />
                    <span>Paste Screenshot</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => quickGalleryInputRef.current?.click()}
                    className="flex items-center justify-center gap-1 py-2 px-1.5 rounded-xl border border-sky-200 bg-sky-50/80 hover:bg-sky-100 text-sky-900 text-[11px] font-semibold transition"
                    title="Pilih file gambar dari galeri perangkat"
                  >
                    <ImageIcon className="w-3.5 h-3.5 text-sky-600 flex-shrink-0" />
                    <span>Ganti Galeri</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => quickCameraInputRef.current?.click()}
                    className="flex items-center justify-center gap-1 py-2 px-1.5 rounded-xl border border-teal-200 bg-teal-50/80 hover:bg-teal-100 text-teal-900 text-[11px] font-semibold transition"
                    title="Ambil foto ulang menggunakan kamera"
                  >
                    <Camera className="w-3.5 h-3.5 text-teal-600 flex-shrink-0" />
                    <span>Foto Ulang</span>
                  </button>
                </div>

                <div className="pt-2 border-t border-slate-100 flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setRouteCameraTargetLoc(quickPhotoModalLocation);
                      setQuickPhotoModalLocation(null);
                    }}
                    className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-xl bg-slate-900 hover:bg-black text-white text-xs font-bold transition shadow-xs"
                  >
                    <Camera className="w-4 h-4 text-teal-400" />
                    <span>Buka Kamera Rute & Google Maps HUD</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleRemovePhoto(quickPhotoModalLocation)}
                    className="w-full flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl border border-rose-200 bg-rose-50/50 hover:bg-rose-100 text-rose-700 text-xs font-semibold transition"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                    Hapus Foto Ini
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="p-2.5 rounded-xl border border-dashed border-slate-300 bg-slate-50 flex items-center justify-between text-xs text-slate-600">
                  <span className="flex items-center gap-1.5 font-medium">
                    <ClipboardPaste className="w-4 h-4 text-purple-600" />
                    Bisa langsung tekan <kbd className="px-1 py-0.5 rounded bg-white border border-slate-300 font-mono text-[10px]">Ctrl+V</kbd>
                  </span>
                  <span className="text-[10px] text-slate-400">Tempel screenshot</span>
                </div>

                <div className="grid grid-cols-1 gap-2">
                  <button
                    type="button"
                    onClick={handleQuickPasteFromClipboard}
                    className="flex items-center justify-center gap-2.5 py-2.5 px-4 rounded-xl border border-purple-200 bg-purple-50/90 hover:bg-purple-100 text-purple-900 text-xs font-bold transition shadow-2xs"
                  >
                    <ClipboardPaste className="w-4 h-4 text-purple-600 flex-shrink-0" />
                    <span>Paste Screenshot dari Clipboard (Ctrl+V)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => quickGalleryInputRef.current?.click()}
                    className="flex items-center justify-center gap-2.5 py-2.5 px-4 rounded-xl border border-sky-200 bg-sky-50/90 hover:bg-sky-100 text-sky-900 text-xs font-semibold transition shadow-2xs"
                  >
                    <ImageIcon className="w-4 h-4 text-sky-600 flex-shrink-0" />
                    <span>Pilih Foto dari Galeri / File Laptop & HP</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => quickCameraInputRef.current?.click()}
                    className="flex items-center justify-center gap-2.5 py-2.5 px-4 rounded-xl border border-teal-200 bg-teal-50/90 hover:bg-teal-100 text-teal-900 text-xs font-semibold transition shadow-2xs"
                  >
                    <Camera className="w-4 h-4 text-teal-600 flex-shrink-0" />
                    <span>Ambil Foto Langsung (Kamera HP)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setRouteCameraTargetLoc(quickPhotoModalLocation);
                      setQuickPhotoModalLocation(null);
                    }}
                    className="flex items-center justify-center gap-2 py-2 px-3 rounded-xl border border-slate-200 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium transition"
                  >
                    <Camera className="w-3.5 h-3.5 text-slate-500" />
                    <span>Buka Mode Kamera & Panduan Rute Peta</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Full Screen Image Viewer Modal */}
      <ImageViewerModal
        isOpen={Boolean(photoViewerLocation)}
        onClose={() => setPhotoViewerLocation(null)}
        imageUrl={photoViewerLocation?.imageUrl || null}
        title={photoViewerLocation?.name || 'Foto Lokasi'}
        subtitle={photoViewerLocation?.address || (photoViewerLocation ? `${photoViewerLocation.latitude}, ${photoViewerLocation.longitude}` : undefined)}
      />

      {/* Route Camera & Google Maps HUD Modal */}
      <RouteCameraModal
        isOpen={Boolean(routeCameraTargetLoc)}
        onClose={() => setRouteCameraTargetLoc(null)}
        initialLocation={routeCameraTargetLoc}
        routeLocations={locations}
        onPhotoSaved={() => {
          onLocationUpdated?.();
        }}
        onShowToast={onShowToast}
      />
    </div>
  );
};

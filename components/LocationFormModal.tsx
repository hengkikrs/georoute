'use client';
import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  X,
  MapPin,
  ClipboardPaste,
  Copy,
  ExternalLink,
  AlertTriangle,
  Check,
  Navigation,
  Camera,
  Image as ImageIcon,
  Trash2,
  Maximize2,
  Loader2,
  Sparkles,
} from 'lucide-react';
import { LocationPoint, DEFAULT_CATEGORIES } from '@/types/location';
import {
  validateCoordinates,
  parseQuickCoordinates,
  formatCoordinatePair,
} from '@/utils/coordinateValidation';
import {
  findDuplicateLocationCoordinate,
  saveSingleLocation,
} from '@/services/locationStorage';
import { buildSingleLocationNavUrl } from '@/services/googleMapsUrl';
import { processAndCompressImage } from '@/lib/imageUtils';
import { ImageViewerModal } from '@/components/ImageViewerModal';
import { uploadImageToServer } from '@/services/cloudSyncService';

interface LocationFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: (savedLocation: LocationPoint) => void;
  initialData?: LocationPoint | null;
  initialCoordinates?: { lat: number; lng: number } | null;
  onPickFromMap?: () => void;
}

interface FormContentProps {
  onClose: () => void;
  onSaved: (savedLocation: LocationPoint) => void;
  initialData?: LocationPoint | null;
  initialCoordinates?: { lat: number; lng: number } | null;
  onPickFromMap?: () => void;
}

const LocationFormContent: React.FC<FormContentProps> = ({
  onClose,
  onSaved,
  initialData,
  initialCoordinates,
  onPickFromMap,
}) => {
  const [name, setName] = useState(() => initialData?.name || '');
  const [latitude, setLatitude] = useState(() => {
    if (initialData) return initialData.latitude.toString();
    if (initialCoordinates) return initialCoordinates.lat.toFixed(6);
    return '';
  });
  const [longitude, setLongitude] = useState(() => {
    if (initialData) return initialData.longitude.toString();
    if (initialCoordinates) return initialCoordinates.lng.toFixed(6);
    return '';
  });

  const [category, setCategory] = useState<string>(() => {
    if (!initialData?.category) return 'Survei';
    if (DEFAULT_CATEGORIES.includes(initialData.category as (typeof DEFAULT_CATEGORIES)[number])) {
      return initialData.category;
    }
    return 'Lainnya';
  });

  const [customCategory, setCustomCategory] = useState(() => {
    if (
      initialData?.category &&
      !DEFAULT_CATEGORIES.includes(initialData.category as (typeof DEFAULT_CATEGORIES)[number])
    ) {
      return initialData.category;
    }
    return '';
  });

  const [address, setAddress] = useState(() => initialData?.address || '');
  const [notes, setNotes] = useState(() => initialData?.notes || '');
  const [imageUrl, setImageUrl] = useState(() => initialData?.imageUrl || (initialData?.images && initialData.images[0]) || '');
  const [isProcessingImage, setIsProcessingImage] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  const [pasteSuccessMsg, setPasteSuccessMsg] = useState<string | null>(null);
  const [isViewerOpen, setIsViewerOpen] = useState(false);

  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  // Core image handler: compresses and uploads to server for cross-device view
  const processAndSetImage = useCallback(async (file: File, sourceName = 'Gambar') => {
    setIsProcessingImage(true);
    setImageError(null);
    setPasteSuccessMsg(null);

    try {
      const compressed = await processAndCompressImage(file, {
        maxWidth: 1200,
        maxHeight: 1200,
        quality: 0.8,
      });

      // Optimistically show compressed image immediately
      setImageUrl(compressed);

      // Upload to server so laptop and phone can access the same photo URL
      try {
        const serverUrl = await uploadImageToServer(compressed);
        if (serverUrl && serverUrl !== compressed) {
          setImageUrl(serverUrl);
        }
      } catch (uploadErr) {
        console.warn('Server upload background warning:', uploadErr);
      }

      setPasteSuccessMsg(`${sourceName} berhasil dipasang! Siap disinkronkan ke HP & Laptop.`);
      setTimeout(() => setPasteSuccessMsg(null), 4000);
    } catch (err) {
      console.error('Error processing image:', err);
      setImageError(err instanceof Error ? err.message : 'Gagal memproses gambar');
    } finally {
      setIsProcessingImage(false);
    }
  }, []);

  const handleImageFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await processAndSetImage(file, 'Foto dari galeri');
    e.target.value = '';
  };

  // Button handler for pasting image from clipboard
  const handlePasteFromClipboard = async () => {
    try {
      if (!navigator.clipboard || !navigator.clipboard.read) {
        setImageError('Gunakan shortcut Ctrl+V (atau Cmd+V) di keyboard untuk menempelkan foto hasil copy screenshot.');
        return;
      }

      const items = await navigator.clipboard.read();
      let found = false;

      for (const item of items) {
        for (const type of item.types) {
          if (type.startsWith('image/')) {
            const blob = await item.getType(type);
            const file = new File([blob], `screenshot_${Date.now()}.${type.split('/')[1] || 'png'}`, { type });
            await processAndSetImage(file, 'Screenshot dari clipboard');
            found = true;
            break;
          }
        }
        if (found) break;
      }

      if (!found) {
        setImageError('Tidak ada gambar di clipboard. Silakan salin (copy) screenshot terlebih dahulu, lalu klik tombol ini atau tekan Ctrl+V.');
      }
    } catch (err) {
      console.warn('Clipboard read permission warning:', err);
      setImageError('Akses clipboard otomatis dibatasi browser. Silakan langsung tekan Ctrl+V di keyboard untuk mempaste screenshot.');
    }
  };

  // Global Ctrl+V listener while modal is active
  useEffect(() => {
    const handlePaste = async (e: ClipboardEvent) => {
      // Don't intercept paste if user is typing in a text input or textarea
      const target = e.target as HTMLElement | null;
      const isInput = target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA';
      
      const items = e.clipboardData?.items;
      if (!items) return;

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.type.startsWith('image/')) {
          e.preventDefault();
          const file = item.getAsFile();
          if (file) {
            await processAndSetImage(file, 'Screenshot (Ctrl+V)');
            break;
          }
        }
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [processAndSetImage]);

  // Quick coordinate paste helper box
  const [quickPasteText, setQuickPasteText] = useState('');
  const [quickPasteOpen, setQuickPasteOpen] = useState(false);

  // Errors & Duplicate warning
  const [errors, setErrors] = useState<{ [key: string]: string }>({});
  const [duplicateWarning, setDuplicateWarning] = useState<LocationPoint | null>(null);
  const [allowDuplicateOverride, setAllowDuplicateOverride] = useState(false);
  const [copiedSuccess, setCopiedSuccess] = useState(false);

  const handleApplyQuickPaste = () => {
    if (!quickPasteText.trim()) return;
    const result = parseQuickCoordinates(quickPasteText);
    if (result.isValid && result.latitude !== undefined && result.longitude !== undefined) {
      setLatitude(result.latitude.toString());
      setLongitude(result.longitude.toString());
      setQuickPasteOpen(false);
      setQuickPasteText('');
      setErrors((prev) => {
        const next = { ...prev };
        delete next.latitude;
        delete next.longitude;
        delete next.coordinates;
        return next;
      });
    } else {
      setErrors((prev) => ({
        ...prev,
        quickPaste: result.errorMessage || 'Koordinat tidak valid',
      }));
    }
  };

  const handleCopyCoordinates = () => {
    const latNum = parseFloat(latitude);
    const lngNum = parseFloat(longitude);
    if (!Number.isNaN(latNum) && !Number.isNaN(lngNum)) {
      navigator.clipboard.writeText(`${latNum}, ${lngNum}`);
      setCopiedSuccess(true);
      setTimeout(() => setCopiedSuccess(false), 2000);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const newErrors: { [key: string]: string } = {};

    const trimmedName = name.trim();
    if (!trimmedName) {
      newErrors.name = 'Nama lokasi wajib diisi.';
    }

    const coordVal = validateCoordinates(latitude, longitude);
    if (!coordVal.isValid) {
      newErrors.coordinates = coordVal.errorMessage || 'Koordinat tidak valid.';
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    const finalLat = coordVal.latitude!;
    const finalLng = coordVal.longitude!;

    // Duplicate coordinate check
    if (!allowDuplicateOverride) {
      const duplicate = findDuplicateLocationCoordinate(finalLat, finalLng, initialData?.id);
      if (duplicate) {
        setDuplicateWarning(duplicate);
        return;
      }
    }

    const finalCategory =
      category === 'Lainnya' && customCategory.trim()
        ? customCategory.trim()
        : category;

    try {
      const saved = saveSingleLocation(
        {
          name: trimmedName,
          latitude: finalLat,
          longitude: finalLng,
          category: finalCategory,
          address: address.trim(),
          notes: notes.trim(),
          imageUrl: imageUrl || undefined,
          images: imageUrl ? [imageUrl] : undefined,
        },
        initialData?.id
      );

      onSaved(saved);
      onClose();
    } catch (err) {
      setErrors({
        submit: err instanceof Error ? err.message : 'Gagal menyimpan data lokasi.',
      });
    }
  };

  const isCoordValid =
    latitude && longitude && validateCoordinates(latitude, longitude).isValid;

  return (
    <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden my-auto max-h-[92vh] flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100 bg-slate-50/70 flex-shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-teal-100 text-teal-700 flex items-center justify-center">
            <MapPin className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-900 leading-tight">
              {initialData ? 'Edit Titik Lokasi' : 'Tambah Titik Lokasi Baru'}
            </h2>
            <p className="text-xs text-slate-500">
              Lengkapi nama dan koordinat latitude-longitude
            </p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="rounded-full p-1.5 text-slate-400 hover:bg-slate-200 hover:text-slate-700 transition"
          aria-label="Tutup form"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Form Body */}
      <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 space-y-4">
        {errors.submit && (
          <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            <span>{errors.submit}</span>
          </div>
        )}

        {/* Location Name */}
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">
            Nama Lokasi <span className="text-rose-500">*</span>
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Contoh: Kantor Survei A atau Restoran Seafood"
            className={`w-full px-3.5 py-2.5 rounded-xl border text-sm transition focus:outline-none focus:ring-2 ${
              errors.name
                ? 'border-rose-400 bg-rose-50/30 focus:ring-rose-200'
                : 'border-slate-300 focus:border-teal-600 focus:ring-teal-100'
            }`}
          />
          {errors.name && <p className="mt-1 text-xs text-rose-600">{errors.name}</p>}
        </div>

        {/* Quick Paste Bar Toggle */}
        <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-700 flex items-center gap-1.5">
              <ClipboardPaste className="w-3.5 h-3.5 text-teal-600" />
              Input Koordinat Cepat
            </span>
            <button
              type="button"
              onClick={() => setQuickPasteOpen(!quickPasteOpen)}
              className="text-xs font-semibold text-teal-700 hover:text-teal-800"
            >
              {quickPasteOpen ? 'Sembunyikan' : 'Tempel Format Teks'}
            </button>
          </div>

          {quickPasteOpen && (
            <div className="mt-2.5 pt-2 border-t border-slate-200">
              <p className="text-[11px] text-slate-500 mb-1.5">
                Tempel teks koordinat (contoh: <code>-5.397140, 105.266790</code>):
              </p>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={quickPasteText}
                  onChange={(e) => setQuickPasteText(e.target.value)}
                  placeholder="-5.397140, 105.266790"
                  className="flex-1 px-3 py-1.5 text-xs rounded-lg border border-slate-300 focus:border-teal-600 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={handleApplyQuickPaste}
                  className="px-3 py-1.5 rounded-lg bg-teal-600 text-white text-xs font-semibold hover:bg-teal-700 transition"
                >
                  Terapkan
                </button>
              </div>
              {errors.quickPaste && (
                <p className="mt-1 text-[11px] text-rose-600">{errors.quickPaste}</p>
              )}
            </div>
          )}
        </div>

        {/* Coordinates Inputs: Lat & Lng */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Latitude (-90 s/d 90) <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              value={latitude}
              onChange={(e) => setLatitude(e.target.value)}
              placeholder="-5.397140"
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm font-mono focus:border-teal-600 focus:ring-2 focus:ring-teal-100 focus:outline-none transition"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Longitude (-180 s/d 180) <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              value={longitude}
              onChange={(e) => setLongitude(e.target.value)}
              placeholder="105.266790"
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm font-mono focus:border-teal-600 focus:ring-2 focus:ring-teal-100 focus:outline-none transition"
            />
          </div>
        </div>

        {errors.coordinates && (
          <p className="text-xs text-rose-600 bg-rose-50 p-2 rounded-lg border border-rose-200">
            {errors.coordinates}
          </p>
        )}

        {/* Coordinate Actions (Map Picker & Copy & Nav Preview) */}
        <div className="flex flex-wrap items-center gap-2 pt-0.5">
          {onPickFromMap && (
            <button
              type="button"
              onClick={() => {
                onClose();
                onPickFromMap();
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-teal-200 bg-teal-50 text-teal-800 text-xs font-medium hover:bg-teal-100 transition"
            >
              <MapPin className="w-3.5 h-3.5" />
              Pilih Titik di Peta
            </button>
          )}

          {isCoordValid && (
            <>
              <button
                type="button"
                onClick={handleCopyCoordinates}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 text-xs font-medium hover:bg-slate-50 transition"
              >
                {copiedSuccess ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                    Tersalin!
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    Salin Koordinat
                  </>
                )}
              </button>

              <a
                href={buildSingleLocationNavUrl(parseFloat(latitude), parseFloat(longitude))}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-sky-200 bg-sky-50 text-sky-800 text-xs font-medium hover:bg-sky-100 transition"
              >
                <Navigation className="w-3.5 h-3.5" />
                Buka Google Maps
                <ExternalLink className="w-3 h-3 opacity-60" />
              </a>
            </>
          )}
        </div>

        {/* Duplicate Coordinate Warning Banner */}
        {duplicateWarning && (
          <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-300 text-xs text-amber-900 space-y-2">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">Peringatan: Koordinat Mirip Terdeteksi</p>
                <p className="mt-0.5 text-amber-800">
                  Koordinat ini identik dengan lokasi <strong>&ldquo;{duplicateWarning.name}&rdquo;</strong> (
                  {formatCoordinatePair(duplicateWarning.latitude, duplicateWarning.longitude)}).
                </p>
              </div>
            </div>
            <label className="flex items-center gap-2 pt-1 font-medium cursor-pointer">
              <input
                type="checkbox"
                checked={allowDuplicateOverride}
                onChange={(e) => setAllowDuplicateOverride(e.target.checked)}
                className="w-4 h-4 rounded text-teal-600 focus:ring-teal-500"
              />
              <span>Saya tetap ingin menyimpan lokasi dengan koordinat ini.</span>
            </label>
          </div>
        )}

        {/* Category Selector */}
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1.5">
            Kategori Lokasi
          </label>
          <div className="flex flex-wrap gap-1.5">
            {DEFAULT_CATEGORIES.map((cat) => (
              <button
                type="button"
                key={cat}
                onClick={() => setCategory(cat)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                  category === cat
                    ? 'bg-teal-700 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          {category === 'Lainnya' && (
            <input
              type="text"
              value={customCategory}
              onChange={(e) => setCustomCategory(e.target.value)}
              placeholder="Tulis kategori kustom..."
              className="mt-2 w-full px-3 py-2 rounded-xl border border-slate-300 text-xs focus:border-teal-600 focus:outline-none"
            />
          )}
        </div>

        {/* Address / Description */}
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">
            Alamat atau Deskripsi <span className="text-slate-400 font-normal">(opsional)</span>
          </label>
          <input
            type="text"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="Contoh: Jl. Raden Intan No. 12, seberang masjid"
            className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-sm focus:border-teal-600 focus:ring-2 focus:ring-teal-100 focus:outline-none transition"
          />
        </div>

        {/* Notes */}
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">
            Catatan Lapangan <span className="text-slate-400 font-normal">(opsional)</span>
          </label>
          <textarea
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Kondisi jalan, PIC kontak, nomor telp, jam operasional..."
            className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-sm focus:border-teal-600 focus:ring-2 focus:ring-teal-100 focus:outline-none transition resize-none"
          />
        </div>

        {/* Foto / Gambar Lokasi (Paste Screenshot / Galeri / Kamera) */}
        <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 space-y-2.5">
          <div className="flex items-center justify-between">
            <label className="block text-xs font-semibold text-slate-800 flex items-center gap-1.5">
              <span>Foto Lokasi & Dokumentasi</span>
              <span className="text-slate-400 font-normal text-[11px]">(opsional)</span>
            </label>
            {imageUrl ? (
              <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full border border-emerald-300">
                ✓ Foto Terpasang (Siap Sinkron)
              </span>
            ) : (
              <span className="text-[10px] text-slate-400">
                Mendukung Ctrl+V Screenshot
              </span>
            )}
          </div>

          {/* Hidden inputs for Camera and Gallery */}
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={handleImageFileChange}
          />
          <input
            ref={galleryInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleImageFileChange}
          />

          {imageError && (
            <p className="text-xs text-rose-600 bg-rose-50 p-2.5 rounded-xl border border-rose-200 flex items-start gap-1.5">
              <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5 text-rose-500" />
              <span>{imageError}</span>
            </p>
          )}

          {pasteSuccessMsg && (
            <p className="text-xs text-emerald-700 bg-emerald-50 p-2 rounded-xl border border-emerald-200 flex items-center gap-1.5 font-medium animate-in fade-in">
              <Sparkles className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />
              <span>{pasteSuccessMsg}</span>
            </p>
          )}

          {isProcessingImage ? (
            <div className="p-4 rounded-xl border border-dashed border-teal-300 bg-teal-50/70 flex items-center justify-center gap-2 text-teal-800 text-xs font-medium">
              <Loader2 className="w-4 h-4 animate-spin text-teal-600" />
              <span>Memproses & mengompres foto untuk sinkronisasi HP & Laptop...</span>
            </div>
          ) : imageUrl ? (
            <div className="space-y-2">
              <div className="relative group rounded-xl overflow-hidden border border-slate-200 bg-slate-900/5 max-h-48 flex items-center justify-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={imageUrl}
                  alt="Foto Lokasi"
                  className="w-full h-40 object-cover cursor-pointer hover:opacity-95 transition"
                  onClick={() => setIsViewerOpen(true)}
                />
                <button
                  type="button"
                  onClick={() => setIsViewerOpen(true)}
                  className="absolute bottom-2 left-2 flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-black/65 hover:bg-black/85 text-white text-[11px] font-medium backdrop-blur-xs transition"
                >
                  <Maximize2 className="w-3.5 h-3.5" />
                  Perbesar Foto
                </button>
              </div>

              {/* Action buttons when image exists */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 pt-0.5">
                <button
                  type="button"
                  onClick={handlePasteFromClipboard}
                  className="flex items-center justify-center gap-1 py-1.5 px-2 rounded-lg border border-purple-200 bg-purple-50/80 hover:bg-purple-100 text-purple-800 text-[11px] font-semibold transition"
                  title="Paste screenshot baru dari clipboard"
                >
                  <ClipboardPaste className="w-3.5 h-3.5 text-purple-600" />
                  <span>Paste Screenshot</span>
                </button>
                <button
                  type="button"
                  onClick={() => galleryInputRef.current?.click()}
                  className="flex items-center justify-center gap-1 py-1.5 px-2 rounded-lg border border-sky-200 bg-sky-50/80 hover:bg-sky-100 text-sky-800 text-[11px] font-semibold transition"
                  title="Pilih file dari galeri laptop/HP"
                >
                  <ImageIcon className="w-3.5 h-3.5 text-sky-600" />
                  <span>Ganti Galeri</span>
                </button>
                <button
                  type="button"
                  onClick={() => cameraInputRef.current?.click()}
                  className="flex items-center justify-center gap-1 py-1.5 px-2 rounded-lg border border-teal-200 bg-teal-50/80 hover:bg-teal-100 text-teal-800 text-[11px] font-semibold transition"
                  title="Foto ulang menggunakan kamera"
                >
                  <Camera className="w-3.5 h-3.5 text-teal-600" />
                  <span>Foto Ulang</span>
                </button>
                <button
                  type="button"
                  onClick={() => setImageUrl('')}
                  className="flex items-center justify-center gap-1 py-1.5 px-2 rounded-lg border border-rose-200 bg-white hover:bg-rose-50 text-rose-600 text-[11px] font-semibold transition"
                  title="Hapus foto"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Hapus</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-2.5">
              <div className="p-3 rounded-xl border border-dashed border-slate-300 bg-white hover:border-teal-400 transition flex flex-col items-center justify-center text-center gap-1">
                <div className="flex items-center gap-2 text-slate-600">
                  <ClipboardPaste className="w-4 h-4 text-purple-600" />
                  <span className="text-xs font-semibold text-slate-800">
                    Bisa Langsung Paste Screenshot (Ctrl + V)
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 max-w-sm">
                  Salin (copy) screenshot di laptop atau gambar di HP, lalu tekan{' '}
                  <kbd className="px-1.5 py-0.5 rounded bg-slate-100 border border-slate-300 font-mono text-[10px] text-slate-700">Ctrl+V</kbd>{' '}
                  atau gunakan tombol pilihan di bawah:
                </p>
              </div>

              {/* 3 Prominent Source Buttons: Paste, Gallery, Camera */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={handlePasteFromClipboard}
                  className="flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl border border-purple-200 bg-purple-50/90 hover:bg-purple-100 text-purple-900 text-xs font-semibold transition shadow-2xs group"
                >
                  <ClipboardPaste className="w-4 h-4 text-purple-600 group-hover:scale-110 transition flex-shrink-0" />
                  <div className="text-left">
                    <div className="leading-tight">Paste Screenshot</div>
                    <div className="text-[10px] text-purple-700 font-normal">Dari Clipboard</div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => galleryInputRef.current?.click()}
                  className="flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl border border-sky-200 bg-sky-50/90 hover:bg-sky-100 text-sky-900 text-xs font-semibold transition shadow-2xs group"
                >
                  <ImageIcon className="w-4 h-4 text-sky-600 group-hover:scale-110 transition flex-shrink-0" />
                  <div className="text-left">
                    <div className="leading-tight">Galeri / File</div>
                    <div className="text-[10px] text-sky-700 font-normal">Pilih File Gambar</div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => cameraInputRef.current?.click()}
                  className="flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl border border-teal-200 bg-teal-50/90 hover:bg-teal-100 text-teal-900 text-xs font-semibold transition shadow-2xs group"
                >
                  <Camera className="w-4 h-4 text-teal-600 group-hover:scale-110 transition flex-shrink-0" />
                  <div className="text-left">
                    <div className="leading-tight">Kamera Langsung</div>
                    <div className="text-[10px] text-teal-700 font-normal">Foto Baru</div>
                  </div>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-100">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl border border-slate-200 text-slate-700 text-xs font-semibold hover:bg-slate-50 transition"
          >
            Batal
          </button>
          <button
            type="submit"
            className="px-5 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 active:bg-teal-800 text-white text-xs font-semibold shadow-sm transition"
          >
            {initialData ? 'Simpan Perubahan' : 'Simpan Lokasi'}
          </button>
        </div>
      </form>

      {/* Lightbox Modal */}
      <ImageViewerModal
        isOpen={isViewerOpen}
        onClose={() => setIsViewerOpen(false)}
        imageUrl={imageUrl}
        title={name || 'Foto Lokasi'}
        subtitle={address || (isCoordValid ? `${latitude}, ${longitude}` : undefined)}
      />
    </div>
  );
};

export const LocationFormModal: React.FC<LocationFormModalProps> = ({
  isOpen,
  onClose,
  onSaved,
  initialData,
  initialCoordinates,
  onPickFromMap,
}) => {
  if (!isOpen) return null;

  const contentKey = initialData?.id || (initialCoordinates ? `${initialCoordinates.lat}_${initialCoordinates.lng}` : 'new');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 overflow-y-auto">
      <LocationFormContent
        key={contentKey}
        onClose={onClose}
        onSaved={onSaved}
        initialData={initialData}
        initialCoordinates={initialCoordinates}
        onPickFromMap={onPickFromMap}
      />
    </div>
  );
};

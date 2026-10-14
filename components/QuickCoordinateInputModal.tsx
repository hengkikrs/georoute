'use client';

import React, { useState } from 'react';
import { X, MapPinPlus, AlertCircle } from 'lucide-react';
import { LocationPoint } from '@/types/location';
import { parseQuickCoordinates } from '@/utils/coordinateValidation';
import { saveSingleLocation, findDuplicateLocationCoordinate } from '@/services/locationStorage';

interface QuickCoordinateInputModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: (location: LocationPoint) => void;
}

export const QuickCoordinateInputModal: React.FC<QuickCoordinateInputModalProps> = ({
  isOpen,
  onClose,
  onSaved,
}) => {
  const [coordText, setCoordText] = useState('');
  const [name, setName] = useState('');
  const [category, setCategory] = useState('Survei');
  const [error, setError] = useState<string | null>(null);
  const [duplicateWarning, setDuplicateWarning] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setDuplicateWarning(null);

    const parsed = parseQuickCoordinates(coordText);
    if (!parsed.isValid || parsed.latitude === undefined || parsed.longitude === undefined) {
      setError(parsed.errorMessage || 'Format koordinat tidak valid.');
      return;
    }

    const trimmedName = name.trim();
    if (!trimmedName) {
      setError('Masukkan nama lokasi untuk koordinat ini.');
      return;
    }

    const dup = findDuplicateLocationCoordinate(parsed.latitude, parsed.longitude);
    if (dup && !duplicateWarning) {
      setDuplicateWarning(
        `Koordinat ini identik dengan lokasi "${dup.name}". Tekan Simpan lagi jika tetap ingin menambahkan.`
      );
      return;
    }

    try {
      const saved = saveSingleLocation({
        name: trimmedName,
        latitude: parsed.latitude,
        longitude: parsed.longitude,
        category: category || 'Survei',
        notes: 'Ditambahkan via Input Cepat',
      });
      onSaved(saved);
      onClose();
      setCoordText('');
      setName('');
      setError(null);
      setDuplicateWarning(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menyimpan.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-slate-50">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-teal-100 text-teal-700 flex items-center justify-center">
              <MapPinPlus className="w-4 h-4" />
            </div>
            <h3 className="text-sm font-bold text-slate-900">Input Koordinat Cepat</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-full text-slate-400 hover:bg-slate-200 hover:text-slate-700"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-3">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Koordinat (Lat, Lng)
            </label>
            <input
              type="text"
              value={coordText}
              onChange={(e) => {
                setCoordText(e.target.value);
                setError(null);
                setDuplicateWarning(null);
              }}
              placeholder="-5.397140, 105.266790"
              className="w-full px-3 py-2 text-xs font-mono rounded-xl border border-slate-300 focus:border-teal-600 focus:outline-none"
              autoFocus
            />
            <p className="mt-1 text-[11px] text-slate-400">
              Format desimal dengan tanda koma atau spasi
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Nama Lokasi
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setError(null);
              }}
              placeholder="Contoh: Titik Survei #12"
              className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:border-teal-600 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Kategori
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:border-teal-600 focus:outline-none bg-white"
            >
              <option value="Survei">Survei</option>
              <option value="Pelanggan">Pelanggan</option>
              <option value="Kantor">Kantor</option>
              <option value="Toko">Toko</option>
              <option value="Gudang">Gudang</option>
              <option value="Lainnya">Lainnya</option>
            </select>
          </div>

          {error && (
            <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-1.5">
              <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {duplicateWarning && (
            <div className="p-2.5 rounded-lg bg-amber-50 border border-amber-300 text-amber-800 text-xs">
              {duplicateWarning}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50"
            >
              Batal
            </button>
            <button
              type="submit"
              className="px-4 py-2 rounded-xl bg-teal-600 text-xs font-semibold text-white hover:bg-teal-700"
            >
              Simpan Titik
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

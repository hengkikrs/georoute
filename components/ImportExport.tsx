'use client';
import React, { useState, useRef } from 'react';
import {
  Upload,
  Download,
  FileSpreadsheet,
  FileCode,
  AlertCircle,
  CheckCircle2,
  AlertTriangle,
  X,
  FileCheck,
  RefreshCw,
  HardDrive,
  Info,
  Cloud,
  Smartphone,
  Laptop,
  Image as ImageIcon,
  Check,
} from 'lucide-react';
import { LocationPoint } from '@/types/location';
import {
  parseAndValidateCsv,
  exportLocationsToCsv,
  exportEditedPhotosCsv,
  downloadFile,
  createJsonBackup,
  restoreFromJsonBackup,
  CsvImportSummary,
} from '@/services/csvService';
import { saveLocationsToStorage, getStoredLocations } from '@/services/locationStorage';
import { syncWithServer } from '@/services/cloudSyncService';

interface ImportExportProps {
  locations: LocationPoint[];
  onLocationsUpdated: () => void;
  onShowToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

export const ImportExport: React.FC<ImportExportProps> = ({
  locations,
  onLocationsUpdated,
  onShowToast,
}) => {
  const [csvPreview, setCsvPreview] = useState<CsvImportSummary | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [activeTab, setActiveTab] = useState<'csv' | 'sync' | 'json'>('csv');

  const csvFileInputRef = useRef<HTMLInputElement>(null);
  const jsonFileInputRef = useRef<HTMLInputElement>(null);

  // CSV File Handler
  const handleCsvFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsProcessing(true);
    const reader = new FileReader();

    reader.onload = (event) => {
      const text = event.target?.result as string;
      if (!text) {
        onShowToast('File CSV kosong atau tidak terbaca.', 'error');
        setIsProcessing(false);
        return;
      }

      try {
        const summary = parseAndValidateCsv(text, locations);
        setCsvPreview(summary);
      } catch (err) {
        onShowToast(err instanceof Error ? err.message : 'Gagal memproses CSV', 'error');
      } finally {
        setIsProcessing(false);
      }
    };

    reader.onerror = () => {
      onShowToast('Gagal membaca file dari perangkat.', 'error');
      setIsProcessing(false);
    };

    reader.readAsText(file);
    // Reset file input value so same file can be reselected
    e.target.value = '';
  };

  // Confirm CSV Import
  const handleConfirmCsvImport = () => {
    if (!csvPreview || csvPreview.validRows.length === 0) return;

    try {
      const now = new Date().toISOString();
      const current = getStoredLocations();

      const newPoints: LocationPoint[] = csvPreview.validRows.map((r, i) => ({
        id: `loc_csv_${Date.now()}_${i}_${Math.random().toString(36).substring(2, 6)}`,
        name: r.data.name || 'Lokasi Impor',
        latitude: r.data.latitude!,
        longitude: r.data.longitude!,
        category: r.data.category || 'Survei',
        address: r.data.address || '',
        notes: r.data.notes || '',
        createdAt: now,
        updatedAt: now,
      }));

      const merged = [...newPoints, ...current];
      saveLocationsToStorage(merged);
      onLocationsUpdated();
      onShowToast(`Berhasil mengimpor ${newPoints.length} titik lokasi baru!`, 'success');
      setCsvPreview(null);
    } catch (err) {
      onShowToast(err instanceof Error ? err.message : 'Gagal menyimpan data impor.', 'error');
    }
  };

  // Export CSV
  const handleExportCsv = () => {
    if (locations.length === 0) {
      onShowToast('Belum ada lokasi yang dapat diekspor.', 'info');
      return;
    }
    const csvData = exportLocationsToCsv(locations);
    const dateStr = new Date().toISOString().split('T')[0];
    downloadFile(csvData, `georoute_locations_${dateStr}.csv`, 'text/csv;charset=utf-8;');
    onShowToast(`File CSV berhasil diunduh (${locations.length} lokasi).`, 'success');
  };

  // Export Edited Photos CSV
  const handleExportEditedPhotosCsv = (onlyWithPhotos: boolean) => {
    if (locations.length === 0) {
      onShowToast('Belum ada lokasi yang dapat diekspor.', 'info');
      return;
    }
    const csvData = exportEditedPhotosCsv(locations, onlyWithPhotos);
    const dateStr = new Date().toISOString().split('T')[0];
    const filename = onlyWithPhotos
      ? `georoute_hasil_foto_${dateStr}.csv`
      : `georoute_semua_titik_dokumentasi_${dateStr}.csv`;
    downloadFile(csvData, filename, 'text/csv;charset=utf-8;');
    const count = onlyWithPhotos
      ? locations.filter((l) => Boolean(l.imageUrl || (l.images && l.images.length > 0))).length
      : locations.length;
    onShowToast(`File CSV hasil foto berhasil diunduh (${count} titik).`, 'success');
  };

  // Cross-device sync handler
  const handleSyncNow = async () => {
    setIsSyncing(true);
    try {
      const res = await syncWithServer();
      onLocationsUpdated();
      if (res.success) {
        onShowToast(res.message, 'success');
      } else {
        onShowToast(res.message, 'info');
      }
    } catch (err) {
      onShowToast('Sinkronisasi gagal: ' + (err instanceof Error ? err.message : 'Error koneksi'), 'error');
    } finally {
      setIsSyncing(false);
    }
  };

  // Download JSON Backup
  const handleExportJson = () => {
    const jsonData = createJsonBackup();
    const dateStr = new Date().toISOString().split('T')[0];
    downloadFile(jsonData, `georoute_backup_${dateStr}.json`, 'application/json');
    onShowToast('Backup JSON lengkap berhasil diunduh.', 'success');
  };

  // JSON Restore Handler
  const handleJsonFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      if (!text) return;

      const confirmRestore = window.confirm(
        'Pilih opsi pemulihan:\n\nKlik OK untuk GABUNGKAN (Merge) dengan data lama.\nKlik BATAL jika ingin membatalkan.'
      );

      if (confirmRestore) {
        const result = restoreFromJsonBackup(text, 'merge');
        if (result.success) {
          onLocationsUpdated();
          onShowToast(result.message, 'success');
        } else {
          onShowToast(result.message, 'error');
        }
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-4 space-y-4 pb-24">
      {/* Header Info */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs space-y-2">
        <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
          <HardDrive className="w-4 h-4 text-teal-600" />
          Penyimpanan, Impor & Ekspor Data
        </h2>
        <p className="text-xs text-slate-600 leading-relaxed">
          GeoRoute Planner menyimpan data secara aman di penyimpanan browser lokal (LocalStorage) perangkat Anda. Gunakan fitur di bawah untuk memindahkan data via file CSV spreadsheet atau membuat backup JSON lengkap.
        </p>

        {/* Tab switch */}
        <div className="flex flex-wrap gap-2 pt-2 border-t border-slate-100">
          <button
            onClick={() => setActiveTab('csv')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition ${
              activeTab === 'csv'
                ? 'bg-teal-600 text-white shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            <span>Format CSV & Hasil Foto</span>
          </button>
          <button
            onClick={() => setActiveTab('sync')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition ${
              activeTab === 'sync'
                ? 'bg-purple-600 text-white shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <Cloud className="w-3.5 h-3.5" />
            <span>Sinkron Laptop & HP</span>
          </button>
          <button
            onClick={() => setActiveTab('json')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition ${
              activeTab === 'json'
                ? 'bg-teal-600 text-white shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <FileCode className="w-3.5 h-3.5" />
            <span>Backup & Restore JSON</span>
          </button>
        </div>
      </div>

      {/* CSV Section */}
      {activeTab === 'csv' && (
        <div className="space-y-4">
          {/* Action Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Import CSV Card */}
            <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-3">
              <div className="flex items-center gap-2 text-teal-700">
                <Upload className="w-4 h-4" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900">
                  Impor Lokasi dari CSV
                </h3>
              </div>
              <p className="text-xs text-slate-500 leading-relaxed">
                Mendukung kolom <code>nama</code>, <code>latitude</code>, <code>longitude</code>, <code>kategori</code>, <code>alamat</code>, dan <code>catatan</code> dengan pemisah koma atau titik koma.
              </p>

              <input
                ref={csvFileInputRef}
                type="file"
                accept=".csv,text/csv,text/plain"
                onChange={handleCsvFileChange}
                className="hidden"
              />

              <button
                disabled={isProcessing}
                onClick={() => csvFileInputRef.current?.click()}
                className="w-full py-2.5 px-4 rounded-xl bg-teal-600 hover:bg-teal-700 active:bg-teal-800 text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition shadow-xs disabled:opacity-50"
              >
                <Upload className="w-4 h-4" />
                <span>{isProcessing ? 'Memproses File...' : 'Pilih File CSV dari HP'}</span>
              </button>
            </div>

            {/* Export CSV Card */}
            <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-3">
              <div className="flex items-center gap-2 text-teal-700">
                <Download className="w-4 h-4" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900">
                  Ekspor Data ke CSV
                </h3>
              </div>
              <p className="text-xs text-slate-500 leading-relaxed">
                Unduh seluruh {locations.length} titik lokasi ke file CSV yang kompatibel dengan Microsoft Excel dan Google Sheets.
              </p>

              <button
                disabled={locations.length === 0}
                onClick={handleExportCsv}
                className="w-full py-2.5 px-4 rounded-xl border border-teal-600 text-teal-700 hover:bg-teal-50 text-xs font-semibold flex items-center justify-center gap-1.5 transition disabled:opacity-40"
              >
                <Download className="w-4 h-4" />
                <span>Unduh File CSV ({locations.length} Lokasi)</span>
              </button>
            </div>
          </div>

          {/* Dedicated Photo CSV Export Card */}
          <div className="p-4 rounded-2xl bg-gradient-to-br from-purple-50/80 to-indigo-50/50 border border-purple-200 shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-purple-800">
                <ImageIcon className="w-4 h-4 text-purple-600" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-purple-950">
                  Download CSV Hasil Foto yang Diedit
                </h3>
              </div>
              <span className="px-2.5 py-0.5 rounded-full bg-purple-200 text-purple-900 text-[11px] font-bold">
                {locations.filter((l) => Boolean(l.imageUrl || (l.images && l.images.length > 0))).length} dari {locations.length} Berfoto
              </span>
            </div>

            <p className="text-xs text-purple-900/80 leading-relaxed">
              Ekspor rekap data survei lengkap dengan status foto, file/tautan foto, waktu dokumentasi terakhir, dan link navigasi Google Maps untuk tiap titik.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
              <button
                onClick={() => handleExportEditedPhotosCsv(true)}
                disabled={locations.filter((l) => Boolean(l.imageUrl || (l.images && l.images.length > 0))).length === 0}
                className="py-2.5 px-3 rounded-xl bg-purple-700 hover:bg-purple-800 active:bg-purple-900 text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition shadow-xs disabled:opacity-40"
              >
                <Download className="w-4 h-4" />
                <span>Unduh CSV Khusus Titik Berfoto ({locations.filter((l) => Boolean(l.imageUrl || (l.images && l.images.length > 0))).length})</span>
              </button>

              <button
                onClick={() => handleExportEditedPhotosCsv(false)}
                disabled={locations.length === 0}
                className="py-2.5 px-3 rounded-xl border border-purple-300 bg-white hover:bg-purple-100/50 text-purple-900 text-xs font-semibold flex items-center justify-center gap-1.5 transition disabled:opacity-40"
              >
                <Download className="w-4 h-4 text-purple-600" />
                <span>Unduh CSV Lengkap Semua Titik ({locations.length})</span>
              </button>
            </div>
          </div>

          {/* CSV Import Preview Modal / Box */}
          {csvPreview && (
            <div className="p-4 rounded-2xl bg-white border border-teal-200 shadow-lg space-y-4 animate-in fade-in">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <FileCheck className="w-5 h-5 text-teal-600" />
                  <div>
                    <h4 className="text-sm font-bold text-slate-900">Pratinjau Hasil Impor CSV</h4>
                    <p className="text-xs text-slate-500">
                      Periksa data sebelum disimpan ke penyimpanan aplikasi
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setCsvPreview(null)}
                  className="p-1 rounded-full text-slate-400 hover:bg-slate-100"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Summary Stats */}
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="p-2.5 rounded-xl bg-teal-50 border border-teal-200">
                  <p className="text-base font-bold text-teal-700">{csvPreview.validRows.length}</p>
                  <p className="text-[10px] font-semibold text-teal-800">Baris Valid</p>
                </div>
                <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200">
                  <p className="text-base font-bold text-amber-700">{csvPreview.duplicateCount}</p>
                  <p className="text-[10px] font-semibold text-amber-800">Koordinat Mirip</p>
                </div>
                <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200">
                  <p className="text-base font-bold text-rose-700">{csvPreview.invalidRows.length}</p>
                  <p className="text-[10px] font-semibold text-rose-800">Baris Bermasalah</p>
                </div>
              </div>

              {/* Invalid Rows Report */}
              {csvPreview.invalidRows.length > 0 && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs space-y-1.5">
                  <p className="font-bold text-rose-900 flex items-center gap-1.5">
                    <AlertCircle className="w-4 h-4 text-rose-600" />
                    Laporan Baris Tidak Valid ({csvPreview.invalidRows.length} baris diabaikan):
                  </p>
                  <ul className="space-y-1 max-h-32 overflow-y-auto text-rose-800 pl-5 list-disc text-[11px]">
                    {csvPreview.invalidRows.map((inv) => (
                      <li key={inv.rowNumber}>
                        <strong>Baris #{inv.rowNumber}:</strong> {inv.errors.join(', ')}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Sample Valid Rows Table */}
              {csvPreview.validRows.length > 0 && (
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <div className="max-h-48 overflow-y-auto text-xs">
                    <table className="w-full text-left">
                      <thead className="bg-slate-50 text-slate-700 text-[11px] uppercase border-b border-slate-200 sticky top-0">
                        <tr>
                          <th className="p-2">Baris</th>
                          <th className="p-2">Nama</th>
                          <th className="p-2">Koordinat</th>
                          <th className="p-2">Kategori</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {csvPreview.validRows.slice(0, 15).map((r) => (
                          <tr key={r.rowNumber} className="hover:bg-slate-50">
                            <td className="p-2 font-mono text-slate-400">#{r.rowNumber}</td>
                            <td className="p-2 font-semibold text-slate-800 truncate max-w-[140px]">
                              {r.data.name}
                            </td>
                            <td className="p-2 font-mono text-[11px] text-slate-600">
                              {r.data.latitude?.toFixed(4)}, {r.data.longitude?.toFixed(4)}
                            </td>
                            <td className="p-2 text-slate-600">{r.data.category}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {csvPreview.validRows.length > 15 && (
                    <div className="p-2 text-center text-[11px] text-slate-400 bg-slate-50 border-t border-slate-100">
                      dan {csvPreview.validRows.length - 15} baris valid lainnya...
                    </div>
                  )}
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setCsvPreview(null)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Batal
                </button>
                <button
                  type="button"
                  disabled={csvPreview.validRows.length === 0}
                  onClick={handleConfirmCsvImport}
                  className="px-5 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold shadow-xs disabled:opacity-40"
                >
                  Simpan {csvPreview.validRows.length} Lokasi Valid
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* JSON Section */}
      {activeTab === 'json' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Export JSON */}
          <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-3">
            <div className="flex items-center gap-2 text-teal-700">
              <Download className="w-4 h-4" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900">
                Backup Lengkap (JSON)
              </h3>
            </div>
            <p className="text-xs text-slate-500 leading-relaxed">
              Ekspor seluruh data lokasi dan semua susunan rute tersimpan ke format JSON terstruktur untuk cadangan aman.
            </p>
            <button
              onClick={handleExportJson}
              className="w-full py-2.5 px-4 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition shadow-xs"
            >
              <Download className="w-4 h-4" />
              <span>Unduh File Backup JSON</span>
            </button>
          </div>

          {/* Import JSON */}
          <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-3">
            <div className="flex items-center gap-2 text-teal-700">
              <Upload className="w-4 h-4" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900">
                Pulihkan / Restore (JSON)
              </h3>
            </div>
            <p className="text-xs text-slate-500 leading-relaxed">
              Pulihkan data dari file backup JSON sebelumnya. Data baru akan digabungkan secara aman tanpa menghapus entri unik.
            </p>

            <input
              ref={jsonFileInputRef}
              type="file"
              accept=".json,application/json"
              onChange={handleJsonFileChange}
              className="hidden"
            />

            <button
              onClick={() => jsonFileInputRef.current?.click()}
              className="w-full py-2.5 px-4 rounded-xl border border-teal-600 text-teal-700 hover:bg-teal-50 text-xs font-semibold flex items-center justify-center gap-1.5 transition"
            >
              <RefreshCw className="w-4 h-4" />
              <span>Pilih File Backup JSON</span>
            </button>
          </div>
        </div>
      )}

      {/* Cloud Sync Laptop <-> HP Section */}
      {activeTab === 'sync' && (
        <div className="space-y-4">
          <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5 text-purple-700">
                <div className="p-2 rounded-xl bg-purple-100 text-purple-700">
                  <Cloud className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    Sinkronisasi Antar Perangkat (Laptop & HP)
                  </h3>
                  <p className="text-xs text-slate-500">
                    Bekerja lancar di laptop dan HP dengan data & foto yang sama
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span>Server Aktif</span>
              </div>
            </div>

            {/* Visual Cross-Device Diagram */}
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 flex flex-col sm:flex-row items-center justify-around gap-4 text-center">
              <div className="flex flex-col items-center gap-1.5">
                <div className="w-12 h-12 rounded-2xl bg-white border border-slate-200 shadow-xs flex items-center justify-center text-slate-700">
                  <Laptop className="w-6 h-6 text-indigo-600" />
                </div>
                <span className="text-xs font-bold text-slate-800">Laptop / PC</span>
                <span className="text-[10px] text-slate-500 max-w-[120px]">Tambah titik & paste screenshot</span>
              </div>

              <div className="flex flex-col items-center gap-1 text-purple-600">
                <RefreshCw className="w-5 h-5 animate-spin" style={{ animationDuration: '6s' }} />
                <span className="text-[10px] font-bold text-purple-700">Sinkron Otomatis</span>
              </div>

              <div className="flex flex-col items-center gap-1.5">
                <div className="w-12 h-12 rounded-2xl bg-white border border-slate-200 shadow-xs flex items-center justify-center text-slate-700">
                  <Smartphone className="w-6 h-6 text-teal-600" />
                </div>
                <span className="text-xs font-bold text-slate-800">Handphone (HP)</span>
                <span className="text-[10px] text-slate-500 max-w-[120px]">Lihat foto laptop & foto kamera rute</span>
              </div>
            </div>

            <div className="space-y-2 text-xs text-slate-600 leading-relaxed bg-purple-50/60 p-3.5 rounded-xl border border-purple-100">
              <p className="font-semibold text-purple-950 flex items-center gap-1.5">
                <Check className="w-4 h-4 text-purple-600 flex-shrink-0" />
                <span>Bagaimana cara melihat foto laptop di HP?</span>
              </p>
              <ul className="list-disc list-inside space-y-1 text-slate-700 text-xs pl-1">
                <li>Buka tautan website ini di browser handphone Anda.</li>
                <li>Setiap kali Anda menambahkan titik atau foto di laptop, server langsung menyimpannya.</li>
                <li>Di HP Anda, titik dan foto tersebut akan otomatis muncul. Anda juga bisa mengklik tombol di bawah untuk menyegarkan seketika.</li>
              </ul>
            </div>

            <div className="pt-2 flex flex-col sm:flex-row gap-2">
              <button
                onClick={handleSyncNow}
                disabled={isSyncing}
                className="flex-1 py-3 px-4 rounded-xl bg-purple-600 hover:bg-purple-700 active:bg-purple-800 text-white text-xs font-bold flex items-center justify-center gap-2 transition shadow-md disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
                <span>{isSyncing ? 'Menyinkronkan dengan Server...' : 'Sinkronkan Data Sekarang (HP & Laptop)'}</span>
              </button>

              <button
                onClick={() => handleExportEditedPhotosCsv(true)}
                className="py-3 px-4 rounded-xl border border-purple-200 bg-white hover:bg-purple-50 text-purple-900 text-xs font-semibold flex items-center justify-center gap-1.5 transition"
              >
                <Download className="w-4 h-4 text-purple-600" />
                <span>Unduh Rekap CSV Foto</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Storage & Privacy Note */}
      <div className="p-3.5 rounded-2xl bg-slate-100/80 border border-slate-200 text-slate-600 text-xs space-y-1">
        <div className="flex items-center gap-1.5 font-bold text-slate-800">
          <Info className="w-3.5 h-3.5 text-teal-600" />
          <span>Privasi & Keamanan Data</span>
        </div>
        <p className="text-[11px] text-slate-500 leading-relaxed">
          GeoRoute Planner beroperasi 100% di browser pengguna tanpa mengirimkan koordinat ke server pihak ketiga. Seluruh koordinat GPS Anda tersimpan di penyimpanan lokal HP (LocalStorage). Untuk memindahkan data antar-perangkat, gunakan fitur Backup JSON atau Ekspor CSV.
        </p>
      </div>
    </div>
  );
};

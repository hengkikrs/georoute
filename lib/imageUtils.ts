/**
 * Utility to process, compress and convert uploaded/captured images
 * to optimized base64 JPEG strings for fast storage and rendering.
 */

export interface CompressImageOptions {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number; // 0.1 to 1.0
}

export async function processAndCompressImage(
  file: File,
  options: CompressImageOptions = {}
): Promise<string> {
  const { maxWidth = 1200, maxHeight = 1200, quality = 0.8 } = options;

  return new Promise((resolve, reject) => {
    // Basic file type validation
    if (!file.type.startsWith('image/')) {
      reject(new Error('File yang dipilih bukan berkas gambar.'));
      return;
    }

    const reader = new FileReader();

    reader.onerror = () => {
      reject(new Error('Gagal membaca file gambar.'));
    };

    reader.onload = (e) => {
      const result = e.target?.result as string;
      if (!result) {
        reject(new Error('Data gambar kosong.'));
        return;
      }

      const img = new Image();

      img.onerror = () => {
        reject(new Error('Gagal memuat gambar untuk diproses.'));
      };

      img.onload = () => {
        try {
          let { width, height } = img;

          // Calculate scaling
          if (width > maxWidth || height > maxHeight) {
            const widthRatio = maxWidth / width;
            const heightRatio = maxHeight / height;
            const ratio = Math.min(widthRatio, heightRatio);
            width = Math.round(width * ratio);
            height = Math.round(height * ratio);
          }

          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;

          const ctx = canvas.getContext('2d');
          if (!ctx) {
            // Fallback to original if canvas context unavailable
            resolve(result);
            return;
          }

          // Use high quality image smoothing
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';

          ctx.drawImage(img, 0, 0, width, height);

          // Convert to JPEG data URL
          const compressedDataUrl = canvas.toDataURL('image/jpeg', quality);
          resolve(compressedDataUrl);
        } catch (err) {
          console.warn('Compression error, falling back to original data URL:', err);
          resolve(result);
        }
      };

      img.src = result;
    };

    reader.readAsDataURL(file);
  });
}

/**
 * Capture current frame from HTMLVideoElement stream and compress to JPEG base64
 */
export function captureFrameFromVideo(
  video: HTMLVideoElement,
  options: CompressImageOptions = {}
): string | null {
  if (!video || !video.videoWidth || !video.videoHeight) return null;

  const { maxWidth = 1280, maxHeight = 1280, quality = 0.85 } = options;

  let width = video.videoWidth;
  let height = video.videoHeight;

  if (width > maxWidth || height > maxHeight) {
    const ratio = Math.min(maxWidth / width, maxHeight / height);
    width = Math.round(width * ratio);
    height = Math.round(height * ratio);
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(video, 0, 0, width, height);

  return canvas.toDataURL('image/jpeg', quality);
}

'use client';

import { createWorker } from 'tesseract.js';

/**
 * Memproses gambar struk (resize + grayscale + contrast stretch) di browser canvas
 * agar teks struk termal yang pudar lebih mudah dibaca oleh Tesseract.js.
 */
async function preprocessReceiptImage(file: File): Promise<Blob | File> {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return file;
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('Gagal memuat pratinjau gambar struk'));
      image.src = objectUrl;
    });

    const naturalW = img.naturalWidth || img.width;
    const naturalH = img.naturalHeight || img.height;
    if (!naturalW || !naturalH) return file;

    let targetW = naturalW;
    if (naturalW < 1200) {
      targetW = Math.min(1800, Math.round(naturalW * 2));
    } else if (naturalW > 2000) {
      targetW = 1800;
    }
    const scale = targetW / naturalW;
    const targetH = Math.round(naturalH * scale);

    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;

    const ctx = canvas.getContext('2d');
    if (!ctx) return file;

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, targetW, targetH);
    ctx.drawImage(img, 0, 0, targetW, targetH);

    const imageData = ctx.getImageData(0, 0, targetW, targetH);
    const data = imageData.data;

    let minLum = 255;
    let maxLum = 0;
    const lumValues = new Uint8Array(targetW * targetH);

    for (let i = 0, p = 0; i < data.length; i += 4, p += 1) {
      const lum = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
      lumValues[p] = lum;
      if (lum < minLum) minLum = lum;
      if (lum > maxLum) maxLum = lum;
    }

    const range = Math.max(1, maxLum - minLum);
    const contrastFactor = 1.35;

    for (let i = 0, p = 0; i < data.length; i += 4, p += 1) {
      const stretched = ((lumValues[p] - minLum) / range) * 255;
      const boosted = Math.max(0, Math.min(255, Math.round((stretched - 128) * contrastFactor + 128)));
      data[i] = boosted;
      data[i + 1] = boosted;
      data[i + 2] = boosted;
      data[i + 3] = 255;
    }

    ctx.putImageData(imageData, 0, 0);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((result) => resolve(result), 'image/png', 0.95)
    );
    return blob || file;
  } catch {
    return file;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

/**
 * Menjalankan Tesseract OCR dengan fallback bahasa ('ind+eng' -> 'eng')
 * serta memastikan worker selalu ditutup dengan aman di blok finally.
 */
export async function extractTextFromReceipt(
  file: File,
  onProgress?: (message: string) => void
): Promise<string> {
  onProgress?.('Mempertajam kualitas foto struk...');
  const preparedImage = await preprocessReceiptImage(file);

  const logger = (m: { status?: string; progress?: number }) => {
    if (m.status === 'recognizing text' && typeof m.progress === 'number') {
      const pct = Math.min(100, Math.round(m.progress * 100));
      onProgress?.(`Membaca teks struk... ${pct}%`);
    }
  };

  onProgress?.('Menyiapkan mesin OCR...');
  let worker: Awaited<ReturnType<typeof createWorker>> | null = null;
  try {
    try {
      worker = await createWorker('ind+eng', 1, { logger });
    } catch {
      onProgress?.('Menggunakan mode bahasa Inggris untuk OCR...');
      worker = await createWorker('eng', 1, { logger });
    }

    const result = await worker.recognize(preparedImage);
    const text = result?.data?.text?.trim() || '';
    if (!text) {
      throw new Error('Tidak ada teks yang terbaca pada foto struk. Coba foto ulang dengan cahaya lebih terang.');
    }
    return text;
  } finally {
    if (worker) {
      await worker.terminate().catch(() => {});
    }
  }
}


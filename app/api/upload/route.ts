import { NextRequest, NextResponse } from 'next/server';
import { saveImageFile } from '@/lib/serverStorage';

export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get('content-type') || '';

    if (contentType.includes('application/json')) {
      const { image, name } = await req.json();
      if (!image) {
        return NextResponse.json({ success: false, error: 'Tidak ada data gambar' }, { status: 400 });
      }

      const imageUrl = saveImageFile(image, name ? `photo_${Date.now()}_${name}` : undefined);
      return NextResponse.json({ success: true, url: imageUrl });
    }

    if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData();
      const file = formData.get('file') as File | null;
      if (!file) {
        return NextResponse.json({ success: false, error: 'File tidak ditemukan' }, { status: 400 });
      }

      const bytes = await file.arrayBuffer();
      const buffer = Buffer.from(bytes);
      const ext = file.name.split('.').pop() || 'jpg';
      const filename = `photo_${Date.now()}_${Math.random().toString(36).substring(2, 7)}.${ext}`;

      const imageUrl = saveImageFile(buffer, filename);
      return NextResponse.json({ success: true, url: imageUrl });
    }

    return NextResponse.json({ success: false, error: 'Tipe konten tidak didukung' }, { status: 400 });
  } catch (err) {
    console.error('API /api/upload error:', err);
    return NextResponse.json(
      { success: false, error: 'Gagal mengunggah gambar ke server' },
      { status: 500 }
    );
  }
}

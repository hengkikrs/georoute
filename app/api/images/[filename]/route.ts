import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

interface RouteContext {
  params: Promise<{
    filename: string;
  }>;
}

export async function GET(req: NextRequest, context: RouteContext) {
  try {
    const { filename } = await context.params;

    // Sanitize filename to prevent directory traversal
    const safeFilename = path.basename(filename);
    const filepath = path.join(process.cwd(), 'data', 'uploads', safeFilename);

    if (!fs.existsSync(filepath)) {
      return new NextResponse('Gambar tidak ditemukan', { status: 404 });
    }

    const fileBuffer = fs.readFileSync(filepath);
    const ext = safeFilename.split('.').pop()?.toLowerCase() || 'jpg';

    let mimeType = 'image/jpeg';
    if (ext === 'png') mimeType = 'image/png';
    else if (ext === 'webp') mimeType = 'image/webp';
    else if (ext === 'gif') mimeType = 'image/gif';
    else if (ext === 'svg') mimeType = 'image/svg+xml';

    return new NextResponse(fileBuffer, {
      status: 200,
      headers: {
        'Content-Type': mimeType,
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  } catch (err) {
    console.error('Error serving image:', err);
    return new NextResponse('Internal server error', { status: 500 });
  }
}

import type { Metadata, Viewport } from 'next';
import './globals.css';
import 'leaflet/dist/leaflet.css';

export const viewport: Viewport = {
  themeColor: '#0f766e',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
};

export const metadata: Metadata = {
  title: 'GeoRoute Planner — Navigasi & Pemetaan Multi-Lokasi',
  description: 'Aplikasi mobile-first untuk pencatatan titik lokasi POI, pemetaan interaktif, perencanaan rute multi-titik, dan navigasi langsung ke Google Maps.',
  openGraph: {
    title: 'GeoRoute Planner — Navigasi & Pemetaan Multi-Lokasi',
    description: 'Aplikasi mobile-first untuk pencatatan titik lokasi POI, pemetaan interaktif, perencanaan rute multi-titik, dan navigasi langsung ke Google Maps.',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'GeoRoute Planner — Navigasi & Pemetaan Multi-Lokasi',
    description: 'Aplikasi mobile-first untuk pencatatan titik lokasi POI, pemetaan interaktif, perencanaan rute multi-titik, dan navigasi langsung ke Google Maps.',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'GeoRoute',
  },
  icons: {
    icon: '/icon.svg',
    apple: '/icon.svg',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="id" suppressHydrationWarning>
      <body
        suppressHydrationWarning
        className="bg-slate-50 text-slate-900 antialiased font-sans min-h-screen selection:bg-teal-100 selection:text-teal-900"
      >
        <script
          dangerouslySetInnerHTML={{
            __html: `
              try {
                if (typeof window !== 'undefined') {
                  var _targetFetch = window.fetch;
                  try {
                    Object.defineProperty(window, 'fetch', {
                      get: function() { return _targetFetch; },
                      set: function(fn) { _targetFetch = fn; },
                      configurable: true,
                      enumerable: true
                    });
                  } catch (e1) {
                    try {
                      Object.defineProperty(Object.getPrototypeOf(window), 'fetch', {
                        get: function() { return _targetFetch; },
                        set: function(fn) { _targetFetch = fn; },
                        configurable: true,
                        enumerable: true
                      });
                    } catch (e2) {}
                  }
                }
              } catch (e) {}
            `,
          }}
        />
        {children}
      </body>
    </html>
  );
}

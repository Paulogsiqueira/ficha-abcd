import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  base: process.env.BASE_PATH || "/",
  plugins: [
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: false,
      includeAssets: ["apple-touch-icon.png"],
      manifest: {
        name: "Ficha ABCD",
        short_name: "Ficha ABCD",
        description: "Treino ABCD com registro de séries, cargas e evolução.",
        lang: "pt-BR",
        display: "standalone",
        orientation: "portrait",
        background_color: "#e9edf1",
        theme_color: "#17212b",
        start_url: ".",
        scope: ".",
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        // A página sempre vem da rede quando há internet (assim nunca aponta para arquivos antigos);
        // sem internet, usa a última cópia guardada.
        navigateFallback: null,
        globPatterns: ["**/*.{js,css,png,svg}"],
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          { urlPattern: ({ request }) => request.mode === "navigate", handler: "NetworkFirst", options: { cacheName: "paginas", networkTimeoutSeconds: 4, cacheableResponse: { statuses: [200] } } },
          { urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/, handler: "CacheFirst", options: { cacheName: "fontes", expiration: { maxEntries: 20, maxAgeSeconds: 31536000 }, cacheableResponse: { statuses: [0, 200] } } },
        ],
      },
    }),
  ],
});

import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg"],
      manifest: {
        name: "R2 Remote",
        short_name: "R2",
        description: "Remote control for Sphero R2-D2",
        display: "standalone",
        orientation: "any",
        background_color: "#07101c",
        theme_color: "#07101c",
        start_url: "/",
        icons: []
      }
    })
  ]
});

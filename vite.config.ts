/**
 * Relative paths (the site lives under /calorie-ai-tracker/) and a CSP
 * injected into the built page.
 *
 * The CSP lets the page call any https API (your AI provider, models.dev) and
 * local model servers, and nothing else. It is left out of the dev server, whose hot reload needs inline scripts.
 */
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

export const CSP = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self'",
  "connect-src 'self' https: http://localhost:* http://127.0.0.1:* data: blob:",
  "img-src 'self' blob: data:",
  "media-src 'self' blob:",
  "manifest-src 'self'",
  "base-uri 'none'",
  "form-action 'none'",
].join("; ");

const DESCRIPTION =
  "AI calorie tracker that runs in your browser: log meals by text, photo or voice, follow your week against your goals, ask an AI coach. Bring your own model; your data stays on your device.";

/** The CSP and the page's meta tags, in the build only. */
function head(): Plugin {
  return {
    name: "head",
    apply: "build",
    transformIndexHtml(html) {
      const tags = [
        `<meta http-equiv="Content-Security-Policy" content="${CSP}" />`,
        `<meta name="referrer" content="no-referrer" />`,
        `<meta name="description" content="${DESCRIPTION}" />`,
        `<meta property="og:title" content="calorie-ai-tracker" />`,
        `<meta property="og:description" content="${DESCRIPTION}" />`,
      ].join("\n    ");
      const charset = '<meta charset="UTF-8" />';
      return html.replace(charset, `${charset}\n    ${tags}`);
    },
  };
}

export default defineConfig({
  base: "./",
  plugins: [react(), tailwindcss(), head()],
  build: { target: "es2023", chunkSizeWarningLimit: 2000 },
  // Its own port, so a preview from another project is never mistaken for this one.
  preview: { port: 4317, strictPort: true },
});

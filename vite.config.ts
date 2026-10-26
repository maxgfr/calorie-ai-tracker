/**
 * Relative paths (the site lives under /calorie-ai-tracker/), a CSP injected
 * into the built page, and onnxruntime's WebAssembly served from this site
 * (`ort/`) for Whisper on the device, never from a CDN.
 *
 * The CSP lets the page call any https API (your AI provider, models.dev,
 * Hugging Face for the Whisper weights) and local model servers, and nothing
 * else. It is left out of the dev server, whose hot reload needs inline scripts.
 */
import { existsSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

export const CSP = [
  "default-src 'none'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "style-src 'self'",
  "connect-src 'self' https: http://localhost:* http://127.0.0.1:* data: blob:",
  "img-src 'self' blob: data:",
  "media-src 'self' blob:",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "base-uri 'none'",
  "form-action 'none'",
].join("; ");

const DESCRIPTION =
  "AI calorie tracker that runs in your browser: log meals by text, photo or voice, follow your week against your goals, ask an AI coach. Bring your own model; your data stays on your device.";

const ORT_FILES = ["ort-wasm-simd-threaded.asyncify.mjs", "ort-wasm-simd-threaded.asyncify.wasm"];

/** The onnxruntime-web build transformers.js itself loads. */
function ortDir(): string {
  const transformers = createRequire(import.meta.url).resolve("@huggingface/transformers");
  return dirname(createRequire(transformers).resolve("onnxruntime-web"));
}

/** onnxruntime-web's WebAssembly at `ort/`, in dev and in the build. */
function ort(): Plugin {
  let outDir = "dist";
  return {
    name: "ort-wasm",
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir);
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const file = ORT_FILES.find((f) => req.url?.endsWith(`/ort/${f}`));
        if (!file) return next();
        res.setHeader(
          "Content-Type",
          file.endsWith(".wasm") ? "application/wasm" : "text/javascript",
        );
        res.end(readFileSync(join(ortDir(), file)));
      });
    },
    generateBundle() {
      for (const f of ORT_FILES) {
        this.emitFile({
          type: "asset",
          fileName: `ort/${f}`,
          source: readFileSync(join(ortDir(), f)),
        });
      }
    },
    // The worker's bundle copies the same WebAssembly into assets/, where nothing loads it from.
    closeBundle() {
      const assets = join(outDir, "assets");
      if (!existsSync(assets)) return;
      for (const f of readdirSync(assets, { withFileTypes: true })) {
        if (/^ort-wasm-.*\.wasm$/.test(f.name)) rmSync(join(assets, f.name));
      }
    },
  };
}

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
  plugins: [react(), tailwindcss(), ort(), head()],
  worker: { format: "es" },
  build: { target: "es2023", chunkSizeWarningLimit: 2000 },
  preview: { port: 4173, strictPort: true },
});

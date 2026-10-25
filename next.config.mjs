/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // the stockfish.js emscripten bundle must not be bundled by webpack
  serverExternalPackages: ["stockfish.js"],
  outputFileTracingIncludes: {
    "/api/setup": ["./db/migrations/**/*"],
    // the engine is loaded via createRequire at runtime — static tracing can't
    // see it, so ship the WASM bundle explicitly with every engine route
    "/api/games/[id]/bot-move": ["./node_modules/stockfish.js/**"],
    "/api/games/[id]/analysis": ["./node_modules/stockfish.js/**"],
  },
};
export default nextConfig;

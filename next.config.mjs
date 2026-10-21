/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // the stockfish.js emscripten bundle must not be bundled by webpack
  serverExternalPackages: ["stockfish.js"],
};
export default nextConfig;

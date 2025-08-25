// next.config.mjs
/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'ipfs.io' },
      { protocol: 'https', hostname: '**.mypinata.cloud' },
      { protocol: 'https', hostname: 'gateway.pinata.cloud' },
    ],
  },
  webpack: (config) => {
    config.resolve.alias = {
      ...(config.resolve.alias || {}),
      'pino-pretty': false,     // hilangkan warning modul optional
      'react-native': false,    // kalau tidak dipakai
      '@metamask/sdk': false,   // jika tidak pakai MetaMask SDK langsung (cukup injected)
    };
    config.resolve.fallback = {
      ...(config.resolve.fallback || {}),
      encoding: false,          // hilangkan warning "encoding"
    };
    return config;
  },
};
export default nextConfig;

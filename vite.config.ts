import { defineConfig } from 'vite';
import { shiftPeerRelayVitePlugin } from './src/net/peerRelayServer';

export default defineConfig({
  plugins: [shiftPeerRelayVitePlugin()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    allowedHosts: true,
  },
  preview: {
    host: '0.0.0.0',
    port: 4173,
    allowedHosts: true,
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});

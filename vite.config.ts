import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

   const githubPagesBase = '/';
export default defineConfig({
  assetsInclude: ['**/*.glb'],
  base: githubPagesBase,
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom'],
          three: ['three', '@react-three/fiber', '@react-three/drei'],
        },
      },
    },
  },
  plugins: [react()],
});

import {defineConfig} from 'vite';
export default defineConfig({server:{proxy:{'/api':'http://127.0.0.1:4173'}},build:{chunkSizeWarningLimit:900,rollupOptions:{output:{manualChunks:{three:['three']}}}}});

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({base:process.env.DIPSY_BASE_PATH||'/',plugins:[react()],build:{chunkSizeWarningLimit:800},test:{include:['tests/**/*.test.ts']}});

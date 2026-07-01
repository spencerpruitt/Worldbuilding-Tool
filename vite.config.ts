import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';

export default {
    root: './src',
    base: process.env.NETLIFY ? '/' : '/Fantasy-Map-Generator/',
    plugins: [react()],
    build: {
        outDir: '../dist',
        assetsDir: './',
    },
    publicDir: '../public',
    resolve: {
        alias: {
            '@': fileURLToPath(new URL('./src', import.meta.url)),
        },
    },
}
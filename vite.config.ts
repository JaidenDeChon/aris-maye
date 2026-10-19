import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import { transmogData } from './scripts/transmog/vite-plugin';

export default defineConfig({
    plugins: [transmogData(), sveltekit()],
});

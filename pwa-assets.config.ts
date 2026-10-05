import { defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config'

// Run with `npm run icons` after changing public/icon.svg.
export default defineConfig({
  preset: {
    ...minimal2023Preset,
    // The stock preset shrinks these to 70 % on white; the icon is full-bleed.
    maskable: { sizes: [512], padding: 0 },
    apple: { sizes: [180], padding: 0 },
  },
  images: ['public/icon.svg'],
})

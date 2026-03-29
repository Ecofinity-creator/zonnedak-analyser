import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Pas 'zonnedak-analyser' aan naar de naam van jouw GitHub repository
export default defineConfig({
  plugins: [react()],
  base: '/zonnedak-analyser/',
})

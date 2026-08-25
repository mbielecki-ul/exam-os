import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Repo is served at https://mbielecki-ul.github.io/exam-os/ unless a custom
// domain (CNAME) is configured in /public — in that case set base back to '/'.
export default defineConfig({
  plugins: [react()],
  base: '/exam-os/',
})

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

function adminPortalCrmHookFix() {
  return {
    name: 'admin-portal-crm-hook-fix',
    enforce: 'pre',
    transform(code, id) {
      if (!id.endsWith('/src/pages/AdminPortal.jsx')) return null

      const stateAnchor = "  const [data, setData] = useState(null)\n"
      const conditionalHook = "            const [crmAccount, setCrmAccount] = React.useState('all')\n"

      if (!code.includes(stateAnchor)) {
        throw new Error('AdminPortal CRM hotfix anchor missing: data state')
      }
      if (!code.includes(conditionalHook)) {
        throw new Error('AdminPortal CRM hotfix anchor missing: conditional crmAccount hook')
      }

      const fixed = code
        .replace(stateAnchor, stateAnchor + "  const [crmAccount, setCrmAccount] = useState('all')\n")
        .replace(conditionalHook, '')

      return { code: fixed, map: null }
    }
  }
}

export default defineConfig({
  base: '/',
  plugins: [adminPortalCrmHookFix(), react()],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://127.0.0.1:3000', changeOrigin: true, secure: false },
      '/uploads': { target: 'http://127.0.0.1:3000', changeOrigin: true, secure: false }
    }
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    // Raise warning threshold — these are known heavy chunks
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        entryFileNames: `assets/[name]-[hash].js`,
        chunkFileNames: `assets/[name]-[hash].js`,
        // Split heavy libraries into separate chunks so they only load when needed
        manualChunks: (id) => {
          // PDF rendering — only loads on IRS forms / documents pages
          if (id.includes('pdfjs-dist') || id.includes('pdf.worker')) return 'pdf-worker'
          if (id.includes('pdf-lib')) return 'pdf-lib'
          // Excel — only loads on reports / exports
          if (id.includes('node_modules/xlsx')) return 'xlsx'
          // SignalWire / calling — only loads in Dialer
          if (id.includes('@signalwire') || id.includes('signalwire')) return 'signalwire'
          // Stripe — only loads in payments
          if (id.includes('@stripe') || id.includes('stripe')) return 'stripe'
          // React core stays in main
          if (id.includes('node_modules/react/') || id.includes('node_modules/react-dom/')) return 'react-vendor'
          // React Router
          if (id.includes('react-router')) return 'react-router'
          // Supabase
          if (id.includes('@supabase')) return 'supabase'
        }
      }
    }
  }
})

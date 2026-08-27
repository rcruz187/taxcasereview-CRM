import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Temporary compile-time safety patch for the legacy monolithic AdminPortal.
// The CRM tab currently declares crmAccount state inside a conditional render IIFE,
// which violates React's Rules of Hooks and crashes Command Center when CRM is opened.
// Keep the patch tightly scoped to CommandCenter and fail the build if the exact
// source anchors ever change, rather than silently rewriting the wrong component.
function commandCenterHookOrderFix() {
  return {
    name: 'command-center-hook-order-fix',
    enforce: 'pre',
    transform(code, id) {
      if (!id.endsWith('/src/pages/AdminPortal.jsx')) return null

      const start = code.indexOf('function CommandCenter()')
      const end = code.indexOf('// ── SupportCenterTab', start)
      if (start === -1 || end === -1) {
        throw new Error('Command Center hook fix: component boundaries not found')
      }

      const before = code.slice(0, start)
      let commandCenter = code.slice(start, end)
      const after = code.slice(end)

      const stateAnchor = "  const [data, setData] = useState(null)\n"
      const badHook = "            const [crmAccount, setCrmAccount] = React.useState('all')\n"
      const goodHook = "  const [crmAccount, setCrmAccount] = useState('all')\n"

      if ((commandCenter.match(/const \[data, setData\] = useState\(null\)/g) || []).length !== 1) {
        throw new Error('Command Center hook fix: data state anchor mismatch')
      }
      if ((commandCenter.match(/const \[crmAccount, setCrmAccount\] = React\.useState\('all'\)/g) || []).length !== 1) {
        throw new Error('Command Center hook fix: conditional CRM hook mismatch')
      }

      commandCenter = commandCenter
        .replace(stateAnchor, stateAnchor + goodHook)
        .replace(badHook, '')

      return { code: before + commandCenter + after, map: null }
    }
  }
}

export default defineConfig({
  base: '/',
  plugins: [commandCenterHookOrderFix(), react()],
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
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        entryFileNames: `assets/[name]-[hash].js`,
        chunkFileNames: `assets/[name]-[hash].js`,
        manualChunks: (id) => {
          if (id.includes('pdfjs-dist') || id.includes('pdf.worker')) return 'pdf-worker'
          if (id.includes('pdf-lib')) return 'pdf-lib'
          if (id.includes('node_modules/xlsx')) return 'xlsx'
          if (id.includes('@signalwire') || id.includes('signalwire')) return 'signalwire'
          if (id.includes('@stripe') || id.includes('stripe')) return 'stripe'
          if (id.includes('node_modules/react/') || id.includes('node_modules/react-dom/')) return 'react-vendor'
          if (id.includes('react-router')) return 'react-router'
          if (id.includes('@supabase')) return 'supabase'
        }
      }
    }
  }
})

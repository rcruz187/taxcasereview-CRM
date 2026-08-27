import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

function adminPortalCrmHookFix() {
  return {
    name: 'admin-portal-crm-hook-fix',
    enforce: 'pre',
    transform(code, id) {
      if (!id.endsWith('/src/pages/AdminPortal.jsx')) return null

      const commandCenterStart = code.indexOf('function CommandCenter(')
      if (commandCenterStart === -1) throw new Error('AdminPortal CRM fix: CommandCenter not found')

      const before = code.slice(0, commandCenterStart)
      let commandCenter = code.slice(commandCenterStart)
      const stateAnchor = "  const [data, setData] = useState(null)\n"
      const conditionalHook = "            const [crmAccount, setCrmAccount] = React.useState('all')\n"

      if (!commandCenter.includes(stateAnchor)) throw new Error('AdminPortal CRM fix: CommandCenter data state not found')
      if (!commandCenter.includes(conditionalHook)) throw new Error('AdminPortal CRM fix: conditional crmAccount hook not found')

      commandCenter = commandCenter
        .replace(stateAnchor, stateAnchor + "  const [crmAccount, setCrmAccount] = useState('all')\n")
        .replace(conditionalHook, '')

      return { code: before + commandCenter, map: null }
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

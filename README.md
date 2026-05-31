# Tax Case Review CRM — React Frontend

## Project Structure
```
tcr-client/               ← This React frontend
├── index.html            ← Vite entry point
├── vite.config.js        ← Vite config (proxies /api → localhost:3000)
├── package.json
└── src/
    ├── main.jsx          ← React entry
    ├── App.jsx           ← Router + auth guard + layout shell
    ├── index.css         ← Full design system (dark navy theme)
    ├── context/
    │   └── AppContext.jsx ← Global state (user, toast, modal, search)
    ├── hooks/
    │   └── useApi.js     ← fetch wrapper for Node.js backend
    ├── components/
    │   ├── layout/
    │   │   ├── Sidebar.jsx   ← Nav with all 20+ links
    │   │   └── TopBar.jsx    ← Search, clock, + New button
    │   └── ui/
    │       └── index.jsx     ← Badge, Avatar, Modal, Toast, Empty, Spinner
    └── pages/
        ├── Login.jsx
        ├── Dashboard.jsx     ← Full metrics + cases + tasks + deadlines
        ├── Leads.jsx         ← Full table with filter chips + add modal
        ├── Clients.jsx       ← Full table with type filter + add modal
        └── [17 more pages]   ← Scaffolded, ready to build out
```

## Daily Dev Workflow

### Start the backend (existing):
```bash
cd "Desktop\Tax Resolution CRM\TCR-Saas\tcr-node"
npm start
```

### Start the React dev server (new terminal):
```bash
cd "Desktop\Tax Resolution CRM\TCR-Saas\tcr-client"
npm run dev
```
→ Open http://localhost:5173

### Build for production (deploys to Node's /public folder):
```bash
cd tcr-client
npm run build
# Then copy dist/* to ../public/
```

## Next Steps (in order)
1. Wire up Cases page (full CRUD like Leads)
2. Wire up Tasks page
3. Wire up Calendar page
4. Wire up Invoices + Payments with Stripe
5. Wire up SMS with Twilio
6. Wire up Email
7. Deploy to Railway/Render for permanent hosting

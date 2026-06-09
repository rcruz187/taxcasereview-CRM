# SignalWire Backend — Tax Case Review CRM
All-in-one backend for browser dialer (WebRTC), SMS, and eFax.

## Setup

### 1. Get SignalWire credentials
1. Sign up at https://signalwire.com (free)
2. Create a project and note your **Space URL**, **Project ID**, **API Token**
3. Buy a phone number (~$1.15/mo) that supports voice + SMS + fax

### 2. Configure
```bash
cp .env.example .env
# Fill in your values
```

### 3. Run locally
```bash
npm install
npm run dev
```

### 4. Deploy (Railway — free tier)
1. Push to a GitHub repo or drag-drop to railway.app
2. Add env vars in Railway dashboard
3. Deploy — you get a URL like `https://your-app.railway.app`

### 5. Wire into CRM
Add to your CRM environment:
```
VITE_SIGNALWIRE_BACKEND=https://your-app.railway.app
```
Copy `signalwire-client.js` to `src/lib/signalwire.js` in the CRM.

## Webhooks to configure in SignalWire dashboard
| Feature | Webhook URL |
|---------|------------|
| Inbound calls | `https://your-app.railway.app/dialer/inbound` |
| Inbound SMS  | `https://your-app.railway.app/sms/inbound` |
| Inbound fax  | `https://your-app.railway.app/fax/inbound` |

## API Endpoints
| Method | Path | Description |
|--------|------|-------------|
| POST | /dialer/token | Get JWT for WebRTC browser calls |
| POST | /sms/send | Send SMS |
| GET  | /sms/history | Get SMS history |
| POST | /fax/send | Send eFax |
| GET  | /fax/history | Get fax history |
| GET  | /health | Health check |

## Cost estimate (SignalWire)
- Phone number: ~$1.15/month
- Calls: ~$0.008/min inbound, ~$0.014/min outbound
- SMS: ~$0.0075/message
- Fax: ~$0.01/page

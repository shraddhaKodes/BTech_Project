# SCADA Frontend

React + Vite dashboard for the IEEE 123-node feeder.

## Mock mode

Use mock mode when the backend or MATLAB stream is not running:

```bash
VITE_USE_MOCK=true npm run dev
```

On Windows PowerShell:

```powershell
$env:VITE_USE_MOCK="true"; npm run dev
```

Mock mode generates a daily-load sine pattern for selected feeder buses and always shows a `MOCK DATA` badge.

## Real mode

Start the backend on `http://127.0.0.1:5000`, then run:

```bash
VITE_API_BASE_URL=http://127.0.0.1:5000 VITE_USE_MOCK=false npm run dev
```

On Windows PowerShell:

```powershell
$env:VITE_API_BASE_URL="http://127.0.0.1:5000"; $env:VITE_USE_MOCK="false"; npm run dev
```

The frontend polls `GET /api/measurements?limit=500`. It does not call MongoDB or the ML service directly.

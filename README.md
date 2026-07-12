# Shelf Watch — Shop Product Counter

Next.js frontend (Vercel) + FastAPI backend (Render/Railway), calling your
Roboflow Rapid model. Detects products in uploaded footage and counts an
item as "sold" when it leaves the frame edge.

## Structure
```
backend/    FastAPI service — calls Roboflow API + runs the tracker
frontend/   Next.js app — video upload, live UI, calls the backend
```

## 1. Backend — run locally
```bash
cd backend
python -m venv venv
venv\Scripts\activate        # Windows
pip install -r requirements.txt

set ROBOFLOW_API_KEY=your_key_here     # Windows (PowerShell: $env:ROBOFLOW_API_KEY="...")
uvicorn main:app --reload --port 8000
```
Visit http://localhost:8000/health — should show `{"status": "ok", "api_key_set": true}`.

## 2. Frontend — run locally
```bash
cd frontend
npm install
cp .env.local.example .env.local   # then leave NEXT_PUBLIC_API_URL as localhost:8000
npm run dev
```
Visit http://localhost:3000.

## 3. Deploy backend (Render or Railway)
- New Web Service → point at `backend/`
- Start command: `uvicorn main:app --host 0.0.0.0 --port $PORT`
- Add environment variable: `ROBOFLOW_API_KEY = your_key_here`
- Note the deployed URL (e.g. `https://shelf-watch-api.onrender.com`)

## 4. Deploy frontend (Vercel)
- Import the repo, set root directory to `frontend/`
- Add environment variable: `NEXT_PUBLIC_API_URL = https://your-backend-url`
- Deploy

## Notes
- The Roboflow API key **only ever lives on the backend** (as an env var) — it's never sent to the browser, so this is the secure setup by default.
- `FRAME_INTERVAL_MS` in `frontend/app/page.tsx` controls how often a frame is sent to the API (default ~0.9s). Lower = more responsive tracking, more API calls.
- Tracking state lives in-memory on the backend per session — fine for demo/portfolio use; would need a database or Redis for multi-instance production scaling.

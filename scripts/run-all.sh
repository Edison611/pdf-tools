# Run backend (FastAPI with uvicorn) and frontend (Next.js) in parallel

# Start backend on 8081 — the port next.config.ts rewrites /api/pdf/* to
cd ../backend
uvicorn main:app --reload --port 8081 &

# Start frontend
cd ../frontend
npm run dev &

# Wait for both to finish (optional, keeps script running)
wait

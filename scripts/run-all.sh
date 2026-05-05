# Run backend (FastAPI with uvicorn) and frontend (Next.js) in parallel

# Start backend
cd ../backend
uvicorn main:app --reload &

# Start frontend
cd ../frontend
npm run dev &

# Wait for both to finish (optional, keeps script running)
wait

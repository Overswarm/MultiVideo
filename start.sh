#!/usr/bin/env bash
# MultiVideo launcher for macOS / Linux

PORT=8080
DIR="$(cd "$(dirname "$0")" && pwd)"

echo "Starting MultiVideo on http://localhost:$PORT"

# Start server in background
python3 -m http.server "$PORT" -d "$DIR" &
SERVER_PID=$!

# Wait briefly for server
sleep 1

# Open browser
if command -v xdg-open &>/dev/null; then
  xdg-open "http://localhost:$PORT"
elif command -v open &>/dev/null; then
  open "http://localhost:$PORT"
else
  echo "Open http://localhost:$PORT in your browser"
fi

echo "Press Ctrl+C to stop."
trap "kill $SERVER_PID 2>/dev/null; exit" INT TERM
wait $SERVER_PID

#!/bin/bash
#
# Claw Gains Auto-Reloading Server
# - Persistent server with auto-restart on crash
# - Auto-reloads when index.html changes
#

APP_DIR="/root/clawd/claw-gains"
BIND_IP="0.0.0.0"
PORT="8000"
LOG_FILE="/tmp/claw-gains-server.log"
PID_FILE="/tmp/claw-gains-server.pid"
WATCH_FILE="$APP_DIR/index.html"

# Function to start the server
start_server() {
    cd "$APP_DIR"
    nohup python3 -m http.server "$PORT" --bind "$BIND_IP" > "$LOG_FILE" 2>&1 &
    echo $! > "$PID_FILE"
    echo "[$(date)] Server started with PID $(cat $PID_FILE)" >> "$LOG_FILE"
}

# Function to stop the server
stop_server() {
    if [ -f "$PID_FILE" ]; then
        PID=$(cat "$PID_FILE")
        if kill "$PID" 2>/dev/null; then
            echo "[$(date)] Server stopped" >> "$LOG_FILE"
        fi
        rm -f "$PID_FILE"
    fi
}

# Function to restart the server
restart_server() {
    echo "[$(date)] Restarting server..." >> "$LOG_FILE"
    stop_server
    sleep 0.5
    start_server
}

# Handle signals
trap 'stop_server; exit 0' SIGTERM SIGINT SIGHUP

# Start the server
start_server

# Watch for changes to index.html and restart on change
# Using --format to get just the event type
while inotifywait -e modify,close_write,move_self "$WATCH_FILE" 2>/dev/null; do
    echo "[$(date)] Detected change to index.html, reloading..." >> "$LOG_FILE"
    restart_server
done

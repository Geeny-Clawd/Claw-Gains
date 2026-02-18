#!/bin/bash
#
# Claw Gains Auto-Reloading Server
# - Persistent server with auto-restart on crash
# - Auto-reloads when index.html or program.json changes
#

APP_DIR="/home/openclaw/.openclaw/workspace/claw-gains"
LOG_FILE="/home/openclaw/.openclaw/workspace/claw-gains/server.log"
PID_FILE="/home/openclaw/.openclaw/workspace/claw-gains/server.pid"
WATCH_FILES="$APP_DIR/index.html $APP_DIR/program.json $APP_DIR/server.py"

# Function to start the server
start_server() {
    cd "$APP_DIR"
    nohup uv run python server.py > "$LOG_FILE" 2>&1 &
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

# Watch for changes and restart on change
while inotifywait -e modify,close_write,move_self $WATCH_FILES 2>/dev/null; do
    echo "[$(date)] Detected file change, reloading..." >> "$LOG_FILE"
    restart_server
done

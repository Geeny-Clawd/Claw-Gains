# Claw Gains - Fitness App UI

A modern fitness dashboard built with vanilla HTML/CSS.

## Quick Start

```bash
# Start the auto-reloading server
/root/clawd/claw-gains/run-server.sh &

# Check if running
ps aux | grep "run-server.sh"

# View logs
tail -f /tmp/claw-gains-server.log
```

---

## Testing

This project includes a comprehensive test suite to ensure all functionality works correctly after code changes.

### Running Tests

**Option 1: Browser Test Runner**
1. Open `test-runner.html` in your browser
2. Tests run automatically and display results

**Option 2: Browser Console**
```javascript
// In browser console
runAllTests();
```

### Test Coverage

| Category | Tests |
|----------|-------|
| **Program Data Structure** | Validates 5-day program, all exercise sections, week A/B structure |
| **Week Toggle** | Switches between Week A/B, validates exercise filtering |
| **Day Navigation** | Day selection (1-5), bounds checking, day names |
| **Cycle Progression** | Cycle increment, max cycle (28) limit, reset behavior |
| **Data Persistence** | localStorage save/load, complex state merging |
| **Exercise Rendering** | All sections (warmup, mainA, prehab, accessories, shoulderHealth, calfTibialis, neck, flexibility, extra) |
| **Set Completion** | Checkbox toggles, auto-complete detection, completion tracking |
| **Weight Input & Progression** | Weight parsing, default values, last weight lookup, history |
| **History Display** | History generation, filtering, display formatting |
| **Edge Cases** | Empty states, missing data, boundary conditions, error handling |

### What Each Test Verifies

#### Program Data Structure
- `programData` contains all 5 workout days
- Each day has required sections (warmup, mainA, accessories, etc.)
- Week A/B exercises are properly structured
- Exercise objects have required properties (name, sets, reps, notes)

#### Week Toggle Functionality
- Toggling between Week A and Week B works correctly
- Week B exercises appear/disappear based on `isWeekB` flag
- State properly updates on toggle

#### Day Navigation
- Days 1-5 are accessible
- Day names display correctly (Lwr Qd, Up Push, etc.)
- Navigation respects bounds (can't go below 1 or above 5)

#### Cycle Progression
- Cycles increment from 1 to max (28)
- Week/day reset on new cycle start
- Maximum cycle limit enforced

#### Data Persistence
- State saves to localStorage correctly
- Complex nested state loads properly
- Reset clears all persisted data

#### Exercise Rendering
- All 9 sections render (warmup, mainA, prehab, accessories, shoulderHealth, calfTibialis, neck, flexibility, extra)
- Week-specific exercises filter correctly
- Day 3 includes calfTibialis, Day 5 includes neck/flexibility

#### Set Completion
- Checkbox toggles update state
- Auto-complete triggers when all sets done
- Day completion auto-advances to next day

#### Weight Input & Progression
- Weight input parsing (numbers, decimals)
- Default weight from targetWeight or last weight
- getLastWeight() returns correct value
- Weight history tracking per exercise

#### History Display
- getAllHistory() collects only completed sets with weight
- Recent history limits to 5 entries
- History display format (name, weight, reps, cycle, week)

#### Edge Cases
- Empty initial state works
- Missing data handled gracefully
- Boundary navigation (day 1, day 5)
- Invalid JSON parsing
- localStorage errors handled

---

## Service Management

### Start the Server
```bash
/root/clawd/claw-gains/run-server.sh &
```

### Stop the Server
```bash
# Kill the watcher script
pkill -f "run-server.sh"

# Or manually
kill $(cat /tmp/claw-gains-server.pid)
```

### Check if Running
```bash
# Method 1: Check PID file
cat /tmp/claw-gains-server.pid && ps -p $(cat /tmp/claw-gains-server.pid)

# Method 2: Check process
ps aux | grep "python3 -m http.server 8000"
```

### View Logs
```bash
# Live log tail
tail -f /tmp/claw-gains-server.log

# All logs
cat /tmp/claw-gains-server.log
```

## Features

- **Auto-Reload**: Server automatically restarts when `index.html` changes
- **Crash Recovery**: Server auto-restarts if it crashes (via watchdog loop)
- **Persistent**: Runs in background, survives terminal close

## How It Works

The `run-server.sh` script:
1. Starts Python HTTP server on port 8000
2. Watches `index.html` for changes using `inotifywait`
3. Restarts server when changes are detected
4. Auto-restarts on crash (the script stays alive; server restarts)

## Requirements

- `inotify-tools` package (for file watching)
- Python 3

## Installation (if needed)

```bash
apt-get update && apt-get install -y inotify-tools
```

## Access

The server binds to `0.0.0.0` (all interfaces), so it's accessible from:
- Local: http://localhost:8000
- Tailscale: http://ubuntu.taila2ab93.ts.net:8000
- Direct IP: http://<server-ip>:8000

Or via SSH tunnel:
```bash
ssh -N -L 18789:127.0.0.1:8000 root@<server-ip>
# Then: http://127.0.0.1:18789
```

## Troubleshooting

**Port already in use:**
```bash
lsof -i :8000
kill <PID>
```

**Watcher not starting:**
```bash
# Check if inotify-tools is installed
which inotifywait

# Install if missing
apt-get install -y inotify-tools
```

**Server not accessible:**
```bash
# Verify server is running
ps aux | grep http.server

# Check logs for errors
cat /tmp/claw-gains-server.log
```

## Manual Commands

```bash
# Kill all related processes
pkill -f "http.server 8000"
pkill -f "run-server.sh"

# Restart fresh
/root/clawd/claw-gains/run-server.sh &
```

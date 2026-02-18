import sqlite3
import os
from datetime import datetime, timezone

from flask import Flask, request, jsonify, send_from_directory

APP_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(APP_DIR, "workout.db")

app = Flask(__name__)


# --- SQLite setup ---

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


def init_db():
    conn = get_db()
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS workouts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            cycle INTEGER NOT NULL,
            week TEXT NOT NULL CHECK (week IN ('A', 'B')),
            day INTEGER NOT NULL CHECK (day BETWEEN 1 AND 5),
            note TEXT,
            completed_at TIMESTAMP,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(cycle, week, day)
        );

        CREATE TABLE IF NOT EXISTS exercises (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            workout_id INTEGER NOT NULL REFERENCES workouts(id) ON DELETE CASCADE,
            name TEXT NOT NULL,
            section TEXT NOT NULL,
            note TEXT,
            UNIQUE(workout_id, name)
        );

        CREATE TABLE IF NOT EXISTS sets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            exercise_id INTEGER NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
            set_num INTEGER NOT NULL,
            weight REAL,
            reps TEXT,
            done BOOLEAN NOT NULL DEFAULT 0
        );
    """)
    conn.close()


# --- Static file serving ---

@app.route("/")
def index():
    return send_from_directory(APP_DIR, "index.html")


@app.route("/<path:filename>")
def static_files(filename):
    return send_from_directory(APP_DIR, filename)


# --- API ---

@app.route("/api/workout", methods=["POST"])
def save_workout():
    data = request.get_json()
    if not data:
        return jsonify({"error": "No JSON body"}), 400

    cycle = data.get("cycle")
    week = data.get("week")
    day = data.get("day")
    day_note = data.get("day_note")
    completed_at = data.get("completed_at")
    exercises = data.get("exercises", [])

    if cycle is None or week is None or day is None:
        return jsonify({"error": "cycle, week, day are required"}), 400

    conn = get_db()
    try:
        cur = conn.cursor()

        # Upsert workout row
        cur.execute("""
            INSERT INTO workouts (cycle, week, day, note, completed_at)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(cycle, week, day) DO UPDATE SET
                note = excluded.note,
                completed_at = excluded.completed_at
        """, (cycle, week, day, day_note, completed_at))

        workout_id = cur.execute(
            "SELECT id FROM workouts WHERE cycle=? AND week=? AND day=?",
            (cycle, week, day)
        ).fetchone()[0]

        # Delete existing children and re-insert
        cur.execute("DELETE FROM exercises WHERE workout_id=?", (workout_id,))

        for ex in exercises:
            cur.execute("""
                INSERT INTO exercises (workout_id, name, section, note)
                VALUES (?, ?, ?, ?)
            """, (workout_id, ex["name"], ex["section"], ex.get("note")))
            exercise_id = cur.lastrowid

            for s in ex.get("sets", []):
                cur.execute("""
                    INSERT INTO sets (exercise_id, set_num, weight, reps, done)
                    VALUES (?, ?, ?, ?, ?)
                """, (exercise_id, s["set_num"], s.get("weight"), s.get("reps"), s.get("done", False)))

        conn.commit()
    except Exception as e:
        conn.rollback()
        return jsonify({"error": str(e)}), 500
    finally:
        conn.close()

    return jsonify({"ok": True})


@app.route("/health")
def health():
    return jsonify({"status": "ok"})


if __name__ == "__main__":
    init_db()
    app.run(host="0.0.0.0", port=8000)

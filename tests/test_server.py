from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

import server


class WorkoutApiTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.original_db_path = server.DB_PATH
        server.DB_PATH = str(Path(self.temp_dir.name) / "workout.db")
        server.init_db()
        self.client = server.app.test_client()

    def tearDown(self) -> None:
        server.DB_PATH = self.original_db_path
        self.temp_dir.cleanup()

    def test_workout_history_can_be_restored_as_complete_nested_records(self) -> None:
        response = self.client.post(
            "/api/workout",
            json={
                "cycle": 2,
                "week": "B",
                "day": 3,
                "day_note": "Strong session",
                "completed_at": "2026-07-18T18:30:00Z",
                "exercises": [
                    {
                        "name": "Front Squat",
                        "section": "mainA",
                        "note": "Stay upright",
                        "sets": [
                            {
                                "set_num": 1,
                                "weight": 85,
                                "reps": "5",
                                "done": True,
                            }
                        ],
                    }
                ],
            },
        )
        self.assertEqual(response.status_code, 200)

        response = self.client.get("/api/workouts")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.get_json(),
            {
                "workouts": [
                    {
                        "cycle": 2,
                        "week": "B",
                        "day": 3,
                        "day_note": "Strong session",
                        "completed_at": "2026-07-18T18:30:00Z",
                        "exercises": [
                            {
                                "name": "Front Squat",
                                "section": "mainA",
                                "note": "Stay upright",
                                "sets": [
                                    {
                                        "set_num": 1,
                                        "weight": 85.0,
                                        "reps": "5",
                                        "done": True,
                                    }
                                ],
                            }
                        ],
                    }
                ]
            },
        )


if __name__ == "__main__":
    unittest.main()

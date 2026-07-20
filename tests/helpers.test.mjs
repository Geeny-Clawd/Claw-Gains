import test from 'node:test';
import assert from 'node:assert/strict';
import {
    defaultState,
    sanitizeState,
    hasWeightLogged,
    toWeightNumber,
    getGhostForSet,
    getAllHistory,
    getPreviousWorkoutSets,
    getLastExerciseNote,
    getSectionForExercise,
    getMainExercisesForWeek,
    buildWorkoutPayload,
    getRestTargetSeconds,
    restoreWorkoutsIntoState,
    loadInitialState,
} from '../helpers.js';

const program = {
    1: {
        name: 'Lower',
        warmup: [{ name: 'Bodyweight Squats', sets: 1, reps: '10' }],
        mainA: {
            weekA: [{ name: 'Back Squat', sets: 3, reps: '8-12' }],
            weekB: [{ name: 'Front Squat', sets: 3, reps: '8-12' }],
        },
        prehab: [{ name: 'Hip Flexor Raises', sets: 2, reps: '20' }],
    },
};

// ── sanitizeState ────────────────────────────────────────────

test('sanitizeState returns defaults for garbage input', () => {
    assert.deepEqual(sanitizeState('nonsense'), defaultState);
    assert.deepEqual(sanitizeState(), defaultState);
});

test('sanitizeState clamps out-of-range navigation values', () => {
    const st = sanitizeState({ currentCycle: -2, currentDay: 9, currentWeek: 'C' });
    assert.equal(st.currentCycle, 1);
    assert.equal(st.currentDay, 1);
    assert.equal(st.currentWeek, 'A');
});

test('sanitizeState keeps valid values and coerces numeric strings', () => {
    const st = sanitizeState({ currentCycle: '3', currentDay: 4, currentWeek: 'B', exerciseLogs: { 3: {} } });
    assert.equal(st.currentCycle, 3);
    assert.equal(st.currentDay, 4);
    assert.equal(st.currentWeek, 'B');
    assert.deepEqual(st.exerciseLogs, { 3: {} });
});

test('sanitizeState replaces non-object collections', () => {
    const st = sanitizeState({ dayCompletion: 'bad', exerciseLogs: null, restTimerStartedAt: 'soon' });
    assert.deepEqual(st.dayCompletion, {});
    assert.deepEqual(st.exerciseLogs, {});
    assert.equal(st.restTimerStartedAt, null);
});

test('sanitizeState keeps valid rest targets and nulls bad ones', () => {
    assert.equal(sanitizeState({ restTimerTarget: 150 }).restTimerTarget, 150);
    assert.equal(sanitizeState({ restTimerTarget: '90' }).restTimerTarget, 90);
    assert.equal(sanitizeState({ restTimerTarget: -5 }).restTimerTarget, null);
    assert.equal(sanitizeState({ restTimerTarget: 'long' }).restTimerTarget, null);
    assert.equal(sanitizeState({}).restTimerTarget, null); // legacy state
});

test('server workouts restore logs, notes, and completion into empty state', () => {
    const restored = restoreWorkoutsIntoState(defaultState, [{
        cycle: 2,
        week: 'B',
        day: 3,
        day_note: 'Strong session',
        completed_at: '2026-07-18T18:30:00Z',
        exercises: [{
            name: 'Front Squat',
            section: 'mainA',
            note: 'Stay upright',
            sets: [{ set_num: 1, weight: 85, reps: '5', done: true }],
        }],
    }]);

    assert.deepEqual(
        restored.exerciseLogs[2].B[3]['Front Squat'],
        [{ weight: 85, reps: '5', done: true }],
    );
    assert.equal(restored.dayNotes[2].B[3], 'Strong session');
    assert.equal(restored.exerciseNotes[2].B[3]['Front Squat'], 'Stay upright');
    assert.equal(restored.dayCompletion[2].B[3], '2026-07-18T18:30:00Z');
});

test('existing local state is never replaced during server bootstrap', async () => {
    const local = {
        ...defaultState,
        currentCycle: 4,
        exerciseLogs: { 4: { A: { 1: { Press: [{ weight: 40, reps: '8', done: true }] } } } },
    };
    let serverFetches = 0;

    const selected = await loadInitialState(JSON.stringify(local), async () => {
        serverFetches += 1;
        return [{
            cycle: 1,
            week: 'A',
            day: 1,
            exercises: [{
                name: 'Squat',
                sets: [{ set_num: 1, weight: 100, reps: '5', done: true }],
            }],
        }];
    });

    assert.equal(serverFetches, 0);
    assert.equal(selected.currentCycle, 4);
    assert.equal(selected.exerciseLogs[1], undefined);
    assert.equal(selected.exerciseLogs[4].A[1].Press[0].weight, 40);
});

test('empty installation fetches and restores server workout history', async () => {
    let calls = 0;
    const restored = await loadInitialState(null, async () => {
        calls += 1;
        return [{
            cycle: 1,
            week: 'A',
            day: 1,
            completed_at: '2026-07-18T18:30:00Z',
            exercises: [{
                name: 'Squat',
                sets: [{ set_num: 1, weight: 100, reps: '5', done: true }],
            }],
        }];
    });

    assert.equal(calls, 1);
    assert.equal(restored.exerciseLogs[1].A[1].Squat[0].weight, 100);
    assert.equal(restored.dayCompletion[1].A[1], '2026-07-18T18:30:00Z');
});

// ── weight handling ──────────────────────────────────────────

test('hasWeightLogged accepts numbers, numeric strings, zero, and negatives', () => {
    assert.equal(hasWeightLogged({ weight: 100 }), true);
    assert.equal(hasWeightLogged({ weight: '12.5' }), true);
    assert.equal(hasWeightLogged({ weight: 0 }), true);
    assert.equal(hasWeightLogged({ weight: -15 }), true); // assisted pull-ups
});

test('hasWeightLogged rejects empty, partial, and missing values', () => {
    assert.equal(hasWeightLogged({ weight: null }), false);
    assert.equal(hasWeightLogged({ weight: '' }), false);
    assert.equal(hasWeightLogged({ weight: '-' }), false);
    assert.equal(hasWeightLogged({ weight: '12.' }), true); // Number('12.') === 12
    assert.equal(hasWeightLogged(undefined), false);
});

test('toWeightNumber converts raw strings at the boundary', () => {
    assert.equal(toWeightNumber('72.5'), 72.5);
    assert.equal(toWeightNumber(-10), -10);
    assert.equal(toWeightNumber('-'), null);
    assert.equal(toWeightNumber(''), null);
    assert.equal(toWeightNumber(null), null);
});

// ── ghost values ─────────────────────────────────────────────

const prevSets = [
    { weight: 60, reps: '10', done: true },
    { weight: 65, reps: '8', done: true },
];

test('ghost prefers nearest earlier set from this session', () => {
    const exLogs = [{ weight: 80, reps: '5', done: true }, {}];
    assert.deepEqual(getGhostForSet(exLogs, 1, prevSets), { weight: 80, reps: '5' });
});

test('ghost falls back to same set number from previous workout', () => {
    assert.deepEqual(getGhostForSet([], 1, prevSets), { weight: 65, reps: '8' });
});

test('ghost falls back to last done set when set number has no match', () => {
    assert.deepEqual(getGhostForSet([], 5, prevSets), { weight: 65, reps: '8' });
});

test('ghost is null with no history at all', () => {
    assert.equal(getGhostForSet([], 0, null), null);
});

// ── history lookups ──────────────────────────────────────────

const state = {
    ...defaultState,
    currentCycle: 2,
    currentWeek: 'A',
    currentDay: 1,
    exerciseLogs: {
        1: {
            A: { 1: { 'Back Squat': [{ weight: 60, reps: '10', done: true }] } },
            B: { 1: { 'Front Squat': [{ weight: 50, reps: '10', done: true }] } },
        },
        2: {
            A: { 1: { 'Back Squat': [{ weight: 70, reps: '8', done: true }] } },
        },
    },
    exerciseNotes: {
        1: { A: { 1: { 'Back Squat': 'belt on' } } },
        2: { A: { 1: { 'Back Squat': 'current session note' } } },
    },
};

test('getPreviousWorkoutSets excludes the current session and picks the latest', () => {
    // Current session is C2/A/1, so the latest other Back Squat session is C1/A/1.
    assert.deepEqual(getPreviousWorkoutSets(state, 'Back Squat'), [{ weight: 60, reps: '10', done: true }]);
});

test('getPreviousWorkoutSets returns null for unknown exercise', () => {
    assert.equal(getPreviousWorkoutSets(state, 'Nope'), null);
});

test('getLastExerciseNote skips the current session note', () => {
    assert.equal(getLastExerciseNote(state, 'Back Squat'), 'belt on');
});

test('getAllHistory collects done sets with session labels from keys', () => {
    const history = getAllHistory(state);
    assert.deepEqual(history['Front Squat'], [{ cycle: 1, week: 'B', day: 1, weight: 50, reps: '10' }]);
    assert.equal(history['Back Squat'].length, 2);
});

// ── program sections ─────────────────────────────────────────

test('getSectionForExercise finds week-dependent main work', () => {
    assert.equal(getSectionForExercise(program, 'A', 1, 'Back Squat'), 'mainA');
    assert.equal(getSectionForExercise(program, 'B', 1, 'Front Squat'), 'mainA');
    assert.equal(getSectionForExercise(program, 'A', 1, 'Hip Flexor Raises'), 'prehab');
});

test('getSectionForExercise falls back to unknown instead of throwing', () => {
    assert.equal(getSectionForExercise(program, 'A', 1, 'Renamed Exercise'), 'unknown');
});

test('getRestTargetSeconds maps sections to program rest guidance', () => {
    assert.equal(getRestTargetSeconds('mainA'), 150);      // compounds: 2–3 min
    assert.equal(getRestTargetSeconds('accessories'), 90); // accessories: 60–90 s
    assert.equal(getRestTargetSeconds('prehab'), 90);
    assert.equal(getRestTargetSeconds('warmup'), 60);
    assert.equal(getRestTargetSeconds('flexibility'), 60);
    assert.equal(getRestTargetSeconds('unknown'), 90);     // safe default
});

test('getMainExercisesForWeek validates week and day shape', () => {
    assert.equal(getMainExercisesForWeek(program[1], 'A')[0].name, 'Back Squat');
    assert.throws(() => getMainExercisesForWeek(program[1], 'C'));
    assert.throws(() => getMainExercisesForWeek({}, 'A'));
});

// ── payload building ─────────────────────────────────────────

test('buildWorkoutPayload converts raw weights and preserves stored completion time', () => {
    const st = {
        ...defaultState,
        dayCompletion: { 1: { A: { 1: '2026-06-11T10:00:00.000Z' } } },
        dayNotes: { 1: { A: { 1: 'good session' } } },
        exerciseLogs: {
            1: { A: { 1: { 'Back Squat': [{ weight: '72.5', reps: '8', done: true }, { weight: '-', reps: '', done: false }] } } },
        },
        exerciseNotes: { 1: { A: { 1: { 'Back Squat': 'felt heavy' } } } },
    };
    const payload = buildWorkoutPayload(st, program, { cycle: 1, week: 'A', day: 1 });
    assert.equal(payload.completed_at, '2026-06-11T10:00:00.000Z');
    assert.equal(payload.day_note, 'good session');
    assert.deepEqual(payload.exercises, [{
        name: 'Back Squat',
        section: 'mainA',
        note: 'felt heavy',
        sets: [
            { set_num: 1, weight: 72.5, reps: '8', done: true },
            { set_num: 2, weight: null, reps: null, done: false },
        ],
    }]);
});

test('buildWorkoutPayload handles incomplete days and legacy boolean completion', () => {
    const base = { ...defaultState, exerciseLogs: {}, dayCompletion: {} };
    const notDone = buildWorkoutPayload(base, program, { cycle: 1, week: 'A', day: 1 });
    assert.equal(notDone.completed_at, null);
    assert.deepEqual(notDone.exercises, []);

    const legacy = { ...base, dayCompletion: { 1: { A: { 1: true } } } };
    const payload = buildWorkoutPayload(legacy, program, { cycle: 1, week: 'A', day: 1 });
    assert.ok(typeof payload.completed_at === 'string' && !Number.isNaN(Date.parse(payload.completed_at)));
});

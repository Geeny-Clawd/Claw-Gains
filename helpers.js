// Pure app logic: state shape, sanitization, history lookups, payload building.
// No DOM, no globals — everything takes its inputs explicitly so node can test it.

export const defaultState = {
    currentCycle: 1,
    currentDay: 1,
    currentWeek: 'A',
    dayCompletion: {},
    exerciseLogs: {},
    dayNotes: {},
    exerciseNotes: {},
    restTimerStartedAt: null,
    restTimerTarget: null
};

export function sanitizeState(raw = {}) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) raw = {};
    const st = { ...defaultState, ...raw };

    const cycleNum = Number(st.currentCycle);
    st.currentCycle = Number.isFinite(cycleNum) && cycleNum >= 1 ? Math.floor(cycleNum) : 1;

    const dayNum = Number(st.currentDay);
    st.currentDay = Number.isFinite(dayNum) && dayNum >= 1 && dayNum <= 5 ? Math.floor(dayNum) : 1;

    st.currentWeek = (st.currentWeek === 'A' || st.currentWeek === 'B') ? st.currentWeek : 'A';

    st.dayCompletion = (st.dayCompletion && typeof st.dayCompletion === 'object') ? st.dayCompletion : {};
    st.exerciseLogs = (st.exerciseLogs && typeof st.exerciseLogs === 'object') ? st.exerciseLogs : {};
    st.dayNotes = (st.dayNotes && typeof st.dayNotes === 'object') ? st.dayNotes : {};
    st.exerciseNotes = (st.exerciseNotes && typeof st.exerciseNotes === 'object') ? st.exerciseNotes : {};
    const restAt = Number(st.restTimerStartedAt);
    st.restTimerStartedAt = Number.isFinite(restAt) && restAt > 0 ? restAt : null;
    const restTarget = Number(st.restTimerTarget);
    st.restTimerTarget = Number.isFinite(restTarget) && restTarget > 0 ? Math.floor(restTarget) : null;

    return st;
}

// Rest targets (seconds) by program guidance: compounds 2–3 min (use the
// midpoint), accessories/prehab 60–90 s (use the top), warm-up and
// stretching just need a breather. The chip signals when the target is hit.
export function restoreWorkoutsIntoState(baseState, workouts) {
    const state = JSON.parse(JSON.stringify(sanitizeState(baseState)));
    for (const workout of Array.isArray(workouts) ? workouts : []) {
        const cycle = Number(workout?.cycle);
        const day = Number(workout?.day);
        const week = workout?.week;
        if (!Number.isInteger(cycle) || cycle < 1 || !Number.isInteger(day)
            || day < 1 || day > 5 || !['A', 'B'].includes(week)) continue;

        if (!state.exerciseLogs[cycle]) state.exerciseLogs[cycle] = {};
        if (!state.exerciseLogs[cycle][week]) state.exerciseLogs[cycle][week] = {};
        if (!state.exerciseLogs[cycle][week][day]) state.exerciseLogs[cycle][week][day] = {};

        for (const exercise of Array.isArray(workout.exercises) ? workout.exercises : []) {
            if (!exercise || typeof exercise.name !== 'string' || !exercise.name) continue;
            const sets = [];
            for (const storedSet of Array.isArray(exercise.sets) ? exercise.sets : []) {
                const setNum = Number(storedSet?.set_num);
                if (!Number.isInteger(setNum) || setNum < 1) continue;
                while (sets.length < setNum) sets.push({ weight: null, reps: '', done: false });
                sets[setNum - 1] = {
                    weight: storedSet.weight,
                    reps: storedSet.reps || '',
                    done: Boolean(storedSet.done),
                };
            }
            state.exerciseLogs[cycle][week][day][exercise.name] = sets;
            if (exercise.note) {
                if (!state.exerciseNotes[cycle]) state.exerciseNotes[cycle] = {};
                if (!state.exerciseNotes[cycle][week]) state.exerciseNotes[cycle][week] = {};
                if (!state.exerciseNotes[cycle][week][day]) state.exerciseNotes[cycle][week][day] = {};
                state.exerciseNotes[cycle][week][day][exercise.name] = exercise.note;
            }
        }
        if (workout.day_note) {
            if (!state.dayNotes[cycle]) state.dayNotes[cycle] = {};
            if (!state.dayNotes[cycle][week]) state.dayNotes[cycle][week] = {};
            state.dayNotes[cycle][week][day] = workout.day_note;
        }
        if (workout.completed_at) {
            if (!state.dayCompletion[cycle]) state.dayCompletion[cycle] = {};
            if (!state.dayCompletion[cycle][week]) state.dayCompletion[cycle][week] = {};
            state.dayCompletion[cycle][week][day] = workout.completed_at;
        }
    }
    return state;
}

function parseSavedState(savedStateJson) {
    if (typeof savedStateJson !== 'string' || !savedStateJson) return null;
    try {
        const parsed = JSON.parse(savedStateJson);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            return sanitizeState(parsed);
        }
    } catch {
        // Corrupt browser state should recover from the server.
    }
    return null;
}

export async function loadInitialState(savedStateJson, fetchServerWorkouts) {
    const savedState = parseSavedState(savedStateJson);
    if (savedState) return savedState;
    const workouts = await fetchServerWorkouts();
    return restoreWorkoutsIntoState(defaultState, workouts);
}

export function getRestTargetSeconds(section) {
    switch (section) {
        case 'mainA': return 150;
        case 'warmup':
        case 'flexibility': return 60;
        default: return 90;
    }
}

export function invariant(condition, message) {
    if (!condition) throw new Error(message);
}

export function getWeekKey(week) {
    invariant(week === 'A' || week === 'B', `Unexpected week value: ${week}`);
    return `week${week}`;
}

export function getMainExercisesForWeek(dayData, week, context = 'unknown') {
    invariant(dayData && typeof dayData === 'object', `[${context}] Missing day data`);
    invariant(dayData.mainA && typeof dayData.mainA === 'object', `[${context}] Missing mainA block`);
    const weekKey = getWeekKey(week);
    const exercises = dayData.mainA[weekKey];
    invariant(Array.isArray(exercises), `[${context}] Missing/invalid exercises for ${weekKey}`);
    return exercises;
}

// Falls back to 'unknown' rather than throwing: a renamed exercise in
// program.json must not be able to permanently block syncing old logs.
export function getSectionForExercise(program, week, dayNum, exerciseName) {
    invariant(program && typeof program === 'object', 'Program data not loaded');
    const dayData = program[dayNum];
    invariant(dayData, `Missing day ${dayNum} in program data`);
    const sectionMap = {
        warmup: dayData.warmup || [],
        mainA: getMainExercisesForWeek(dayData, week, `getSectionForExercise day=${dayNum}`),
        prehab: dayData.prehab || [],
        accessories: dayData.accessories || [],
        shoulderHealth: dayData.shoulderHealth || [],
        calfTibialis: dayData.calfTibialis || [],
        neck: dayData.neck || [],
        flexibility: dayData.flexibility || [],
        extra: dayData.extra || []
    };
    for (const [section, exercises] of Object.entries(sectionMap)) {
        if (exercises.some(ex => ex.name === exerciseName)) return section;
    }
    return 'unknown';
}

// Weights are kept as the raw input string so partial entries ("-", "12.")
// survive re-renders of the controlled input; convert at the point of use.
export function hasWeightLogged(log) {
    const w = log?.weight;
    if (w === null || w === undefined || w === '') return false;
    return Number.isFinite(Number(w));
}

export function toWeightNumber(w) {
    return hasWeightLogged({ weight: w }) ? Number(w) : null;
}

// Ghost values: what a set would inherit if checked off without typing —
// the nearest earlier set logged this session, else the same set number
// from the previous workout, else that workout's last completed set.
export function getGhostForSet(exLogs, setIndex, prevSets) {
    for (let i = setIndex - 1; i >= 0; i--) {
        const prev = exLogs[i];
        if (prev && (hasWeightLogged(prev) || prev.reps || prev.done)) {
            return { weight: hasWeightLogged(prev) ? prev.weight : null, reps: prev.reps || '' };
        }
    }
    if (prevSets) {
        const matching = prevSets[setIndex];
        if (matching && hasWeightLogged(matching)) {
            return { weight: matching.weight, reps: matching.reps || '' };
        }
        const lastDone = [...prevSets].reverse().find(s => s && s.done && hasWeightLogged(s));
        if (lastDone) return { weight: lastDone.weight, reps: lastDone.reps || '' };
    }
    return null;
}

export function getAllHistory(state) {
    const history = {};
    const logs = state.exerciseLogs || {};
    for (const [cycle, cycleData] of Object.entries(logs)) {
        for (const [week, weekData] of Object.entries(cycleData)) {
            for (const [day, dayData] of Object.entries(weekData)) {
                for (const [exName, exLogs] of Object.entries(dayData)) {
                    for (const log of exLogs) {
                        if (log.done && hasWeightLogged(log)) {
                            if (!history[exName]) history[exName] = [];
                            history[exName].push({
                                cycle: parseInt(cycle),
                                week,
                                day: parseInt(day),
                                weight: log.weight,
                                reps: log.reps
                            });
                        }
                    }
                }
            }
        }
    }
    return history;
}

export function getPreviousWorkoutSets(state, exerciseName) {
    const { currentCycle, currentWeek, currentDay } = state;
    const logs = state.exerciseLogs || {};
    const sessions = [];
    for (const [c, cycleData] of Object.entries(logs)) {
        for (const [w, weekData] of Object.entries(cycleData)) {
            for (const [d, dayData] of Object.entries(weekData)) {
                if (+c === currentCycle && w === currentWeek && +d === currentDay) continue;
                const exLogs = dayData[exerciseName];
                if (exLogs && exLogs.some(log => log.done && hasWeightLogged(log))) {
                    sessions.push({ cycle: +c, week: w, day: +d, sets: exLogs });
                }
            }
        }
    }
    if (sessions.length === 0) return null;
    sessions.sort((a, b) => {
        if (a.cycle !== b.cycle) return a.cycle - b.cycle;
        if (a.week !== b.week) return a.week < b.week ? -1 : 1;
        return a.day - b.day;
    });
    return sessions[sessions.length - 1].sets;
}

export function getLastExerciseNote(state, exerciseName) {
    const notes = state.exerciseNotes || {};
    const { currentCycle, currentWeek, currentDay } = state;
    const candidates = [];
    for (const [c, cycleData] of Object.entries(notes)) {
        for (const [w, weekData] of Object.entries(cycleData)) {
            for (const [d, dayData] of Object.entries(weekData)) {
                const note = dayData[exerciseName];
                if (note && note.trim()) {
                    if (+c === currentCycle && w === currentWeek && +d === currentDay) continue;
                    candidates.push({ cycle: +c, week: w, day: +d, note });
                }
            }
        }
    }
    candidates.sort((a, b) =>
        a.cycle !== b.cycle ? a.cycle - b.cycle :
        a.week !== b.week ? (a.week === 'A' ? -1 : 1) :
        a.day - b.day
    );
    return candidates.length > 0 ? candidates[candidates.length - 1].note : null;
}

export function buildWorkoutPayload(state, program, target) {
    const { cycle, week, day } = target;
    const logs = state.exerciseLogs[cycle]?.[week]?.[day] || {};
    // Completion is stored as an ISO timestamp (legacy data may have `true`).
    const doneMark = state.dayCompletion[cycle]?.[week]?.[day];
    const dayNote = (state.dayNotes && state.dayNotes[cycle]?.[week]?.[day]) || null;

    const exercises = [];
    for (const [name, sets] of Object.entries(logs)) {
        const exNote = (state.exerciseNotes && state.exerciseNotes[cycle]?.[week]?.[day]?.[name]) || null;
        exercises.push({
            name,
            section: getSectionForExercise(program, week, day, name),
            note: exNote,
            sets: sets.map((s, i) => ({
                set_num: i + 1,
                weight: toWeightNumber(s.weight),
                reps: s.reps || null,
                done: !!s.done
            }))
        });
    }

    return {
        cycle, week, day,
        day_note: dayNote,
        completed_at: typeof doneMark === 'string'
            ? doneMark
            : (doneMark ? new Date().toISOString() : null),
        exercises
    };
}

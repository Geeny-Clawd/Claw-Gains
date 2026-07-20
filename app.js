import { h, render, useEffect, useCallback, signal, htm } from './vendor/preact-bundle.js';
import {
    sanitizeState,
    invariant,
    getMainExercisesForWeek,
    hasWeightLogged,
    getGhostForSet,
    getAllHistory,
    getPreviousWorkoutSets,
    getLastExerciseNote,
    buildWorkoutPayload,
    getSectionForExercise,
    getRestTargetSeconds,
    loadInitialState,
} from './helpers.js';

const html = htm.bind(h);

const RUNTIME_ID = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

// ── Error reporting ──────────────────────────────────────────

function renderFatal(message, detail = '') {
    const root = document.getElementById('app');
    const fallback = document.getElementById('bootFallback');
    if (fallback) fallback.style.display = 'none';
    if (!root) return;
    root.innerHTML = `
        <div style="padding:16px;color:#ff8a8a;font-family:system-ui">
            <div style="font-weight:600;margin-bottom:8px">Claw Gains hit an error</div>
            <div style="margin-bottom:8px">${message}</div>
            ${detail ? `<div style="opacity:.8;font-size:.85em;word-break:break-word">${detail}</div>` : ''}
            <div style="margin-top:10px;font-size:.8em;opacity:.75">Session: ${RUNTIME_ID}</div>
        </div>`;
}

function safeStringify(value) {
    try {
        return JSON.stringify(value);
    } catch {
        return String(value);
    }
}

function reportClientError(kind, payload = {}) {
    const body = {
        kind,
        runtimeId: RUNTIME_ID,
        href: location.href,
        ...payload,
    };
    return fetch('/api/client-error', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    }).catch(() => {});
}

// Before boot, an error means the app never came up: show the fatal screen.
// After boot, replacing the UI would kill an in-progress workout over a
// possibly harmless error, so just report it and show a dismissible toast.
function handleGlobalError(detail) {
    if (!window.__clawgainsBooted) {
        window.__clawgainsBooted = true;
        if (window.__clawgainsBootTimer) clearTimeout(window.__clawgainsBootTimer);
        renderFatal('Claw Gains failed to start. Please refresh.', detail);
    } else {
        showErrorToast();
    }
}

function showErrorToast() {
    let toast = document.getElementById('errorToast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'errorToast';
        toast.className = 'error-toast';
        toast.textContent = 'Something went wrong (error logged). Your data is saved locally. Tap to dismiss.';
        toast.addEventListener('click', () => toast.remove());
        document.body.appendChild(toast);
    }
    clearTimeout(toast._hideTimer);
    toast._hideTimer = setTimeout(() => toast.remove(), 8000);
}

window.addEventListener('error', (evt) => {
    const detail = evt?.error?.stack || evt?.message || 'Unknown error';
    reportClientError('window.error', {
        message: evt?.message,
        source: evt?.filename,
        line: evt?.lineno,
        col: evt?.colno,
        stack: evt?.error?.stack,
    });
    handleGlobalError(detail);
});

window.addEventListener('unhandledrejection', (evt) => {
    const reason = evt?.reason;
    const detail = typeof reason === 'string' ? reason : (reason?.stack || reason?.message || 'Unhandled promise rejection');
    reportClientError('window.unhandledrejection', {
        reason: typeof reason === 'string' ? reason : safeStringify(reason),
        stack: reason?.stack,
    });
    handleGlobalError(detail);
});

// ── Signals ──────────────────────────────────────────────────

const savedStateJson = localStorage.getItem('clawgains_state');
const appState = signal(sanitizeState());
const nowTick = signal(Date.now());
const programData = signal(null);
const isFinishing = signal(false);
const finishError = signal(null);

// ── Persistence ──────────────────────────────────────────────

function persistAndSync(options = {}) {
    const { skipSync = false } = options;
    localStorage.setItem('clawgains_state', JSON.stringify(appState.value));
    if (!skipSync) debouncedSync();
}

function mutateState(fn, options = {}) {
    fn(appState.value);
    appState.value = { ...appState.value };
    persistAndSync(options);
}

// Days with local changes not yet confirmed by the server. Tracked per
// day so that switching days before the debounce fires can't drop the
// previous day's sync.
const dirtyTargets = new Map();

let syncTimer = null;
function debouncedSync() {
    const st = appState.value;
    const target = { cycle: st.currentCycle, week: st.currentWeek, day: st.currentDay };
    dirtyTargets.set(`${target.cycle}|${target.week}|${target.day}`, target);
    clearTimeout(syncTimer);
    syncTimer = setTimeout(flushDirtyTargets, 2000);
}

async function flushDirtyTargets() {
    if (!programData.value) return;
    for (const [key, target] of [...dirtyTargets]) {
        dirtyTargets.delete(key);
        try {
            await syncWorkoutToServer(target);
        } catch (err) {
            // Keep it dirty; the next mutation's debounce retries it.
            if (err?.name !== 'AbortError') dirtyTargets.set(key, target);
        }
    }
}

let inFlightSync = null;
async function syncWorkoutToServer(target) {
    if (inFlightSync) inFlightSync.abort();
    const ctrl = new AbortController();
    inFlightSync = ctrl;
    try {
        const payload = buildWorkoutPayload(appState.value, programData.value, target);
        const resp = await fetch('/api/workout', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            signal: ctrl.signal
        });
        if (!resp.ok) {
            throw new Error(`Workout sync failed: ${resp.status}`);
        }
    } finally {
        if (inFlightSync === ctrl) inFlightSync = null;
    }
}

// ── State helpers ────────────────────────────────────────────

function getExerciseLogs(st, ensureExists = false) {
    if (!st.exerciseLogs[st.currentCycle]) {
        if (!ensureExists) return null;
        st.exerciseLogs[st.currentCycle] = {};
    }
    if (!st.exerciseLogs[st.currentCycle][st.currentWeek]) {
        if (!ensureExists) return null;
        st.exerciseLogs[st.currentCycle][st.currentWeek] = {};
    }
    if (!st.exerciseLogs[st.currentCycle][st.currentWeek][st.currentDay]) {
        if (!ensureExists) return null;
        st.exerciseLogs[st.currentCycle][st.currentWeek][st.currentDay] = {};
    }
    return st.exerciseLogs[st.currentCycle][st.currentWeek][st.currentDay];
}

function ensureSetLog(st, exerciseName, setNum) {
    const dayLogs = getExerciseLogs(st, true);
    if (!dayLogs[exerciseName]) dayLogs[exerciseName] = [];
    const sets = dayLogs[exerciseName];
    while (sets.length < setNum) sets.push({ weight: null, reps: '', done: false });
    return sets;
}

// ── Rest-done notification ───────────────────────────────────

function ensureAudioReady() {
    // Intentionally no-op. Creating or resuming Web Audio can steal mobile
    // audio focus and mute music apps when the tracker is opened/used.
}

function notifyRestDone() {
    try { navigator.vibrate?.(200); } catch { /* unsupported (iOS) */ }
}

// ── Actions ──────────────────────────────────────────────────

function toggleSet(exerciseName, setNum) {
    const st = appState.value;
    const exLogs = st.exerciseLogs[st.currentCycle]?.[st.currentWeek]?.[st.currentDay]?.[exerciseName] || [];
    const current = exLogs[setNum - 1];
    const hasWeight = hasWeightLogged(current);
    const hasReps = !!(current?.reps && String(current.reps).trim() !== '');
    const ghost = (!hasWeight || !hasReps)
        ? getGhostForSet(exLogs, setNum - 1, getPreviousWorkoutSets(st, exerciseName))
        : null;

    let restTarget;
    try {
        restTarget = getRestTargetSeconds(
            getSectionForExercise(programData.value, st.currentWeek, st.currentDay, exerciseName));
    } catch {
        restTarget = getRestTargetSeconds('unknown');
    }
    if (!current?.done) ensureAudioReady();

    mutateState(s => {
        const sets = ensureSetLog(s, exerciseName, setNum);
        const log = sets[setNum - 1];
        if (log.done) {
            log.done = false;
            if (log.imputedWeight) { log.weight = null; log.imputedWeight = false; }
            if (log.imputedReps) { log.reps = ''; log.imputedReps = false; }
        } else {
            if (!hasWeight) log.weight = ghost ? ghost.weight : null;
            if (!hasReps) log.reps = ghost ? ghost.reps : '';
            log.done = true;
            log.imputedWeight = !hasWeight;
            log.imputedReps = !hasReps;
            s.restTimerStartedAt = Date.now();
            s.restTimerTarget = restTarget;
        }
    });
}

function updateWeight(exerciseName, setNum, value) {
    mutateState(st => {
        const log = ensureSetLog(st, exerciseName, setNum)[setNum - 1];
        log.weight = value === '' ? null : value;
        log.imputedWeight = false;
    });
}

function updateReps(exerciseName, setNum, value) {
    mutateState(st => {
        const log = ensureSetLog(st, exerciseName, setNum)[setNum - 1];
        log.reps = value;
        log.imputedReps = false;
    });
}

function updateDayNote(value) {
    mutateState(st => {
        const { currentCycle: c, currentWeek: w, currentDay: d } = st;
        if (!st.dayNotes[c]) st.dayNotes[c] = {};
        if (!st.dayNotes[c][w]) st.dayNotes[c][w] = {};
        st.dayNotes[c][w][d] = value;
    });
}

function updateExerciseNote(exerciseName, value, inheritedNote) {
    const trimmed = value.trim();
    const inheritedTrimmed = (inheritedNote || '').trim();
    if (trimmed === '' && inheritedTrimmed === '') return;
    if (trimmed === inheritedTrimmed) return;
    mutateState(st => {
        const { currentCycle: c, currentWeek: w, currentDay: d } = st;
        if (!st.exerciseNotes[c]) st.exerciseNotes[c] = {};
        if (!st.exerciseNotes[c][w]) st.exerciseNotes[c][w] = {};
        if (!st.exerciseNotes[c][w][d]) st.exerciseNotes[c][w][d] = {};
        st.exerciseNotes[c][w][d][exerciseName] = value;
    });
}

function addSet(exerciseName) {
    mutateState(st => {
        ensureSetLog(st, exerciseName, 0).push({ weight: null, reps: '', done: false });
    });
}

function removeSet(exerciseName, setNum) {
    mutateState(st => {
        const dayLogs = getExerciseLogs(st);
        if (dayLogs?.[exerciseName]?.[setNum - 1]) {
            dayLogs[exerciseName].splice(setNum - 1, 1);
        }
    });
}

async function finishWorkout() {
    if (isFinishing.value) return;

    clearTimeout(syncTimer);

    const st = appState.value;
    const target = {
        cycle: st.currentCycle,
        week: st.currentWeek,
        day: st.currentDay
    };
    const wasComplete = st.dayCompletion[target.cycle]?.[target.week]?.[target.day];
    const completedAt = new Date().toISOString();

    if (!wasComplete) {
        const dayLogs = st.exerciseLogs[target.cycle]?.[target.week]?.[target.day] || {};
        const totalDone = Object.values(dayLogs).reduce((n, sets) => n + sets.filter(s => s.done).length, 0);
        if (totalDone === 0 && !confirm('No sets logged for today. Mark this day complete anyway?')) {
            return;
        }
    }

    finishError.value = null;
    isFinishing.value = true;

    // Always persist local state immediately, but don't debounce-sync here.
    // Keep the original timestamp when re-finishing an already-complete day.
    mutateState(s => {
        if (!s.dayCompletion[target.cycle]) s.dayCompletion[target.cycle] = {};
        if (!s.dayCompletion[target.cycle][target.week]) s.dayCompletion[target.cycle][target.week] = {};
        s.dayCompletion[target.cycle][target.week][target.day] =
            typeof wasComplete === 'string' ? wasComplete : completedAt;
        s.restTimerStartedAt = null;
        s.restTimerTarget = null;
    }, { skipSync: true });

    try {
        await syncWorkoutToServer(target);
        dirtyTargets.delete(`${target.cycle}|${target.week}|${target.day}`);
        flushDirtyTargets();

        // Only advance after server confirms save.
        if (!wasComplete) {
            mutateState(s => {
                if (s.currentCycle !== target.cycle || s.currentWeek !== target.week || s.currentDay !== target.day) {
                    return;
                }
                if (s.currentDay < 5) {
                    s.currentDay++;
                }
            }, { skipSync: true });
        }

        alert('Workout saved! Great job!');
    } catch (err) {
        if (err?.name === 'AbortError') return;
        finishError.value = 'Saved locally, but sync to server failed. Retry Finish.';
        alert('Saved locally, but sync failed. Please tap Finish again.');
    } finally {
        isFinishing.value = false;
    }
}

function nextCycle() {
    if (appState.value.currentCycle >= 28) {
        alert('Maximum cycle reached!');
        return;
    }
    mutateState(st => {
        st.currentCycle++;
        st.currentDay = 1;
        st.currentWeek = 'A';
    }, { skipSync: true });
}

// ── Components ───────────────────────────────────────────────

function Header() {
    return html`
        <div class="header">
            <span class="header-title">Claw Gains</span>
            <div class="header-actions">
                <${RestTimerChip} />
                <button class="finish-btn" disabled=${isFinishing.value} onClick=${finishWorkout}>
                    ${isFinishing.value ? 'Saving…' : 'Finish'}
                </button>
            </div>
        </div>
        ${finishError.value ? html`<div style="margin: 8px 16px; color: #ff8a8a; font-size: 0.8rem;">${finishError.value}</div>` : null}
    `;
}

function fmtClock(totalSecs) {
    const mins = Math.floor(totalSecs / 60);
    const secs = totalSecs % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// Tracks which rest period already got its "go" beep, so re-renders,
// day switches, or reloads can't replay it.
let restNotifiedFor = null;

function RestTimerChip() {
    const startedAt = appState.value.restTimerStartedAt;
    const target = appState.value.restTimerTarget;

    useEffect(() => {
        if (!startedAt) return;
        nowTick.value = Date.now();
        const id = setInterval(() => {
            nowTick.value = Date.now();
        }, 1000);
        return () => clearInterval(id);
    }, [startedAt]);

    const stopRest = useCallback(() => {
        mutateState(st => {
            st.restTimerStartedAt = null;
            st.restTimerTarget = null;
        }, { skipSync: true });
    }, []);
    const elapsed = startedAt ? Math.max(0, Math.floor((nowTick.value - startedAt) / 1000)) : 0;
    const ready = !!startedAt && !!target && elapsed >= target;

    useEffect(() => {
        if (!ready || restNotifiedFor === startedAt) return;
        restNotifiedFor = startedAt;
        // Only chime on a live crossing — not when a reload or tab return
        // lands on an already-expired timer.
        if (elapsed - target <= 2) notifyRestDone();
    }, [ready, startedAt]);

    return html`
        <div class=${`rest-chip ${startedAt ? '' : 'inactive'} ${ready ? 'ready' : ''}`}>
            <span class="rest-label">${ready ? 'Go' : 'Rest'}</span>
            <span class="rest-time">
                ${fmtClock(elapsed)}${startedAt && target ? html`<span class="rest-target">/${fmtClock(target)}</span>` : null}
            </span>
            ${startedAt ? html`<button class="rest-reset" title="Reset rest timer" onClick=${stopRest}>×</button>` : null}
        </div>
    `;
}

function WeekToggle() {
    const st = appState.value;
    const setWeek = (week) => mutateState(s => { s.currentWeek = week; }, { skipSync: true });

    return html`
        <div class="week-toggle">
            <button class="week-btn week-a ${st.currentWeek === 'A' ? 'active' : ''}"
                    onClick=${() => setWeek('A')}>Week A</button>
            <button class="week-btn week-b ${st.currentWeek === 'B' ? 'active' : ''}"
                    onClick=${() => setWeek('B')}>Week B</button>
        </div>
    `;
}

function DayNav() {
    const st = appState.value;
    const dayNames = ['Lwr Qd', 'Up Push', 'Lwr PC', 'Up Pull', 'Arms/Mob'];

    return html`
        <div class="day-nav">
            ${dayNames.map((name, i) => {
                const day = i + 1;
                const isCompleted = st.dayCompletion[st.currentCycle]?.[st.currentWeek]?.[day];
                const isActive = st.currentDay === day;
                return html`
                    <button class="day-btn ${isActive ? 'active' : ''} ${isCompleted ? 'completed' : ''}"
                            onClick=${() => mutateState(s => { s.currentDay = day; }, { skipSync: true })}
                            key=${day}>
                        ${name}
                    </button>
                `;
            })}
        </div>
    `;
}

function SetRow({ exerciseName, set, isExtra, exLogs, prevSets, ex }) {
    const logData = exLogs[set - 1];
    const hasRealWeight = hasWeightLogged(logData);
    const hasRealReps = !!logData?.reps;
    const isTimeMetric = ex?.metric === 'time';

    const ghost = getGhostForSet(exLogs, set - 1, prevSets);
    const weight = logData?.weight ?? '';
    const reps = hasRealReps ? logData.reps : '';
    const done = !!logData?.done;
    const ghostWeight = (!hasRealWeight && ghost && ghost.weight != null) ? ghost.weight : '';
    const ghostReps = (!hasRealReps && ghost) ? ghost.reps : '';

    const prevSetData = prevSets ? prevSets[set - 1] : null;
    const prevDisplay = (prevSetData && prevSetData.done && hasWeightLogged(prevSetData)) ? `${prevSetData.weight}×${prevSetData.reps}` : '';

    const weightPlaceholder = ghostWeight !== '' ? String(ghostWeight) : '—';
    const repsPlaceholder = ghostReps !== '' ? String(ghostReps) : '—';

    const onRepsChange = (e) => {
        const v = isTimeMetric ? e.target.value : e.target.value.replace(/[^0-9]/g, '');
        updateReps(exerciseName, set, v);
    };

    return html`
        <tr>
            <td class="set-num">${set}${isExtra ? '*' : ''}</td>
            <td class="prev-val">${prevDisplay}</td>
            <td><input type="number" class="kg-input" value=${weight}
                onInput=${(e) => updateWeight(exerciseName, set, e.target.value)}
                placeholder=${weightPlaceholder} step="1" /></td>
            <td><input type="text" class="reps-input" value=${reps}
                inputmode=${isTimeMetric ? 'text' : 'numeric'}
                pattern=${isTimeMetric ? null : '[0-9]*'}
                onInput=${onRepsChange}
                placeholder=${repsPlaceholder} /></td>
            <td>${isExtra ? html`<button class="remove-set-btn" onClick=${() => removeSet(exerciseName, set)}>✕</button>` : ''}</td>
            <td class="check-col">
                <div class="check-btn ${done ? 'checked' : ''}"
                     onClick=${() => toggleSet(exerciseName, set)}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>
                </div>
            </td>
        </tr>
    `;
}

function ExerciseRow({ ex, logs }) {
    const st = appState.value;
    const exLogs = logs[ex.name] || [];
    const prevSets = getPreviousWorkoutSets(st, ex.name);
    const actualSets = Math.max(ex.sets, exLogs.length);
    const note = ex.note ? `${ex.reps} · ${ex.note}` : ex.reps;
    const rawNote = st.exerciseNotes[st.currentCycle]?.[st.currentWeek]?.[st.currentDay]?.[ex.name];
    const hasOwnNote = rawNote !== undefined;
    const exNoteVal = rawNote || '';
    const inheritedNote = !hasOwnNote ? (getLastExerciseNote(st, ex.name) || '') : '';
    const isInherited = !hasOwnNote && inheritedNote !== '';

    const sets = [];
    for (let s = 1; s <= actualSets; s++) {
        sets.push(s);
    }

    return html`
        <div class="exercise-row">
            <div class="exercise-info">
                <div class="exercise-info-left">
                    <span class="exercise-name">${ex.name}</span>
                    <span class="exercise-note">${note}</span>
                    <input type="text"
                        class=${`exercise-note-input${isInherited ? ' inherited' : ''}`}
                        placeholder="Add note..."
                        value=${exNoteVal || inheritedNote}
                        onInput=${(e) => updateExerciseNote(ex.name, e.target.value, inheritedNote)} />
                </div>
                <span class="exercise-target">${ex.sets}×</span>
            </div>
            <table class="sets-table">
                <thead><tr>
                    <th class="set-col">#</th>
                    <th class="prev-col">Prev</th>
                    <th class="kg-col">kg</th>
                    <th class="reps-col">${ex.metric === 'time' ? 'Time' : 'Reps'}</th>
                    <th class="remove-col"></th>
                    <th class="check-col"></th>
                </tr></thead>
                <tbody>
                    ${sets.map(s => html`
                        <${SetRow}
                            key=${`${ex.name}-${s}`}
                            exerciseName=${ex.name}
                            set=${s}
                            isExtra=${s > ex.sets}
                            exLogs=${exLogs}
                            prevSets=${prevSets}
                            ex=${ex}
                        />
                    `)}
                </tbody>
            </table>
            <button class="add-set-btn" onClick=${() => addSet(ex.name)}>+ Add Set</button>
        </div>
    `;
}

function ExerciseSection({ title, exercises, logs }) {
    if (!exercises || exercises.length === 0) return null;
    return html`
        <div class="group-card">
            <div class="group-header">
                <h3>${title}</h3>
            </div>
            ${exercises.map(ex => html`
                <${ExerciseRow} key=${ex.name} ex=${ex} logs=${logs} />
            `)}
        </div>
    `;
}

function History() {
    const history = getAllHistory(appState.value);
    const entries = Object.entries(history);
    if (entries.length === 0) return null;

    // Most recently trained exercises first (by their latest logged session).
    const latest = ([, logs]) => logs[logs.length - 1];
    entries.sort((a, b) => {
        const la = latest(a), lb = latest(b);
        if (la.cycle !== lb.cycle) return lb.cycle - la.cycle;
        if (la.week !== lb.week) return la.week === 'B' ? -1 : 1;
        return (lb.day || 0) - (la.day || 0);
    });

    return html`
        <div class="history-section">
            <h2>Recent Progress</h2>
            ${entries.slice(0, 5).map(([name, logs]) => {
                const lastLog = logs[logs.length - 1];
                return html`
                    <div class="history-item" key=${name}>
                        <span class="history-date">${name}</span>
                        <span>${lastLog.weight}kg × ${lastLog.reps} · C${lastLog.cycle}W${lastLog.week}</span>
                    </div>
                `;
            })}
        </div>
    `;
}

function WeekCompleteBanner() {
    return html`
        <div class="week-complete-banner">
            <h3>Week Complete!</h3>
            <p>Ready to start the next cycle?</p>
            <button onClick=${nextCycle}>Next Cycle</button>
        </div>
    `;
}

function DayNote() {
    const st = appState.value;
    const dayNoteVal = (st.dayNotes[st.currentCycle]?.[st.currentWeek]?.[st.currentDay]) || '';

    return html`
        <div class="day-note-wrap">
            <textarea class="day-note-area" placeholder="Session notes..."
                value=${dayNoteVal}
                onChange=${(e) => updateDayNote(e.target.value)}></textarea>
        </div>
    `;
}

function WorkoutContent() {
    const pd = programData.value;
    if (!pd) return null;

    const st = appState.value;
    const dayData = pd[st.currentDay];
    invariant(dayData, `Missing day ${st.currentDay} in program data`);
    const exercises = getMainExercisesForWeek(dayData, st.currentWeek, `WorkoutContent day=${st.currentDay}`);
    const logs = st.exerciseLogs[st.currentCycle]?.[st.currentWeek]?.[st.currentDay] || {};

    const filterWeekB = (arr) => arr ? arr.filter(ex => !ex.isWeekB || st.currentWeek === 'B') : [];

    const completedDays = (() => {
        const weekData = st.dayCompletion[st.currentCycle]?.[st.currentWeek] || {};
        return Object.values(weekData).filter(Boolean).length;
    })();

    return html`
        <div id="workoutContent">
            <h2>${dayData.name}</h2>
            <${DayNote} />
            <${ExerciseSection} title="Warm-up" exercises=${dayData.warmup} logs=${logs} />
            <${ExerciseSection} title="Main Work" exercises=${exercises} logs=${logs} />
            ${dayData.prehab ? html`<${ExerciseSection} title="Prehab" exercises=${filterWeekB(dayData.prehab)} logs=${logs} />` : null}
            ${dayData.accessories ? html`<${ExerciseSection} title="Accessories" exercises=${filterWeekB(dayData.accessories)} logs=${logs} />` : null}
            ${dayData.shoulderHealth ? html`<${ExerciseSection} title="Shoulder Health" exercises=${filterWeekB(dayData.shoulderHealth)} logs=${logs} />` : null}
            ${dayData.calfTibialis ? html`<${ExerciseSection} title="Calf/Tibialis" exercises=${filterWeekB(dayData.calfTibialis)} logs=${logs} />` : null}
            ${dayData.neck ? html`<${ExerciseSection} title="Neck" exercises=${filterWeekB(dayData.neck)} logs=${logs} />` : null}
            ${dayData.flexibility ? html`<${ExerciseSection} title="Flexibility" exercises=${filterWeekB(dayData.flexibility)} logs=${logs} />` : null}
            <${ExerciseSection} title="Extra Time" exercises=${filterWeekB(dayData.extra)} logs=${logs} />
            ${completedDays === 5 ? html`<${WeekCompleteBanner} />` : null}
            <${History} />
        </div>
    `;
}

function App() {
    return html`
        <${Header} />
        <div id="mainView">
            <${WeekToggle} />
            <${DayNav} />
            <${WorkoutContent} />
        </div>
    `;
}

// ── Bootstrap ────────────────────────────────────────────────

async function init() {
    try {
        const [programResponse, initialState] = await Promise.all([
            fetch('/program.json'),
            loadInitialState(savedStateJson, async () => {
                const response = await fetch('/api/workouts', { cache: 'no-store' });
                if (!response.ok) {
                    throw new Error(`Failed to restore workouts (${response.status})`);
                }
                const payload = await response.json();
                if (!Array.isArray(payload?.workouts)) {
                    throw new Error('Workout history response is invalid');
                }
                return payload.workouts;
            }),
        ]);
        if (!programResponse.ok) {
            throw new Error(`Failed to load program.json (${programResponse.status})`);
        }
        programData.value = await programResponse.json();
        appState.value = initialState;
        localStorage.setItem('clawgains_state', JSON.stringify(initialState));
        render(html`<${App} />`, document.getElementById('app'));
        const fallback = document.getElementById('bootFallback');
        if (fallback) fallback.style.display = 'none';
        window.__clawgainsBooted = true;
        if (window.__clawgainsBootTimer) clearTimeout(window.__clawgainsBootTimer);
    } catch (err) {
        reportClientError('init.failure', {
            message: err?.message,
            stack: err?.stack,
        });
        renderFatal('Failed to load Claw Gains. Please refresh.', err?.message || 'Unknown init error');
        window.__clawgainsBooted = true;
        if (window.__clawgainsBootTimer) clearTimeout(window.__clawgainsBootTimer);
        console.error(err);
    }
}

init();

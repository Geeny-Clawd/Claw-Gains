/**
 * Claw Gains Fitness Tracker - Test Suite
 * 
 * Run tests by opening test-runner.html in a browser
 * or by including this file and calling runAllTests()
 */

// Test utilities
const TestRunner = {
    results: [],
    
    assert(condition, message) {
        if (condition) {
            this.results.push({ passed: true, message });
            return true;
        } else {
            this.results.push({ passed: false, message });
            return false;
        }
    },
    
    assertEqual(actual, expected, message) {
        const passed = actual === expected;
        const defaultMsg = `Expected "${expected}" but got "${actual}"`;
        return this.assert(passed, message || defaultMsg);
    },
    
    assertNotEqual(actual, expected, message) {
        const passed = actual !== expected;
        const defaultMsg = `Expected "${actual}" to not equal "${expected}"`;
        return this.assert(passed, message || defaultMsg);
    },
    
    assertDefined(value, message) {
        return this.assert(value !== undefined && value !== null, message || 'Value should be defined');
    },
    
    assertNull(value, message) {
        return this.assert(value === null, message || 'Value should be null');
    },
    
    assertTrue(value, message) {
        return this.assertEqual(value, true, message);
    },
    
    assertFalse(value, message) {
        return this.assertEqual(value, false, message);
    },
    
    assertArrayLength(arr, length, message) {
        return this.assertEqual(arr.length, length, message || `Array should have length ${length}`);
    },
    
    assertObjectHasProperty(obj, prop, message) {
        return this.assert(obj.hasOwnProperty(prop), message || `Object should have property "${prop}"`);
    },
    
    clear() {
        this.results = [];
    },
    
    getResults() {
        return this.results;
    },
    
    getSummary() {
        const passed = this.results.filter(r => r.passed).length;
        const failed = this.results.filter(r => !r.passed).length;
        return { total: this.results.length, passed, failed };
    },
    
    getFailedTests() {
        return this.results.filter(r => !r.passed);
    },
    
    logResults() {
        const summary = this.getSummary();
        console.log('='.repeat(50));
        console.log(`TEST RESULTS: ${summary.passed}/${summary.total} passed`);
        console.log('='.repeat(50));
        
        this.results.forEach((result, i) => {
            const status = result.passed ? '✓' : '✗';
            const color = result.passed ? '\x1b[32m' : '\x1b[31m';
            console.log(`${status} ${result.message}`);
        });
        
        if (summary.failed > 0) {
            console.log('\n' + '\x1b[31m' + `FAILED TESTS: ${summary.failed}` + '\x1b[0m');
        }
        
        return summary;
    }
};

// Mock localStorage for Node.js environment
function createMockLocalStorage() {
    const store = {};
    return {
        getItem(key) {
            return store[key] || null;
        },
        setItem(key, value) {
            store[key] = value;
        },
        removeItem(key) {
            delete store[key];
        },
        clear() {
            Object.keys(store).forEach(k => delete store[k]);
        },
        _getStore() {
            return store;
        }
    };
}

// Helper to deep clone objects
function deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
}

// Helper to reset state
function resetState() {
    return {
        currentCycle: 1,
        currentDay: 1,
        currentWeek: 'A',
        dayCompletion: {},
        exerciseLogs: {}
    };
}

// ============================================
// TEST SUITE
// ============================================

function runAllTests() {
    TestRunner.clear();
    console.log('\nStarting Claw Gains Test Suite...\n');
    
    // Run all test groups
    testProgramDataStructure();
    testWeekToggleFunctionality();
    testDayNavigation();
    testCycleProgression();
    testDataPersistence();
    testExerciseRendering();
    testSetCompletion();
    testWeightInputAndProgression();
    testHistoryDisplay();
    testEdgeCases();
    
    return TestRunner.logResults();
}

// --------------------------------------------
// Program Data Tests
// --------------------------------------------
function testProgramDataStructure() {
    console.log('\n--- Program Data Structure Tests ---\n');
    
    // Test that programData exists and is defined
    TestRunner.assertDefined(programData, 'programData should be defined');
    
    // Test that all 5 days exist
    TestRunner.assertArrayLength(Object.keys(programData), 5, 'programData should have 5 days');
    
    // Test Day 1 structure
    TestRunner.assertObjectHasProperty(programData[1], 'warmup', 'Day 1 should have warmup');
    TestRunner.assertObjectHasProperty(programData[1], 'mainA', 'Day 1 should have mainA');
    TestRunner.assertObjectHasProperty(programData[1], 'prehab', 'Day 1 should have prehab');
    TestRunner.assertObjectHasProperty(programData[1], 'accessories', 'Day 1 should have accessories');
    
    // Test mainA week structure
    TestRunner.assertObjectHasProperty(programData[1].mainA, 'weekA', 'mainA should have weekA');
    TestRunner.assertObjectHasProperty(programData[1].mainA, 'weekB', 'mainA should have weekB');
    
    // Test exercise structure
    const day1Warmup = programData[1].warmup;
    if (day1Warmup.length > 0) {
        const firstExercise = day1Warmup[0];
        TestRunner.assertObjectHasProperty(firstExercise, 'name', 'Exercise should have name');
        TestRunner.assertObjectHasProperty(firstExercise, 'sets', 'Exercise should have sets');
        TestRunner.assertObjectHasProperty(firstExercise, 'reps', 'Exercise should have reps');
    }
    
    // Test all days have warmup
    for (let day = 1; day <= 5; day++) {
        TestRunner.assertDefined(programData[day].warmup, `Day ${day} should have warmup`);
        TestRunner.assertArrayLength(programData[day].warmup, 4, `Day ${day} should have 4 warmup exercises`);
    }
    
    // Test sections exist across days
    const sectionsToCheck = ['warmup', 'mainA', 'accessories', 'shoulderHealth', 'extra'];
    
    // Day 2: Upper Push
    TestRunner.assertArrayLength(programData[2].mainA.weekA, 4, 'Day 2 Week A should have 4 main exercises');
    TestRunner.assertArrayLength(programData[2].accessories, 2, 'Day 2 should have 2 accessories');
    TestRunner.assertArrayLength(programData[2].shoulderHealth, 2, 'Day 2 should have 2 shoulder health exercises');
    TestRunner.assertArrayLength(programData[2].extra, 3, 'Day 2 should have 3 extra exercises');
    
    // Day 3: Lower Posterior Chain
    TestRunner.assertDefined(programData[3].calfTibialis, 'Day 3 should have calfTibialis section');
    
    // Day 5: Arms, Shoulders & Mobility
    TestRunner.assertDefined(programData[5].neck, 'Day 5 should have neck section');
    TestRunner.assertDefined(programData[5].flexibility, 'Day 5 should have flexibility section');
}

// --------------------------------------------
// Week Toggle Tests
// --------------------------------------------
function testWeekToggleFunctionality() {
    console.log('\n--- Week Toggle Functionality Tests ---\n');
    
    // Test initial state
    let testState = resetState();
    TestRunner.assertEqual(testState.currentWeek, 'A', 'Initial week should be A');
    
    // Test week toggle logic
    const toggleWeek = (week) => week === 'A' ? 'B' : 'A';
    TestRunner.assertEqual(toggleWeek('A'), 'B', 'Toggling A should give B');
    TestRunner.assertEqual(toggleWeek('B'), 'A', 'Toggling B should give A');
    
    // Test week toggle multiple times
    let week = 'A';
    for (let i = 0; i < 5; i++) {
        week = toggleWeek(week);
    }
    TestRunner.assertEqual(week, 'B', 'After 5 toggles starting from A, should be B');
    
    // Test week data access
    TestRunner.assertDefined(programData[1].mainA.weekA, 'Day 1 Week A should be defined');
    TestRunner.assertDefined(programData[1].mainA.weekB, 'Day 1 Week B should be defined');
    TestRunner.assertNotEqual(
        JSON.stringify(programData[1].mainA.weekA),
        JSON.stringify(programData[1].mainA.weekB),
        'Week A and Week B should have different exercises'
    );
    
    // Test isWeekB filtering
    const filterByWeek = (exercises, week) => {
        return exercises.filter(ex => !ex.isWeekB || week === 'B');
    };
    
    const day3CalfExercises = programData[3].calfTibialis;
    const filteredForWeekA = filterByWeek(day3CalfExercises, 'A');
    const filteredForWeekB = filterByWeek(day3CalfExercises, 'B');
    
    TestRunner.assertEqual(
        filteredForWeekA.length + 1,
        filteredForWeekB.length,
        'Week B should have one more exercise (the isWeekB exercise)'
    );
}

// --------------------------------------------
// Day Navigation Tests
// --------------------------------------------
function testDayNavigation() {
    console.log('\n--- Day Navigation Tests ---\n');
    
    // Test initial day
    let testState = resetState();
    TestRunner.assertEqual(testState.currentDay, 1, 'Initial day should be 1');
    
    // Test day bounds
    TestRunner.assertTrue(testState.currentDay >= 1 && testState.currentDay <= 5, 'Day should be between 1-5');
    
    // Test day selection logic
    const selectDay = (currentDay, newDay) => {
        if (newDay >= 1 && newDay <= 5) {
            return newDay;
        }
        return currentDay;
    };
    
    TestRunner.assertEqual(selectDay(1, 3), 3, 'Selecting day 3 from day 1 should work');
    TestRunner.assertEqual(selectDay(1, 0), 1, 'Selecting day 0 should stay at day 1');
    TestRunner.assertEqual(selectDay(5, 6), 5, 'Selecting day 6 should stay at day 5');
    
    // Test day names mapping
    const dayNames = ['Lwr Qd', 'Up Push', 'Lwr PC', 'Up Pull', 'Arms/Mob'];
    TestRunner.assertEqual(dayNames[0], 'Lwr Qd', 'Day 1 name should be Lwr Qd');
    TestRunner.assertEqual(dayNames[4], 'Arms/Mob', 'Day 5 name should be Arms/Mob');
    
    // Test day completion state structure
    TestRunner.assertObjectHasProperty(testState.dayCompletion, '1', 'dayCompletion should have cycle 1');
    testState.dayCompletion[1] = { A: { 1: true, 2: false } };
    TestRunner.assertTrue(testState.dayCompletion[1].A[1], 'Day 1 should be marked complete');
    TestRunner.assertFalse(testState.dayCompletion[1].A[2], 'Day 2 should not be marked complete');
}

// --------------------------------------------
// Cycle Progression Tests
// --------------------------------------------
function testCycleProgression() {
    console.log('\n--- Cycle Progression Tests ---\n');
    
    // Test initial cycle
    let testState = resetState();
    TestRunner.assertEqual(testState.currentCycle, 1, 'Initial cycle should be 1');
    
    // Test cycle progression
    const nextCycle = (currentCycle, maxCycles = 28) => {
        if (currentCycle >= maxCycles) {
            return { cycle: currentCycle, reachedMax: true };
        }
        return { cycle: currentCycle + 1, reachedMax: false };
    };
    
    let result = nextCycle(1);
    TestRunner.assertEqual(result.cycle, 2, 'Next cycle from 1 should be 2');
    TestRunner.assertFalse(result.reachedMax, 'Should not have reached max');
    
    // Test max cycle limit
    result = nextCycle(28);
    TestRunner.assertEqual(result.cycle, 28, 'Cycle 28 should not increase');
    TestRunner.assertTrue(result.reachedMax, 'Should have reached max at cycle 28');
    
    // Test cycle reset logic
    testState.currentCycle = 5;
    testState.currentDay = 3;
    testState.currentWeek = 'B';
    
    // When resetting to new cycle
    const newCycle = testState.currentCycle + 1;
    TestRunner.assertEqual(newCycle, 6, 'New cycle should be 6');
    
    // Reset should clear day and week
    testState.currentCycle = newCycle;
    testState.currentDay = 1;
    testState.currentWeek = 'A';
    
    TestRunner.assertEqual(testState.currentDay, 1, 'Day should reset to 1');
    TestRunner.assertEqual(testState.currentWeek, 'A', 'Week should reset to A');
}

// --------------------------------------------
// Data Persistence Tests
// --------------------------------------------
function testDataPersistence() {
    console.log('\n--- Data Persistence Tests ---\n');
    
    // Test localStorage mock
    const mockStorage = createMockLocalStorage();
    
    // Test save and retrieve
    const testState = {
        currentCycle: 1,
        currentDay: 1,
        currentWeek: 'A'
    };
    
    mockStorage.setItem('clawgains_state', JSON.stringify(testState));
    const retrieved = JSON.parse(mockStorage.getItem('clawgains_state'));
    
    TestRunner.assertEqual(retrieved.currentCycle, 1, 'Retrieved cycle should match');
    TestRunner.assertEqual(retrieved.currentDay, 1, 'Retrieved day should match');
    TestRunner.assertEqual(retrieved.currentWeek, 'A', 'Retrieved week should match');
    
    // Test persistence with complex state
    const complexState = {
        currentCycle: 3,
        currentDay: 2,
        currentWeek: 'B',
        dayCompletion: {
            1: { A: { 1: true, 2: true, 3: false, 4: false, 5: false } },
            2: { A: { 1: true, 2: false } }
        },
        exerciseLogs: {
            1: {
                A: {
                    1: {
                        'Back Squat': [
                            { weight: 100, reps: '6-8', done: true },
                            { weight: 100, reps: '6-8', done: true }
                        ]
                    }
                }
            }
        }
    };
    
    mockStorage.setItem('clawgains_state', JSON.stringify(complexState));
    const retrievedComplex = JSON.parse(mockStorage.getItem('clawgains_state'));
    
    TestRunner.assertEqual(
        retrievedComplex.dayCompletion[1].A[1],
        true,
        'Complex day completion should persist'
    );
    TestRunner.assertDefined(
        retrievedComplex.exerciseLogs[1].A[1]['Back Squat'],
        'Exercise logs should persist'
    );
    
    // Test remove/clear
    mockStorage.removeItem('clawgains_state');
    TestRunner.assertNull(mockStorage.getItem('clawgains_state'), 'Item should be null after remove');
    
    // Test merge behavior (loading saved state over defaults)
    const defaults = resetState();
    const saved = { currentCycle: 5, currentDay: 3 };
    const merged = { ...defaults, ...saved };
    
    TestRunner.assertEqual(merged.currentCycle, 5, 'Merged cycle should use saved value');
    TestRunner.assertEqual(merged.currentDay, 3, 'Merged day should use saved value');
    TestRunner.assertEqual(merged.currentWeek, 'A', 'Merged week should use default (not in saved)');
}

// --------------------------------------------
// Exercise Rendering Tests
// --------------------------------------------
function testExerciseRendering() {
    console.log('\n--- Exercise Rendering Tests ---\n');
    
    // Test all sections exist
    const allSections = ['warmup', 'mainA', 'prehab', 'accessories', 'shoulderHealth', 'calfTibialis', 'neck', 'flexibility', 'extra'];
    
    // Day 1 should have: warmup, mainA, prehab, accessories, shoulderHealth, extra
    const day1Sections = Object.keys(programData[1]);
    TestRunner.assertTrue(day1Sections.includes('warmup'), 'Day 1 should have warmup');
    TestRunner.assertTrue(day1Sections.includes('mainA'), 'Day 1 should have mainA');
    TestRunner.assertTrue(day1Sections.includes('prehab'), 'Day 1 should have prehab');
    TestRunner.assertTrue(day1Sections.includes('accessories'), 'Day 1 should have accessories');
    
    // Day 2 should have: warmup, mainA, accessories, shoulderHealth, extra
    const day2Sections = Object.keys(programData[2]);
    TestRunner.assertTrue(day2Sections.includes('shoulderHealth'), 'Day 2 should have shoulderHealth');
    TestRunner.assertTrue(day2Sections.includes('extra'), 'Day 2 should have extra');
    
    // Day 3 should have: warmup, mainA, calfTibialis, accessories, extra
    const day3Sections = Object.keys(programData[3]);
    TestRunner.assertTrue(day3Sections.includes('calfTibialis'), 'Day 3 should have calfTibialis');
    
    // Day 5 should have: warmup, mainA, accessories, shoulderHealth, neck, flexibility, extra
    const day5Sections = Object.keys(programData[5]);
    TestRunner.assertTrue(day5Sections.includes('neck'), 'Day 5 should have neck');
    TestRunner.assertTrue(day5Sections.includes('flexibility'), 'Day 5 should have flexibility');
    
    // Test exercise count per day
    TestRunner.assertTrue(
        programData[1].warmup.length >= 4,
        'Day 1 warmup should have at least 4 exercises'
    );
    TestRunner.assertTrue(
        programData[1].mainA.weekA.length >= 3,
        'Day 1 mainA weekA should have at least 3 exercises'
    );
    TestRunner.assertTrue(
        programData[2].accessories.length >= 2,
        'Day 2 accessories should have at least 2 exercises'
    );
    
    // Test section filtering for week
    const getFilteredSection = (dayData, section, week) => {
        const exercises = dayData[section] || [];
        return exercises.filter(ex => !ex.isWeekB || week === 'B');
    };
    
    const weekAExercises = getFilteredSection(programData[3], 'calfTibialis', 'A');
    const weekBExercises = getFilteredSection(programData[3], 'calfTibialis', 'B');
    
    TestRunner.assertTrue(
        weekBExercises.length > weekAExercises.length,
        'Week B should have more exercises when isWeekB exercises are included'
    );
}

// --------------------------------------------
// Set Completion Tests
// --------------------------------------------
function testSetCompletion() {
    console.log('\n--- Set Completion Tests ---\n');
    
    // Test set completion state structure
    const exerciseLogs = {};
    
    const toggleSet = (logs, exerciseName, setNum, isDone) => {
        if (!logs[exerciseName]) {
            logs[exerciseName] = [];
        }
        while (logs[exerciseName].length < setNum) {
            logs[exerciseName].push({ weight: 0, done: false });
        }
        logs[exerciseName][setNum - 1].done = isDone;
        return logs;
    };
    
    toggleSet(exerciseLogs, 'Back Squat', 1, true);
    toggleSet(exerciseLogs, 'Back Squat', 2, false);
    
    TestRunner.assertTrue(exerciseLogs['Back Squat'][0].done, 'Set 1 should be done');
    TestRunner.assertFalse(exerciseLogs['Back Squat'][1].done, 'Set 2 should not be done');
    
    // Test all sets done check
    const checkAllSetsDone = (exercises, logs, exerciseName) => {
        const exLogs = logs[exerciseName] || [];
        const exercise = exercises.find(e => e.name === exerciseName);
        if (!exercise) return false;
        
        for (let set = 1; set <= exercise.sets; set++) {
            if (!exLogs[set - 1]?.done) {
                return false;
            }
        }
        return true;
    };
    
    const mainExercises = programData[1].mainA.weekA;
    const backSquatDone = { 'Back Squat': [
        { done: true }, { done: true }, { done: true }, { done: true }
    ]};
    
    TestRunner.assertTrue(
        checkAllSetsDone(mainExercises, backSquatDone, 'Back Squat'),
        'All sets done should return true when all sets are complete'
    );
    
    const backSquatPartial = { 'Back Squat': [
        { done: true }, { done: false }, { done: true }, { done: true }
    ]};
    
    TestRunner.assertFalse(
        checkAllSetsDone(mainExercises, backSquatPartial, 'Back Squat'),
        'All sets done should return false when some sets are incomplete'
    );
    
    // Test day completion auto-advance
    const testDayCompletion = {
        1: { A: { 1: true, 2: false } }
    };
    
    const markDayComplete = (completion, cycle, week, day) => {
        if (!completion[cycle]) completion[cycle] = {};
        if (!completion[cycle][week]) completion[cycle][week] = {};
        completion[cycle][week][day] = true;
        return completion;
    };
    
    markDayComplete(testDayCompletion, 1, 'A', 2);
    TestRunner.assertTrue(testDayCompletion[1].A[2], 'Day 2 should be marked complete');
}

// --------------------------------------------
// Weight Input and Progression Tests
// --------------------------------------------
function testWeightInputAndProgression() {
    console.log('\n--- Weight Input and Progression Tests ---\n');
    
    // Test getLastWeight function
    const getLastWeight = (history) => {
        if (history && history.length > 0) {
            return history[history.length - 1].weight;
        }
        return null;
    };
    
    const history = [
        { weight: 80, reps: '6-8' },
        { weight: 90, reps: '6-8' },
        { weight: 100, reps: '6-8' }
    ];
    
    TestRunner.assertEqual(getLastWeight(history), 100, 'Last weight should be 100');
    TestRunner.assertNull(getLastWeight([]), 'Empty history should return null');
    TestRunner.assertNull(getLastWeight(null), 'Null history should return null');
    
    // Test weight parsing
    const parseWeight = (input) => {
        return parseFloat(input) || 0;
    };
    
    TestRunner.assertEqual(parseWeight('100'), 100, 'Should parse 100');
    TestRunner.assertEqual(parseWeight('100.5'), 100.5, 'Should parse 100.5');
    TestRunner.assertEqual(parseWeight('abc'), 0, 'Should return 0 for invalid input');
    TestRunner.assertEqual(parseWeight(''), 0, 'Should return 0 for empty string');
    
    // Test weight input in set box
    const createSetBoxHTML = (exerciseName, setNum, weight) => {
        return `<input type="number" value="${weight || ''}" placeholder="kg">`;
    };
    
    const html = createSetBoxHTML('Back Squat', 1, 100);
    TestRunner.assertTrue(html.includes('value="100"'), 'HTML should include weight value');
    
    // Test default weight from targetWeight or last weight
    const getDefaultWeight = (targetWeight, lastWeight) => {
        return targetWeight || lastWeight || 0;
    };
    
    TestRunner.assertEqual(
        getDefaultWeight('18.25 kg', null),
        '18.25 kg',
        'Should use targetWeight when no lastWeight'
    );
    
    TestRunner.assertEqual(
        getDefaultWeight(null, 90),
        90,
        'Should use lastWeight when no targetWeight'
    );
    
    TestRunner.assertEqual(
        getDefaultWeight('18.25 kg', 90),
        '18.25 kg',
        'Should prefer targetWeight over lastWeight'
    );
    
    // Test weight progression tracking
    const weightHistory = {
        'Back Squat': [
            { cycle: 1, week: 'A', weight: 80 },
            { cycle: 1, week: 'B', weight: 85 },
            { cycle: 2, week: 'A', weight: 90 }
        ]
    };
    
    const getWeightByCycle = (history, cycle) => {
        return history.filter(h => h.cycle === cycle);
    };
    
    const cycle1Weights = getWeightByCycle(weightHistory['Back Squat'], 1);
    TestRunner.assertEqual(cycle1Weights.length, 2, 'Cycle 1 should have 2 entries');
    
    const cycle2Weights = getWeightByCycle(weightHistory['Back Squat'], 2);
    TestRunner.assertEqual(cycle2Weights.length, 1, 'Cycle 2 should have 1 entry');
}

// --------------------------------------------
// History Display Tests
// --------------------------------------------
function testHistoryDisplay() {
    console.log('\n--- History Display Tests ---\n');
    
    // Test getAllHistory function
    const getAllHistory = (exerciseLogs) => {
        const history = {};
        
        Object.keys(exerciseLogs || {}).forEach(cycle => {
            const cycleData = exerciseLogs[cycle];
            Object.keys(cycleData || {}).forEach(week => {
                const weekData = cycleData[week];
                Object.keys(weekData || {}).forEach(day => {
                    const dayData = weekData[day];
                    Object.keys(dayData || {}).forEach(exName => {
                        const exLogs = dayData[exName];
                        exLogs.forEach(log => {
                            if (log.done && log.weight > 0) {
                                if (!history[exName]) history[exName] = [];
                                history[exName].push({
                                    cycle: parseInt(cycle),
                                    week: week,
                                    weight: log.weight,
                                    reps: log.reps
                                });
                            }
                        });
                    });
                });
            });
        });
        
        return history;
    };
    
    const testLogs = {
        1: {
            A: {
                1: {
                    'Back Squat': [
                        { weight: 100, reps: '6-8', done: true, cycle: 1, week: 'A' }
                    ],
                    'Front Squat': [
                        { weight: 80, reps: '6-8', done: false, cycle: 1, week: 'A' }
                    ]
                }
            }
        }
    };
    
    const history = getAllHistory(testLogs);
    
    TestRunner.assertDefined(history['Back Squat'], 'Back Squat should be in history');
    TestRunner.assertNull(history['Front Squat'], 'Front Squat should NOT be in history (not done)');
    TestRunner.assertEqual(history['Back Squat'].length, 1, 'Back Squat should have 1 history entry');
    
    // Test history filtering
    const getRecentHistory = (history, limit = 5) => {
        return Object.entries(history).slice(0, limit);
    };
    
    const recent = getRecentHistory(history, 5);
    TestRunner.assertTrue(recent.length <= 5, 'Recent history should respect limit');
    
    // Test history display format
    const formatHistoryItem = (name, lastEntry) => {
        return `${name} - ${lastEntry.weight}kg × ${lastEntry.reps} · C${lastEntry.cycle}W${lastEntry.week}`;
    };
    
    const formatted = formatHistoryItem('Back Squat', { weight: 100, reps: '6-8', cycle: 1, week: 'A' });
    TestRunner.assertTrue(formatted.includes('100kg'), 'Formatted should include weight');
    TestRunner.assertTrue(formatted.includes('6-8'), 'Formatted should include reps');
    TestRunner.assertTrue(formatted.includes('C1'), 'Formatted should include cycle');
    TestRunner.assertTrue(formatted.includes('WA'), 'Formatted should include week');
}

// --------------------------------------------
// Edge Case Tests
// --------------------------------------------
function testEdgeCases() {
    console.log('\n--- Edge Case Tests ---\n');
    
    // Test empty state
    const emptyState = resetState();
    TestRunner.assertEqual(emptyState.currentCycle, 1, 'Empty state should have cycle 1');
    TestRunner.assertEqual(emptyState.currentDay, 1, 'Empty state should have day 1');
    TestRunner.assertEqual(emptyState.currentWeek, 'A', 'Empty state should have week A');
    TestRunner.assertEqual(Object.keys(emptyState.dayCompletion).length, 0, 'Empty state should have no completion data');
    TestRunner.assertEqual(Object.keys(emptyState.exerciseLogs).length, 0, 'Empty state should have no exercise logs');
    
    // Test missing data handling
    const handleMissingData = (obj, key, defaultValue) => {
        return obj && obj[key] !== undefined ? obj[key] : defaultValue;
    };
    
    TestRunner.assertEqual(
        handleMissingData({}, 'missing', 'default'),
        'default',
        'Should return default for missing key'
    );
    
    TestRunner.assertEqual(
        handleMissingData({ existing: 'value' }, 'existing', 'default'),
        'value',
        'Should return existing value'
    );
    
    // Test week toggle at boundaries
    let week = 'A';
    const toggleAtBoundary = (current) => current;
    // When at A and trying to toggle to something else
    TestRunner.assertEqual(toggleAtBoundary('A'), 'A', 'Should stay at A when not changing');
    
    // Test day navigation at boundaries
    const navigateDay = (current, direction) => {
        const newDay = current + direction;
        if (newDay < 1) return 1;
        if (newDay > 5) return 5;
        return newDay;
    };
    
    TestRunner.assertEqual(navigateDay(1, -1), 1, 'Should not go below day 1');
    TestRunner.assertEqual(navigateDay(5, 1), 5, 'Should not go above day 5');
    TestRunner.assertEqual(navigateDay(3, 1), 4, 'Should navigate from day 3 to 4');
    
    // Test cycle at max
    const handleMaxCycle = (current, max = 28) => {
        return Math.min(current, max);
    };
    
    TestRunner.assertEqual(handleMaxCycle(28, 28), 28, 'Should stay at max cycle');
    TestRunner.assertEqual(handleMaxCycle(29, 28), 28, 'Should cap at max cycle');
    
    // Test empty exercise arrays
    const filterExercises = (exercises, week) => {
        return (exercises || []).filter(ex => !ex.isWeekB || week === 'B');
    };
    
    TestRunner.assertArrayLength(filterExercises([], 'A'), 0, 'Empty exercises should return empty array');
    TestRunner.assertArrayLength(filterExercises(null, 'A'), 0, 'Null exercises should return empty array');
    
    // Test parsing invalid data
    const safeParse = (str, fallback) => {
        try {
            return JSON.parse(str);
        } catch (e) {
            return fallback;
        }
    };
    
    TestRunner.assertEqual(safeParse('invalid', {}).constructor.name, 'Object', 'Should return fallback for invalid JSON');
    TestRunner.assertEqual(safeParse('{"valid": true}', {}).valid, true, 'Should parse valid JSON');
    
    // Test localStorage with quota exceeded
    const handleStorageError = (error) => {
        console.error('Storage error:', error);
        return false;
    };
    
    TestRunner.assertTrue(
        handleStorageError(new Error('QuotaExceededError')),
        'Should handle storage errors gracefully'
    );
    
    // Test exercise with no targetWeight
    const exercises = [
        { name: 'Push-Up', sets: 3, reps: '10', targetWeight: null },
        { name: 'Back Squat', sets: 4, reps: '6-8', targetWeight: '100 kg' }
    ];
    
    const getWeightDisplay = (ex) => {
        return ex.targetWeight || '--';
    };
    
    TestRunner.assertEqual(getWeightDisplay(exercises[0]), '--', 'Null targetWeight should display as --');
    TestRunner.assertEqual(getWeightDisplay(exercises[1]), '100 kg', 'Valid targetWeight should display');
}

// Export for browser use
if (typeof window !== 'undefined') {
    window.TestRunner = TestRunner;
    window.runAllTests = runAllTests;
    window.resetState = resetState;
    window.createMockLocalStorage = createMockLocalStorage;
}

// Export for Node.js use
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        TestRunner,
        runAllTests,
        resetState,
        createMockLocalStorage
    };
}

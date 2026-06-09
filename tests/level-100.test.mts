import assert from "node:assert/strict";
import test from "node:test";

import {
  LEVEL_100_TARGET_EXERCISES,
  buildLevel100Dashboard,
  getLevel100ExerciseRule,
  getLevel100Score
} from "../lib/arm-tracker/level-100.ts";
import type { ArmTrackerData } from "../lib/arm-tracker/types.ts";

function createData(): ArmTrackerData {
  return {
    plans: [],
    sessions: [],
    exercises: [],
    workoutLogs: [],
    exerciseLogs: [],
    importRuns: []
  };
}

test("scores leg exercises with weight divided by two", () => {
  assert.equal(getLevel100Score({ exerciseName: "Squat", weight: 150 }), 75);
  assert.equal(getLevel100Score({ exerciseName: "Stacco da terra", weight: 180 }), 90);
});

test("scores classic two-arm exercises with weight as level", () => {
  assert.equal(getLevel100Score({ exerciseName: "Panca Piana", weight: 100 }), 100);
  assert.equal(getLevel100Score({ exerciseName: "Military Press", weight: 60 }), 60);
});

test("scores arm wrestling arm exercises with doubled weight", () => {
  assert.equal(getLevel100Score({ exerciseName: "Side Pressure", weight: 30 }), 60);
  assert.equal(getLevel100Score({ exerciseName: "Cupping", weight: 35 }), 70);
});

test("scores weighted bodyweight exercises with bodyweight plus ballast divided by two", () => {
  assert.equal(getLevel100Score({ exerciseName: "Pull Up zavorrato", weight: 50, bodyweightKg: 90 }), 70);
  assert.equal(getLevel100Score({ exerciseName: "Dips zavorrati", weight: 40, bodyweightKg: 90 }), 65);
});

test("uses the bodyweight saved on the workout record for bodyweight exercises", () => {
  const data = createData();

  data.workoutLogs = [
    {
      id: "log-1",
      planSessionId: "session-1",
      performedDate: "2026-06-08",
      bodyweightKg: 100,
      overallNotes: null,
      completionStatus: "completed",
      createdAt: "2026-06-08T10:00:00.000Z"
    }
  ];
  data.exerciseLogs = [
    {
      id: "exercise-log-1",
      workoutLogId: "log-1",
      planExerciseId: "exercise-1",
      exerciseNameSnapshot: "Pull Up zavorrato",
      plannedSetsSnapshot: null,
      plannedRepsSnapshot: null,
      plannedWeightSnapshot: null,
      plannedNotesSnapshot: null,
      actualWeight: 50,
      actualReps: 3,
      actualSets: 1,
      notes: null,
      performedOrder: 0
    }
  ];

  const dashboard = buildLevel100Dashboard(data, { bodyweightKg: 90 });
  const pullUp = dashboard.exercises.find((exercise) => exercise.exerciseName === "Pull Up zavorrato");

  assert.equal(pullUp?.level, 75);
  assert.equal(pullUp?.bestValidBodyweightKg, 100);
});

test("scores bodyweight reps from bodyweight divided by two", () => {
  assert.equal(getLevel100Score({ exerciseName: "Pull Up", weight: null, bodyweightKg: 90, reps: 8 }), 45);
  assert.equal(getLevel100Score({ exerciseName: "Dip", weight: null, bodyweightKg: 90, reps: 10 }), 45);
});

test("scores one arm pull up reps from bodyweight", () => {
  assert.equal(getLevel100Score({ exerciseName: "One Arm Pull Up", weight: null, bodyweightKg: 90, reps: 1 }), 90);
});

test("scores one arm isometry only when ten seconds are held", () => {
  assert.equal(
    getLevel100Score({ exerciseName: "One Arm Pull Up Iso", weight: 10, bodyweightKg: 90, seconds: 10 }),
    100
  );
  assert.equal(
    getLevel100Score({ exerciseName: "One Arm Pull Up Iso", weight: 10, bodyweightKg: 90, seconds: 8 }),
    0
  );
});

test("caps level 100 score at the 130 maximum", () => {
  assert.equal(getLevel100Score({ exerciseName: "Side Pressure", weight: 80 }), 130);
  assert.equal(getLevel100Score({ exerciseName: "Panca Piana", weight: 150 }), 130);
  assert.equal(getLevel100Score({ exerciseName: "Squat", weight: 300 }), 130);
});

test("uses only records with at least three reps", () => {
  const data = createData();

  data.workoutLogs = [
    {
      id: "log-1",
      planSessionId: "session-1",
      performedDate: "2026-01-01",
      overallNotes: null,
      completionStatus: "completed",
      createdAt: "2026-01-01T10:00:00.000Z"
    },
    {
      id: "log-2",
      planSessionId: "session-2",
      performedDate: "2026-02-01",
      overallNotes: null,
      completionStatus: "completed",
      createdAt: "2026-02-01T10:00:00.000Z"
    }
  ];
  data.exerciseLogs = [
    {
      id: "exercise-log-1",
      workoutLogId: "log-1",
      planExerciseId: "exercise-1",
      exerciseNameSnapshot: "Panca Piana",
      plannedSetsSnapshot: null,
      plannedRepsSnapshot: null,
      plannedWeightSnapshot: null,
      plannedNotesSnapshot: null,
      actualWeight: 120,
      actualReps: 1,
      actualSets: 1,
      notes: null,
      performedOrder: 0
    },
    {
      id: "exercise-log-2",
      workoutLogId: "log-2",
      planExerciseId: "exercise-2",
      exerciseNameSnapshot: "Panca Piana",
      plannedSetsSnapshot: null,
      plannedRepsSnapshot: null,
      plannedWeightSnapshot: null,
      plannedNotesSnapshot: null,
      actualWeight: 100,
      actualReps: 3,
      actualSets: 1,
      notes: null,
      performedOrder: 0
    }
  ];

  const dashboard = buildLevel100Dashboard(data);
  const panca = dashboard.exercises.find((exercise) => exercise.exerciseName === "Panca Piana");

  assert.equal(panca?.bestValidWeight, 100);
  assert.equal(panca?.level, 100);
  assert.equal(panca?.attemptCount, 2);
  assert.equal(panca?.validRecordCount, 1);
});

test("ignores unrealistic imported weights", () => {
  const data = createData();

  data.workoutLogs = [
    {
      id: "log-1",
      planSessionId: "session-1",
      performedDate: "2026-01-01",
      overallNotes: null,
      completionStatus: "completed",
      createdAt: "2026-01-01T10:00:00.000Z"
    },
    {
      id: "log-2",
      planSessionId: "session-2",
      performedDate: "2026-02-01",
      overallNotes: null,
      completionStatus: "completed",
      createdAt: "2026-02-01T10:00:00.000Z"
    }
  ];
  data.exerciseLogs = [
    {
      id: "exercise-log-1",
      workoutLogId: "log-1",
      planExerciseId: "exercise-1",
      exerciseNameSnapshot: "Pull Up zavorrato",
      plannedSetsSnapshot: null,
      plannedRepsSnapshot: null,
      plannedWeightSnapshot: null,
      plannedNotesSnapshot: null,
      actualWeight: 3524,
      actualReps: 3,
      actualSets: 1,
      notes: null,
      performedOrder: 0
    },
    {
      id: "exercise-log-2",
      workoutLogId: "log-2",
      planExerciseId: "exercise-2",
      exerciseNameSnapshot: "Trazioni [50kg]",
      plannedSetsSnapshot: null,
      plannedRepsSnapshot: null,
      plannedWeightSnapshot: null,
      plannedNotesSnapshot: null,
      actualWeight: 50,
      actualReps: 3,
      actualSets: 1,
      notes: null,
      performedOrder: 0
    }
  ];

  const dashboard = buildLevel100Dashboard(data, { bodyweightKg: 90 });
  const pullUp = dashboard.exercises.find((exercise) => exercise.exerciseName === "Pull Up zavorrato");

  assert.equal(pullUp?.bestValidWeight, 50);
  assert.equal(pullUp?.level, 70);
  assert.equal(pullUp?.attemptCount, 2);
  assert.equal(pullUp?.validRecordCount, 1);
});

test("sorts dashboard by usage before level", () => {
  const data = createData();

  data.workoutLogs = [
    {
      id: "log-1",
      planSessionId: "session-1",
      performedDate: "2026-01-01",
      overallNotes: null,
      completionStatus: "completed",
      createdAt: "2026-01-01T10:00:00.000Z"
    }
  ];
  data.exerciseLogs = [
    {
      id: "exercise-log-1",
      workoutLogId: "log-1",
      planExerciseId: "exercise-1",
      exerciseNameSnapshot: "Side Pressure",
      plannedSetsSnapshot: null,
      plannedRepsSnapshot: null,
      plannedWeightSnapshot: null,
      plannedNotesSnapshot: null,
      actualWeight: 30,
      actualReps: 3,
      actualSets: 1,
      notes: null,
      performedOrder: 0
    },
    {
      id: "exercise-log-2",
      workoutLogId: "log-1",
      planExerciseId: "exercise-2",
      exerciseNameSnapshot: "Side Pressure",
      plannedSetsSnapshot: null,
      plannedRepsSnapshot: null,
      plannedWeightSnapshot: null,
      plannedNotesSnapshot: null,
      actualWeight: 32,
      actualReps: 3,
      actualSets: 1,
      notes: null,
      performedOrder: 1
    },
    {
      id: "exercise-log-3",
      workoutLogId: "log-1",
      planExerciseId: "exercise-3",
      exerciseNameSnapshot: "Squat",
      plannedSetsSnapshot: null,
      plannedRepsSnapshot: null,
      plannedWeightSnapshot: null,
      plannedNotesSnapshot: null,
      actualWeight: 180,
      actualReps: 3,
      actualSets: 1,
      notes: null,
      performedOrder: 2
    }
  ];

  const dashboard = buildLevel100Dashboard(data);

  assert.equal(dashboard.exercises[0]?.exerciseName, "Side Pressure");
  assert.equal(getLevel100ExerciseRule("Squat").label, "Gambe");
});

test("pins target exercises so the dashboard always shows the main watchlist", () => {
  const dashboard = buildLevel100Dashboard(createData(), {
    pinnedExerciseNames: LEVEL_100_TARGET_EXERCISES
  });

  assert.deepEqual(
    dashboard.exercises.slice(0, 6).map((exercise) => exercise.exerciseName),
    ["Squat", "Stacco da terra", "Panca Piana", "Military Press", "Rematore", "Pull Up zavorrato"]
  );
  assert.equal(dashboard.exercises[0]?.level, 0);
  assert.equal(dashboard.exercises[0]?.validRecordCount, 0);
  assert.ok(dashboard.exercises.some((exercise) => exercise.exerciseName === "Back Lever"));
  assert.ok(dashboard.exercises.some((exercise) => exercise.exerciseName === "L-Sit"));
  assert.ok(dashboard.exercises.some((exercise) => exercise.exerciseName === "Handstand Hold"));
});

test("classifies suggested untracked cases without forcing them into classic kg scoring", () => {
  assert.equal(getLevel100ExerciseRule("Front Lever").label, "Isometrie");
  assert.equal(getLevel100ExerciseRule("One Arm Pull Up Iso").label, "Isometrie");
  assert.equal(getLevel100ExerciseRule("L-Sit").label, "Isometrie");
  assert.equal(getLevel100ExerciseRule("Muscle Up").label, "Skill dinamiche");
  assert.equal(getLevel100ExerciseRule("Fran").label, "Conditioning");
  assert.equal(getLevel100ExerciseRule("Lat Machine").label, "Macchine / cavi");
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const schema = readFileSync("supabase/migrations/20260629_cloud_schema.sql", "utf8");

test("cloud schema creates normalized workout tables instead of a single snapshot table", () => {
  [
    "arm_plans",
    "arm_sessions",
    "arm_plan_exercises",
    "arm_workout_logs",
    "arm_workout_exercise_logs",
    "arm_level100_watchlist",
    "arm_level100_records",
    "arm_import_runs",
    "arm_audit_events"
  ].forEach((tableName) => {
    assert.match(schema, new RegExp(`create table if not exists public\\.${tableName}`));
  });

  assert.doesNotMatch(schema, /create table if not exists public\.arm_tracker_snapshots/);
});

test("cloud schema keeps bodyweight on the workout record and one log per session", () => {
  assert.match(schema, /bodyweight_kg numeric/);
  assert.match(schema, /unique\(user_id, plan_session_id\)/);
});

test("cloud schema enables row level security for user owned data", () => {
  [
    "arm_plans",
    "arm_sessions",
    "arm_workout_logs",
    "arm_workout_exercise_logs",
    "arm_level100_records"
  ].forEach((tableName) => {
    assert.match(schema, new RegExp(`alter table public\\.${tableName} enable row level security`));
    assert.match(schema, new RegExp(`auth\\.uid\\(\\) = user_id`));
  });
});

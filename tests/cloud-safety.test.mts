import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("critical workout flows do not write the local database directly", () => {
  const forbiddenFiles = [
    "features/arm-tracker/arm-tracker-provider.tsx",
    "lib/arm-tracker/mutations.ts",
    "app/(tracker)/log/[sessionId]/page.tsx",
    "app/(tracker)/custom-workout/new/page.tsx"
  ];

  for (const file of forbiddenFiles) {
    const source = readFileSync(file, "utf8");

    assert.equal(
      /localStorage\.setItem\((?=.*(?:iron_log_db_v2|aw_workout_logs|aw_exercise_logs))/s.test(source),
      false,
      `${file} must not write workout data into localStorage`
    );
  }
});

test("snapshot route requires an explicit sync token before reading or writing", () => {
  const source = readFileSync("app/api/arm-tracker/snapshot/route.ts", "utf8");
  const authSource = readFileSync("lib/arm-tracker/snapshot-auth.server.ts", "utf8");

  assert.match(source, /isAuthorizedSnapshotRequest/);
  assert.match(authSource, /x-arm-tracker-sync-token/);
  assert.match(authSource, /iron_log_sync_token/);
  assert.match(source, /status: 401/);
  assert.match(source, /Snapshot writes require an authenticated cloud session/);
});

test("sync session route stores the sync token in an httpOnly cookie", () => {
  const source = readFileSync("app/api/arm-tracker/session/route.ts", "utf8");

  assert.match(source, /export async function POST/);
  assert.match(source, /httpOnly: true/);
  assert.match(source, /sameSite: "lax"/);
  assert.match(source, /Token sync non valido/);
});

test("supabase sync strips literal CRLF artifacts from env values", () => {
  const source = readFileSync("lib/arm-tracker/supabase-sync.server.ts", "utf8");

  assert.match(source, /function cleanEnvValue/);
  assert.match(source, /\.replace\(\/\\\\r\/g, ""\)/);
  assert.match(source, /\.replace\(\/\\\\n\/g, ""\)/);
});

test("level 100 manual records are not persisted as browser-only records", () => {
  const source = readFileSync("app/(tracker)/page.tsx", "utf8");

  assert.doesNotMatch(
    source,
    /localStorage\.setItem\(level100ManualRecordsStorageKey/,
    "manual records must move to the cloud path, not localStorage"
  );
});

test("vulnerable xlsx parser is not part of the runtime dependency graph", () => {
  const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };

  assert.equal(packageJson.dependencies?.xlsx, undefined);
  assert.equal(packageJson.devDependencies?.xlsx, undefined);
});

test("supabase snapshot writes are versioned and merged without deleting missing cloud data", () => {
  const source = readFileSync("lib/arm-tracker/supabase-sync.server.ts", "utf8");

  assert.match(source, /arm_tracker_snapshot_versions/);
  assert.match(source, /insertSnapshotVersion/);
  assert.match(source, /mergeSnapshotsForZeroLoss/);
  assert.match(source, /readSupabaseSnapshot/);
});

test("legacy snapshot schema keeps recoverable versions before overwrites", () => {
  const source = readFileSync("supabase/arm_tracker_schema.sql", "utf8");

  assert.match(source, /create table if not exists public\.arm_tracker_snapshot_versions/);
  assert.match(source, /snapshot jsonb not null/);
  assert.match(source, /owner_key text not null/);
});

test("browser snapshot replacement creates a bounded local backup first", () => {
  const source = readFileSync("lib/arm-tracker/storage.ts", "utf8");

  assert.match(source, /localBackups: "iron_log_db_v2_backups"/);
  assert.match(source, /function writeLocalBackup/);
  assert.match(source, /writeLocalBackup\(currentSnapshot, "before-setSnapshot"\)/);
});

test("sync page can export automatic local safety backups", () => {
  const storageSource = readFileSync("lib/arm-tracker/storage.ts", "utf8");
  const syncPageSource = readFileSync("app/(tracker)/sync/page.tsx", "utf8");

  assert.match(storageSource, /export function exportArmTrackerLocalBackups/);
  assert.match(syncPageSource, /exportSafetyBackups/);
  assert.match(syncPageSource, /Esporta backup di sicurezza/);
});

test("backup imports are handled by an authenticated server route instead of browser-only storage", () => {
  const importRouteSource = readFileSync("app/api/arm-tracker/import/route.ts", "utf8");
  const providerSource = readFileSync("features/arm-tracker/arm-tracker-provider.tsx", "utf8");
  const remoteSyncSource = readFileSync("lib/arm-tracker/remote-sync.ts", "utf8");

  assert.match(importRouteSource, /isAuthorizedSnapshotRequest/);
  assert.match(importRouteSource, /readSupabaseSnapshot/);
  assert.match(importRouteSource, /writeSupabaseSnapshot/);
  assert.match(importRouteSource, /status: 401/);
  assert.match(remoteSyncSource, /importRemoteArchive/);
  assert.match(providerSource, /importRemoteArchive/);
  assert.doesNotMatch(providerSource, /importArmTrackerArchive/);
});

test("critical mutations wait for cloud confirmation and roll back local state on failure", () => {
  const providerSource = readFileSync("features/arm-tracker/arm-tracker-provider.tsx", "utf8");
  const logPageSource = readFileSync("app/(tracker)/log/[sessionId]/page.tsx", "utf8");
  const customPageSource = readFileSync("app/(tracker)/custom-workout/new/page.tsx", "utf8");
  const importPageSource = readFileSync("app/(tracker)/import/page.tsx", "utf8");

  assert.match(providerSource, /async function commitMutationToCloud/);
  assert.match(providerSource, /await pushRemoteSnapshot/);
  assert.match(providerSource, /db\.setSnapshot\(previousSnapshot\)/);
  assert.match(providerSource, /manualCommitInFlightRef/);
  assert.match(logPageSource, /await saveWorkoutLog/);
  assert.match(customPageSource, /await createCustomSession/);
  assert.match(importPageSource, /await importPlan/);
});

test("provider does not auto-seed or merge historical demo data on startup", () => {
  const providerSource = readFileSync("features/arm-tracker/arm-tracker-provider.tsx", "utf8");

  assert.doesNotMatch(providerSource, /createIronLogHistorySeedData/);
  assert.doesNotMatch(providerSource, /IRON_LOG_HISTORY_SEED_VERSION/);
  assert.doesNotMatch(providerSource, /applySeedIfNeeded/);
});

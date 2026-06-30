# Iron Log Cloud Rebuild Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trasformare Iron Log da PWA con salvataggi locali e snapshot fragile in una web app cloud-first, con database unico, salvataggi affidabili da qualsiasi dispositivo, storico recuperabile e UI responsive verificata.

**Architecture:** Il dato reale deve vivere in Supabase/Postgres, non in `localStorage`. La UI React/Next legge e scrive tramite Server Actions o Route Handlers autenticati, con RLS Supabase per utente. `localStorage` resta ammesso solo per preferenze innocue di UI, mai per workout, record, programmi o dashboard Livello 100.

**Tech Stack:** Next.js App Router 15.5.x, React 19.2.x, TypeScript, Supabase Postgres/Auth/RLS, Tailwind, test Node + Playwright.

---

## Audit Summary

### Stato attuale verificato

- Typecheck: passa (`npm run typecheck`).
- Unit test: passano 19/19 (`npm run test:unit`).
- Lint: passa (`npm run lint`).
- Build production: passa (`npm run build`).
- NPM audit: fallisce con vulnerabilita su `xlsx` e segnalazioni PostCSS via Next.
- Responsive live: nessun overflow orizzontale rilevato su iPad 834x1194 e telefono 390x844 per `/`, `/program`, `/stats`, `/history`, `/custom-workout/new`; pero ci sono controlli compatti da 36px nella dashboard mobile.

### Dati seed verificati

Nel file `lib/arm-tracker/iron-log-history-seed.json`:

- `plans`: 31
- `sessions`: 261
- `exercises`: 1978
- `workoutLogs`: 257
- `exerciseLogs`: 1949
- `importRuns`: 31
- Duplicati ID: 0
- Riferimenti orfani: 0
- Workout con `bodyweightKg` mancante: 257/257
- Righe esercizio senza nessun dato reale (`sets`, `reps`, `weight` null): 437
- Ultimo log seed: 2026-04-11
- Log `Gara prep` giugno 2026 nel seed/live leggibile: 0

### Problemi critici

1. `lib/arm-tracker/storage.ts` usa `localStorage` come database primario. Questo e il motivo per cui l'iPad puo avere dati che il PC non vede.
2. `features/arm-tracker/arm-tracker-provider.tsx` prova a sincronizzare un intero snapshot remoto, ma se fallisce disattiva il sync e continua in locale senza bloccare i salvataggi.
3. `app/api/arm-tracker/snapshot/route.ts` accetta `POST` senza autenticazione utente. Con la service role lato server, un chiamante pubblico puo teoricamente sovrascrivere lo snapshot se conosce l'endpoint.
4. `supabase/arm_tracker_schema.sql` definisce una sola tabella `arm_tracker_snapshots`: non e un database normalizzato, e solo un JSON unico.
5. `app/(tracker)/page.tsx` salva watchlist e record manuali Livello 100 in `localStorage`, separati dallo storico reale.
6. `lib/arm-tracker/competition-prep-program.ts` aggiunge allenamenti tramite migrazione locale automatica: e comodo, ma non produce una fonte dati server verificabile.
7. `lib/arm-tracker/iron-log-history-seed.json` pesa circa 2.6 MB e viene importato nell'app: aumenta bundle e confonde dati demo/storici/dati reali.
8. `xlsx` ha vulnerabilita note senza fix disponibile via `npm audit`; l'import Excel va isolato o sostituito.
9. Non esiste autenticazione: l'app non sa chi sei, quindi non puo garantire accesso coerente da dispositivi diversi.
10. Non esiste una modalita "offline read-only": se il cloud non funziona, oggi l'utente puo salvare in locale e credere di aver salvato davvero.

---

## Target Architecture

### Fonte unica del dato

Postgres/Supabase diventa l'unica fonte dei dati reali:

- Programmi
- Sessioni
- Esercizi pianificati
- Workout registrati
- Righe esercizio registrate
- Peso corporeo per workout
- Record Livello 100
- Watchlist dashboard
- Import storici
- Audit log delle modifiche

### Cosa puo restare locale

Solo preferenze non critiche:

- filtro categoria aperto
- ultimo tab selezionato
- preferenza tema
- ordinamento UI temporaneo

Non possono restare locali:

- allenamenti
- record
- peso corporeo
- programma gara
- dashboard Livello 100
- backup importati

---

## File Structure

### Create

- `supabase/migrations/20260629_cloud_schema.sql`
  - Schema normalizzato Postgres, RLS, indici, trigger `updated_at`.
- `lib/arm-tracker/server/auth.ts`
  - Lettura utente autenticato e guardia server.
- `lib/arm-tracker/server/repository.ts`
  - Query Supabase/Postgres tipizzate.
- `lib/arm-tracker/server/mutations.ts`
  - Mutazioni server-side atomiche.
- `lib/arm-tracker/server/mappers.ts`
  - Conversione righe DB -> tipi UI.
- `lib/arm-tracker/server/validation.ts`
  - Validazione input workout/sessioni/import.
- `lib/arm-tracker/client/cache.ts`
  - Stato client solo per cache volatile, senza persistenza workout.
- `app/(tracker)/sync/page.tsx`
  - Pagina stato sync, recupero backup iPad, diagnostica account.
- `app/api/arm-tracker/export/route.ts`
  - Export JSON autenticato dal database cloud.
- `app/api/arm-tracker/import/route.ts`
  - Import JSON autenticato con merge controllato.
- `tests/cloud-schema.test.mts`
  - Test integrita modello dati.
- `tests/no-local-workout-storage.test.mts`
  - Test che impedisce di reintrodurre salvataggi workout in `localStorage`.
- `tests/level-100-cloud-records.test.mts`
  - Test record Livello 100 da DB.
- `tests/sync-conflict-resolution.test.mts`
  - Test merge e conflitti.
- `tests/responsive.spec.ts`
  - E2E responsive con Playwright.

### Modify

- `features/arm-tracker/arm-tracker-provider.tsx`
  - Rimuovere DB locale primario; leggere dati iniziali da server.
- `lib/arm-tracker/storage.ts`
  - Deprecare come storage dati; mantenere solo import/export legacy temporaneo.
- `lib/arm-tracker/mutations.ts`
  - Spostare logica mutazioni in server-side.
- `app/api/arm-tracker/snapshot/route.ts`
  - Eliminare o trasformare in endpoint legacy autenticato read-only.
- `app/(tracker)/page.tsx`
  - Spostare watchlist/record manuali su DB.
- `app/(tracker)/log/[sessionId]/page.tsx`
  - Salvare workout via Server Action/API cloud.
- `app/(tracker)/custom-workout/new/page.tsx`
  - Creare custom workout nel DB cloud.
- `app/(tracker)/import/page.tsx`
  - Importare nel DB cloud, non nel browser.
- `app/(tracker)/program/page.tsx`
  - Mostrare stato da DB, non snapshot locale.
- `app/(tracker)/history/page.tsx`
  - Leggere storico da DB.
- `app/(tracker)/stats/page.tsx`
  - Calcolare statistiche da dati DB normalizzati o viste server.
- `lib/arm-tracker/types.ts`
  - Separare tipi DB, tipi dominio, tipi view-model.
- `package.json`
  - Aggiungere test e dipendenze necessarie, rimuovere o isolare `xlsx`.

---

## Task 1: Bloccare Nuovi Salvataggi Locali Critici

**Files:**
- Modify: `features/arm-tracker/arm-tracker-provider.tsx`
- Modify: `lib/arm-tracker/remote-sync.ts`
- Test: `tests/no-local-workout-storage.test.mts`

- [ ] **Step 1: Scrivere test anti-regressione**

```ts
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("workout-critical code must not persist real training data to localStorage", () => {
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
```

- [ ] **Step 2: Far fallire il test se lo storage locale viene usato per workout**

Run:

```bash
npm run test:unit
```

Expected: il test deve fallire finche il codice usa `iron_log_db_v2` come fonte primaria.

- [ ] **Step 3: Cambiare comportamento sync**

Nel provider, se il cloud non e disponibile:

- bloccare `saveWorkoutLog`
- bloccare `createCustomSession`
- mostrare banner: "Cloud non disponibile: puoi leggere i dati caricati, ma non salvare nuovi allenamenti."
- permettere export backup legacy se esistono dati locali.

- [ ] **Step 4: Verifica**

Run:

```bash
npm run typecheck
npm run test:unit
npm run build
```

Expected: passano tutti.

---

## Task 2: Aggiungere Autenticazione Utente

**Files:**
- Create: `lib/arm-tracker/server/auth.ts`
- Modify: `app/(tracker)/layout.tsx`
- Modify: `app/api/arm-tracker/snapshot/route.ts`

- [ ] **Step 1: Introdurre guardia server**

```ts
export interface AuthenticatedUser {
  id: string;
  email: string | null;
}

export async function requireArmTrackerUser(): Promise<AuthenticatedUser> {
  const user = await getUserFromSupabaseSession();

  if (!user) {
    throw new Error("UNAUTHENTICATED");
  }

  return {
    id: user.id,
    email: user.email ?? null
  };
}
```

- [ ] **Step 2: Rendere ogni endpoint dati autenticato**

Ogni route handler deve chiamare `requireArmTrackerUser()` prima di leggere o scrivere dati.

- [ ] **Step 3: Rimuovere il concetto di `ARM_TRACKER_OWNER_KEY` come identita**

`ARM_TRACKER_OWNER_KEY` puo restare solo per migrazione legacy. La chiave reale diventa `user.id`.

- [ ] **Step 4: Verifica**

Test manuale:

- non autenticato: redirect/login o errore 401
- autenticato da PC: vede dati cloud
- autenticato da iPad: vede gli stessi dati cloud

---

## Task 3: Sostituire Snapshot JSON con Schema Relazionale

**Files:**
- Create: `supabase/migrations/20260629_cloud_schema.sql`
- Create: `tests/cloud-schema.test.mts`

- [ ] **Step 1: Creare tabelle principali**

```sql
create table public.arm_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.arm_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  source_file_name text,
  status text not null check (status in ('active', 'archived')),
  imported_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.arm_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_id uuid not null references public.arm_plans(id) on delete cascade,
  session_date date not null,
  day_label text,
  week_number integer,
  notes text,
  status text not null check (status in ('planned', 'completed', 'partial', 'skipped')),
  kind text not null check (kind in ('planned', 'custom')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.arm_plan_exercises (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid not null references public.arm_sessions(id) on delete cascade,
  exercise_name text not null,
  planned_sets numeric,
  planned_reps numeric,
  planned_weight numeric,
  planned_notes text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.arm_workout_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_session_id uuid not null references public.arm_sessions(id) on delete cascade,
  performed_date date not null,
  bodyweight_kg numeric,
  overall_notes text,
  completion_status text not null check (completion_status in ('completed', 'partial', 'skipped')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, plan_session_id)
);

create table public.arm_workout_exercise_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  workout_log_id uuid not null references public.arm_workout_logs(id) on delete cascade,
  plan_exercise_id uuid not null references public.arm_plan_exercises(id) on delete restrict,
  exercise_name_snapshot text not null,
  planned_sets_snapshot numeric,
  planned_reps_snapshot numeric,
  planned_weight_snapshot numeric,
  planned_notes_snapshot text,
  actual_weight numeric,
  actual_reps numeric,
  actual_sets numeric,
  notes text,
  performed_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

- [ ] **Step 2: Creare tabelle Livello 100**

```sql
create table public.arm_level100_watchlist (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  exercise_name text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, exercise_name)
);

create table public.arm_level100_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  exercise_name text not null,
  bodyweight_kg numeric,
  weight numeric,
  reps numeric,
  seconds numeric,
  record_date date not null,
  source_workout_exercise_log_id uuid references public.arm_workout_exercise_logs(id) on delete set null,
  is_manual boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

- [ ] **Step 3: Abilitare RLS**

Per ogni tabella:

```sql
alter table public.arm_workout_logs enable row level security;

create policy "users manage own workout logs"
on public.arm_workout_logs
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
```

Ripetere la stessa policy per tutte le tabelle `arm_*`.

- [ ] **Step 4: Indici**

```sql
create index arm_sessions_user_date_idx on public.arm_sessions(user_id, session_date desc);
create index arm_workout_logs_user_date_idx on public.arm_workout_logs(user_id, performed_date desc);
create index arm_workout_exercise_logs_workout_idx on public.arm_workout_exercise_logs(workout_log_id, performed_order);
create index arm_level100_records_user_exercise_idx on public.arm_level100_records(user_id, exercise_name, record_date desc);
```

---

## Task 4: Migrare Dati Locali e iPad senza Perderli

**Files:**
- Create: `app/(tracker)/sync/page.tsx`
- Create: `app/api/arm-tracker/import/route.ts`
- Modify: `app/(tracker)/import/page.tsx`
- Modify: `lib/arm-tracker/storage.ts`

- [ ] **Step 1: Supportare import legacy JSON**

Il JSON esportato dall'iPad deve essere accettato come `ArmTrackerArchive`.

- [ ] **Step 2: Merge deterministico**

Regole:

- se stesso `id`, vince `updated_at` piu recente
- se stesso `planSessionId`, un solo workout log attivo
- preservare `bodyweightKg`
- preservare manual records Livello 100
- generare report import con conteggi aggiunti, aggiornati, ignorati

- [ ] **Step 3: Pagina sync**

Mostrare:

- utente loggato
- ultimo salvataggio cloud
- ultimo workout cloud
- numero workout cloud
- eventuali dati legacy locali trovati
- pulsante "Migra dati locali nel cloud"

- [ ] **Step 4: Verifica reale**

Eseguire scenario:

1. Esporta JSON da iPad PWA.
2. Importa su PC.
3. Controlla che i 5 workout gara risultino in `/program?status=completed`.
4. Apri i dettagli in `/history/[sessionId]`.
5. Accedi da iPad: stessi dati, senza reinserimento.

---

## Task 5: Riscrivere Provider e Mutazioni Cloud-First

**Files:**
- Modify: `features/arm-tracker/arm-tracker-provider.tsx`
- Create: `lib/arm-tracker/server/repository.ts`
- Create: `lib/arm-tracker/server/mutations.ts`
- Create: `lib/arm-tracker/server/mappers.ts`

- [ ] **Step 1: Repository lettura**

```ts
export async function getArmTrackerSnapshotForUser(userId: string): Promise<ArmTrackerData> {
  const [plans, sessions, exercises, workoutLogs, exerciseLogs, importRuns] = await Promise.all([
    listPlans(userId),
    listSessions(userId),
    listPlanExercises(userId),
    listWorkoutLogs(userId),
    listWorkoutExerciseLogs(userId),
    listImportRuns(userId)
  ]);

  return mapDatabaseRowsToArmTrackerData({
    plans,
    sessions,
    exercises,
    workoutLogs,
    exerciseLogs,
    importRuns
  });
}
```

- [ ] **Step 2: Mutazione `saveWorkoutLog` atomica**

La mutazione deve:

- aprire transazione o RPC Postgres
- upsert `arm_workout_logs`
- cancellare/sostituire righe esercizio della sessione
- aggiornare `arm_sessions.status`
- inserire record Livello 100 se l'esercizio e validabile
- restituire snapshot aggiornato o session details aggiornati

- [ ] **Step 3: UI optimistic solo dopo risposta server**

Non scrivere prima in locale. Mostrare stato:

- `Salvataggio...`
- `Salvato nel cloud`
- `Errore: non chiudere, riprova`

---

## Task 6: Portare Dashboard Livello 100 nel Database

**Files:**
- Modify: `app/(tracker)/page.tsx`
- Modify: `lib/arm-tracker/level-100.ts`
- Test: `tests/level-100-cloud-records.test.mts`

- [ ] **Step 1: Eliminare `level100ManualRecordsStorageKey` e watchlist localStorage**

I record manuali diventano righe `arm_level100_records`.

- [ ] **Step 2: Unificare record manuali e workout reali**

Regola:

- record da workout: `source_workout_exercise_log_id` valorizzato
- record manuale: `is_manual = true`
- se record manuale viene modificato, resta tracciato con `updated_at`

- [ ] **Step 3: Validazione**

Continuare a rispettare:

- livello massimo 130
- target 100
- gambe `kg / 2`
- classici `kg x 1`
- armwrestling `kg x 2`
- corpo libero zavorrato `(bodyweight + zavorra) / 2`
- one arm pull up `bodyweight`
- one arm iso valida solo a 10 secondi

---

## Task 7: Pulire Seed e Import Storico

**Files:**
- Move: `lib/arm-tracker/iron-log-history-seed.json`
- Modify: `lib/arm-tracker/iron-log-history-seed.ts`
- Modify: `features/arm-tracker/arm-tracker-provider.tsx`

- [ ] **Step 1: Spostare seed fuori dal runtime principale**

Il seed deve diventare fixture o import amministrativo, non dato caricato automaticamente per ogni utente.

- [ ] **Step 2: Creare comando import storico**

Esempio:

```bash
npm run import:seed -- --user <user-id> --file lib/arm-tracker/iron-log-history-seed.json
```

- [ ] **Step 3: Rimuovere import automatico nel provider**

Nuovo utente:

- vede database vuoto
- puo importare storico
- puo creare programma
- non riceve automaticamente dati demo/storici non suoi

---

## Task 8: Sostituire o Isolare `xlsx`

**Files:**
- Modify: `lib/arm-tracker/excel-parser.ts`
- Modify: `lib/arm-tracker/historical-workbook.ts`
- Modify: `app/(tracker)/import/page.tsx`
- Modify: `package.json`

- [ ] **Step 1: Spostare parsing Excel sul server**

Il browser non deve caricare parsing Excel pesante/vulnerabile.

- [ ] **Step 2: Valutare sostituzione**

Opzioni:

- sostituire `xlsx` con parser mantenuto
- accettare solo CSV
- mantenere `xlsx` solo server-side, con limite dimensione file, timeout e validazione rigida

- [ ] **Step 3: Protezioni minime**

Applicare:

- max file size
- max righe
- max colonne
- whitelist estensioni
- parsing in endpoint autenticato
- errore chiaro se file non valido

---

## Task 9: Responsive e UX Operativa

**Files:**
- Modify: `app/(tracker)/page.tsx`
- Modify: `app/(tracker)/stats/page.tsx`
- Modify: `app/(tracker)/log/[sessionId]/page.tsx`
- Modify: `features/arm-tracker/arm-tracker-shell.tsx`
- Test: `tests/responsive.spec.ts`

- [ ] **Step 1: Aggiungere test Playwright responsive**

```ts
import { test, expect } from "@playwright/test";

const pages = ["/", "/program", "/stats", "/history", "/custom-workout/new"];
const viewports = [
  { name: "phone", width: 390, height: 844 },
  { name: "ipad", width: 834, height: 1194 },
  { name: "desktop", width: 1440, height: 1000 }
];

for (const viewport of viewports) {
  for (const path of pages) {
    test(`${viewport.name} ${path} has no horizontal overflow`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await page.goto(path);
      await expect(page.locator("body")).toBeVisible();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 2);
      expect(overflow).toBe(false);
    });
  }
}
```

- [ ] **Step 2: Rendere touch target minimi 44px**

La dashboard mobile ha pulsanti da 36px per filtri/elimina. Portarli a 44px.

- [ ] **Step 3: Ridurre densita dashboard mobile**

Su telefono:

- classifica compatta
- dettaglio esercizio in accordion stabile
- pulsante elimina con conferma
- filtri in scroll orizzontale controllato o select

---

## Task 10: Osservabilita e Protezione Dati

**Files:**
- Create: `lib/arm-tracker/server/audit-log.ts`
- Create: `supabase/migrations/20260629_audit_log.sql`

- [ ] **Step 1: Audit log**

```sql
create table public.arm_audit_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null,
  entity_type text not null,
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
```

- [ ] **Step 2: Loggare eventi critici**

Eventi:

- workout_created
- workout_updated
- workout_deleted
- backup_imported
- level100_record_updated
- cloud_save_failed

- [ ] **Step 3: Pagina diagnostica**

In `/sync` mostrare ultimi 10 eventi e ultimo errore cloud leggibile.

---

## Task 11: Deployment e Rollout Sicuro

**Files:**
- Modify: `.env.example`
- Modify: `README.md` se presente, altrimenti creare `docs/deployment.md`

- [ ] **Step 1: Pulire env**

Correggere `.env.local` locale: oggi contiene caratteri `\r\n` letterali nei valori e rompe la URL Supabase.

- [ ] **Step 2: Variabili richieste**

```text
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

La service role deve restare solo server-side.

- [ ] **Step 3: Checklist Vercel**

- env presenti in Production
- Supabase URL risolve
- RLS attiva
- utente test creato
- import backup iPad eseguito
- ultimo workout visibile da PC e iPad

---

## Acceptance Criteria

L'app e considerata sistemata solo quando:

- un workout salvato su iPad appare su PC senza export manuale
- un workout salvato su PC appare su iPad
- se il cloud e offline, l'app non permette di salvare dati reali solo in locale
- `/program` mostra correttamente `completed`, `partial`, `planned`
- `/history` mostra i 5 allenamenti gara importati dall'iPad
- Dashboard Livello 100 usa gli stessi record da ogni dispositivo
- i record manuali sono editabili e persistono nel cloud
- il peso corporeo e parte del workout log
- nessun endpoint dati pubblico permette overwrite anonimo
- responsive passa senza overflow su telefono, iPad e desktop
- `npm run typecheck`, `npm run lint`, `npm run test:unit`, `npm run build` passano
- `npm audit` non segnala vulnerabilita high in dipendenze runtime

---

## Execution Order

1. Hotfix sicurezza API snapshot: autenticazione o disabilitazione `POST`.
2. Fix env locale e Vercel env.
3. Pagina `/sync` e import backup iPad.
4. Schema Supabase relazionale con RLS.
5. Repository cloud e provider cloud-first.
6. Mutazioni workout cloud.
7. Dashboard Livello 100 cloud.
8. Import storico cloud e rimozione seed runtime.
9. Sostituzione/isolamento `xlsx`.
10. Responsive E2E e touch target.
11. Deploy, test cross-device, audit finale.


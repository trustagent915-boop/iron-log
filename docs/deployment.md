# Iron Log Deployment Checklist

Questa app deve essere trattata come cloud-first: se il cloud non e pronto, i salvataggi reali restano bloccati per evitare dati salvati solo sul dispositivo.

## 1. Supabase

Applicare prima lo schema legacy di sicurezza, poi la migration relazionale:

1. Aprire Supabase SQL editor del progetto corretto.
2. Eseguire tutto `supabase/arm_tracker_schema.sql`.
3. Eseguire tutto `supabase/migrations/20260629_cloud_schema.sql`.
4. Verificare che esistano:
   - `arm_tracker_snapshots`
   - `arm_tracker_snapshot_versions`
   - `arm_workout_logs`
   - `arm_workout_exercise_logs`
   - `arm_level100_records`
   - `arm_audit_events`

La tabella `arm_tracker_snapshot_versions` e obbligatoria: senza questa tabella le scritture snapshot devono fallire, perche ogni overwrite deve essere recuperabile.

## 2. Vercel env

Configurare in Production, Preview e Development:

```text
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
ARM_TRACKER_OWNER_KEY=
ARM_TRACKER_SYNC_TOKEN=
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

`SUPABASE_SERVICE_ROLE_KEY`, `ARM_TRACKER_OWNER_KEY` e `ARM_TRACKER_SYNC_TOKEN` sono segreti server-side. Non devono essere esposti nel client.

## 3. Primo accesso

1. Aprire `/sync`.
2. Inserire il token configurato in `ARM_TRACKER_SYNC_TOKEN` o `ARM_TRACKER_OWNER_KEY`.
3. Verificare che `Scrittura cloud` diventi `Attiva`.
4. Esportare un backup locale e un backup di sicurezza prima di importare dati iPad.
5. Importare il JSON esportato dall'iPad da `/import`.
6. Controllare `/program`, `/history` e dashboard Livello 100 da due dispositivi diversi.

## 4. Rollback dati

Se un import o una sync produce dati inattesi:

1. Non cancellare dati dal browser.
2. Esportare subito `Esporta backup di sicurezza` da `/sync`.
3. Recuperare la versione precedente da `arm_tracker_snapshot_versions`.
4. Ripristinare solo dopo avere esportato lo snapshot corrente.

## 5. Verifiche pre-deploy

```bash
npm run typecheck
npm run test:unit
npm run lint
npm run build
npm audit --omit=dev
```

Nota audit: se `npm audit fix --force` propone downgrade di Next, non applicarlo automaticamente.

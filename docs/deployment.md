# Iron Log Deployment Checklist

Questa app deve essere trattata come cloud-first: se il cloud non e pronto, i salvataggi reali restano bloccati per evitare dati salvati solo sul dispositivo.

## 1. Supabase

### Schema runtime obbligatorio

Il runtime usa **solo** lo schema JSON snapshot. Eseguire `supabase/arm_tracker_schema.sql`
sul progetto Supabase corretto.

Tabelle che devono esistere al termine:
- `arm_tracker_snapshots` — singolo blob JSON per `owner_key`
- `arm_tracker_snapshot_versions` — storico versioni per rollback

La tabella `arm_tracker_snapshot_versions` e **obbligatoria**: senza, ogni scrittura
snapshot deve fallire chiusa, perche ogni overwrite deve essere recuperabile. Il
codice in `lib/arm-tracker/supabase-sync.server.ts` inserisce una versione
`pre-write-cloud` e una `incoming-write` prima del POST principale.

### Schema relazionale (preparatorio, non attivo)

Il file `supabase/migrations/20260629_cloud_schema.sql` definisce uno schema
relazionale con `auth.users` (tabelle `arm_workout_logs`, `arm_level100_records`,
`arm_audit_events`, ecc.). **Questo schema non e letto/scritto dal runtime
attuale**: e una preparazione per una futura migrazione verso multi-utente con
RLS per `auth.uid()`. Puo essere applicato senza impatto (le tabelle restano
vuote), ma NON e necessario per far funzionare l'app oggi.

Se si applica, verificare che esistano anche:
- `arm_plans`, `arm_sessions`, `arm_plan_exercises`
- `arm_workout_logs`, `arm_workout_exercise_logs`
- `arm_level100_watchlist`, `arm_level100_records`
- `arm_import_runs`, `arm_audit_events`, `arm_profiles`

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
4. Sotto a "Stato dati lato cloud" verificare che i conteggi cloud combacino
   con quelli del dispositivo (l'endpoint `/api/arm-tracker/health` espone
   counts, watchlist, tombstones, ultimo `updated_at` e numero di versioni
   snapshot — visibile da pannello `/sync`).
5. Esportare un backup locale e un backup di sicurezza prima di importare dati iPad.
6. Importare il JSON esportato dall'iPad da `/import`.
7. Controllare `/program`, `/history` e dashboard Livello 100 da due dispositivi diversi.

### Verifica multi-device

Dopo il primo accesso, eseguire questa checklist su almeno due dispositivi
(PC + iPad o PC + telefono):

- [ ] I conteggi sotto "Stato dati lato cloud" combaciano tra dispositivi.
- [ ] Aggiungere un esercizio nel watchlist dashboard da PC → ricaricare iPad → presente.
- [ ] Registrare un workout iso da PC con secondi tenuti → il dashboard Livello 100
      mostra il livello iso anche dall'iPad.
- [ ] Cancellare un allenamento da `/history/[id]` → al refresh non riappare dal cloud.

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

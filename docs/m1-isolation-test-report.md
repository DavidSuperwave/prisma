# M1 Isolation Test Report

Date: 2026-04-11  
Environment: local repository checkout (`c:/Users/Kecin/Desktop/Prisma`)

## Added Test Assets

- Seed fixture: `supabase/seeds/20260411_m1_isolation_seed.sql`
- RLS check: `supabase/tests/m1_rls_isolation_check.sql`

## Execution Status

The SQL fixtures and verification script are prepared, but the test has not been executed in this repository session because no Supabase CLI/database connection was configured in the terminal context.

## How To Execute

1. Apply migrations:

```bash
supabase db push
```

2. Seed two-workspace fixture:

```bash
psql "$SUPABASE_DB_URL" -v USER_A_ID="<uuid-a>" -v USER_B_ID="<uuid-b>" -f supabase/seeds/20260411_m1_isolation_seed.sql
```

3. Run isolation check:

```bash
psql "$SUPABASE_DB_URL" -v USER_A_ID="<uuid-a>" -v USER_B_ID="<uuid-b>" -f supabase/tests/m1_rls_isolation_check.sql
```

## Expected Result

- Script exits successfully with no exceptions.
- USER_A cannot read workspace B records.
- USER_B cannot read workspace A records.

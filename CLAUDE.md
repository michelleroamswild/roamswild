# Claude Code Project Notes

## Supabase Local Development Workflow

**Important:** This project uses Supabase with both local and cloud instances. Be careful about which database migrations are applied to.

### Commands

| Action | Command | Target |
|--------|---------|--------|
| Apply new migrations locally | `supabase migration up` | Local DB |
| Reset local DB (wipes data) | `supabase db reset` | Local DB |
| Push migrations to cloud | `supabase db push` | Cloud DB |
| Check migration status | `supabase migration list` | Both |

### Common Issues

1. **Migrations applied to wrong database**: If you create a migration and run `supabase db push`, it goes to the cloud, not local. Always run `supabase migration up` for local development.

2. **"Table not found in schema cache"**: Run `supabase db reset` to apply all migrations locally and refresh the schema cache.

3. **RLS policies not working locally**: Migrations may be on cloud but not local. Check with `supabase migration list` and run `supabase migration up`.

### Environment

- Local Supabase: `http://127.0.0.1:54321`
- Local DB: `postgresql://postgres:postgres@127.0.0.1:54322/postgres`
- Email provider: Resend (configured in `supabase/config.toml`)
- Universal access code: `ROAM-4789`

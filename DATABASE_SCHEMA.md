# Database schema

This dashboard uses the schema defined in:

**`../Database/schema.sql`**

## Key points for the Python API

| Concept | Table / column |
|--------|----------------|
| Workflow status (OPEN, IN_PROGRESS, …) | `secrets.secret_status` |
| Severity / AI validation | `secret_validations` (`risk_score`, `verdict`, `reasoning`, …) |
| Git blame | `secret_git_metadata` |
| Status changes + audit | `set_secret_status()` → updates `secrets` + `secret_status_history` |
| Alert queue (pipeline) | View `v_secrets_alert_queue` |

The API does **not** use a `status` column on `secret_validations` (removed in the refined schema).

## Apply schema

```bash
psql -U socadmin -d secrets_db -f ../Database/schema.sql
```

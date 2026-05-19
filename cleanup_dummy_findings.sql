-- Remove demo data inserted by seed_dummy_findings.sql
-- Keeps dashboard users (seed_users.sql) and any non–acme-corp repositories.

BEGIN;

DELETE FROM repositories
WHERE url LIKE '%github.com/acme-corp/%'
   OR name IN ('payment-api', 'mobile-app', 'infra-terraform');

COMMIT;

SELECT COUNT(*) AS repositories_remaining FROM repositories;
SELECT COUNT(*) AS secrets_remaining FROM secrets;

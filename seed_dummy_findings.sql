-- Dummy SOC dashboard findings (safe hashes only — no real secrets)
-- Run: psql -U girish -d secrets_db -f seed_dummy_findings.sql

BEGIN;

INSERT INTO repositories (name, url) VALUES
  ('payment-api', 'https://github.com/acme-corp/payment-api'),
  ('mobile-app', 'https://github.com/acme-corp/mobile-app'),
  ('infra-terraform', 'https://github.com/acme-corp/infra-terraform')
ON CONFLICT (url) DO NOTHING;

INSERT INTO scan_runs (repo_id, started_at, completed_at, status, scanners_used)
SELECT r.id, NOW() - INTERVAL '2 days', NOW() - INTERVAL '2 days' + INTERVAL '18 minutes', 'completed', ARRAY['gitleaks', 'trufflehog']
FROM repositories r WHERE r.name = 'payment-api'
ON CONFLICT DO NOTHING;

INSERT INTO scan_runs (repo_id, started_at, completed_at, status, scanners_used)
SELECT r.id, NOW() - INTERVAL '5 days', NOW() - INTERVAL '5 days' + INTERVAL '22 minutes', 'completed', ARRAY['gitleaks']
FROM repositories r WHERE r.name = 'mobile-app'
ON CONFLICT DO NOTHING;

INSERT INTO scan_runs (repo_id, started_at, completed_at, status, scanners_used)
SELECT r.id, NOW() - INTERVAL '1 day', NOW() - INTERVAL '1 day' + INTERVAL '31 minutes', 'completed', ARRAY['gitleaks', 'trufflehog', 'custom-regex']
FROM repositories r WHERE r.name = 'infra-terraform'
ON CONFLICT DO NOTHING;

-- payment-api findings
INSERT INTO secrets (
  repo_id, scan_run_id, tool, secret_type, file_path, line_number,
  secret_hash, source_url, detected_by, fingerprint, is_active, secret_status, created_at
)
SELECT
  r.id,
  sr.id,
  v.tool,
  v.secret_type,
  v.file_path,
  v.line_number,
  v.secret_hash,
  v.source_url,
  v.detected_by,
  v.fingerprint,
  v.is_active,
  v.secret_status,
  v.created_at
FROM repositories r
JOIN scan_runs sr ON sr.repo_id = r.id AND sr.status = 'completed'
CROSS JOIN (VALUES
  ('gitleaks', 'AWS Access Key', 'config/prod.env', 42,
   'a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456',
   'https://github.com/acme-corp/payment-api/blob/main/config/prod.env#L42',
   ARRAY['gitleaks'], 'payment-api:config/prod.env:42', TRUE, 'OPEN', NOW() - INTERVAL '6 hours'),
  ('trufflehog', 'Stripe API Key', 'src/billing/checkout.ts', 118,
   'b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef1234567890',
   'https://github.com/acme-corp/payment-api/blob/main/src/billing/checkout.ts#L118',
   ARRAY['trufflehog'], 'payment-api:src/billing/checkout.ts:118', TRUE, 'IN_PROGRESS', NOW() - INTERVAL '2 days'),
  ('gitleaks', 'PEM Private Key', 'deploy/legacy/tls.key', 1,
   'c3d4e5f6789012345678901234567890abcdef1234567890abcdef1234567890ab',
   'https://github.com/acme-corp/payment-api/blob/main/deploy/legacy/tls.key#L1',
   ARRAY['gitleaks', 'trufflehog'], 'payment-api:deploy/legacy/tls.key:1', TRUE, 'OPEN', NOW() - INTERVAL '12 hours')
) AS v(tool, secret_type, file_path, line_number, secret_hash, source_url, detected_by, fingerprint, is_active, secret_status, created_at)
WHERE r.name = 'payment-api'
ON CONFLICT (repo_id, file_path, line_number) DO NOTHING;

-- mobile-app findings
INSERT INTO secrets (
  repo_id, scan_run_id, tool, secret_type, file_path, line_number,
  secret_hash, source_url, detected_by, fingerprint, is_active, secret_status, created_at
)
SELECT
  r.id, sr.id, v.tool, v.secret_type, v.file_path, v.line_number,
  v.secret_hash, v.source_url, v.detected_by, v.fingerprint, v.is_active, v.secret_status, v.created_at
FROM repositories r
JOIN scan_runs sr ON sr.repo_id = r.id AND sr.status = 'completed'
CROSS JOIN (VALUES
  ('gitleaks', 'Google API Key', 'android/app/secrets.gradle', 8,
   'd4e5f6789012345678901234567890abcdef1234567890abcdef1234567890abcd',
   'https://github.com/acme-corp/mobile-app/blob/main/android/app/secrets.gradle#L8',
   ARRAY['gitleaks'], 'mobile-app:android/app/secrets.gradle:8', TRUE, 'RESOLVED', NOW() - INTERVAL '5 days'),
  ('gitleaks', 'JWT Secret', 'lib/auth/token.dart', 55,
   'e5f6789012345678901234567890abcdef1234567890abcdef1234567890abcdef',
   'https://github.com/acme-corp/mobile-app/blob/main/lib/auth/token.dart#L55',
   ARRAY['gitleaks'], 'mobile-app:lib/auth/token.dart:55', FALSE, 'ACCEPTED_RISK', NOW() - INTERVAL '4 days'),
  ('gitleaks', 'Slack Webhook', 'scripts/notify.sh', 3,
   'f6789012345678901234567890abcdef1234567890abcdef1234567890abcdef12',
   'https://github.com/acme-corp/mobile-app/blob/main/scripts/notify.sh#L3',
   ARRAY['gitleaks'], 'mobile-app:scripts/notify.sh:3', TRUE, 'OPEN', NOW() - INTERVAL '20 hours')
) AS v(tool, secret_type, file_path, line_number, secret_hash, source_url, detected_by, fingerprint, is_active, secret_status, created_at)
WHERE r.name = 'mobile-app'
ON CONFLICT (repo_id, file_path, line_number) DO NOTHING;

-- infra-terraform findings
INSERT INTO secrets (
  repo_id, scan_run_id, tool, secret_type, file_path, line_number,
  secret_hash, source_url, detected_by, fingerprint, is_active, secret_status, created_at
)
SELECT
  r.id, sr.id, v.tool, v.secret_type, v.file_path, v.line_number,
  v.secret_hash, v.source_url, v.detected_by, v.fingerprint, v.is_active, v.secret_status, v.created_at
FROM repositories r
JOIN scan_runs sr ON sr.repo_id = r.id AND sr.status = 'completed'
CROSS JOIN (VALUES
  ('trufflehog', 'Database Password', 'modules/rds/variables.tf', 27,
   '789012345678901234567890abcdef1234567890abcdef1234567890abcdef1234',
   'https://github.com/acme-corp/infra-terraform/blob/main/modules/rds/variables.tf#L27',
   ARRAY['trufflehog'], 'infra-terraform:modules/rds/variables.tf:27', TRUE, 'OPEN', NOW() - INTERVAL '1 day'),
  ('gitleaks', 'Azure Client Secret', 'env/staging.tfvars', 12,
   '890123456789012345678901234567890abcdef1234567890abcdef1234567890ab',
   'https://github.com/acme-corp/infra-terraform/blob/main/env/staging.tfvars#L12',
   ARRAY['gitleaks'], 'infra-terraform:env/staging.tfvars:12', TRUE, 'IN_PROGRESS', NOW() - INTERVAL '8 hours'),
  ('custom-regex', 'SSH Private Key', 'ansible/keys/deploy_rsa', 1,
   '9012345678901234567890abcdef1234567890abcdef1234567890abcdef123456',
   'https://github.com/acme-corp/infra-terraform/blob/main/ansible/keys/deploy_rsa#L1',
   ARRAY['gitleaks', 'custom-regex'], 'infra-terraform:ansible/keys/deploy_rsa:1', TRUE, 'OPEN', NOW() - INTERVAL '3 days')
) AS v(tool, secret_type, file_path, line_number, secret_hash, source_url, detected_by, fingerprint, is_active, secret_status, created_at)
WHERE r.name = 'infra-terraform'
ON CONFLICT (repo_id, file_path, line_number) DO NOTHING;

-- Git metadata
INSERT INTO secret_git_metadata (
  secret_id, commit_hash, branch_name, author_name, author_email, author_date,
  committer_name, committer_email, committer_date
)
SELECT
  s.id,
  m.commit_hash,
  m.branch_name,
  m.author_name,
  m.author_email,
  m.author_date,
  m.committer_name,
  m.committer_email,
  m.committer_date
FROM secrets s
JOIN repositories r ON r.id = s.repo_id
JOIN (VALUES
  ('payment-api', 'config/prod.env', 42, 'a1f3c9e2b8d74f6012ab34cd56ef7890abcd1234', 'main',
   'Jane Doe', 'jane.doe@acme.com', NOW() - INTERVAL '30 days',
   'Jane Doe', 'jane.doe@acme.com', NOW() - INTERVAL '30 days'),
  ('payment-api', 'src/billing/checkout.ts', 118, 'b2e4d6f8a0c1357924680abcdef1234567890ab12', 'main',
   'Bob Smith', 'bob.smith@acme.com', NOW() - INTERVAL '14 days',
   'Bob Smith', 'bob.smith@acme.com', NOW() - INTERVAL '14 days'),
  ('payment-api', 'deploy/legacy/tls.key', 1, 'c3f5a7b9d1e2436587091abcdef234567890cd12', 'hotfix/tls',
   'Ops Bot', 'ops@acme.com', NOW() - INTERVAL '90 days',
   'Ops Bot', 'ops@acme.com', NOW() - INTERVAL '90 days'),
  ('mobile-app', 'android/app/secrets.gradle', 8, 'd4a6c8e0f2b4567890abcdef1234567890abcdef12', 'develop',
   'Alice Chen', 'alice.chen@acme.com', NOW() - INTERVAL '45 days',
   'Alice Chen', 'alice.chen@acme.com', NOW() - INTERVAL '45 days'),
  ('mobile-app', 'lib/auth/token.dart', 55, 'e5b7d9f1a3c5678901234abcdef5678901234abcdef', 'main',
   'Dev Intern', 'intern@acme.com', NOW() - INTERVAL '60 days',
   'Dev Intern', 'intern@acme.com', NOW() - INTERVAL '60 days'),
  ('mobile-app', 'scripts/notify.sh', 3, 'f6c8e0a2b4d6789012345abcdef6789012345abcdef', 'main',
   'CI Pipeline', 'ci@acme.com', NOW() - INTERVAL '7 days',
   'CI Pipeline', 'ci@acme.com', NOW() - INTERVAL '7 days'),
  ('infra-terraform', 'modules/rds/variables.tf', 27, 'a7c9e1b3d5f7890123456abcdef7890123456abcdef', 'main',
   'SRE Team', 'sre@acme.com', NOW() - INTERVAL '21 days',
   'SRE Team', 'sre@acme.com', NOW() - INTERVAL '21 days'),
  ('infra-terraform', 'env/staging.tfvars', 12, 'b8d0f2a4c6e8901234567abcdef8901234567abcdef', 'staging',
   'Terraform Apply', 'terraform@acme.com', NOW() - INTERVAL '10 days',
   'Terraform Apply', 'terraform@acme.com', NOW() - INTERVAL '10 days'),
  ('infra-terraform', 'ansible/keys/deploy_rsa', 1, 'c9e1a3b5d7f0123456789abcdef0123456789abcdef', 'main',
   'Admin', 'admin@acme.com', NOW() - INTERVAL '120 days',
   'Admin', 'admin@acme.com', NOW() - INTERVAL '120 days')
) AS m(repo_name, file_path, line_number, commit_hash, branch_name, author_name, author_email, author_date, committer_name, committer_email, committer_date)
  ON r.name = m.repo_name AND s.file_path = m.file_path AND s.line_number = m.line_number
ON CONFLICT (secret_id) DO NOTHING;

-- AI / scanner validations
INSERT INTO secret_validations (
  secret_id, validator_type, validator_model, ok, verdict, verdict_legacy,
  confidence, risk_score, is_likely_active, secret_kind, reasoning, evidence
)
SELECT
  s.id,
  v.validator_type,
  v.validator_model,
  TRUE,
  v.verdict,
  v.verdict_legacy,
  v.confidence,
  v.risk_score,
  v.is_likely_active,
  v.secret_kind,
  v.reasoning,
  v.evidence
FROM secrets s
JOIN repositories r ON r.id = s.repo_id
JOIN (VALUES
  ('payment-api', 'config/prod.env', 42, 'ai', 'gpt-4o-mini', 'VALID_CANDIDATE', 'true_positive', 0.94, 9, 'true', 'api_key',
   'High-entropy AWS AKIA prefix in production config file committed to default branch.',
   ARRAY['Pattern AKIA[0-9A-Z]{16}', 'File path contains prod.env']),
  ('payment-api', 'src/billing/checkout.ts', 118, 'ai', 'gpt-4o-mini', 'VALID_CANDIDATE', 'true_positive', 0.88, 8, 'true', 'api_key',
   'Stripe live key format detected near payment charge handler.',
   ARRAY['sk_live_ prefix match', 'Used in chargeSession()']),
  ('payment-api', 'deploy/legacy/tls.key', 1, 'scanner', NULL, 'VALID_CANDIDATE', 'true_positive', 0.99, 10, 'true', 'private_key',
   'Full PEM private key block with BEGIN RSA PRIVATE KEY header.',
   ARRAY['PEM block', 'Legacy deploy directory']),
  ('mobile-app', 'android/app/secrets.gradle', 8, 'ai', 'gpt-4o-mini', 'FALSE_POSITIVE', 'false_positive', 0.72, 3, 'false', 'api_key',
   'Placeholder value documented in README; matches test key pattern only.',
   ARRAY['Comment says PLACEHOLDER', 'No network calls reference this key']),
  ('mobile-app', 'lib/auth/token.dart', 55, 'ai', 'gpt-4o-mini', 'LOW_CONFIDENCE', 'HUMAN_REVIEW_REQUIRED', 0.55, 5, 'unknown', 'generic_secret',
   'Possible JWT secret string; entropy moderate and may be dev-only.',
   ARRAY['Used only in debug build flag']),
  ('mobile-app', 'scripts/notify.sh', 3, 'scanner', NULL, 'VALID_CANDIDATE', 'true_positive', 0.91, 7, 'true', 'webhook',
   'Slack incoming webhook URL with live workspace ID.',
   ARRAY['hooks.slack.com URL']),
  ('infra-terraform', 'modules/rds/variables.tf', 27, 'ai', 'gpt-4o-mini', 'VALID_CANDIDATE', 'true_positive', 0.86, 9, 'true', 'password',
   'Hardcoded database password in Terraform variable default.',
   ARRAY['default = "..." syntax', 'Production module path']),
  ('infra-terraform', 'env/staging.tfvars', 12, 'scanner', NULL, 'VALID_CANDIDATE', 'true_positive', 0.83, 7, 'true', 'client_secret',
   'Azure AD client secret assigned in staging tfvars.',
   ARRAY['client_secret field']),
  ('infra-terraform', 'ansible/keys/deploy_rsa', 1, 'ai', 'gpt-4o-mini', 'VALID_CANDIDATE', 'true_positive', 0.97, 10, 'true', 'private_key',
   'OpenSSH private key used for deployment automation.',
   ARRAY['BEGIN OPENSSH PRIVATE KEY'])
) AS v(repo_name, file_path, line_number, validator_type, validator_model, verdict, verdict_legacy, confidence, risk_score, is_likely_active, secret_kind, reasoning, evidence)
  ON r.name = v.repo_name AND s.file_path = v.file_path AND s.line_number = v.line_number
ON CONFLICT (secret_id) DO NOTHING;

COMMIT;

SELECT COUNT(*) AS total_secrets FROM secrets;
SELECT secret_status, COUNT(*) FROM secrets GROUP BY secret_status ORDER BY secret_status;

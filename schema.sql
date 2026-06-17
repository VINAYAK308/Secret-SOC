-- =============================================================
--  Secrets Scanning Pipeline — Database Schema
--  Aligned to enriched-findings.json (attribute_secrets.py output)
-- =============================================================

-- -------------------------------------------------------------
-- 1. repositories
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS repositories (
    id          SERIAL PRIMARY KEY,
    name        TEXT        NOT NULL,
    url         TEXT        NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- -------------------------------------------------------------
-- 2. scan_runs
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS scan_runs (
    id             SERIAL PRIMARY KEY,
    repo_id        INTEGER     NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
    started_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at   TIMESTAMPTZ,
    status         TEXT        NOT NULL DEFAULT 'running',  -- 'running' | 'completed' | 'failed'
    scanners_used  TEXT[],
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_scan_runs_repo_id ON scan_runs(repo_id);
CREATE INDEX IF NOT EXISTS idx_scan_runs_status  ON scan_runs(status);

-- -------------------------------------------------------------
-- 3. secrets
--    Maps to per-finding top-level fields in enriched-findings.json.
--    secret_status is the incident workflow state for triage/remediation.
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS secrets (
    id            SERIAL PRIMARY KEY,
    repo_id       INTEGER     NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
    scan_run_id   INTEGER     NOT NULL REFERENCES scan_runs(id)    ON DELETE CASCADE,

    tool          TEXT        NOT NULL,    -- JSON `tool`
    secret_type   TEXT,                     -- JSON `rule`
    file_path     TEXT        NOT NULL,     -- JSON `file`
    line_number   INTEGER     NOT NULL,     -- JSON `line`

    secret_hash   TEXT        NOT NULL,     -- SHA-256 of JSON `secret`
    source_url    TEXT,                     -- JSON `url`

    detected_by   TEXT[],
    fingerprint   TEXT        NOT NULL UNIQUE,  -- '<file_path>:<line_number>:<secret_hash[:12]>'

    is_active     BOOLEAN     NOT NULL DEFAULT TRUE,    -- still present in latest scan
    secret_status TEXT        NOT NULL DEFAULT 'OPEN',  -- incident workflow state

    last_seen_at  TIMESTAMPTZ,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_secret_status CHECK (
        secret_status IN ('OPEN', 'IN_PROGRESS', 'RESOLVED', 'ACCEPTED_RISK')
    )
);
CREATE INDEX IF NOT EXISTS idx_secrets_repo_id     ON secrets(repo_id);
CREATE INDEX IF NOT EXISTS idx_secrets_scan_run_id ON secrets(scan_run_id);
CREATE INDEX IF NOT EXISTS idx_secrets_fingerprint ON secrets(fingerprint);
CREATE INDEX IF NOT EXISTS idx_secrets_is_active   ON secrets(is_active);
CREATE INDEX IF NOT EXISTS idx_secrets_status      ON secrets(secret_status);
CREATE INDEX IF NOT EXISTS idx_secrets_tool        ON secrets(tool);
CREATE INDEX IF NOT EXISTS idx_secrets_file_line   ON secrets(file_path, line_number);

-- -------------------------------------------------------------
-- 4. secret_git_metadata
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS secret_git_metadata (
    id                 SERIAL PRIMARY KEY,
    secret_id          INTEGER NOT NULL REFERENCES secrets(id) ON DELETE CASCADE,

    commit_hash        TEXT,                   -- JSON `commit`
    branch_name        TEXT,

    author_name        TEXT,                   -- JSON `author_name`
    author_email       TEXT,                   -- JSON `author_email`
    author_date        TIMESTAMPTZ,            -- JSON `author_date`

    committer_name     TEXT,                   -- JSON `committer_name`
    committer_email    TEXT,                   -- JSON `committer_email`
    committer_date     TIMESTAMPTZ,            -- JSON `committer_date`

    attribution_error  TEXT,                   -- JSON `attribution_error`
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_attribution_result CHECK (
        commit_hash IS NOT NULL OR attribution_error IS NOT NULL
    )
);
CREATE INDEX IF NOT EXISTS idx_secret_git_meta_secret_id   ON secret_git_metadata(secret_id);
CREATE INDEX IF NOT EXISTS idx_secret_git_meta_commit_hash ON secret_git_metadata(commit_hash);
CREATE INDEX IF NOT EXISTS idx_secret_git_meta_author      ON secret_git_metadata(author_email);
CREATE INDEX IF NOT EXISTS idx_secret_git_meta_committer   ON secret_git_metadata(committer_email);

-- -------------------------------------------------------------
-- 5. secret_validations
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS secret_validations (
    id                SERIAL PRIMARY KEY,
    secret_id         INTEGER     NOT NULL REFERENCES secrets(id) ON DELETE CASCADE,

    validator_type    TEXT        NOT NULL,
    validator_model   TEXT,

    ok                BOOLEAN     NOT NULL DEFAULT TRUE,   -- JSON validation.ok

    verdict           TEXT,                    -- JSON validation.verdict
    verdict_legacy    TEXT,                    -- JSON validation.verdict_legacy
    confidence        REAL,                    -- JSON validation.confidence
    risk_score        SMALLINT,                -- JSON validation.risk_score
    is_likely_active  TEXT,                    -- JSON validation.is_likely_active
    secret_kind       TEXT,                    -- JSON validation.secret_kind
    reasoning         TEXT,                    -- JSON validation.reasoning
    evidence          TEXT[],                  -- JSON validation.evidence

    validated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_verdict CHECK (
        verdict IS NULL OR verdict IN
            ('VALID_CANDIDATE', 'FALSE_POSITIVE', 'LOW_CONFIDENCE')
    ),
    CONSTRAINT chk_verdict_legacy CHECK (
        verdict_legacy IS NULL OR verdict_legacy IN
            ('true_positive', 'false_positive', 'HUMAN_REVIEW_REQUIRED')
    ),
    CONSTRAINT chk_is_likely_active CHECK (
        is_likely_active IS NULL OR is_likely_active IN ('true', 'false', 'unknown')
    ),
    CONSTRAINT chk_risk_score CHECK (risk_score IS NULL OR (risk_score BETWEEN 1   AND 10)),
    CONSTRAINT chk_confidence CHECK (confidence IS NULL OR (confidence BETWEEN 0.0 AND 1.0))
);
CREATE INDEX IF NOT EXISTS idx_secret_validations_secret_id ON secret_validations(secret_id);
CREATE INDEX IF NOT EXISTS idx_secret_validations_verdict   ON secret_validations(verdict);
CREATE INDEX IF NOT EXISTS idx_secret_validations_active    ON secret_validations(is_likely_active);
CREATE INDEX IF NOT EXISTS idx_secret_validations_risk      ON secret_validations(risk_score);

-- -------------------------------------------------------------
-- 6. users  (SOC dashboard authentication & RBAC)
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
    id          SERIAL PRIMARY KEY,
    username    TEXT        NOT NULL,
    password    TEXT        NOT NULL,
    role        TEXT        NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_users_username UNIQUE (username),
    CONSTRAINT chk_users_role CHECK (role IN ('admin', 'reviewer'))
);

CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_role     ON users(role);

-- -------------------------------------------------------------
-- 7. finding_cache  (Tier-1 cross-scan cache for code_graph + validation)
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS finding_cache (
    fingerprint       TEXT        NOT NULL,
    repo_name         TEXT        NOT NULL,
    file_path         TEXT        NOT NULL,   -- repo-relative path
    line              INTEGER     NOT NULL,
    rule              TEXT        NOT NULL,
    tool              TEXT,
    context_json      JSONB,
    validation_json   JSONB,
    finding_json      JSONB,                  -- optional full snapshot
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    PRIMARY KEY (repo_name, fingerprint),
    CONSTRAINT chk_finding_cache_line CHECK (line > 0)
);

-- -------------------------------------------------------------
-- 8. Views
-- -------------------------------------------------------------
CREATE OR REPLACE VIEW v_secrets_alert_queue AS
SELECT
    s.id AS secret_id,
    s.fingerprint,
    s.secret_status,
    sv.risk_score,
    s.repo_id,
    r.name AS repo_name,
    s.is_active,
    s.created_at,
    CASE
        WHEN s.secret_status = 'OPEN' THEN 'needs_initial'
        WHEN s.secret_status = 'IN_PROGRESS' THEN 'needs_reminder'
        ELSE 'resolved'
    END AS alert_state
FROM secrets s
JOIN repositories r ON s.repo_id = r.id
LEFT JOIN secret_validations sv ON sv.secret_id = s.id
WHERE s.is_active = TRUE
  AND s.secret_status IN ('OPEN', 'IN_PROGRESS');


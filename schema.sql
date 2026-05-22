-- =============================================================
--  Secrets Scanning Pipeline — Database Schema (refined)
--  Aligned to enriched-findings.json (attribute_secrets.py output)
--  Pipeline: finding_cache.py | database.py | Dashboard: secret-soc-dashboard-python
--
--  Apply:  psql "$DATABASE_URL" -f schema.sql
--  Seeds:  psql "$DATABASE_URL" -f ../secret-soc-dashboard-python/seed_users.sql
-- =============================================================

-- -------------------------------------------------------------
-- 1. repositories
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS repositories (
    id          SERIAL PRIMARY KEY,
    name        TEXT        NOT NULL,
    url         TEXT        NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_repositories_url UNIQUE (url)
);

-- -------------------------------------------------------------
-- 2. scan_runs
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS scan_runs (
    id             SERIAL PRIMARY KEY,
    repo_id        INTEGER     NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
    started_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at   TIMESTAMPTZ,
    status         TEXT        NOT NULL DEFAULT 'running',
    scanners_used  TEXT[],
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_scan_run_status CHECK (
        status IN ('running', 'completed', 'failed')
    ),
    CONSTRAINT chk_scan_run_times CHECK (
        completed_at IS NULL OR completed_at >= started_at
    )
);

CREATE INDEX IF NOT EXISTS idx_scan_runs_repo_id ON scan_runs(repo_id);
CREATE INDEX IF NOT EXISTS idx_scan_runs_status  ON scan_runs(status);

-- -------------------------------------------------------------
-- 3. secrets
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS secrets (
    id            SERIAL PRIMARY KEY,
    repo_id       INTEGER     NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
    scan_run_id   INTEGER     NOT NULL REFERENCES scan_runs(id)    ON DELETE CASCADE,

    tool          TEXT        NOT NULL,
    secret_type   TEXT,
    file_path     TEXT        NOT NULL,
    line_number   INTEGER     NOT NULL,

    secret_hash   TEXT        NOT NULL,
    source_url    TEXT,

    detected_by   TEXT[]      NOT NULL DEFAULT '{}',
    fingerprint   TEXT        NOT NULL,

    is_active     BOOLEAN     NOT NULL DEFAULT TRUE,
    secret_status TEXT        NOT NULL DEFAULT 'OPEN',

    last_seen_at  TIMESTAMPTZ,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_secrets_repo_file_line UNIQUE (repo_id, file_path, line_number),
    CONSTRAINT chk_secret_status CHECK (
        secret_status IN ('OPEN', 'IN_PROGRESS', 'RESOLVED', 'ACCEPTED_RISK')
    ),
    CONSTRAINT chk_secrets_line_number CHECK (line_number > 0)
);

CREATE INDEX IF NOT EXISTS idx_secrets_repo_id       ON secrets(repo_id);
CREATE INDEX IF NOT EXISTS idx_secrets_scan_run_id   ON secrets(scan_run_id);
CREATE INDEX IF NOT EXISTS idx_secrets_is_active     ON secrets(is_active);
CREATE INDEX IF NOT EXISTS idx_secrets_status        ON secrets(secret_status);
CREATE INDEX IF NOT EXISTS idx_secrets_tool          ON secrets(tool);
CREATE INDEX IF NOT EXISTS idx_secrets_file_line     ON secrets(file_path, line_number);
CREATE INDEX IF NOT EXISTS idx_secrets_repo_active   ON secrets(repo_id, is_active)
    WHERE is_active;

-- Permanent policy: never keep .git paths; one row per repo + file + line.
DELETE FROM secrets
WHERE replace(file_path, E'\\', '/') ~ '(^|/)\.git(/|$)';

WITH merged_tools AS (
    SELECT
        (MIN(s.id)) AS keep_id,
        array_agg(DISTINCT t ORDER BY t) FILTER (WHERE t IS NOT NULL) AS tools
    FROM secrets s
    CROSS JOIN LATERAL unnest(
        COALESCE(s.detected_by, ARRAY[]::TEXT[])
    ) AS t
    GROUP BY s.repo_id, s.file_path, s.line_number
    HAVING COUNT(*) > 1
)
UPDATE secrets s
SET detected_by = m.tools,
    updated_at  = NOW()
FROM merged_tools m
WHERE s.id = m.keep_id;

DELETE FROM secrets s
USING secrets older
WHERE s.repo_id = older.repo_id
  AND s.file_path = older.file_path
  AND s.line_number = older.line_number
  AND s.id > older.id;

ALTER TABLE secrets DROP CONSTRAINT IF EXISTS uq_secrets_fingerprint;
CREATE INDEX IF NOT EXISTS idx_secrets_fingerprint ON secrets (fingerprint);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'uq_secrets_repo_file_line'
    ) THEN
        ALTER TABLE secrets
            ADD CONSTRAINT uq_secrets_repo_file_line
            UNIQUE (repo_id, file_path, line_number);
    END IF;
END $$;

-- -------------------------------------------------------------
-- 4. secret_git_metadata  (one row per secret)
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS secret_git_metadata (
    id                 SERIAL PRIMARY KEY,
    secret_id          INTEGER NOT NULL REFERENCES secrets(id) ON DELETE CASCADE,

    commit_hash        TEXT,
    branch_name        TEXT,

    author_name        TEXT,
    author_email       TEXT,
    author_date        TIMESTAMPTZ,

    committer_name     TEXT,
    committer_email    TEXT,
    committer_date     TIMESTAMPTZ,

    attribution_error  TEXT,

    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_secret_git_metadata_secret_id UNIQUE (secret_id),
    CONSTRAINT chk_attribution_result CHECK (
        commit_hash IS NOT NULL
        OR NULLIF(BTRIM(attribution_error), '') IS NOT NULL
    )
);

CREATE INDEX IF NOT EXISTS idx_secret_git_meta_commit_hash ON secret_git_metadata(commit_hash);
CREATE INDEX IF NOT EXISTS idx_secret_git_meta_author      ON secret_git_metadata(author_email);
CREATE INDEX IF NOT EXISTS idx_secret_git_meta_branch      ON secret_git_metadata(branch_name);

-- -------------------------------------------------------------
-- 5. secret_validations  (one row per secret)
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS secret_validations (
    id                SERIAL PRIMARY KEY,
    secret_id         INTEGER     NOT NULL REFERENCES secrets(id) ON DELETE CASCADE,

    validator_type    TEXT        NOT NULL,
    validator_model   TEXT,

    ok                BOOLEAN     NOT NULL DEFAULT TRUE,

    verdict           TEXT,
    verdict_legacy    TEXT,
    confidence        REAL,
    risk_score        SMALLINT,
    is_likely_active  TEXT,
    secret_kind       TEXT,
    reasoning         TEXT,
    evidence          TEXT[],

    validated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_secret_validations_secret_id UNIQUE (secret_id),
    CONSTRAINT chk_verdict CHECK (
        verdict IS NULL OR verdict IN (
            'VALID_CANDIDATE', 'FALSE_POSITIVE', 'LOW_CONFIDENCE'
        )
    ),
    CONSTRAINT chk_verdict_legacy CHECK (
        verdict_legacy IS NULL OR verdict_legacy IN (
            'true_positive', 'false_positive', 'HUMAN_REVIEW_REQUIRED'
        )
    ),
    CONSTRAINT chk_is_likely_active CHECK (
        is_likely_active IS NULL OR is_likely_active IN ('true', 'false', 'unknown')
    ),
    CONSTRAINT chk_risk_score CHECK (
        risk_score IS NULL OR risk_score BETWEEN 1 AND 10
    ),
    CONSTRAINT chk_confidence CHECK (
        confidence IS NULL OR confidence BETWEEN 0.0 AND 1.0
    )
);

CREATE INDEX IF NOT EXISTS idx_secret_validations_verdict ON secret_validations(verdict);
CREATE INDEX IF NOT EXISTS idx_secret_validations_active  ON secret_validations(is_likely_active);
CREATE INDEX IF NOT EXISTS idx_secret_validations_risk    ON secret_validations(risk_score);

-- -------------------------------------------------------------
-- 6. secret_alerts  (Gmail / notification log)
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS secret_alerts (
    id               SERIAL PRIMARY KEY,
    secret_id        INTEGER     NOT NULL REFERENCES secrets(id) ON DELETE CASCADE,
    sent_to          TEXT        NOT NULL,
    alert_type       TEXT        NOT NULL DEFAULT 'initial',
    delivery_status  TEXT        NOT NULL DEFAULT 'sent',
    skip_reason      TEXT,
    message_id       TEXT,
    sent_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_alert_type CHECK (
        alert_type IN ('initial', 'reminder')
    ),
    CONSTRAINT chk_delivery_status CHECK (
        delivery_status IN ('sent', 'failed', 'skipped')
    )
);

CREATE INDEX IF NOT EXISTS idx_secret_alerts_secret_id ON secret_alerts(secret_id);
CREATE INDEX IF NOT EXISTS idx_secret_alerts_sent_at   ON secret_alerts(sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_secret_alerts_secret_sent
    ON secret_alerts(secret_id, sent_at DESC)
    WHERE delivery_status = 'sent';

-- One successful initial alert per secret (reminders allowed separately)
CREATE UNIQUE INDEX IF NOT EXISTS uq_secret_alerts_initial_sent
    ON secret_alerts(secret_id)
    WHERE alert_type = 'initial' AND delivery_status = 'sent';

-- -------------------------------------------------------------
-- 7. secret_status_history  (audit trail)
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS secret_status_history (
    id            SERIAL PRIMARY KEY,
    secret_id     INTEGER     NOT NULL REFERENCES secrets(id) ON DELETE CASCADE,
    old_status    TEXT,
    new_status    TEXT        NOT NULL,
    changed_by    TEXT,
    change_reason TEXT,
    changed_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_history_new_status CHECK (
        new_status IN ('OPEN', 'IN_PROGRESS', 'RESOLVED', 'ACCEPTED_RISK')
    )
);

CREATE INDEX IF NOT EXISTS idx_secret_status_history_secret
    ON secret_status_history(secret_id, changed_at DESC);

-- -------------------------------------------------------------
-- 8. users  (SOC dashboard authentication & RBAC)
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
-- 9. finding_cache  (Tier-1 cross-scan cache for code_graph + validation)
--     Fingerprint: SHA256(repo_name | rel_path | line | rule)
--     Used by: finding_cache.py split / merge / upsert
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

CREATE INDEX IF NOT EXISTS idx_finding_cache_repo_updated
    ON finding_cache (repo_name, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_finding_cache_repo_location
    ON finding_cache (repo_name, file_path, line, rule);

COMMENT ON TABLE finding_cache IS
    'Cross-scan cache: Tier-1 fingerprint = SHA256(repo|rel_path|line|rule)';

-- -------------------------------------------------------------
-- Helpers: status change + dashboard view
-- -------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_secret_status(
    p_secret_id     INTEGER,
    p_new_status    TEXT,
    p_changed_by    TEXT DEFAULT 'system',
    p_change_reason TEXT DEFAULT NULL
)
RETURNS VOID AS $$
DECLARE
    v_old TEXT;
BEGIN
    IF p_new_status NOT IN ('OPEN', 'IN_PROGRESS', 'RESOLVED', 'ACCEPTED_RISK') THEN
        RAISE EXCEPTION 'Invalid secret_status: %', p_new_status;
    END IF;

    SELECT secret_status INTO v_old FROM secrets WHERE id = p_secret_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Secret % not found', p_secret_id;
    END IF;

    IF v_old IS NOT DISTINCT FROM p_new_status THEN
        RETURN;
    END IF;

    UPDATE secrets SET secret_status = p_new_status WHERE id = p_secret_id;

    INSERT INTO secret_status_history (
        secret_id, old_status, new_status, changed_by, change_reason
    ) VALUES (
        p_secret_id, v_old, p_new_status, p_changed_by, p_change_reason
    );
END;
$$ LANGUAGE plpgsql;

-- Active findings that still need owner notification or follow-up
-- DROP required when view columns change (CREATE OR REPLACE cannot reorder/rename).
DROP VIEW IF EXISTS v_secrets_alert_queue;
CREATE VIEW v_secrets_alert_queue AS
SELECT
    s.id              AS secret_id,
    s.fingerprint,
    s.secret_status,
    s.is_active,
    s.tool,
    s.secret_type,
    s.source_url,
    s.detected_by,
    s.file_path,
    s.line_number,
    r.name            AS repo_name,
    r.url             AS repo_url,
    g.branch_name,
    g.author_name,
    g.author_email,
    g.committer_name,
    g.committer_email,
    g.commit_hash,
    v.verdict_legacy,
    v.secret_kind,
    v.reasoning,
    v.evidence,
    COALESCE(
        NULLIF(BTRIM(g.committer_email), ''),
        NULLIF(BTRIM(g.author_email), '')
    )                 AS notify_email,
    la.last_sent_at,
    la.alert_count,
    CASE
        WHEN s.secret_status IN ('RESOLVED', 'ACCEPTED_RISK') THEN 'closed'
        WHEN NOT s.is_active THEN 'inactive'
        WHEN COALESCE(
            NULLIF(BTRIM(g.committer_email), ''),
            NULLIF(BTRIM(g.author_email), '')
        ) IS NULL THEN 'no_email'
        WHEN la.initial_sent_at IS NULL THEN 'needs_initial'
        WHEN s.secret_status = 'IN_PROGRESS'
             AND la.last_sent_at < NOW() - INTERVAL '7 days' THEN 'needs_reminder'
        ELSE 'waiting'
    END               AS alert_state
FROM secrets s
JOIN repositories r ON r.id = s.repo_id
LEFT JOIN secret_git_metadata g ON g.secret_id = s.id
LEFT JOIN secret_validations v ON v.secret_id = s.id
LEFT JOIN LATERAL (
    SELECT
        MIN(sent_at) FILTER (
            WHERE alert_type = 'initial' AND delivery_status = 'sent'
        ) AS initial_sent_at,
        MAX(sent_at) FILTER (WHERE delivery_status = 'sent') AS last_sent_at,
        COUNT(*) FILTER (WHERE delivery_status = 'sent') AS alert_count
    FROM secret_alerts a
    WHERE a.secret_id = s.id
) la ON TRUE
WHERE replace(s.file_path, E'\\', '/') !~ '(^|/)\.git(/|$)';

-- -------------------------------------------------------------
-- updated_at triggers
-- -------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at := NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_secrets_updated_at ON secrets;
CREATE TRIGGER trg_secrets_updated_at
    BEFORE UPDATE ON secrets
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_secret_git_metadata_updated_at ON secret_git_metadata;
CREATE TRIGGER trg_secret_git_metadata_updated_at
    BEFORE UPDATE ON secret_git_metadata
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_secret_validations_updated_at ON secret_validations;
CREATE TRIGGER trg_secret_validations_updated_at
    BEFORE UPDATE ON secret_validations
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_finding_cache_updated_at ON finding_cache;
CREATE TRIGGER trg_finding_cache_updated_at
    BEFORE UPDATE ON finding_cache
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

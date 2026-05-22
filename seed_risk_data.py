import sys
import os
import random
from datetime import datetime, timedelta

# Add root folder to import path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.database import get_connection

REPOS = [
    {"name": "auth-service", "url": "https://github.com/acme-corp/auth-service"},
    {"name": "billing-engine", "url": "https://github.com/acme-corp/billing-engine"},
    {"name": "customer-portal", "url": "https://github.com/acme-corp/customer-portal"},
    {"name": "analytics-pipeline", "url": "https://github.com/acme-corp/analytics-pipeline"},
    {"name": "admin-console", "url": "https://github.com/acme-corp/admin-console"},
]

# Quantities of secrets per severity for each repo
# (repo, criticals, highs, mediums, lows)
SEEDS = [
    ("auth-service", 6, 4, 8, 3),
    ("billing-engine", 4, 5, 3, 2),
    ("customer-portal", 2, 3, 5, 2),
    ("analytics-pipeline", 3, 1, 2, 2),
    ("admin-console", 1, 2, 2, 1),
]

TOOLS = ["gitleaks", "trufflehog", "custom-regex"]
SECRET_TYPES = {
    "Critical": ["AWS Access Key", "Slack Webhook", "Azure Client Secret"],
    "High": ["Stripe API Key", "Google API Key", "JWT Secret"],
    "Medium": ["Database Password", "SSH Private Key", "Auth Token"],
    "Low": ["Generic Password", "Config Password", "API Key"],
}

def seed():
    print("Connecting to database...")
    try:
        with get_connection() as conn:
            with conn.cursor() as cur:
                print("Inserting repositories and scan runs...")
                repo_ids = {}
                scan_run_ids = {}

                for r in REPOS:
                    # Safe check and insert for repository
                    cur.execute("SELECT id FROM repositories WHERE url = %s", (r["url"],))
                    row = cur.fetchone()
                    if row:
                        repo_id = row["id"]
                        # Make sure name matches
                        cur.execute("UPDATE repositories SET name = %s WHERE id = %s", (r["name"], repo_id))
                    else:
                        cur.execute(
                            "INSERT INTO repositories (name, url) VALUES (%s, %s) RETURNING id",
                            (r["name"], r["url"]),
                        )
                        repo_id = cur.fetchone()["id"]
                    repo_ids[r["name"]] = repo_id

                    # Check for scan run
                    cur.execute("SELECT id FROM scan_runs WHERE repo_id = %s LIMIT 1", (repo_id,))
                    sr_row = cur.fetchone()
                    if sr_row:
                        scan_run_id = sr_row["id"]
                    else:
                        cur.execute(
                            "INSERT INTO scan_runs (repo_id, started_at, completed_at, status, scanners_used) VALUES (%s, NOW() - INTERVAL '1 day', NOW() - INTERVAL '23 hours', 'completed', %s) RETURNING id",
                            (repo_id, ["gitleaks", "trufflehog"]),
                        )
                        scan_run_id = cur.fetchone()["id"]
                    scan_run_ids[r["name"]] = scan_run_id

                print("Inserting secrets and validations...")
                inserted_count = 0

                for repo_name, crits, highs, meds, lows in SEEDS:
                    repo_id = repo_ids[repo_name]
                    scan_run_id = scan_run_ids[repo_name]

                    severities = (
                        [("Critical", random.randint(9, 10)) for _ in range(crits)]
                        + [("High", random.randint(7, 8)) for _ in range(highs)]
                        + [("Medium", random.randint(4, 6)) for _ in range(meds)]
                        + [("Low", random.randint(1, 3)) for _ in range(lows)]
                    )

                    for idx, (sev_name, score) in enumerate(severities):
                        tool = random.choice(TOOLS)
                        secret_type = random.choice(SECRET_TYPES[sev_name])
                        file_path = f"src/modules/{repo_name.replace('-', '_')}/config_{idx}.py"
                        line_number = random.randint(10, 250)
                        secret_hash = f"hash_{repo_name}_{idx}_{random.randint(1000, 9999)}"
                        fingerprint = f"{repo_name}:{file_path}:{line_number}"
                        status = random.choice(["OPEN", "IN_PROGRESS"])
                        created_at = datetime.now() - timedelta(days=random.randint(0, 15), hours=random.randint(0, 23))

                        # Safe check if secret exists at repo + path + line
                        cur.execute(
                            "SELECT id FROM secrets WHERE repo_id = %s AND file_path = %s AND line_number = %s",
                            (repo_id, file_path, line_number),
                        )
                        sec_row = cur.fetchone()
                        if sec_row:
                            secret_id = sec_row["id"]
                        else:
                            cur.execute(
                                """
                                INSERT INTO secrets (
                                    repo_id, scan_run_id, tool, secret_type, file_path, line_number,
                                    secret_hash, source_url, detected_by, fingerprint, is_active, secret_status, created_at
                                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, TRUE, %s, %s)
                                RETURNING id
                                """,
                                (
                                    repo_id,
                                    scan_run_id,
                                    tool,
                                    secret_type,
                                    file_path,
                                    line_number,
                                    secret_hash,
                                    f"https://github.com/acme-corp/{repo_name}/blob/main/{file_path}#L{line_number}",
                                    [tool],
                                    fingerprint,
                                    status,
                                    created_at,
                                ),
                            )
                            secret_id = cur.fetchone()["id"]

                        # Check if validation exists
                        cur.execute("SELECT id FROM secret_validations WHERE secret_id = %s", (secret_id,))
                        val_row = cur.fetchone()
                        if not val_row:
                            cur.execute(
                                """
                                INSERT INTO secret_validations (
                                    secret_id, validator_type, validator_model, ok, verdict, confidence, risk_score, is_likely_active, secret_kind, reasoning
                                ) VALUES (%s, 'ai', 'gpt-4o-mini', TRUE, 'VALID_CANDIDATE', 0.90, %s, 'true', 'api_key', %s)
                                """,
                                (
                                    secret_id,
                                    score,
                                    f"Mock {sev_name} secret automatically validated via pipeline.",
                                ),
                            )
                            inserted_count += 1

                conn.commit()
                print(f"Successfully seeded {inserted_count} dummy findings for Riskiest Repositories chart!")
    except Exception as e:
        print(f"Error seeding data: {e}")

if __name__ == "__main__":
    seed()

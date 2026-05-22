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
                print("Clearing all data with RESTART IDENTITY CASCADE...")
                cur.execute("TRUNCATE TABLE repositories RESTART IDENTITY CASCADE")

                print("Inserting repositories and scan runs...")
                repo_ids = {}
                scan_run_ids = {}

                for r in REPOS:
                    # Insert repository
                    cur.execute(
                        "INSERT INTO repositories (name, url) VALUES (%s, %s) RETURNING id",
                        (r["name"], r["url"]),
                    )
                    repo_id = cur.fetchone()["id"]
                    repo_ids[r["name"]] = repo_id

                    # Seed the primary completed scan run (so secrets can link to it)
                    cur.execute(
                        """
                        INSERT INTO scan_runs (repo_id, started_at, completed_at, status, scanners_used)
                        VALUES (%s, NOW() - INTERVAL '1 day', NOW() - INTERVAL '23 hours', 'completed', %s)
                        RETURNING id
                        """,
                        (repo_id, ["gitleaks", "trufflehog"]),
                    )
                    primary_scan_run_id = cur.fetchone()["id"]
                    scan_run_ids[r["name"]] = primary_scan_run_id

                    # Seed 5 to 12 additional random scan runs for this repo
                    num_extra_scans = random.randint(5, 12)
                    for i in range(num_extra_scans):
                        days_ago = random.randint(1, 15)
                        hours_ago = random.randint(0, 23)
                        started = datetime.now() - timedelta(days=days_ago, hours=hours_ago)
                        
                        # Mostly completed, some failed, occasionally running
                        rand_val = random.random()
                        if rand_val < 0.75:
                            status = "completed"
                            duration = random.randint(10, 180) # seconds
                            completed = started + timedelta(seconds=duration)
                        elif rand_val < 0.95:
                            status = "failed"
                            duration = random.randint(5, 60)
                            completed = started + timedelta(seconds=duration)
                        else:
                            status = "running"
                            completed = None

                        cur.execute(
                            """
                            INSERT INTO scan_runs (repo_id, started_at, completed_at, status, scanners_used)
                            VALUES (%s, %s, %s, %s, %s)
                            """,
                            (repo_id, started, completed, status, random.choice([["gitleaks"], ["trufflehog"], ["gitleaks", "trufflehog"]])),
                        )

                print("Inserting secrets, validations, git metadata, and alert queue state...")
                inserted_count = 0

                # Pre-calculate exact distribution ratios
                total_secrets = sum(crits + highs + meds + lows for _, crits, highs, meds, lows in SEEDS)
                num_initial = int(total_secrets * 0.4)
                num_reminder = int(total_secrets * 0.3)
                num_waiting = total_secrets - num_initial - num_reminder

                alert_states = (
                    ["needs_initial"] * num_initial
                    + ["needs_reminder"] * num_reminder
                    + ["waiting"] * num_waiting
                )
                random.shuffle(alert_states)
                state_idx = 0

                developers = [
                    ("Alice Smith", "alice.smith@acme-corp.com"),
                    ("Bob Jones", "bob.jones@acme-corp.com"),
                    ("Charlie Brown", "charlie.brown@acme-corp.com"),
                    ("Diana Prince", "diana.prince@acme-corp.com"),
                    ("Evan Wright", "evan.wright@acme-corp.com"),
                ]

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
                        
                        target_state = alert_states[state_idx]
                        state_idx += 1

                        # Based on target_state:
                        # needs_reminder -> secret_status is 'IN_PROGRESS'
                        # needs_initial -> secret_status is 'OPEN'
                        # waiting -> secret_status is 'OPEN'
                        if target_state == "needs_reminder":
                            status = "IN_PROGRESS"
                        else:
                            status = "OPEN"

                        created_at = datetime.now() - timedelta(days=random.randint(0, 15), hours=random.randint(0, 23))

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

                        # Insert into secret_validations
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

                        # Insert into secret_git_metadata
                        commit_hash = "".join(random.choices("0123456789abcdef", k=40))
                        dev_name, dev_email = random.choice(developers)

                        cur.execute(
                            """
                            INSERT INTO secret_git_metadata (
                                secret_id, commit_hash, branch_name,
                                author_name, author_email, author_date,
                                committer_name, committer_email, committer_date
                            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                            """,
                            (
                                secret_id,
                                commit_hash,
                                "main",
                                dev_name,
                                dev_email,
                                created_at - timedelta(minutes=5),
                                dev_name,
                                dev_email,
                                created_at - timedelta(minutes=5),
                            ),
                        )

                        # Seed secret_alerts historical logs to achieve targeted alert state
                        if target_state == "needs_reminder":
                            # Needs an initial alert sent more than 7 days ago
                            sent_at = datetime.now() - timedelta(days=random.randint(8, 15))
                            cur.execute(
                                """
                                INSERT INTO secret_alerts (
                                    secret_id, sent_to, alert_type, delivery_status, sent_at
                                ) VALUES (%s, %s, 'initial', 'sent', %s)
                                """,
                                (secret_id, dev_email, sent_at),
                            )
                        elif target_state == "waiting":
                            # Needs an alert sent recently (within 7 days)
                            sent_at = datetime.now() - timedelta(days=random.randint(0, 6))
                            cur.execute(
                                """
                                INSERT INTO secret_alerts (
                                    secret_id, sent_to, alert_type, delivery_status, sent_at
                                ) VALUES (%s, %s, 'initial', 'sent', %s)
                                """,
                                (secret_id, dev_email, sent_at),
                            )
                        # "needs_initial" target_state does not create any secret_alerts row

                        inserted_count += 1

                conn.commit()
                print(f"Successfully seeded {inserted_count} dummy findings for Riskiest Repositories and Alert Status charts!")
    except Exception as e:
        print(f"Error seeding data: {e}")

if __name__ == "__main__":
    seed()

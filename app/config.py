import os
from functools import lru_cache

from dotenv import load_dotenv

load_dotenv()


@lru_cache
def get_settings():
    return Settings()


class Settings:
    port: int = int(os.getenv("PORT", "5002"))
    jwt_secret: str = os.getenv("JWT_SECRET", "your-secret-key-change-in-production")
    pg_user: str = os.getenv("PG_USER", "socadmin")
    pg_password: str = os.getenv("PG_PASSWORD", "socpassword")
    pg_host: str = os.getenv("PG_HOST", "localhost")
    pg_port: int = int(os.getenv("PG_PORT", "5432"))
    pg_database: str = os.getenv("PG_DATABASE", "secrets_db")
    jenkins_url: str | None = os.getenv("JENKINS_URL")
    jenkins_job_name: str | None = os.getenv("JENKINS_JOB_NAME")
    jenkins_user: str | None = os.getenv("JENKINS_USER")
    jenkins_api_token: str | None = os.getenv("JENKINS_API_TOKEN")
    jenkins_param_repo: str = os.getenv("JENKINS_PARAM_REPO", "REPO_URL")
    jenkins_param_branch: str = os.getenv("JENKINS_PARAM_BRANCH", "BRANCHES")

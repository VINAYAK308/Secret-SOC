import psycopg
from psycopg.rows import dict_row

from app.config import get_settings


def get_connection():
    settings = get_settings()
    return psycopg.connect(
        user=settings.pg_user,
        password=settings.pg_password,
        host=settings.pg_host,
        port=settings.pg_port,
        dbname=settings.pg_database,
        row_factory=dict_row,
    )

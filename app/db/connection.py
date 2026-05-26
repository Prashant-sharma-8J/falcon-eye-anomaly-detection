import mysql.connector

from app.core.config import settings


def validate_database_settings() -> None:
    missing = [
        name
        for name, value in {
            "DB_HOST": settings.db_host,
            "DB_USER": settings.db_user,
            "DB_PASSWORD": settings.db_password,
            "DB_NAME": settings.db_name,
        }.items()
        if not value
    ]
    if missing:
        raise ValueError(f"Missing database environment variables: {', '.join(missing)}")


def get_connection(autocommit: bool = False):
    validate_database_settings()
    config = settings.db_config | {"autocommit": autocommit}
    return mysql.connector.connect(**config)

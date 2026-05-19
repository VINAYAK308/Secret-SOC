-- Dashboard demo users (run after Database/schema.sql)
-- users table is defined in schema.sql

INSERT INTO users (username, password, role)
VALUES
    ('admin', 'admin123', 'admin'),
    ('reviewer', 'reviewer123', 'reviewer')
ON CONFLICT (username) DO NOTHING;

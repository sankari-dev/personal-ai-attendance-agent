\set ON_ERROR_STOP on

BEGIN;

CREATE TABLE IF NOT EXISTS schema_migrations (
    version TEXT PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

SELECT EXISTS (
    SELECT 1
    FROM schema_migrations
    WHERE version = '001_attendance_settings'
) AS already_applied
\gset

\if :already_applied
    \echo 'Migration 001 already applied; skipping.'
\else

CREATE TABLE user_settings (
    id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    time_zone TEXT NOT NULL DEFAULT 'Asia/Kolkata'
        CHECK (time_zone = 'Asia/Kolkata'),
    work_start TIME NOT NULL DEFAULT '09:30',
    work_end TIME NOT NULL DEFAULT '18:30',
    working_days SMALLINT[] NOT NULL
        DEFAULT ARRAY[1, 2, 3, 4, 5, 6]::SMALLINT[],
    permission_block_minutes SMALLINT NOT NULL DEFAULT 60
        CHECK (permission_block_minutes > 0),
    daily_permission_blocks SMALLINT NOT NULL DEFAULT 1
        CHECK (daily_permission_blocks = 1),
    monthly_permission_blocks SMALLINT NOT NULL DEFAULT 5
        CHECK (monthly_permission_blocks >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    CHECK (work_end > work_start),
    CHECK (
        cardinality(working_days) BETWEEN 1 AND 7
        AND working_days <@ ARRAY[1, 2, 3, 4, 5, 6, 7]::SMALLINT[]
        AND array_position(working_days, NULL) IS NULL
    )
);

COMMENT ON COLUMN user_settings.working_days
    IS 'ISO weekdays: Monday=1 through Sunday=7.';

CREATE TABLE reminder_settings (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_settings_id SMALLINT NOT NULL DEFAULT 1
        REFERENCES user_settings(id),
    reminder_type TEXT NOT NULL
        CHECK (reminder_type = 'missing_punch_in'),
    reminder_time TIME NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_settings_id, reminder_type, reminder_time)
);

CREATE FUNCTION set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

CREATE TRIGGER user_settings_updated_at
BEFORE UPDATE ON user_settings
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER reminder_settings_updated_at
BEFORE UPDATE ON reminder_settings
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

INSERT INTO user_settings (id) VALUES (1);

INSERT INTO reminder_settings (reminder_type, reminder_time)
VALUES
    ('missing_punch_in', '10:00'),
    ('missing_punch_in', '10:30'),
    ('missing_punch_in', '11:00');

INSERT INTO schema_migrations (version)
VALUES ('001_attendance_settings');

\endif

COMMIT;
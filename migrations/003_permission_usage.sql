\set ON_ERROR_STOP on

BEGIN;

SELECT EXISTS (
    SELECT 1 FROM schema_migrations
    WHERE version = '002_attendance_records'
) AS prerequisite_exists
\gset

\if :prerequisite_exists
\else
    \echo 'Apply migration 002 first.'
    ROLLBACK;
    \quit 1
\endif

SELECT EXISTS (
    SELECT 1 FROM schema_migrations
    WHERE version = '003_permission_usage'
) AS already_applied
\gset

\if :already_applied
    \echo 'Migration 003 already applied; skipping.'
\else

CREATE TABLE permission_usage (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_settings_id SMALLINT NOT NULL DEFAULT 1,
    working_date DATE NOT NULL,
    minutes SMALLINT NOT NULL DEFAULT 60 CHECK (minutes = 60),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    UNIQUE (user_settings_id, working_date),

    FOREIGN KEY (user_settings_id, working_date)
        REFERENCES attendance_records (
            user_settings_id, working_date
        )
        ON DELETE RESTRICT
);

CREATE FUNCTION enforce_permission_limits()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    monthly_limit INTEGER;
    allowed_days SMALLINT[];
    month_start DATE;
    next_month_start DATE;
    used_blocks INTEGER;
BEGIN
    -- Serialise permission changes for this user.
    SELECT monthly_permission_blocks, working_days
    INTO monthly_limit, allowed_days
    FROM user_settings
    WHERE id = NEW.user_settings_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Attendance settings were not found.';
    END IF;

    IF TG_OP = 'UPDATE' THEN
        IF NEW.user_settings_id <> OLD.user_settings_id THEN
            RAISE EXCEPTION 'Permission ownership cannot be changed.';
        END IF;
    END IF;

    IF NOT (
        EXTRACT(ISODOW FROM NEW.working_date)::SMALLINT
        = ANY (allowed_days)
    ) THEN
        RAISE EXCEPTION 'Permission requires a working day.';
    END IF;

    month_start :=
        date_trunc('month', NEW.working_date::timestamp)::date;

    next_month_start :=
        (month_start + INTERVAL '1 month')::date;

    SELECT count(*)
    INTO used_blocks
    FROM permission_usage
    WHERE user_settings_id = NEW.user_settings_id
      AND working_date >= month_start
      AND working_date < next_month_start
      AND id <> NEW.id;

    IF used_blocks >= monthly_limit THEN
        RAISE EXCEPTION 'Monthly permission allowance exhausted.';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER permission_usage_limits
BEFORE INSERT OR UPDATE ON permission_usage
FOR EACH ROW EXECUTE FUNCTION enforce_permission_limits();

CREATE TRIGGER permission_usage_updated_at
BEFORE UPDATE ON permission_usage
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMENT ON TABLE permission_usage
    IS 'Personal permission tracking; not employer approval.';

INSERT INTO schema_migrations (version)
VALUES ('003_permission_usage');

\endif

COMMIT;
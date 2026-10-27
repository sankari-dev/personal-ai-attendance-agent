\set ON_ERROR_STOP on

BEGIN;

SELECT EXISTS (
    SELECT 1 FROM schema_migrations
    WHERE version = '001_attendance_settings'
) AS prerequisite_exists
\gset

\if :prerequisite_exists
\else
    \echo 'Apply migration 001 first.'
    ROLLBACK;
    \quit 1
\endif

SELECT EXISTS (
    SELECT 1 FROM schema_migrations
    WHERE version = '002_attendance_records'
) AS already_applied
\gset

\if :already_applied
    \echo 'Migration 002 already applied; skipping.'
\else

CREATE TABLE attendance_records (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_settings_id SMALLINT NOT NULL DEFAULT 1
        REFERENCES user_settings(id),
    working_date DATE NOT NULL,

    expected_start_at TIMESTAMPTZ NOT NULL,
    expected_end_at TIMESTAMPTZ NOT NULL,

    actual_punch_in_at TIMESTAMPTZ,
    actual_punch_out_at TIMESTAMPTZ,

    record_source TEXT NOT NULL DEFAULT 'manual'
        CHECK (record_source = 'manual'),

    notes TEXT NOT NULL DEFAULT ''
        CHECK (char_length(notes) <= 2000),

    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    UNIQUE (user_settings_id, working_date),

    CHECK (expected_end_at > expected_start_at),

    CHECK (
        (expected_start_at AT TIME ZONE 'Asia/Kolkata')::date
        = working_date
    ),

    CHECK (
        (expected_end_at AT TIME ZONE 'Asia/Kolkata')::date
        = working_date
    ),

    CHECK (
        actual_punch_in_at IS NULL
        OR (actual_punch_in_at AT TIME ZONE 'Asia/Kolkata')::date
            = working_date
    ),

    CHECK (
        actual_punch_out_at IS NULL
        OR (
            actual_punch_in_at IS NOT NULL
            AND actual_punch_out_at > actual_punch_in_at
            AND
            (actual_punch_out_at AT TIME ZONE 'Asia/Kolkata')::date
                = working_date
        )
    )
);

COMMENT ON COLUMN attendance_records.record_source
    IS 'Manual entries are user-reported, not employer-verified.';

COMMENT ON COLUMN attendance_records.expected_end_at
    IS 'Expected time only; never proof of actual punch-out.';

CREATE TRIGGER attendance_records_updated_at
BEFORE UPDATE ON attendance_records
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

INSERT INTO schema_migrations (version)
VALUES ('002_attendance_records');

\endif

COMMIT;
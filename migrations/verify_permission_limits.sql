\set ON_ERROR_STOP on

BEGIN;

-- Temporary attendance records for six working days.
INSERT INTO attendance_records (
    working_date,
    expected_start_at,
    expected_end_at,
    actual_punch_in_at
)
SELECT
    d,
    (d + TIME '09:30') AT TIME ZONE 'Asia/Kolkata',
    (d + TIME '18:30') AT TIME ZONE 'Asia/Kolkata',
    (d + TIME '10:00') AT TIME ZONE 'Asia/Kolkata'
FROM (
    VALUES
        (DATE '2026-10-01'),
        (DATE '2026-10-02'),
        (DATE '2026-10-03'),
        (DATE '2026-10-05'),
        (DATE '2026-10-06'),
        (DATE '2026-10-07')
) AS dates(d);

INSERT INTO permission_usage (working_date)
VALUES ('2026-10-01');

-- A second block on the same day must fail.
DO $$
BEGIN
    BEGIN
        INSERT INTO permission_usage (working_date)
        VALUES ('2026-10-01');

        RAISE EXCEPTION 'TEST FAILED: duplicate permission accepted.';
    EXCEPTION
        WHEN unique_violation THEN
            RAISE NOTICE 'PASS: second daily block rejected.';
    END;
END;
$$;

-- Partial-hour permission must fail.
DO $$
BEGIN
    BEGIN
        INSERT INTO permission_usage (working_date, minutes)
        VALUES ('2026-10-02', 30);

        RAISE EXCEPTION 'TEST FAILED: partial hour accepted.';
    EXCEPTION
        WHEN check_violation THEN
            RAISE NOTICE 'PASS: partial-hour permission rejected.';
    END;
END;
$$;

INSERT INTO permission_usage (working_date)
VALUES
    ('2026-10-02'),
    ('2026-10-03'),
    ('2026-10-05'),
    ('2026-10-06');

-- A sixth block in the same month must fail.
DO $$
BEGIN
    BEGIN
        INSERT INTO permission_usage (working_date)
        VALUES ('2026-10-07');

        RAISE EXCEPTION 'TEST FAILED: sixth monthly block accepted.';
    EXCEPTION
        WHEN raise_exception THEN
            IF SQLERRM = 'Monthly permission allowance exhausted.' THEN
                RAISE NOTICE 'PASS: sixth monthly block rejected.';
            ELSE
                RAISE;
            END IF;
    END;
END;
$$;

ROLLBACK;

SELECT count(*) AS attendance_count FROM attendance_records;
SELECT count(*) AS permission_count FROM permission_usage;
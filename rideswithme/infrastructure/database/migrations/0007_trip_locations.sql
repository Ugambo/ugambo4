-- Phase 4: trip location history, partitioned by day (UTC).
--
-- Only positions recorded while a driver has a ride assigned are stored (data
-- minimisation); live positions otherwise exist only in Redis. Daily partitions
-- make retention cheap: dropping a day is dropping a table.

ALTER TABLE rides ADD COLUMN actual_distance_meters integer CHECK (actual_distance_meters >= 0);

CREATE TABLE trip_locations (
  id              bigint GENERATED ALWAYS AS IDENTITY,
  ride_id         uuid NOT NULL REFERENCES rides (id),
  driver_id       uuid NOT NULL REFERENCES driver_profiles (user_id),
  location        geography(Point, 4326) NOT NULL,
  accuracy_meters real CHECK (accuracy_meters >= 0),
  heading         real CHECK (heading >= 0 AND heading <= 360),
  speed_mps       real CHECK (speed_mps >= 0),
  -- Phone's clock (when the reading was taken) and server's clock (when it arrived).
  recorded_at     timestamptz NOT NULL,
  received_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (recorded_at, id)
) PARTITION BY RANGE (recorded_at);

CREATE INDEX trip_locations_ride_idx ON trip_locations (ride_id, recorded_at);

-- Creates any missing daily partitions between two dates (inclusive). Idempotent.
CREATE OR REPLACE FUNCTION ensure_trip_location_partitions(from_day date, to_day date) RETURNS integer
LANGUAGE plpgsql AS $$
DECLARE
  d date := from_day;
  part text;
  created integer := 0;
BEGIN
  WHILE d <= to_day LOOP
    part := 'trip_locations_p' || to_char(d, 'YYYYMMDD');
    IF to_regclass(part) IS NULL THEN
      EXECUTE format(
        'CREATE TABLE %I PARTITION OF trip_locations FOR VALUES FROM (%L) TO (%L)',
        part, (d::timestamp AT TIME ZONE 'UTC'), ((d + 1)::timestamp AT TIME ZONE 'UTC'));
      created := created + 1;
    END IF;
    d := d + 1;
  END LOOP;
  RETURN created;
END;
$$;

-- Drops daily partitions for days before the given date (retention). Returns how many.
CREATE OR REPLACE FUNCTION drop_trip_location_partitions(before_day date) RETURNS integer
LANGUAGE plpgsql AS $$
DECLARE
  r record;
  dropped integer := 0;
BEGIN
  FOR r IN
    SELECT c.relname
    FROM pg_inherits i
    JOIN pg_class c ON c.oid = i.inhrelid
    JOIN pg_class p ON p.oid = i.inhparent
    WHERE p.relname = 'trip_locations' AND c.relname ~ '^trip_locations_p\d{8}$'
  LOOP
    IF to_date(substring(r.relname from 17), 'YYYYMMDD') < before_day THEN
      EXECUTE format('DROP TABLE %I', r.relname);
      dropped := dropped + 1;
    END IF;
  END LOOP;
  RETURN dropped;
END;
$$;

SELECT ensure_trip_location_partitions((now() AT TIME ZONE 'UTC')::date - 2, (now() AT TIME ZONE 'UTC')::date + 7);

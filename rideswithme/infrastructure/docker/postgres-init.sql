-- Runs once when the Postgres volume is first created: a separate database for
-- integration tests, which the test run wipes and rebuilds from migrations.
CREATE DATABASE rideswithme_test OWNER rideswithme;

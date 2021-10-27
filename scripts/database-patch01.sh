#!/bin/sh

while getopts ":u:p:d:P" opt; do
  case $opt in
	u)
		USER_NAME=${OPTARG}
		;;
	p)
		PASSWORD=${OPTARG}
		;;
	P)
		PORT=${OPTARG}
		;;
	d)
		DB_NAME=${OPTARG}
		;;
    h | \?)
		echo "$0 -u {USER NAME} -p {PASSWORD} -d {DATABASE NAME} [-P {PORT}]"
		exit 0
      	;;
  esac
done

shift $((OPTIND-1))

if [ -z "$USER_NAME" ] || [ -z "$PASSWORD" ] || [ -z "$DB_NAME" ]; then
	echo $USER_NAME $PASSWORD $DB_NAME
    echo "$0 -u {USER NAME} -p PASSWORD} -d {DATABASE NAME} [-P {PORT}]"
	exit 1
fi

if [ -z $PORT ]; then
	PORT="5432"
fi


psql -U $USER_NAME -p $PORT -q -v "ON_ERROR_STOP=1" $DB_NAME << EOF

ALTER TABLE service_pricing ALTER COLUMN price TYPE DECIMAL(24,4);

ALTER TABLE service_pricing ADD CONSTRAINT positive_unit CHECK (unit > 0);

DO
\$\$
BEGIN
  CREATE TYPE period_levels AS ENUM ('year', 'month', 'day', 'hour');
  EXCEPTION
    WHEN duplicate_object THEN null;
END
\$\$;

CREATE TABLE log_aggr
(
 log_aggr_id       SERIAL PRIMARY KEY,
 period_start_date TIMESTAMP NOT NULL,
 period_end_date   TIMESTAMP NOT NULL,
 period_level      period_levels NOT NULL,
 endpoint_id       INTEGER NULL REFERENCES user_endpoints( endpoint_id ),
 service_id        INTEGER NULL REFERENCES services( service_id ),
 cnt_requests      BIGINT NOT NULL,
 cnt_units         BIGINT NOT NULL
);

CREATE INDEX ON log_aggr(endpoint_id);
CREATE INDEX ON log_aggr(service_id);
CREATE INDEX ON log_aggr(period_level);
CREATE INDEX ON log_aggr(period_start_date);

CREATE TABLE log_ip_aggr
(
 log_ip_aggr_id       SERIAL PRIMARY KEY,
 period_start_date TIMESTAMP NOT NULL,
 period_end_date   TIMESTAMP NOT NULL,
 period_level      period_levels NOT NULL,
 ip                INET,
 service_id        INTEGER NULL REFERENCES services( service_id ),
 cnt_requests      BIGINT NOT NULL,
 cnt_units         BIGINT NOT NULL
);

CREATE INDEX ON log_ip_aggr(ip);
CREATE INDEX ON log_ip_aggr(service_id);
CREATE INDEX ON log_ip_aggr(period_level);
CREATE INDEX ON log_ip_aggr(period_start_date);

COMMENT ON COLUMN log_ip_aggr.ip IS 'NULL for aggregation over all ips';


-- select log_aggr_period(now()::timestamp,'hour'::period_levels);
--                log_aggr_period
-- -----------------------------------------------
--  ("2020-11-10 17:00:00","2020-11-10 18:00:00")

CREATE OR REPLACE FUNCTION log_aggr_period(
    entry_date TIMESTAMP,
    period_level period_levels
  ) RETURNS TABLE (
    period_start TIMESTAMP,
    period_end TIMESTAMP
  )
AS
\$\$
BEGIN
  RETURN QUERY
    SELECT date_trunc(period_level::text, entry_date), date_trunc(period_level::text, entry_date) + ('1 ' || period_level::text)::interval;
END;
\$\$
LANGUAGE plpgsql;




CREATE OR REPLACE FUNCTION log_aggr_new_entry(
  level period_levels,
  period_start TIMESTAMP,
  period_end TIMESTAMP,
  units INTEGER,
  endpoint INTEGER,
  service INTEGER,
  requests INTEGER
  ) RETURNS BOOLEAN
AS
\$\$
DECLARE
  row_exists BOOLEAN := false;
BEGIN
  -- add to correct record or create new one
  SELECT INTO units coalesce(max(units),0); -- set 0 if NULL
  RAISE NOTICE 'ENDPOINT ID = %      period_start = %', endpoint, period_start;
  UPDATE log_aggr
  SET
    cnt_requests = log_aggr.cnt_requests + requests,
    cnt_units = log_aggr.cnt_units + units
  WHERE
    period_level = level
    AND period_start_date = period_start
    AND (( (endpoint_id IS NULL) AND (endpoint IS NULL) ) OR endpoint_id = endpoint )
    AND (( (service_id IS NULL) AND (service IS NULL) ) OR service_id = service )
  RETURNING TRUE INTO row_exists;
  IF row_exists IS NOT true THEN
    INSERT INTO log_aggr
      (
        period_start_date,
        period_end_date,
        period_level,
        endpoint_id,
        service_id,
        cnt_requests,
        cnt_units
      )
    VALUES
      (
        period_start,
        period_end,
        level,
        endpoint,
        service,
        requests,
        units
      );
  END IF;
  RETURN TRUE;
END;
\$\$
LANGUAGE plpgsql;


CREATE OR REPLACE FUNCTION log_ip_aggr_new_entry(
  level period_levels,
  period_start TIMESTAMP,
  period_end TIMESTAMP,
  units INTEGER,
  in_ip INET,
  service INTEGER
  ) RETURNS BOOLEAN
AS
\$\$
DECLARE
  row_exists BOOLEAN := false;
BEGIN
  -- add to correct record or create new one
  RAISE NOTICE '(IP , SERVICE,  units) = (%, %, %)', in_ip, service, units;
  UPDATE log_ip_aggr
  SET
    cnt_requests = log_ip_aggr.cnt_requests + 1,
    cnt_units = log_ip_aggr.cnt_units + units
  WHERE
    period_level = level
    AND period_start_date = period_start
    AND ip = in_ip
    AND (( (service_id IS NULL) AND (service IS NULL) ) OR service_id = service )
  RETURNING TRUE INTO row_exists;
  IF row_exists IS NOT true THEN
    INSERT INTO log_ip_aggr
      (
        period_start_date,
        period_end_date,
        period_level,
        ip,
        service_id,
        cnt_requests,
        cnt_units
      )
    VALUES
      (
        period_start,
        period_end,
        level,
        in_ip,
        service,
        1,
        units
      );
  END IF;
  RETURN TRUE;
END;
\$\$
LANGUAGE plpgsql;


CREATE OR REPLACE FUNCTION trigger_log_entries_aggr()
RETURNS TRIGGER AS
\$\$
declare
  period RECORD;
  period_start TIMESTAMP;
  period_end TIMESTAMP;
  endpoint INTEGER;
begin
  IF tg_op='INSERT' THEN
    -- loop period levels
    FOR period IN
      SELECT unnest(enum_range(null::period_levels)) as period
    LOOP
      SELECT INTO period_start,period_end p.period_start, p.period_end
        FROM log_aggr_period(new.time_local, period.period::period_levels) p;
      FOR endpoint IN
        SELECT endpoint_id FROM user_endpoints WHERE ip = new.remote_addr AND is_active IS TRUE -- TODO test start_date
      LOOP
        PERFORM log_aggr_new_entry(period.period::period_levels, period_start, period_end, new.unit, endpoint, new.service_id, 1);
        PERFORM log_aggr_new_entry(period.period::period_levels, period_start, period_end, new.unit, endpoint, NULL, 1);
      END LOOP;
      PERFORM log_ip_aggr_new_entry(period.period::period_levels, period_start, period_end, new.unit, new.remote_addr, new.service_id);
      PERFORM log_ip_aggr_new_entry(period.period::period_levels, period_start, period_end, new.unit, new.remote_addr, NULL);
      PERFORM log_ip_aggr_new_entry(period.period::period_levels, period_start, period_end, new.unit, NULL, new.service_id);
      PERFORM log_ip_aggr_new_entry(period.period::period_levels, period_start, period_end, new.unit, NULL, NULL);
    END LOOP;

    RETURN new;
  ELSE
    RETURN null;
  END IF;
END;
\$\$
LANGUAGE plpgsql;


CREATE TRIGGER log_files_lines_read_aggr AFTER INSERT ON log_file_entries FOR ROW EXECUTE PROCEDURE trigger_log_entries_aggr();

CREATE TABLE db_schema_version
(
  db_version_id     SERIAL PRIMARY KEY,
  version           INTEGER NOT NULL,
  create_time       TIMESTAMP DEFAULT NOW(),
  script_path       TEXT NOT NULL
);

INSERT INTO db_schema_version(version, script_path)
     VALUES(1, 'scripts/database-patch01.sh') ON CONFLICT DO NOTHING;


\q
EOF



echo 'DATABASE SUCCESSFULLY PATCHED (01)';

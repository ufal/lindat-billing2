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

INSERT INTO services(name, prefix, description) VALUES('translator', '^\/services\/translation\/api', 'A neural networks based translation service provides a simple UI and API that lets you use Transformer models trained by our experts.') ON CONFLICT DO NOTHING;

ALTER TABLE service_pricing ALTER COLUMN price TYPE DECIMAL(24,4);

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
 cnt_units         BIGINT NOT NULL,
 price             DECIMAL(24,4) NULL
);

CREATE INDEX ON log_aggr(endpoint_id);
CREATE INDEX ON log_aggr(service_id);
CREATE INDEX ON log_aggr(period_level);
CREATE INDEX ON log_aggr(period_start_date);

COMMENT ON COLUMN log_aggr.endpoint_id IS 'NULL for aggregation over all ips';


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
  unit_price DECIMAL
  ) RETURNS BOOLEAN
AS
\$\$
DECLARE
  row_exists BOOLEAN := false;
BEGIN
  -- RAISE NOTICE '(ENDPOINT , SERVICE, price , units) = (%, %, %, %)', endpoint, service, unit_price, units;
  -- count price for service if deffined
  -- add to correct record or create new one
  SELECT INTO units coalesce(max(units),0); -- set 0 if NULL
  SELECT INTO unit_price coalesce(max(unit_price),0); -- set 0 if NULL
  UPDATE log_aggr
  SET
    cnt_requests = log_aggr.cnt_requests + 1,
    cnt_units = log_aggr.cnt_units + units,
    price = log_aggr.price + units * unit_price
  WHERE
    period_level = level
    AND period_start_date = period_start
    AND (( (endpoint_id IS NULL) AND (endpoint IS NULL) ) OR endpoint_id = endpoint )
    AND service_id = service
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
        cnt_units,
        price
      )
    VALUES
      (
        period_start,
        period_end,
        level,
        endpoint,
        service,
        1,
        units,
        units * unit_price
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
  unit_price DECIMAL(24,4);
begin
  IF tg_op='INSERT' THEN
    -- unit_price = service_pricing.price / service_pricing.unit, POZOR NA PŘESNOST VÝPOČTU !!!
    -- loop {endpoint, null}
    FOR endpoint, unit_price IN
        SELECT
          endpoint_price.ep AS endpoint,
          endpoint_price.up AS unit_price
        FROM
          (
          SELECT
            ue.endpoint_id as ep,
            sp.price / sp.unit as up
          FROM
            (SELECT endpoint_id, user_id FROM user_endpoints WHERE ip = new.remote_addr
             UNION ALL SELECT NULL AS endpoint_id, NULL AS user_id) ue
             JOIN
            ( SELECT user_id, unit, price
              FROM service_pricing
              WHERE
                service_id = new.service_id
                AND valid_from <= new.time_local
                AND (valid_till IS NULL OR valid_till > new.time_local)
            ) sp
             ON
               ue.user_id = sp.user_id
               OR sp.user_id IS NULL
          UNION ALL SELECT NULL as ep, NULL as up
          ) endpoint_price
        ORDER BY
          endpoint_price.ep DESC NULLS LAST, -- defined endpoint firstly
          endpoint_price.up DESC NULLS LAST -- defined price per unit firstly
        LIMIT 1
    LOOP
      -- loop period levels
      FOR period IN
        SELECT unnest(enum_range(null::period_levels)) as period
      LOOP
        SELECT INTO period_start,period_end p.period_start, p.period_end
          FROM log_aggr_period(new.time_local, period.period::period_levels) p;
        -- RAISE NOTICE 'ENDPOINT ID = %', endpoint;
        PERFORM log_aggr_new_entry(period.period::period_levels, period_start, period_end, new.unit, endpoint, new.service_id, unit_price);
      END LOOP;
    END LOOP;
    RETURN new;
  ELSE
    RETURN null;
  END IF;
END;
\$\$
LANGUAGE plpgsql;


CREATE TRIGGER log_files_lines_read_aggr AFTER INSERT ON log_file_entries FOR ROW EXECUTE PROCEDURE trigger_log_entries_aggr();



\q
EOF



echo 'DATABASE SUCCESSFULLY PATCHED (01)';

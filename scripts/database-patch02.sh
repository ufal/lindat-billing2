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

CREATE OR REPLACE FUNCTION trigger_add_endpoint_copy_ip_aggr()
RETURNS TRIGGER AS
\$\$
declare
  start TIMESTAMP;
  service INTEGER;
  requests BIGINT;
  units BIGINT;
  body_bytes_sent BIGINT;
  period RECORD;
  period_start TIMESTAMP;
  period_end TIMESTAMP;
begin
  IF tg_op='INSERT' THEN
    -- loop over all ip records for hour level, newer than endpoint.start_date
    FOR start, service, requests, units, body_bytes_sent IN
        SELECT
          ip_log.period_start_date,
          ip_log.service_id,
          ip_log.cnt_requests,
          ip_log.cnt_units,
          ip_log.cnt_body_bytes_sent
        FROM
          log_ip_aggr ip_log
        WHERE
          ip_log.ip = new.ip
          AND ip_log.period_level = 'hour'::period_levels
          AND ip_log.period_start_date >= new.start_date
    LOOP
      -- copy value of hour level
      -- TODO
      -- increase upper level counters (day, month, year)
      FOR period IN
        SELECT unnest(enum_range(null::period_levels)) as period
      LOOP
        SELECT INTO period_start,period_end p.period_start, p.period_end
          FROM log_aggr_period(start, period.period::period_levels) p;
        PERFORM log_aggr_new_entry(period.period::period_levels, period_start, period_end, units, new.endpoint_id, service, requests, body_bytes_sent);
      END LOOP;
    END LOOP;
    RETURN new;
  ELSE
    RETURN null;
  END IF;
END;
\$\$
LANGUAGE plpgsql;


CREATE TRIGGER user_endpoints_copy_ip_aggr AFTER INSERT ON user_endpoints FOR ROW EXECUTE PROCEDURE trigger_add_endpoint_copy_ip_aggr();

CREATE EXTENSION IF NOT EXISTS tablefunc;

INSERT INTO db_schema_version(version, script_path)
     VALUES(2, 'scripts/database-patch02.sh') ON CONFLICT DO NOTHING;

\q
EOF



echo 'DATABASE SUCCESSFULLY PATCHED (02)';

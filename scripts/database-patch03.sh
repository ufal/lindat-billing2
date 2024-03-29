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

CREATE TABLE user_tokens
(
  token_id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(user_id),
  name TEXT NOT NULL,
  token VARCHAR(43) NOT NULL,
  start_date TIMESTAMP,
  end_date TIMESTAMP,
  create_time TIMESTAMP DEFAULT NOW(),
  update_time TIMESTAMP DEFAULT NOW()
);

CREATE INDEX ON user_tokens(token);
ALTER TABLE user_tokens ADD CONSTRAINT unique_token UNIQUE (token);



ALTER TABLE log_ip_aggr ADD token_used BOOLEAN DEFAULT FALSE;

ALTER TABLE log_aggr ADD token_id INTEGER NULL REFERENCES user_tokens( token_id ) ON DELETE CASCADE;




INSERT INTO db_schema_version(version, script_path)
     VALUES(3, 'scripts/database-patch03.sh') ON CONFLICT DO NOTHING;

\q
EOF



echo 'DATABASE SUCCESSFULLY PATCHED (03)';

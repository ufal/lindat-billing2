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

psql -p $PORT -q -v "ON_ERROR_STOP=1" postgres << EOF

DO
\$do\$
BEGIN
   IF NOT EXISTS (
      SELECT
      FROM   pg_catalog.pg_roles
      WHERE  rolname = '$USER_NAME') THEN
      CREATE ROLE $USER_NAME LOGIN PASSWORD '$PASSWORD';
   END IF;
END
\$do\$;

\q
EOF

dropdb -p $PORT $DB_NAME
createdb -p $PORT -O $USER_NAME $DB_NAME

psql -p $PORT -d $DB_NAME -c "GRANT ALL PRIVILEGES ON DATABASE $DB_NAME TO $USER_NAME;"
psql -p $PORT -d $DB_NAME -c "CREATE EXTENSION pgcrypto;"

psql -U $USER_NAME -p $PORT -q -v "ON_ERROR_STOP=1" $DB_NAME << EOF

CREATE TABLE users
(
	user_id SERIAL PRIMARY KEY,
	email TEXT NOT NULL UNIQUE,
	password TEXT NOT NULL,
	first_name TEXT NOT NULL,
	last_name TEXT NOT NULL,
	organization TEXT,
	is_admin BOOLEAN DEFAULT FALSE,
	is_verified BOOLEAN DEFAULT FALSE,
	is_active BOOLEAN DEFAULT FALSE,
	verification_code UUID DEFAULT md5(random()::TEXT)::UUID,
	create_time TIMESTAMP DEFAULT NOW(),
	update_time TIMESTAMP DEFAULT NOW()
);

CREATE TABLE user_endpoints
(
	endpoint_id SERIAL PRIMARY KEY,
	user_id INTEGER NOT NULL REFERENCES users(user_id),
	name TEXT NOT NULL,
	ip INET NOT NULL UNIQUE,
	is_verified BOOLEAN DEFAULT FALSE,
	verification_code UUID DEFAULT md5(random()::TEXT)::UUID,
	is_active BOOLEAN DEFAULT FALSE,
	create_time TIMESTAMP DEFAULT NOW(),
	update_time TIMESTAMP DEFAULT NOW()
);

CREATE TABLE user_logs
(
	user_log_id BIGSERIAL PRIMARY KEY,
	user_id INTEGER NOT NULL REFERENCES users(user_id),
	action TEXT NOT NULL,
	create_time TIMESTAMP DEFAULT NOW()
);

CREATE TABLE services
(
	service_id SERIAL PRIMARY KEY,
	name TEXT NOT NULL UNIQUE,
	prefix TEXT NOT NULL UNIQUE,
	method BIT(6) NOT NULL DEFAULT B'111011',
	description TEXT NULL,
	color INT DEFAULT x'808080'::INT,
	create_time TIMESTAMP DEFAULT NOW(),
	update_time TIMESTAMP DEFAULT NOW()
);

CREATE TABLE service_pricing
(
	pricing_id SERIAL PRIMARY KEY,
	service_id INTEGER NOT NULL REFERENCES services(service_id),
	user_id INTEGER REFERENCES users(user_id) DEFAULT NULL,
	unit INTEGER NOT NULL,
	price INTEGER NOT NULL,
	valid_from TIMESTAMP NOT NULL,
	valid_till TIMESTAMP DEFAULT NULL,
	create_time TIMESTAMP DEFAULT NOW(),
	update_time TIMESTAMP DEFAULT NOW()
);

ALTER TABLE service_pricing ADD CONSTRAINT service_pricing_correct_valid_interval CHECK (valid_from < coalesce(valid_till, 'infinity'::timestamp));



ALTER TABLE service_pricing ADD CONSTRAINT service_pricing_no_overlapping_time_ranges_for_single_service
EXCLUDE USING GIST (int4range(service_id, service_id, '[]')  WITH =, int4range(user_id, user_id, '[]') WITH =, tsrange(valid_from, coalesce(valid_till, 'infinity'::timestamp)) WITH &&);

CREATE TABLE log_files
(
	file_id SERIAL PRIMARY KEY,
	file_name TEXT NOT NULL UNIQUE,
	first_line_checksum UUID,
	last_read_line_checksum UUID,
	lines_read BIGINT DEFAULT 0,
	lines_valid BIGINT DEFAULT 0,
	tail BOOLEAN DEFAULT FALSE,
	status VARCHAR(20) DEFAULT 'IMPORTING',
	create_time TIMESTAMP DEFAULT NOW(),
	update_time TIMESTAMP DEFAULT NOW()
);

CREATE TABLE log_file_entries
(
	time_local TIMESTAMP NOT NULL,
	file_id INTEGER NOT NULL REFERENCES log_files(file_id),
	line_number INTEGER NOT NULL,
	line_checksum UUID,
	remote_addr INET,
	remote_user TEXT,
	method TEXT,
	request TEXT,
	protocol TEXT,
	status SMALLINT,
	body_bytes_sent BIGINT,
	http_referer TEXT,
	http_user_agent TEXT,
	service_id INTEGER NOT NULL REFERENCES services(service_id),
	unit INTEGER NOT NULL,
	create_time TIMESTAMP DEFAULT NOW()
);

CREATE INDEX ON log_file_entries(time_local);
CREATE INDEX ON log_file_entries(remote_addr);
CREATE INDEX ON log_file_entries(line_number);
CREATE INDEX ON log_file_entries(line_checksum);


CREATE OR REPLACE FUNCTION trigger_update_log_files()
RETURNS TRIGGER AS
	\$\$
	BEGIN
	  RAISE NOTICE 'Updating file : % ', NEW.file_id;
      UPDATE log_files
      SET
        last_read_line_checksum = NEW.line_checksum,
        lines_read = NEW.line_number,
        lines_valid = lines_valid + 1
      WHERE
        file_id = NEW.file_id;
      RETURN NEW;
	END;
	\$\$
LANGUAGE plpgsql;


CREATE TRIGGER log_files_lines_read AFTER INSERT ON log_file_entries FOR ROW EXECUTE PROCEDURE trigger_update_log_files();



CREATE TABLE billing
(
	billing_id BIGSERIAL PRIMARY KEY,
	endpoint_id INTEGER NOT NULL REFERENCES user_endpoints(endpoint_id),
	period_start_date TIMESTAMP NOT NULL,
	period_end_date TIMESTAMP NOT NULL,
	create_time TIMESTAMP DEFAULT NOW(),
	update_time TIMESTAMP DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION trigger_update_time_column()
RETURNS TRIGGER AS
	\$\$
	BEGIN
    	NEW.update_time = now();
    	RETURN NEW;
	END;
	\$\$
LANGUAGE plpgsql;

CREATE TRIGGER update_users BEFORE UPDATE ON users FOR EACH ROW EXECUTE PROCEDURE trigger_update_time_column();
CREATE TRIGGER update_user_endpoints BEFORE UPDATE ON user_endpoints FOR EACH ROW EXECUTE PROCEDURE trigger_update_time_column();
CREATE TRIGGER update_log_files BEFORE UPDATE ON log_files FOR EACH ROW EXECUTE PROCEDURE trigger_update_time_column();
CREATE TRIGGER update_services BEFORE UPDATE ON services FOR EACH ROW EXECUTE PROCEDURE trigger_update_time_column();
CREATE TRIGGER update_service_pricing BEFORE UPDATE ON service_pricing FOR EACH ROW EXECUTE PROCEDURE trigger_update_time_column();
CREATE TRIGGER update_billing BEFORE UPDATE ON billing FOR EACH ROW EXECUTE PROCEDURE trigger_update_time_column();

INSERT INTO services(service_id, name, prefix, description) VALUES(0, 'UNKNOWN', '^\/services\/', 'When no other described service is matched.');
INSERT INTO services(name, prefix, description) VALUES('PMLTQ', '^\/services\/pmltq\/api.*[^(auth)]$', 'PML-TQ is a powerful open-source search tool for all kinds of linguistically annotated tree-banks with several client interfaces and two search back-ends (one based on a SQL database and one based on Perl and the TrEd toolkit). The tool works natively with tree-banks encoded in the PML data format (conversion scripts are available for many established tree-bank formats).');
INSERT INTO services(name, prefix, description) VALUES('MorphoDiTa', '^\/services\/morphodita\/api', 'MorphoDiTa: Morphological Dictionary and Tagger is an open-source tool for morphological analysis of natural language texts. It performs morphological analysis, morphological generation, tagging and tokenization and is distributed as a standalone tool or a library, along with trained linguistic models. In the Czech language, MorphoDiTa achieves state-of-the-art results with a throughput around 10-200K words per second. MorphoDiTa is a free software under LGPL license and the linguistic models are free for non-commercial use and distributed under CC BY-NC-SA license, although for some models the original data used to create the model may impose additional licensing conditions.');
INSERT INTO services(name, prefix, description) VALUES('PDT-Vallex', '^\/services\/PDT-Vallex', 'The valency lexicon PDT-Vallex has been built in close connection with the annotation of the Prague Dependency Treebank project (PDT) and its successors (mainly the Prague Czech-English Dependency Treebank project, PCEDT). It contains over 11000 valency frames for more than 7000 verbs which occurred in the PDT or PCEDT. It is available in electronically processable format (XML) together with the aforementioned treebanks (to be viewed and edited by TrEd, the PDT/PCEDT main annotation tool), and also in more human readable form including corpus examples (see the WEBSITE link below). The main feature of the lexicon is its linking to the annotated corpora - each occurrence of each verb is linked to the appropriate valency frame with additional (generalized) information about its usage and surface morphosyntactic form alternatives.');
INSERT INTO services(name, prefix, description) VALUES('EngVallex', '^\/services\/EngVallex', 'EngVallex is the English counterpart of the PDT-Vallex valency lexicon, using the same view of valency, valency frames and the description of a surface form of verbal arguments. EngVallex contains links also to PropBank and Verbnet, two existing English predicate-argument lexicons used, i.a., for the PropBank project. The EngVallex lexicon is fully linked to the English side of the PCEDT parallel treebank, which is in fact the PTB re-annotated using the Prague Dependency Treebank style of annotation. The EngVallex is available in an XML format in our repository, and also in a searchable form (see the WEBSITE link below) with examples from the PCEDT.');
INSERT INTO services(name, prefix, description) VALUES('Treex', '^\/services\/treex-web\/api.*[^(auth)]$', 'Treex (formerly TectoMT) is a highly modular NLP software system implemented in Perl programming language under Linux. It is primarily aimed at Machine Translation, making use of the ideas and technology created during the Prague Dependency Treebank project. At the same time, it is also hoped to significantly facilitate and accelerate development of software solutions of many other NLP tasks, especially due to re-usability of the numerous integrated processing modules (called blocks), which are equipped with uniform object-oriented interfaces.');
INSERT INTO services(name, prefix, description) VALUES('Česílko', '^\/services\/rest\/cesilko\/translate', 'The system Česílko was designed as a tool enabling the fast and efficient translation from one source language into many target languages, which are mutually related. The system receives as its input a high quality human translation of the original into Czech (from any language). It translates the Czech input into a number of languages related to Czech. The system contains at the moment 5 language pairs, 4 of them only as experiments, namely Czech into Polish, Lithuanian, Macedonian and Lower Sorbian. Unfortunately, the system cannot be tested on arbitrary texts for these language pairs due to a small size of all dictionaries. The only working language pair (and at the same time also exploitable outside of the above mentioned setup) is the fifth one, Czech to Slovak. Similarly to other MT systems, Česílko requires human post-editing. The system is being developed since 1998.');
INSERT INTO services(name, prefix, description) VALUES('CzEngVallex', '^\/services\/CzEngVallex\/', 'CzEngVallex is a bilingual valency lexicon of corresponding Czech and English verbs. It connects 20835 aligned valency frame pairs (verb senses) which are translations of each other, aligning their arguments as well. The CzEngVallex serves as a powerful, real-text-based database of frame-to-frame and subsequently argument-to-argument pairs and can be used for example for machine translation applications. It uses the data from the Prague Czech-English Dependency Treebank project (PCEDT 2.0) and it also takes advantage of two existing valency lexicons: PDT-Vallex for Czech and EngVallex for English, using the same view of valency (based on the Functional Generative Description theory). The CzEngVallex is available in an XML format in the LINDAT/CLARIN repository, and also in a searchable form (see the “More Apps” tab) interlinked with PDT-Vallex, EngVallex and with examples from the PCEDT.');
INSERT INTO services(name, prefix, description) VALUES('NameTag', '^\/services\/nametag\/api', 'NameTag is an open-source tool for named entity recognition (NER). NameTag identifies proper names in text and classifies them into predefined categories, such as names of persons, locations, organizations, etc. NameTag is distributed as a standalone tool or a library, along with trained linguistic models. In the Czech language, NameTag achieves state-of-the-art performance (Straková et. al. 2013). NameTag is a free software under LGPL license and the linguistic models are free for non-commercial use and distributed under CC BY-NC-SA license, although for some models the original data used to create the model may impose additional licensing conditions.');

\q
EOF

psql -p $PORT -q -v "ON_ERROR_STOP=1" $DB_NAME << EOF

GRANT CONNECT ON DATABASE $DB_NAME TO $USER_NAME;
GRANT ALL ON SCHEMA public TO $USER_NAME;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO $USER_NAME;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO $USER_NAME;

CREATE SCHEMA partman;
CREATE EXTENSION pg_partman SCHEMA partman;

GRANT ALL ON ALL TABLES IN SCHEMA partman TO $USER_NAME;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA partman TO $USER_NAME;
GRANT ALL ON SCHEMA partman TO $USER_NAME;

\q
EOF

D=`dirname $0`
DBGFILE="$D/create-debug-user.sh"
if [ -f $DBGFILE ]; then
       echo "CREATING DEBUG USER !!!"
       psql -U $USER_NAME -p $PORT -q -v "ON_ERROR_STOP=1" $DB_NAME < $DBGFILE
fi

DBGFILEENDPOINTS="$D/debug-data-endpoints.sh"
if [ -f $DBGFILEENDPOINTS ]; then
       echo "ADDING ENDPOINTS, DATA AND USERS !!!"
       psql -U $USER_NAME -p $PORT -q -v "ON_ERROR_STOP=1" $DB_NAME < $DBGFILEENDPOINTS
       grep "^\s*--\s*SHELL" $DBGFILEENDPOINTS | sed "s/^\s*--\s*SHELL//" | sh
fi

echo 'DATABASE SUCCESSFULLY CREATED';

DATE := $(shell date +"%Y%m%dT%H%M%S")
IN := ./data/in/sample-tokens.log
OUT := ./data/out
DIR := $(OUT)/import-$(DATE)

include config.sh

get-new-logs: $(DATE)
	perl ./get-new-logs.pl --db-host $(DB_HOST) \
	                       --db-database $(DB_NAME) \
	                       --db-user $(USER_NAME) \
	                       --db-password='$(PASSWORD)' \
	                       --out-dir $(DIR) \
	                       --in-files $(IN)
	ls -l $(DIR)
convert:
	perl ./log2sql.pl --db-host $(DB_HOST) \
	                       --db-database $(DB_NAME) \
	                       --db-user $(USER_NAME) \
	                       --db-password='$(PASSWORD)' \
	                       --out-dir $(DIR) \
	                       --in-files $(DIR)/*.log

import:
	export PGPASSWORD=$(PASSWORD); ls $(DIR)/*.sql \
	  | sort \
	  | xargs -I {} \
	      psql \
	      -vworkingdir="$(DIR)"\
	      -d $(DB_NAME) \
	      -U $(USER_NAME) \
	      -h $(DB_HOST) \
	      -f {}



$(DATE):
	mkdir -p $(DIR)

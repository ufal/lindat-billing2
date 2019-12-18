FROM postgres:12
RUN set -x \
    && apt-get update && apt-get install -y --no-install-recommends postgresql-12-partman && rm -rf /var/lib/apt/lists/*
COPY ./scripts/database-setup.sh /docker-entrypoint-initdb.d/01_database_setup.sh
COPY ./scripts/create-debug-user.sh /create-debug-user.sh

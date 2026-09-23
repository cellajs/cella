# Local development Postgres with pg_cron, which runs partition maintenance inside the database
# (compose loads it via shared_preload_libraries and points cron.database_name at `postgres`).
FROM postgres:17
RUN apt-get update \
  && apt-get install -y --no-install-recommends postgresql-17-cron \
  && rm -rf /var/lib/apt/lists/*

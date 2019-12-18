# lindat-billing2

# Run Local Docker

## Create default debug user
Create `scripts/create-debug-user.sh` file that should contain SQL commands that e.g., create a user.
```
INSERT INTO users(email, password, first_name, last_name, is_admin, is_verified, is_active) VALUES('debugger', crypt('pass', gen_salt('bf')), 'Mr.', 'Debugger', TRUE, TRUE, TRUE);
```

## Spin off docker containers
```
docker-compose up
```

# Inspect lindat-billing using Local Docker

## Login

Go to `http://localhost:3021/` and use the credentials from above (if specified).

## Rebuild after Dockerfile changes

```
docker-compose down --volumes
docker-compose build
docker-compose up
```

## Inspect database

```
psql -U billing billing
```
we use the fact that the default postgres port is mapped to the proper container.
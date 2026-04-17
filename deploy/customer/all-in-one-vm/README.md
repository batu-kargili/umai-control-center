# UMAI All-In-One VM Demo Deployment

This package runs the current UMAI customer demo stack on one VM with local dependencies.

It starts:

- Oracle Free for the UMAI service database
- Redis for guardrail snapshot publication and reads
- OpenLDAP for control-center login
- phpLDAPadmin for LDAP user management
- `umai-engine`
- `umai-service`
- `umai-control-center`

Use this when you want one VM that customers can access with assigned LDAP users and test the platform end to end without a real DNS name.

## 1. Access model

This bundle is designed for `/etc/hosts` or Windows `hosts` file based access.

Add these entries on each tester machine:

```text
<vm-ip> umai-console.test
<vm-ip> umai-api.test
```

Then customers use:

- `http://umai-console.test:3000/login`
- `http://umai-api.test:8080`

Internal-only by default:

- Engine health: `http://127.0.0.1:8081/healthz`
- Oracle: `127.0.0.1:1521`
- Redis: `127.0.0.1:6379`
- LDAP: `127.0.0.1:1389`
- phpLDAPadmin: `http://127.0.0.1:8088`

## 2. Seeded LDAP users

The bundled LDAP bootstrap seeds these demo users:

- `operator` / `operator123`
- `auditor` / `auditor123`

They live under `ou=users,dc=umai,dc=local` and can sign in to the control center immediately.

To create customer-specific users, use phpLDAPadmin or edit [bootstrap/ldap/01-users.ldif](./bootstrap/ldap/01-users.ldif) before first startup.

## 3. VM prerequisites

- Ubuntu 22.04 LTS or Ubuntu 24.04 LTS
- Docker Engine and Docker Compose plugin
- Enough outbound connectivity to pull the UMAI images
- Enough outbound connectivity to reach the selected OpenAI-compatible LLM endpoint

Recommended VM size:

- Minimum for customer testing: 8 vCPU, 16 GB RAM, 100 GB SSD
- Better for multiple testers: 12 to 16 vCPU, 24 to 32 GB RAM, 150 GB SSD

## 4. Prepare the VM

Copy this repo to the VM and move into the deployment folder:

```bash
cd /opt/umai/umai-control-center/deploy/customer/all-in-one-vm
cp .env.example .env
mkdir -p license
```

Generate unique secrets before first boot:

```bash
openssl rand -hex 32
```

Use the output to replace at least:

- `CONTROL_CENTER_SESSION_SECRET`
- `EXTENSION_CONNECT_JWT_SECRET`
- `UMAI_SNAPSHOT_SIGNING_KEY`
- `LLM_API_KEY` or the equivalent secret env for your inference endpoint

Update `.env` for your VM:

- Set `UMAI_ENGINE_IMAGE`, `UMAI_SERVICE_IMAGE`, and `UMAI_CONTROLCENTER_IMAGE`
- Set `DUVARAI_CORS_ALLOW_ORIGINS=["http://umai-console.test:3000"]`
- Set the `DUVARAI_DEFAULT_GUARDRAIL_LLM_*` values to the reachable LLM endpoint the engine should call
- Keep `CONTROL_CENTER_ORGANIZATION_ID` and `DUVARAI_SEED_TENANT_ID` identical
- Keep `CONTROL_CENTER_ORGANIZATION_NAME` and `DUVARAI_SEED_TENANT_NAME` aligned
- If you change `DUVARAI_DATABASE_URL`, keep it aligned with [bootstrap/oracle/01-umai-bootstrap.sql](./bootstrap/oracle/01-umai-bootstrap.sql)
- If you change `LDAP_DOMAIN` or `LDAP_BASE_DN`, update [bootstrap/ldap/01-users.ldif](./bootstrap/ldap/01-users.ldif)

Keep these values for hosts-file / HTTP mode:

- `CONTROL_CENTER_SESSION_SECURE=false`
- `DUVARAI_CORS_ALLOW_ORIGINS=["http://umai-console.test:3000"]`

License behavior:

- For a quick internal demo, leave `DUVARAI_LICENSE_STRICT=false`
- For a signed license, set `DUVARAI_LICENSE_STRICT=true`, fill `DUVARAI_LICENSE_PUBLIC_KEY`, and place `license.json` under `license/license.json`

## 5. Start the stack

From `deploy/customer/all-in-one-vm`:

```bash
docker compose --env-file .env -f docker-compose.yaml up -d
```

Check status:

```bash
docker compose --env-file .env -f docker-compose.yaml ps
```

Follow logs when needed:

```bash
docker compose --env-file .env -f docker-compose.yaml logs -f umai-service
docker compose --env-file .env -f docker-compose.yaml logs -f umai-control-center
docker compose --env-file .env -f docker-compose.yaml logs -f openldap
```

The stack order is:

1. Oracle initializes and creates the `umai_app` schema user.
2. Redis and OpenLDAP start.
3. `umai-engine` starts and waits on Redis.
4. `umai-service-migrator`, schema repair, and seed jobs prepare Oracle.
5. `umai-service` starts against the prepared Oracle schema.
6. `umai-control-center` starts against the local LDAP and real service.

## 6. Validate the deployment

Health checks:

```bash
curl -fsS http://127.0.0.1:8081/healthz
curl -fsS http://127.0.0.1:8080/healthz
curl -fsS http://127.0.0.1:8080/readyz
curl -I http://127.0.0.1:3000/login
```

Functional check:

1. Open `http://umai-console.test:3000/login`.
2. Sign in as `operator` with password `operator123`.
3. Complete onboarding or create the target environment and project.
4. Deploy a built-in guardrail template.
5. Publish a version and confirm the publish succeeds.
6. Call `http://umai-api.test:8080/healthz`.
7. Run a test prompt through the platform and verify the engine evaluates it.

## 7. Add customer users

Open `http://127.0.0.1:8088` on the VM itself, or use an SSH tunnel such as `ssh -L 8088:127.0.0.1:8088 user@vm-host`.

Sign in to phpLDAPadmin with:

- login DN: `cn=admin,dc=umai,dc=local`
- password: the `LDAP_ADMIN_PASSWORD` value from `.env`

Create users under `ou=users,dc=umai,dc=local` with at least:

- `uid`
- `cn`
- `sn`
- `mail`
- `userPassword`

The control center uses `LDAP_USERNAME_ATTRIBUTE=uid` by default, so the user's sign-in name is the LDAP `uid`.

## 8. Day-2 commands

Restart:

```bash
docker compose --env-file .env -f docker-compose.yaml restart
```

Stop:

```bash
docker compose --env-file .env -f docker-compose.yaml down
```

Remove data volumes for a clean reset:

```bash
docker compose --env-file .env -f docker-compose.yaml down -v
```

That wipes Oracle, Redis, and LDAP data and recreates the seeded demo state on the next boot.

# DEPRECATED: `umai-control-center/deploy/docker-compose.yml`

This compose file was a control-center-specific internal template that diverged from the canonical UMAI deployment contract:

- Used legacy env var names (`CC_SESSION_SECRET`, `CC_EXTENSION_JWT_SECRET`) that the Control Center code does not read. The source reads `CONTROL_CENTER_SESSION_SECRET` and `EXTENSION_CONNECT_JWT_SECRET`. This file silently mis-configured the stack.
- Used `UMAI_CORS_ORIGINS` for the service CORS variable, while the service reads `UMAI_CORS_ALLOW_ORIGINS`.
- Floated image tags to `:${UMAI_VERSION:-latest}` when `UMAI_VERSION` was unset.
- Used `UMAI_ORGANIZATION_*` and `UMAI_LICENSE_EXPIRES_AT` names that the Control Center does not read (it expects `CONTROL_CENTER_ORGANIZATION_*` and `CONTROL_CENTER_ORGANIZATION_LICENSE_EXPIRES_AT`).

## Supported path going forward

Use the canonical compose file at the platform repository root:
- `deploy/production/docker-compose.yaml` (under construction)
- Pinned image variables: `UMAI_ENGINE_IMAGE`, `UMAI_SERVICE_IMAGE`, `UMAI_CONTROLCENTER_IMAGE`

This file is kept here only for historical reference and will be removed in a future release.

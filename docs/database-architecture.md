# Shaji Database Architecture and Security Model

- **Project:** Shaji
- **Component:** PostgreSQL and Prisma Persistence Layer
- **Status:** Implemented — Backend Foundation
- **Database:** PostgreSQL 18
- **ORM:** Prisma 7
- **Application:** Node.js + TypeScript

---

## 1. Purpose

Shaji is an Identity and Access Management (IAM) system designed to handle identity, authentication, authorization, sessions, account recovery, security monitoring, and related security-sensitive operations.

Because authentication systems process highly sensitive data, the database layer is treated as a security boundary rather than simply as application storage.

The database architecture is designed around the following principles:

- least privilege;
- separation of runtime and migration responsibilities;
- database-enforced integrity;
- explicit schema ownership;
- secure migration management;
- credential separation;
- fail-fast database connectivity;
- controlled connection pooling;
- secure handling of database functions and procedures;
- auditable and repeatable schema changes.

The design assumes that application code can fail or become compromised. Where appropriate, PostgreSQL therefore independently enforces security and data-integrity rules.

---

## 2. High-Level Architecture

The runtime database path is:

```text
Shaji API
   |
   v
Prisma Client
   |
   v
@prisma/adapter-pg
   |
   v
pg
   |
   v
PostgreSQL
   |
   +-- Database: shaji
       |
       +-- Schema: app
```

The migration path is deliberately separate:

```text
Prisma CLI
   |
   v
shaji_migrator
   |
   +-- shaji
   |
   +-- shaji_shadow
```

The running Shaji API does not use the migration account.

---

## 3. PostgreSQL Security Roles

Shaji currently uses three relevant PostgreSQL roles.

### 3.1 `postgres`

Purpose:

- local PostgreSQL administration;
- database-level administrative operations;
- role administration where required.

The `postgres` superuser is **not used by the Shaji application**.

Using a PostgreSQL superuser as an application account would give the application unnecessary authority over the database server and would significantly increase the impact of an application compromise.

---

### 3.2 `shaji_migrator`

Purpose:

- owns the `shaji` database;
- owns the `app` schema;
- owns application tables and database objects;
- executes Prisma migrations;
- creates and alters schema objects.

Security attributes:

```text
LOGIN
NOSUPERUSER
NOCREATEDB
NOCREATEROLE
NOINHERIT
NOREPLICATION
NOBYPASSRLS
```

The role does not have broad PostgreSQL administrative privileges.

It is intentionally more privileged than the runtime account because migrations require the ability to create and alter application database objects.

---

### 3.3 `shaji_app`

Purpose:

- database identity used by the running Shaji API.

Security attributes:

```text
LOGIN
NOSUPERUSER
NOCREATEDB
NOCREATEROLE
NOINHERIT
NOREPLICATION
NOBYPASSRLS
```

The runtime role does not own the database, schema, or application tables.

Its intended application permissions are limited to:

```text
SELECT
INSERT
UPDATE
DELETE
```

where required.

It cannot perform operations such as:

```text
CREATE TABLE
ALTER TABLE
DROP TABLE
```

Testing confirmed that attempts to alter or drop `app.users` using `shaji_app` are rejected by PostgreSQL.

---

## 4. Database and Schema Structure

The primary application database is:

```text
shaji
```

Ownership:

```text
Owner: shaji_migrator
```

The database does not rely on PostgreSQL's default `public` schema for application objects.

Instead, Shaji uses:

```text
app
```

The current structure is:

```text
PostgreSQL
|
+-- shaji
    |
    +-- app
        |
        +-- users
        +-- _prisma_migrations
        +-- account_status
        +-- set_updated_at()
```

Future Shaji tables will also be created inside the `app` schema.

---

## 5. `public` Schema Hardening

The default PostgreSQL `public` schema is not used for Shaji application objects.

Broad `PUBLIC` access was removed.

The application schema was created explicitly:

```sql
CREATE SCHEMA app AUTHORIZATION shaji_migrator;
```

The runtime role receives:

```text
USAGE
```

on the `app` schema, but not ownership or `CREATE`.

This prevents the runtime account from introducing new database objects.

---

## 6. Controlled Search Path

Both database roles use a controlled search path for the `shaji` database:

```text
pg_catalog, app
```

Configured conceptually as:

```sql
ALTER ROLE <role>
IN DATABASE shaji
SET search_path = pg_catalog, app;
```

Putting `pg_catalog` explicitly first ensures PostgreSQL built-in functions and system objects are resolved before objects in the application schema.

Sensitive database routines should still define their own safe `search_path` rather than relying exclusively on role defaults.

---

## 7. Runtime and Migration Credential Separation

Shaji deliberately separates runtime credentials from schema-management credentials.

### Runtime

File:

```text
backend/.env
```

Variable:

```text
DATABASE_URL
```

Role:

```text
shaji_app
```

Used by:

```text
running Shaji API
```

---

### Migration

File:

```text
backend/.env.migration
```

Variables:

```text
MIGRATION_DATABASE_URL
SHADOW_DATABASE_URL
```

Role:

```text
shaji_migrator
```

Used by:

```text
Prisma CLI
```

The Shaji runtime configuration does not load the migration credentials.

Both real environment files are excluded from Git.

Safe examples are maintained as:

```text
backend/.env.example
backend/.env.migration.example
```

No real database passwords or connection strings are committed.

---

## 8. Prisma Architecture

Shaji currently uses:

```text
Prisma CLI             7.10.0
@prisma/client         7.10.0
@prisma/adapter-pg     7.10.0
pg                     8.23.1
```

Prisma is not treated as a replacement for PostgreSQL security.

Instead:

```text
Application rules
        +
Prisma type-safe access
        +
PostgreSQL permissions
        +
PostgreSQL constraints
        +
database functions/triggers
```

work together.

Even when Prisma is used, PostgreSQL remains responsible for enforcing database privileges and integrity rules.

---

## 9. Prisma Client Generation

The Prisma Client is generated into:

```text
backend/src/generated/prisma
```

Generated Prisma code is excluded from version control.

The application build includes:

```text
prebuild
    |
    v
prisma generate
    |
    v
TypeScript compilation
```

The relevant scripts include:

```text
prisma:generate
prebuild
build
```

This allows a fresh build environment to recreate the Prisma Client rather than relying on generated files being committed to Git.

---

## 10. Migration Architecture

Database schema changes are version controlled under:

```text
backend/prisma/migrations/
```

Current migrations include:

```text
20261006184957_init_identity
20261006214023_restrict_prisma_migrations
```

The first migration creates the initial identity model.

The second migration prevents the runtime application role from accessing Prisma's migration metadata.

Migration history is therefore treated as infrastructure metadata rather than normal application data.

---

## 11. Prisma Migration Metadata Protection

Prisma creates:

```text
app._prisma_migrations
```

Because Shaji's default table privileges automatically grant runtime CRUD permissions to new application tables, the runtime role initially inherited access to this table.

This was identified during direct PostgreSQL inspection.

The privilege was removed:

```sql
REVOKE ALL PRIVILEGES
ON TABLE app._prisma_migrations
FROM shaji_app;
```

The security control was then converted into a version-controlled migration.

Because Prisma's shadow database does not always contain `_prisma_migrations` while replaying migrations, the final migration safely checks whether the relation exists before revoking privileges.

This prevents the runtime API from reading or modifying migration history while allowing the same migration chain to replay successfully inside the shadow database.

Testing confirmed:

```text
shaji_app -> SELECT app._prisma_migrations
```

returns:

```text
permission denied
```

---

## 12. Prisma Shadow Database

Development migrations use a dedicated shadow database:

```text
shaji_shadow
```

Owner:

```text
shaji_migrator
```

The shadow database allows Prisma to:

- replay migration history;
- detect schema drift;
- calculate required migrations;
- validate migrations before applying them.

The `shaji_migrator` role was not granted global `CREATEDB` permission merely to support Prisma.

Instead, `shaji_shadow` was created explicitly and provided to Prisma through:

```text
SHADOW_DATABASE_URL
```

This preserves least privilege while supporting Prisma's migration workflow.

The shadow database must never point to the actual Shaji application database because Prisma may reset its contents during migration operations.

---

## 13. Initial Identity Model

The first application table is:

```text
app.users
```

Current fields:

```text
id
email
password_hash
status
email_verified_at
created_at
updated_at
```

The table deliberately does not contain unrelated authentication concepts such as:

```text
refresh tokens
MFA secrets
recovery codes
roles
verification tokens
password reset tokens
audit events
```

These will be modeled separately as the authentication architecture expands.

---

## 14. User Identifier

Users use PostgreSQL UUID identifiers.

Conceptually:

```sql
UUID PRIMARY KEY DEFAULT gen_random_uuid()
```

UUID generation occurs at the database level.

This means identifier integrity does not depend exclusively on application code.

---

## 15. Password Storage

The database stores:

```text
password_hash
```

and never stores plaintext passwords.

Future authentication implementation will use Argon2id password hashing.

The following must never persist:

```text
plaintext password
raw temporary password
unhashed recovery credential
```

Password hashing will occur before persistence.

---

## 16. Account Status

Account lifecycle state is represented using the PostgreSQL enum:

```text
account_status
```

Current states:

```text
PENDING_VERIFICATION
ACTIVE
SUSPENDED
DISABLED
```

A single explicit lifecycle state is preferred over combinations of potentially contradictory Boolean columns such as:

```text
is_active
is_suspended
is_disabled
```

Temporary brute-force lockouts will be modeled separately from long-term account lifecycle state.

---

## 17. Email Verification State

Email verification is represented by:

```text
email_verified_at
```

Rather than storing only:

```text
email_verified = true
```

the timestamp provides both:

```text
verification state
+
verification time
```

A `NULL` value means the email has not yet been verified.

---

## 18. Email Normalization Integrity

Authentication systems must not allow duplicate identities that differ only by email casing or surrounding whitespace.

Shaji therefore uses both:

1. application-side normalization; and
2. database-side enforcement.

The database contains a check constraint equivalent to:

```sql
CHECK (
    email = lower(btrim(email))
    AND email <> ''
)
```

Testing confirmed that PostgreSQL accepts:

```text
test@shaji.local
```

but rejects:

```text
Test@Shaji.Local
```

The normalized value is also protected by a unique index.

Testing confirmed that inserting the same normalized email twice results in a unique-constraint violation.

---

## 19. `updated_at` Database Trigger

Shaji does not rely exclusively on Prisma to maintain the `updated_at` timestamp.

A PostgreSQL trigger executes before updates to `app.users`.

The function is:

```text
app.set_updated_at()
```

The trigger is:

```text
users_set_updated_at
```

Conceptually:

```text
UPDATE app.users
        |
        v
BEFORE UPDATE trigger
        |
        v
app.set_updated_at()
        |
        v
NEW.updated_at = CURRENT_TIMESTAMP
```

Testing confirmed that:

- `created_at` remains unchanged;
- `updated_at` changes automatically;
- the caller does not need to explicitly modify `updated_at`.

This protects timestamp integrity even when updates occur outside Prisma.

---

## 20. PostgreSQL Function Security

The current trigger function uses:

```text
SECURITY INVOKER
```

rather than:

```text
SECURITY DEFINER
```

The function does not require elevated privileges, so privilege escalation is unnecessary.

Its search path is explicitly controlled:

```text
pg_catalog, app
```

Future privileged routines must be reviewed carefully before using `SECURITY DEFINER`.

For future functions and procedures, Shaji will evaluate:

- function ownership;
- `SECURITY INVOKER` versus `SECURITY DEFINER`;
- safe `search_path`;
- input validation;
- transaction behaviour;
- explicit `EXECUTE` privileges;
- privilege escalation risks.

---

## 21. Default Function and Procedure Privileges

PostgreSQL normally grants execution privileges on new routines to `PUBLIC`.

Shaji changes this default for routines created by `shaji_migrator`.

Future functions and procedures are therefore not automatically executable by every database role.

Access will instead be explicitly granted when required.

This supports the principle:

```text
default deny
+
explicit grant
```

for database routines.

---

## 22. Runtime Permission Verification

The database permission model was tested directly using the `shaji_app` role.

The runtime account successfully performed:

```text
SELECT
INSERT
UPDATE
DELETE
```

The runtime account was denied:

```text
CREATE TABLE
ALTER TABLE
DROP TABLE
access to _prisma_migrations
```

This demonstrates that the runtime application can perform normal persistence operations without receiving schema-management authority.

---

## 23. Database Readiness at Application Startup

Shaji verifies PostgreSQL connectivity before opening the HTTP server.

The startup sequence is:

```text
Start Shaji
   |
   v
Create Prisma connection
   |
   v
Execute SELECT 1
   |
   +-- failure --> log fatal error --> exit
   |
   +-- success
          |
          v
     Start HTTP server
```

An explicit:

```sql
SELECT 1
```

is used because creating the Prisma/pg pool does not necessarily prove that a real PostgreSQL network connection has already succeeded.

This behaviour was verified by stopping PostgreSQL.

When PostgreSQL was unavailable:

```text
ECONNREFUSED
```

was returned, Shaji logged:

```text
Failed to start Shaji backend
```

and port `3000` was never opened.

This prevents the application from advertising itself as operational while a required dependency is unavailable.

---

## 24. Graceful Database Shutdown

Shaji handles:

```text
SIGINT
SIGTERM
uncaughtException
unhandledRejection
```

During normal shutdown:

```text
termination signal
       |
       v
stop accepting HTTP connections
       |
       v
close HTTP server
       |
       v
disconnect Prisma
       |
       v
exit
```

A forced shutdown timeout prevents the process from hanging indefinitely.

Testing confirmed the following lifecycle:

```text
Graceful shutdown started
HTTP server closed
Database connection closed
```

---

## 25. PostgreSQL Connection Pool

Shaji uses the PostgreSQL `pg` driver through:

```text
@prisma/adapter-pg
```

Current baseline pool configuration:

```text
DB_POOL_MAX=10
DB_CONNECTION_TIMEOUT_MS=5000
DB_IDLE_TIMEOUT_MS=30000
DB_STATEMENT_TIMEOUT_MS=10000
DB_IDLE_TRANSACTION_TIMEOUT_MS=10000
```

These values are configurable through environment variables.

They are baseline development values and must be reviewed when deployment architecture and expected traffic are known.

---

## 26. Pool Size and Horizontal Scaling

`DB_POOL_MAX` applies per running Shaji process.

For example:

```text
1 instance x 10 connections = up to 10 connections

5 instances x 10 connections = up to 50 connections

20 instances x 10 connections = up to 200 connections
```

Production pool sizing must therefore consider:

- PostgreSQL `max_connections`;
- number of Shaji replicas;
- infrastructure-reserved connections;
- background jobs;
- administrative access;
- monitoring connections;
- expected concurrency.

For larger deployments, external pooling such as PgBouncer may be considered.

---

## 27. Database Timeouts

Shaji explicitly configures database timeouts rather than relying entirely on driver defaults.

### Connection timeout

```text
5 seconds
```

Limits how long the application waits when establishing a connection.

### Idle connection timeout

```text
30 seconds
```

Allows unused connections to be removed from the pool.

### Statement timeout

```text
10 seconds
```

Prevents unexpectedly long database statements from running indefinitely.

### Idle transaction timeout

```text
10 seconds
```

Reduces the risk of abandoned transactions remaining open and holding locks or database resources.

---

## 28. Database Session Identification

Shaji sets:

```text
application_name = shaji-api
```

for PostgreSQL sessions.

This allows operational inspection through PostgreSQL views such as:

```text
pg_stat_activity
```

Testing confirmed active Shaji sessions report:

```text
current_user       = shaji_app
current_database   = shaji
application_name   = shaji-api
statement_timeout  = 10s
idle transaction timeout = 10s
```

This improves observability during troubleshooting, monitoring, and incident response.

---

## 29. Environment Validation

Runtime configuration is validated using Zod.

The application validates:

```text
NODE_ENV
PORT
DATABASE_URL
DB_POOL_MAX
DB_CONNECTION_TIMEOUT_MS
DB_IDLE_TIMEOUT_MS
DB_STATEMENT_TIMEOUT_MS
DB_IDLE_TRANSACTION_TIMEOUT_MS
```

Invalid required configuration prevents the application from starting.

This avoids silently running with incomplete or malformed database configuration.

---

## 30. Secret Management

The following files contain local secrets and must never be committed:

```text
backend/.env
backend/.env.migration
```

Git ignore rules have been explicitly verified using:

```text
git check-ignore
```

Generated Prisma code is also excluded:

```text
backend/src/generated/prisma
```

Safe placeholder configuration is maintained using:

```text
backend/.env.example
backend/.env.migration.example
```

No real passwords should appear in:

- Git commits;
- documentation;
- pull requests;
- logs;
- screenshots;
- issues;
- CI output.

Production secrets should eventually be provided by the deployment platform's secret-management mechanism rather than committed environment files.

---

## 31. Known Software Supply-Chain Finding

During dependency review, `npm audit` reported four high-severity findings involving transitive Prisma CLI dependencies.

Observed packages included:

```text
deepmerge-ts 7.1.5
mysql2 3.15.3
```

The dependency path was traced to:

```text
prisma
|
+-- @prisma/config
|   |
|   +-- deepmerge-ts
|
+-- mysql2
```

Shaji itself uses PostgreSQL through:

```text
@prisma/client
@prisma/adapter-pg
pg
```

and does not use MySQL as its application database.

---

## 32. Supply-Chain Investigation

The finding was not automatically dismissed as development-only.

A clean dependency installation was tested using:

```text
npm ci --omit=dev
```

The vulnerable Prisma CLI dependencies were still present.

A second test used:

```text
npm ci --omit=dev --omit=peer
```

The dependencies were still present in the resulting tree.

Therefore, the current finding cannot simply be classified as absent from a default production npm installation.

---

## 33. Supply-Chain Decision

The automated command:

```text
npm audit fix --force
```

was deliberately not used.

The proposed npm remediation would downgrade Prisma from major version 7 to major version 6, creating a breaking architectural change.

Instead, the current decision is:

1. retain Prisma 7;
2. record and monitor the outstanding transitive dependency risk;
3. separate build tooling from the final runtime artifact;
4. use a multi-stage deployment build;
5. exclude Prisma CLI and unnecessary tooling from the final runtime artifact where technically possible;
6. scan the final runtime image independently;
7. confirm vulnerable build-only dependencies are not present or reachable in the deployed runtime.

The objective is not merely to produce a zero-count audit report.

The objective is to understand:

- dependency provenance;
- runtime reachability;
- exploitability;
- deployment exposure;
- available remediation;
- whether a remediation creates greater architectural risk.

---

## 34. Planned Multi-Stage Deployment Model

This is a planned deployment control and has not yet been implemented.

The intended structure is:

```text
BUILD STAGE
|
+-- full npm dependency tree
+-- Prisma CLI
+-- prisma generate
+-- migration/build tooling
+-- TypeScript compiler
|
v
Compiled application artifacts

RUNTIME STAGE
|
+-- compiled Shaji application
+-- generated Prisma Client
+-- @prisma/client
+-- @prisma/adapter-pg
+-- pg
+-- Express
+-- Helmet
+-- Pino
+-- Zod
+-- required runtime dependencies only
```

The final image will be inspected and scanned rather than assuming the multi-stage build removed unnecessary dependencies.

---

## 35. Production Database Security Considerations

Before production deployment, the database configuration must additionally address:

- TLS-encrypted PostgreSQL connections;
- production `pg_hba.conf` rules;
- network access restrictions;
- database firewall/security-group configuration;
- production credential rotation;
- secret-manager integration;
- backup policy;
- restore testing;
- monitoring and alerting;
- connection-capacity planning;
- database patch management;
- migration deployment procedures;
- privileged administrative access;
- incident-response access procedures.

Local development authentication settings must not automatically be reused as production settings.

---

## 36. Functions, Procedures, and Future Database Logic

Shaji will use database-side logic where it provides a meaningful integrity or security benefit.

Potential future uses include:

- security-event recording;
- controlled session revocation;
- consistency-sensitive state transitions;
- database-maintained timestamps;
- audit-related operations;
- privileged administrative operations where appropriate.

Database functions and procedures will not be added merely to move application logic into PostgreSQL.

Each routine should have a clear justification.

Security review should include:

```text
Who owns it?
Who can execute it?
Does it need elevated privileges?
What search path does it use?
Can inputs alter dynamic SQL?
Does it expose sensitive data?
Can it bypass Row-Level Security?
What transaction behaviour does it introduce?
```

---

## 37. Row-Level Security

PostgreSQL Row-Level Security (RLS) remains a possible future control.

It has not yet been implemented.

RLS may be useful if Shaji later requires database-enforced object-level isolation beyond standard application authorization.

It should only be introduced where the additional protection justifies the operational and development complexity.

If introduced, testing must verify both:

- application authorization; and
- PostgreSQL RLS behaviour.

---

## 38. Current Verification Results

The following controls have been tested successfully:

| Control | Result |
|---|---|
| PostgreSQL runtime role uses `shaji_app` | Pass |
| Migration role separated from runtime role | Pass |
| `shaji_app` cannot create tables | Pass |
| `shaji_app` cannot alter `users` | Pass |
| `shaji_app` cannot drop `users` | Pass |
| Runtime CRUD access works | Pass |
| Runtime cannot access `_prisma_migrations` | Pass |
| Email normalization constraint works | Pass |
| Duplicate email protection works | Pass |
| `updated_at` trigger works | Pass |
| Prisma migration history is current | Pass |
| Prisma shadow migration replay works | Pass |
| Runtime database readiness query works | Pass |
| Shaji refuses startup when PostgreSQL is unavailable | Pass |
| HTTP server does not open after DB startup failure | Pass |
| Prisma disconnects during graceful shutdown | Pass |
| PostgreSQL session reports `shaji-api` | Pass |
| Statement timeout is active | Pass |
| Idle transaction timeout is active | Pass |
| Runtime and migration `.env` files are ignored | Pass |
| Generated Prisma Client is ignored | Pass |
| Prisma Client regenerates during build | Pass |

---

## 39. Current Database Security Boundary

The current security boundary can be summarized as:

```text
                       PostgreSQL
                           |
              +------------+------------+
              |                         |
       shaji_migrator                shaji_app
              |                         |
       schema ownership              runtime only
       migrations                    CRUD
       DDL operations                no DDL
              |                         |
              +------------+------------+
                           |
                       app schema
                           |
              +------------+------------+
              |                         |
            users              _prisma_migrations
              |                         |
         runtime CRUD                migrator only
```

This design limits the authority available to the application process while preserving a controlled mechanism for schema evolution.

---

## 40. Security Principle

The database architecture follows one central rule:

> The running application should receive only the database authority required to perform its runtime responsibilities.

Prisma improves developer productivity and type-safe database access, but PostgreSQL remains an independent enforcement layer.

Shaji therefore combines application controls with database-level controls rather than relying on either layer alone.

---

## 41. Next Database Work

As authentication functionality expands, future database work is expected to include separate models for:

```text
roles and permissions
user-role assignments
email verification tokens
sessions
refresh credentials
password reset tokens
MFA credentials
recovery codes
login/security events
audit records
account lockout state
```

Each model will be reviewed for:

- ownership;
- foreign-key integrity;
- uniqueness;
- indexes;
- retention requirements;
- sensitive-data handling;
- runtime permissions;
- logging exposure;
- deletion behaviour;
- transaction requirements.

The database model will evolve alongside the Shaji threat model rather than independently from it.
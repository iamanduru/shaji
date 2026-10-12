# Shaji Registration Security Design

- **Project:** Shaji
- **Component:** Identity Registration
- **Status:** Security Design
- **Phase:** 4 — Identity & Registration

---

## 1. Purpose

Registration is the process through which Shaji creates a new identity.

Because registration creates a security principal that may later authenticate and receive access to protected resources, it is treated as a security-sensitive operation rather than a simple account-creation form.

The registration flow must ensure that:

- the client cannot assign privileges;
- identities are normalized consistently;
- duplicate identities cannot be created;
- passwords are handled securely;
- account state is controlled by the server;
- sensitive information is not exposed through responses or logs;
- malformed or malicious input is rejected before business logic executes;
- newly created identities begin in a safe state.

---

## 2. Trust Boundary

The registration client is untrusted.

Requests may originate from:

- the official Shaji frontend;
- curl;
- Postman;
- Burp Suite;
- scripts;
- automated bots;
- modified clients;
- malicious users.

Shaji must therefore never rely on the frontend to enforce security requirements.

All registration security decisions are enforced by the backend and, where appropriate, PostgreSQL.

---

## 3. Accepted Registration Input

The initial registration contract accepts only:

```text
email
password
```

No other account-security properties are accepted from the client.

For example, the following must never be accepted as client-controlled registration attributes:

```text
role
permissions
status
emailVerifiedAt
isAdmin
createdAt
updatedAt
```

If such values are submitted, they must not influence the resulting account.

---

## 4. Server-Controlled Attributes

Shaji controls the following properties:

```text
id
status
email verification state
roles
permissions
created_at
updated_at
```

This enforces the security invariant:

> Client input cannot grant privilege.

A user cannot become an administrator, activate their own account, or mark their own email as verified by modifying an HTTP request.

---

## 5. Initial Account State

A newly created identity begins with:

```text
status = PENDING_VERIFICATION
email_verified_at = NULL
```

Registration does not mean that the email address has been proven to belong to the requester.

The lifecycle begins as:

```text
Registration
     |
     v
PENDING_VERIFICATION
     |
     v
Email ownership verification
     |
     v
ACTIVE
```

The verification process will be implemented separately.

---

## 6. Registration Does Not Authenticate the User

Successful registration means only:

> A pending identity has been created.

It does not automatically mean:

```text
authenticated
email verified
session created
access token issued
refresh token issued
privileges granted
```

Authentication and session establishment remain separate security operations.

---

## 7. Email Normalization

Before an email address is used for identity lookup or persistence, Shaji will normalize it.

Initial normalization rules:

```text
trim surrounding whitespace
convert to lowercase
validate allowed format
store only the normalized value
```

Example:

```text
Input:
"  Mitchelle@Example.COM  "

Stored:
mitchelle@example.com
```

The same normalized value must be used consistently for:

- registration;
- login;
- verification;
- password recovery;
- identity lookup.

---

## 8. Database-Level Email Protection

Application normalization is reinforced by PostgreSQL.

The `users` table contains a normalization constraint conceptually equivalent to:

```sql
CHECK (
    email = lower(btrim(email))
    AND email <> ''
)
```

The email column also has a unique index.

This gives Shaji two independent controls:

```text
Application normalization
        +
Database normalization enforcement
        +
Unique identity constraint
```

The database therefore rejects non-canonical email values even if application normalization is accidentally bypassed.

---

## 9. Duplicate Identity Handling

Two accounts must not be created for the same normalized email address.

PostgreSQL provides the final integrity boundary through the unique email constraint.

The registration service must also handle duplicate-registration attempts safely.

Internally, the system may know that an identity already exists.

Externally, Shaji should avoid unnecessary confirmation of whether a particular email address belongs to an existing account.

This reduces account-enumeration opportunities.

The exact public response behaviour will be defined during endpoint implementation.

---

## 10. Password Handling

The plaintext password exists only long enough to:

```text
receive
validate
hash
discard
```

The password must never be persisted directly.

The persistence flow will be:

```text
plaintext password
       |
       v
password validation
       |
       v
Argon2id
       |
       v
password hash
       |
       v
PostgreSQL
```

Only:

```text
password_hash
```

is stored.

---

## 11. Password Data Must Never Appear In

Plaintext passwords must never appear in:

```text
database records
application logs
request logs
audit logs
error messages
URLs
Git commits
debug output
analytics systems
monitoring events
```

The current request logger deliberately does not log request bodies.

This reduces the risk of authentication secrets being copied into operational systems.

---

## 12. Password Policy

The exact password policy will be defined before password hashing is implemented.

The policy will consider:

- minimum length;
- maximum accepted length;
- rejection of empty passwords;
- resistance to trivial passwords;
- compatibility with password managers;
- denial-of-service implications of excessively large inputs;
- future compromised-password screening.

Arbitrary composition rules will not be introduced without security justification.

---

## 13. Password Hashing

Shaji will use:

```text
Argon2id
```

for password hashing.

The hashing configuration will be selected deliberately and documented separately.

The database never needs access to the plaintext password.

Password verification will compare user-supplied input against the stored Argon2id hash.

---

## 14. Strict Request Validation

Registration input will be validated using Zod before reaching registration business logic.

The request schema will:

- accept only expected fields;
- validate email structure;
- validate password requirements;
- reject malformed values;
- enforce field-size limits;
- prevent client-controlled security state.

This provides a clear trust boundary between untrusted HTTP input and application logic.

---

## 15. Unknown Fields

The registration contract is intentionally small.

The client is expected to provide:

```json
{
  "email": "user@example.com",
  "password": "..."
}
```

Requests attempting to provide security-sensitive properties such as:

```json
{
  "email": "user@example.com",
  "password": "...",
  "role": "ADMIN",
  "status": "ACTIVE"
}
```

must not result in those properties being accepted.

Role assignment and account state remain server-controlled operations.

---

## 16. Privilege Injection

A key registration threat is privilege injection.

Example attack:

```text
POST /auth/register

{
  "email": "attacker@example.com",
  "password": "...",
  "role": "ADMIN"
}
```

The attacker may attempt to bypass the frontend and send unauthorized fields directly.

Control:

```text
strict request schema
+
server-controlled roles
+
server-controlled account state
```

The registration endpoint must never derive authorization privileges from registration input.

---

## 17. SQL Injection

Registration values eventually reach PostgreSQL.

Database access will be performed through Prisma parameterized operations rather than dynamically concatenated SQL strings.

The security model is:

```text
Untrusted input
      |
      v
Zod validation
      |
      v
application logic
      |
      v
Prisma parameterized query
      |
      v
PostgreSQL
```

Raw SQL involving user-controlled input must not be constructed through string concatenation.

---

## 18. Oversized Input

The Shaji HTTP layer already limits JSON request bodies.

Current baseline:

```text
100kb
```

Registration will also apply field-specific constraints.

This prevents excessively large email or password values from reaching deeper application layers unnecessarily.

Password-hashing operations are particularly important to bound because hashing algorithms are intentionally computationally expensive.

---

## 19. Account Enumeration

Registration may reveal whether an identity already exists if responses differ too clearly between:

```text
new email
existing email
```

This can allow attackers to build lists of registered users.

The registration API will therefore avoid exposing more identity-state information than necessary.

Response behaviour will be designed alongside:

- login;
- password recovery;
- email verification;
- resend-verification flows.

Enumeration resistance must be considered across the entire identity lifecycle rather than only one endpoint.

---

## 20. Mass Registration and Automated Abuse

Attackers may automate registration to:

- create large numbers of accounts;
- consume email-verification capacity;
- consume password-hashing resources;
- create spam identities;
- abuse downstream workflows.

Planned controls include:

```text
rate limiting
monitoring
security-event logging
potential abuse detection
```

These controls will be introduced as the registration flow matures.

---

## 21. Logging Rules

Registration logs may contain operational metadata such as:

```text
request ID
route
HTTP method
status
duration
security-event classification
```

They must not contain:

```text
plaintext password
password hash
verification token
authorization header
cookie
session credential
```

Email-address logging will also be minimized where full identity values are unnecessary.

---

## 22. Error Handling

Registration errors must use the centralized Shaji error-handling system.

Internal errors such as:

```text
database errors
Prisma errors
constraint details
stack traces
filesystem paths
internal implementation details
```

must not be returned directly to API clients.

The external API should return controlled error structures.

Detailed internal errors may be logged server-side where appropriate, provided sensitive authentication data is excluded.

---

## 23. Registration Response

A successful registration response must not return sensitive internal fields.

For example, it must never return:

```text
password_hash
internal database credentials
verification-token secrets
security metadata not required by the client
```

The response should expose only the minimum information required for the registration workflow.

The final response contract will be defined when the endpoint is implemented.

---

## 24. Registration Threat Model

The initial registration threats are:

| Threat | Example | Planned Control |
|---|---|---|
| Privilege injection | Client submits `role=ADMIN` | Strict request schema and server-controlled roles |
| Client-controlled account state | Client submits `status=ACTIVE` | Server-controlled account lifecycle |
| Duplicate identity | Same email registered twice | Email normalization and PostgreSQL UNIQUE |
| Case-variant identity | `A@example.com` and `a@example.com` | Lowercase normalization and database CHECK |
| Password disclosure | Raw password reaches storage/logs | Argon2id and secret-safe logging |
| SQL injection | Malicious database input | Validation and Prisma parameterization |
| Oversized request | Extremely large payload | HTTP body limit and field limits |
| Account enumeration | Response confirms registered identity | Controlled external responses |
| Automated registration | Bot creates many identities | Rate limiting and monitoring |
| Error leakage | Database details returned to client | Centralized error handling |
| Secret logging | Password appears in logs | No request-body/auth-secret logging |

---

## 25. Threat-to-Control Mapping

The registration security design follows the broader Shaji model:

```text
Threat
   |
   v
Preventive control
   |
   v
Detective control
   |
   v
Test
```

Example:

```text
Privilege injection
        |
        v
Strict Zod request schema
        |
        v
Server-controlled role assignment
        |
        v
Automated test:
client sends role=ADMIN
        |
        v
account receives no elevated privilege
```

Security requirements defined here will become automated tests during implementation.

---

## 26. Database Role Boundary

Registration executes through:

```text
shaji_app
```

The runtime role can perform required CRUD operations but cannot:

```text
ALTER TABLE
DROP TABLE
CREATE TABLE
change database schema
access Prisma migration history
```

Therefore, even if registration code is compromised, the database credentials available to the running API do not provide schema-management authority.

---

## 27. Registration Database Transaction

Creating a user is expected to be an atomic database operation.

As registration expands to include related records, transactions may be required to ensure that identity creation cannot leave partially-created security state.

Examples may later include:

```text
user
+
email verification record
+
security event
```

If multiple records must succeed together, they should be created within an appropriate transaction boundary.

---

## 28. Initial Registration Security Invariants

The following invariants apply:

### REG-SI-01

Plaintext passwords must never be persisted.

### REG-SI-02

The client cannot assign roles or permissions.

### REG-SI-03

The client cannot mark its own account as verified.

### REG-SI-04

The client cannot select its initial account state.

### REG-SI-05

Email addresses must be stored in canonical form.

### REG-SI-06

Two users cannot share the same canonical email address.

### REG-SI-07

Registration does not automatically authenticate the user.

### REG-SI-08

Registration does not automatically create a session.

### REG-SI-09

Passwords and authentication secrets must not be logged.

### REG-SI-10

Invalid input must be rejected before persistence.

### REG-SI-11

Database constraints remain authoritative for identity integrity.

### REG-SI-12

Registration responses must not expose internal security state unnecessarily.

---

## 29. Initial Registration Contract

The intended first registration request is:

```json
{
  "email": "user@example.com",
  "password": "user-supplied-secret"
}
```

The resulting identity is conceptually:

```text
id                  = generated by database
email               = normalized email
password_hash       = Argon2id hash
status              = PENDING_VERIFICATION
email_verified_at   = NULL
created_at          = database generated
updated_at          = database generated
```

No role or privilege is derived from client input.

---

## 30. Security Testing Requirements

The eventual registration implementation must include tests covering at least:

```text
valid registration
invalid email
empty email
email normalization
duplicate email
mixed-case duplicate email
missing password
weak/invalid password
oversized password
unexpected fields
attempted role injection
attempted status injection
database constraint failure
password not returned
password hash not returned
plaintext password not logged
registration without automatic session
```

Additional abuse and rate-limit tests will be introduced when those controls are implemented.

---

## 31. Planned Registration Flow

The intended flow is:

```text
Untrusted HTTP request
        |
        v
body-size limit
        |
        v
Zod registration schema
        |
        v
normalize email
        |
        v
validate password
        |
        v
Argon2id hash
        |
        v
registration service
        |
        v
Prisma
        |
        v
PostgreSQL constraints
        |
        v
PENDING_VERIFICATION identity
        |
        v
controlled API response
```

Email verification follows as a separate security flow.

---

## 32. Implementation Sequence

The registration implementation will proceed in the following order:

```text
4.1 Registration security design
4.2 Registration request schema
4.3 Email normalization
4.4 Password policy
4.5 Argon2id password hashing
4.6 User repository/service
4.7 POST /auth/register
4.8 Duplicate-account handling
4.9 Secure response design
4.10 Registration testing
```

Security controls will therefore be introduced deliberately rather than added retrospectively after the endpoint is already functional.

---

## 33. Design Principle

The central registration principle is:

> Registration creates an identity. It does not grant trust.

The user may provide information needed to request an identity, but Shaji remains responsible for deciding:

```text
how the identity is represented
how credentials are protected
what state the account begins in
whether ownership has been verified
what privileges the identity receives
when the identity may authenticate
```

This separates user-supplied identity claims from server-controlled security decisions.
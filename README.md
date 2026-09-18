# Shaji

Shaji is a production-oriented Identity and Access Management system designed to explore secure authentication, authorization, session management, account recovery, MFA, threat modelling, and DevSecOps practices.

## Project Objective

The project focuses on answering:

> How can authentication be designed and operated securely rather than simply making login work?

Shaji will be developed incrementally, with security requirements, threat modelling, testing, and documentation integrated throughout the development lifecycle.

## Planned Technology Stack

* React
* TypeScript
* Node.js
* Express
* PostgreSQL
* Prisma
* Redis
* Argon2id
* Zod
* Docker
* GitHub Actions
* AWS

## Initial Scope

The first version will focus on:

* Secure user registration
* Email verification
* Password authentication
* Account state management
* Session management
* Basic role-based authorization
* Protected user resources
* Secure logout and session revocation
* Security-focused testing

## Security Approach

The project is being designed using:

* Threat modelling
* STRIDE analysis
* Least privilege
* Default-deny authorization
* Server-side validation
* Secure password handling
* Database integrity controls
* Security invariants
* Threat-to-control-to-test mapping

## Current Status

* Phase 0 — Requirements: Complete
* Phase 1 — Threat Modelling: Complete
* Phase 2 — GitHub and Engineering Workflow: In Progress

## Project Structure

The planned repository structure is:

```text
Shaji/
├── backend/
├── frontend/
├── docs/
├── .github/
├── .gitignore
└── README.md
```

The structure will be created progressively as each project phase is implemented.

## Development Workflow

Shaji uses the following branch strategy:

```text
main
 ↑
develop
 ↑
feature/*
```

Feature development will occur on dedicated branches before integration into `develop` and eventual promotion to `main`.

## Documentation

Technical documentation will cover:

* Architecture
* Authentication flows
* Authorization model
* Database design
* Threat model
* Security controls
* Testing strategy
* Deployment
* Incident response
* Architecture Decision Records

## Status

Shaji is currently under active development.

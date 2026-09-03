# YHCT SOCIAL v2 Implementation Plan

**Goal:** Build canonical YHCT SOCIAL modular PWA, role-aware operations planes, versioned API and provider-independent production data/auth boundary; keep existing production available until live cutover gates pass.

**Current milestone:** v2.5 Auth & Governance Hardening.

Tasks include social core, 159 normalized club members, ADMIN-exclusive Control Center, SUPER_MOD/MOD operator consoles, 2D YHCT UI, official-only seed content, first-login password change, signed sessions, server-side role policies, portable PostgreSQL schema, versioned REST API, production browser bundle without member-directory leakage, and Google-owned cutover verification.

Rules: preserve beta1.2 interaction contracts; no secrets/plaintext production passwords in source; preview → verification → production; production cutover requires live data/auth/media reconciliation, role smoke tests and rollback evidence.

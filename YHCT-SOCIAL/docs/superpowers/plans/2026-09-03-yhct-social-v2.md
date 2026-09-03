# YHCT SOCIAL v2 Implementation Plan

**Goal:** Build canonical YHCT SOCIAL v2 modular PWA and admin recovery plane, then deploy preview using Vercel project `yhct-social`.

**Architecture:** Modular frontend with provider-independent adapters. Social domain logic is isolated from rendering so future REST/Google backend migration does not require rewriting UI.

**Tech Stack:** HTML5, CSS, ES modules, Node.js test runner, Vercel static hosting/PWA.

**Tasks:**
- Core adapter and social domain.
- Feed, community, discovery, profile, notification modules.
- Independent admin recovery plane.
- PWA/service worker and deployment configuration.
- GitHub/Vercel synchronization and smoke testing.

**Rules:**
- Preserve beta1.2 interaction contracts.
- No secrets in source.
- Test before production.
- Production cutover requires live verification.

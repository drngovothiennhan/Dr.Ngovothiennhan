# YHCT SOCIAL v2.6 Role + UI Refresh

Source: DS CLB YHCT.xlsx

- 159 unique accounts
- ADMIN: 1
- SUPER_MOD: 2
- MOD: 7
- MEMBER: 149

UI direction:
- Preserve Beta1.2 information architecture
- Refresh YHCT identity using custom line icons
- Herbal/paper/jade palette
- Keep font stack Vietnamese-safe

Migration:
- database/004_management_role_refresh.sql
- Run after 003_seed_club_members.sql

Conflicts retained in audit; no phone data exported to client.

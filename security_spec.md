# SERD Firestore Security Specification

## 1. Data Invariants
- **User Ownership & Isolation**: A user document under `/users/{userId}` can only be read by the authenticated owner (`request.auth.uid == userId`) or authorized administrative/dispatch personnel. Unauthenticated or foreign users cannot access other users' personal medical records or emergency circles.
- **Identity Integrity**: Users can only create or update their own profile `/users/{userId}` where `userId == request.auth.uid`. A user cannot overwrite another user's profile.
- **Incident Dispatch Authenticity**: Emergency incidents under `/incidents/{incidentId}` must be created by an authenticated user with valid schema fields (code, type, priority, location, status).
- **Incident State Progression**: Incidents cannot have invalid states or arbitrary field injection. Status updates are restricted to valid dispatch lifecycle states (`pending`, `dispatched`, `en_route`, `on_scene`, `cancelled`).
- **Catalog Integrity**: The `/allergies_catalog` master list can be read by authenticated users, and additions must be validated against string size limits to prevent Denial of Wallet resource attacks.
- **Default Deny**: Any path not explicitly matched is denied.

## 2. The "Dirty Dozen" Payloads (Designed to Fail)
1. **Unauthenticated User Profile Read**: Anonymous/unauthenticated `get /users/user_123` -> PERMISSION_DENIED.
2. **Foreign User Profile Overwrite**: User `attacker_456` attempts `set /users/victim_123` -> PERMISSION_DENIED.
3. **Role Elevation Attack**: Citizen user sends `{ role: "admin", isAdmin: true }` in their own user doc update -> PERMISSION_DENIED.
4. **Huge Payload ID Poisoning**: Create document with ID of 500 characters containing shell/sql injection characters -> PERMISSION_DENIED.
5. **Denial of Wallet String Injection**: An incident with a 500KB details field -> PERMISSION_DENIED.
6. **Ghost Field / Shadow Update**: Updating an incident with `{ secretBackdoor: true }` -> PERMISSION_DENIED.
7. **Invalid Incident Priority**: Incident created with priority `"super_apocalypse"` -> PERMISSION_DENIED.
8. **Invalid Incident State Transition**: Changing status from `"cancelled"` to an unauthorized state -> PERMISSION_DENIED.
9. **Unauthenticated Incident Injection**: Unauthenticated client attempting `addDoc(/incidents)` -> PERMISSION_DENIED.
10. **Foreign Safety Broadcast Deletion**: User `user_b` attempting `delete /safetyBroadcasts/broadcast_a` -> PERMISSION_DENIED.
11. **Malicious Catalog Injection**: Attempting to write non-string or 100KB payload into `/allergies_catalog` -> PERMISSION_DENIED.
12. **Catch-All Root Collection Scraping**: Querying arbitrary unpublished collections like `/_admin_secrets` or `/system` -> PERMISSION_DENIED.

## 3. Test Runner
Payload verification tests assert that all 12 malformed or unauthorized write/read attempts fail with PERMISSION_DENIED against `firestore.rules`.

# One-time secret sharing — design

**Status:** proposed, not implemented. Nothing in this document exists in code yet.
**Date:** 2026-08-12
**Decisions by:** repository owner, recorded from a design session.

This is the document the security and privacy pages should later be written from.
If the two ever disagree, this one is wrong and needs updating — the public pages
must never claim more than what is built here.

---

## 1. What this is

A way to hand someone a credential without leaving it in a chat log forever.

The sender writes a short record — a password or API key, plus enough context to
know what it is for — and gets back a link. The recipient opens the link, clicks
once to reveal, and the secret is destroyed. The server stores only ciphertext it
cannot read.

### What this is not

**Not a vault.** WoolKey does not become a place to keep credentials. Everything
expires. There is no long-term storage of anything a user would be upset to lose,
and no ambition to compete with Bitwarden or 1Password.

**Not a file host.** Text only, up to 100 KB. No uploads, no attachments, no MIME
handling, no malware scanning problem.

**Not recoverable by us.** We hold no key that opens user data. That is the point,
and it is also a support burden we are accepting deliberately.

---

## 2. Decisions

Each of these was chosen explicitly. The rationale matters more than the choice —
if a rationale stops being true, revisit the decision.

| Decision | Choice | Why |
|---|---|---|
| Encryption model | Client-side end-to-end | Encryption at rest still lets the operator read everything. Only a key that never reaches the server achieves the goal. |
| Payload | Structured record, ≤ 100 KB | A bare password lacks context. Encrypting `{title, url, notes, secret}` costs nothing extra and is a better product. |
| Accounts | Yes, from the start | Owner's call. Enables higher limits, history, notifications, revocation. |
| Anonymous sending | Allowed, tightly capped | Keeps the try-before-signup path. Caps and rate limits contain the abuse surface. |
| Login | Master password, two-value derivation | Proven (Bitwarden model), no third-party dependency, no key escrow. |
| Passkeys | Phase 3, optional | WebAuthn PRF becomes another wrapper around the same account key. Support is still uneven; not a launch blocker. |
| Forgotten password | Recovery codes, no reset | We cannot reset what we cannot read. Codes wrap the account key and are shown once. |
| Sender re-reading a sent secret | Not possible | Strongest reading of "one-time". A compromised account exposes no secret contents. |
| Burn trigger | Explicit `POST`, never a `GET` | Link scanners in Outlook, Slack, Teams and antivirus preload URLs. A burn-on-`GET` design destroys secrets before the recipient arrives. |
| Expiry | Always, in addition to read count | Bounds how long anything sits on the server, read or not. |
| Read notification | Registered senders only | Anonymous shares then hold no personal data at all. |
| Backups | Secrets excluded | A burned secret must not survive in last night's snapshot. |
| Session key handling | `sessionStorage` + auto-lock | Re-entering the master password on every refresh is hostile. Accepted trade recorded in §4. |
| Hosting | cPanel, for now | Adequate to build on. Revisit before launch — see §11. |
| Email | Behind a swappable interface | Shared-host deliverability is unreliable; provider must be a config change. |
| Served-JS risk | Documented, plus SRI | Cannot be eliminated in a web app. See §4. |

---

## 3. Key hierarchy

Two independent hierarchies. This is the part to get right first, because data
encrypted under the wrong key cannot be migrated later without the user present.

```
ACCOUNT — only the user can open this
────────────────────────────────────────────────────────────────
  masterPassword                          never transmitted, ever
      │
      ├── PBKDF2-SHA256(pw, salt = lowercase(email), 600 000)
      │        └──► masterKey (256-bit)          stays in the browser
      │                 │
      │                 ├── PBKDF2-SHA256(masterKey, salt = pw, 1)
      │                 │        └──► authHash   ──► sent to server
      │                 │                            stored as argon2id(authHash)
      │                 │
      │                 └── wraps ──► accountKey
      │
      └── accountKey (random 256-bit)      the key that actually matters
               ├── wrapped by masterKey            → normal unlock
               ├── wrapped by each recovery code   → recovery
               └── wrapped by passkey PRF output   → phase 3

SHARE — the recipient must open this, and has no account
────────────────────────────────────────────────────────────────
  secretKey  = random 256-bit, one per secret
  ciphertext = AES-256-GCM(record, secretKey, random 96-bit IV)
  link       = https://woolkey.com/s/<id>#<base64url(secretKey)>
```

### Why the account key is wrapped rather than used directly

Changing a master password re-wraps one 32-byte key instead of re-encrypting
every record. It is also what makes recovery codes and passkeys possible — each
is just another wrapper around the same `accountKey`. A useful consequence:
**recovery codes keep working after a password change**, because `accountKey`
itself does not rotate.

### Why a share cannot use the sender's account key

The recipient has no account and no way to derive it. Every share therefore gets
its own random key, and that key travels in the URL fragment — everything after
`#` is never sent in an HTTP request. That is browser behaviour, not a promise we
have to keep.

### Consequence: the sender's own history

Because the per-secret key is wrapped nowhere, **the sender cannot read back even
the title of what they sent** — it is inside the ciphertext.

To keep history useful, store a second small blob alongside each secret: a
sender-chosen label encrypted under `accountKey`. The sender sees
"Staging DB password — read 3 hours ago" without being able to reveal the secret
itself. Anonymous senders have no `accountKey` and therefore no label.

### Note on using the email address as KDF salt

A salt should ideally be random. Using the email makes it predictable, so an
attacker targeting a known person can precompute against a weak master password.
The alternative — the server returning a random per-account salt — leaks whether
an account exists, which is worse.

We take Bitwarden's approach and accept the predictable salt. This makes master
password strength load-bearing, so **the signup form should offer a generated
passphrase from WoolKey's own generator** rather than leaving users to invent one.

---

## 4. Threat model

### Protects against

- Server compromise or a stolen database dump — attacker gets ciphertext and no keys
- A curious or compelled operator — we cannot decrypt user data, now or later
- The secret outliving its purpose in a chat log, inbox, or ticket
- Silent interception — an unexpected "already viewed" tells the sender the link leaked
- Link scanners destroying secrets before delivery — handled by click-to-reveal

### Explicitly does **not** protect against

Listing these is the point of the section. Each is a real limitation.

- **Malicious or compromised delivery of our own JavaScript.** We serve the code
  that does the decryption. A compromised server could ship code that exfiltrates
  keys. This affects every browser-based E2EE product. Mitigated by a strict CSP,
  SRI, and published build hashes; eliminated only by moving the crypto out of the
  browser — see §12 on the CLI.
- **Anyone who obtains the link before the recipient.** The link *is* the
  credential. An optional per-link passphrase would fix this and is deferred (§13).
- **A compromised recipient device**, or a recipient who screenshots, forwards, or
  pastes the secret somewhere else.
- **Targeted offline attack on a weak master password**, given the predictable
  salt described in §3.
- **Metadata.** We know when secrets are created and read, how large they are, and
  from which IP ranges. We cannot see contents, but the pattern is visible.
- **XSS in our own application.** While unlocked, the account key sits in
  `sessionStorage`. Any script execution in our origin can read it. This is the
  cost of the auto-lock decision, and it makes the existing `script-src 'self'`
  policy load-bearing rather than merely nice. Never add `unsafe-inline` to it.
- **Future legal compulsion.** We cannot be made to decrypt past secrets, but we
  could in principle be compelled to serve modified code going forward.

---

## 5. Data model

MySQL. No database exists on the host yet; one must be created in cPanel.

The split between `secrets` and `secret_meta` exists solely so backups can include
history while excluding content — see §8.

```sql
users
  id                     BINARY(16) PK
  email                  VARCHAR(254) UNIQUE
  email_verified_at      DATETIME NULL
  auth_hash              VARCHAR(255)        -- argon2id(authHash from client)
  kdf                    VARCHAR(32)         -- 'pbkdf2-sha256'
  kdf_iterations         INT                 -- per user, so it can be raised later
  encrypted_account_key  VARBINARY(255)
  account_key_iv         BINARY(12)
  created_at, updated_at DATETIME
  deleted_at             DATETIME NULL

recovery_codes
  id                     BINARY(16) PK
  user_id                BINARY(16) FK
  code_hash              VARCHAR(255)        -- argon2id, never the code itself
  encrypted_account_key  VARBINARY(255)      -- accountKey wrapped by this code
  iv                     BINARY(12)
  used_at                DATETIME NULL

secret_meta                                  -- backed up; no content
  id                     BINARY(16) PK       -- opaque, 128-bit, base64url in URLs
  user_id                BINARY(16) NULL     -- NULL for anonymous
  label_ciphertext       VARBINARY(512) NULL -- encrypted under accountKey
  label_iv               BINARY(12) NULL
  expires_at             DATETIME
  reads_total            SMALLINT
  reads_remaining        SMALLINT
  notify_on_read         BOOLEAN
  alg_version            TINYINT             -- see §10
  created_at             DATETIME
  burned_at              DATETIME NULL
  revocation_token_hash  VARCHAR(255) NULL   -- anonymous revocation

secrets                                      -- NEVER backed up
  secret_id              BINARY(16) PK FK
  ciphertext             MEDIUMBLOB
  iv                     BINARY(12)

secret_events                                -- backed up; timing only
  id                     BIGINT PK
  secret_id              BINARY(16)
  event                  ENUM('created','revealed','expired','revoked')
  at                     DATETIME
  ip_hash                BINARY(32)          -- salted hash, never a raw IP
```

Deleting a row from `secrets` while keeping `secret_meta` is what lets a used link
report "already viewed" rather than "never existed" — see §7.

---

## 6. Endpoints

Sharing, on the main site so the fragment reaches the page that needs it:

| Method | Path | Auth | Notes |
|---|---|---|---|
| `POST` | `/api/secrets` | optional | Create. Returns `id` and, for anonymous, a one-time revocation token |
| `GET` | `/api/secrets/{id}` | none | **Metadata only.** Exists / expired / reads left. Never returns ciphertext |
| `POST` | `/api/secrets/{id}/reveal` | none | Atomically decrements and returns the ciphertext once |
| `DELETE` | `/api/secrets/{id}` | owner or token | Revoke before it is read |

Accounts:

| Method | Path | Notes |
|---|---|---|
| `POST` | `/api/auth/register` | Stores `authHash`, `encrypted_account_key`, recovery code wrappers |
| `POST` | `/api/auth/verify-email` | |
| `POST` | `/api/auth/prelogin` | Returns KDF params for an email. **Must return plausible deterministic params for unknown addresses**, or it becomes an account-enumeration oracle |
| `POST` | `/api/auth/login` | `authHash` in, session out |
| `POST` | `/api/auth/password-change` | Re-wraps `accountKey`; invalidates other sessions |
| `POST` | `/api/auth/recover` | Recovery code in, `accountKey` unwrapped, new password set |
| `GET` | `/api/account/secrets` | History: metadata plus encrypted labels |
| `DELETE` | `/api/account` | Erasure — see §9 |

The existing generator API at `api.woolkey.com` is untouched by all of this.

---

## 7. The reveal flow

The only genuinely tricky piece of server logic. It must be atomic, or two
simultaneous requests both get the secret.

```sql
UPDATE secret_meta
   SET reads_remaining = reads_remaining - 1,
       burned_at = IF(reads_remaining - 1 <= 0, NOW(), burned_at)
 WHERE id = ?
   AND reads_remaining > 0
   AND expires_at > NOW();
```

Return the ciphertext only if this affected exactly one row. When
`reads_remaining` hits zero, delete the `secrets` row in the same transaction —
the content is gone at that moment, not on a later sweep.

Sequence:

1. Recipient opens `/s/<id>#<key>` — page loads, `GET` fetches metadata only.
   Nothing is destroyed. A link scanner stops here harmlessly.
2. Page shows what is on offer: reads remaining, expiry, and a Reveal button.
3. Reveal issues the `POST`. Server burns and returns ciphertext.
4. Browser decrypts using the fragment and displays the record.
5. Page calls `history.replaceState` to strip the fragment, so the key does not
   linger in browser history.

### "Already viewed" versus "not found"

**Recommendation: distinguish them.** Confirming that a secret once existed is a
minor leak. An unexpected "already viewed" is the signal that tells a sender their
link was intercepted, which is a large part of what makes one-time sharing worth
having. `secret_meta` outliving `secrets` is what makes this possible.

---

## 8. Limits, retention, backups

| | Anonymous | Account |
|---|---|---|
| Max payload | 4 KB | 100 KB |
| Max TTL | 24 hours | 30 days |
| Max reads | 1 | 10 |
| Creates per hour per IP | 5 | 100 |
| Read notification | — | yes |
| Revocation | one-time token | from history |
| Sender label | — | yes |

**Backups include** `users`, `recovery_codes`, `secret_meta`, `secret_events`.
**Backups exclude** `secrets`. A restore therefore loses in-flight content — which
is ephemeral by definition — while preserving accounts and history. This is what
allows the security page to say a burned secret is gone without an asterisk.

Note that `secret_events` reveals timing patterns even though it holds no content.

Expired rows are swept by cron, with opportunistic cleanup on write as a fallback,
mirroring how the existing rate limiter already garbage-collects.

---

## 9. Abuse, legal, and operations

### Abuse

Anonymous sending means a link on `woolkey.com` carries our domain's reputation,
which is exactly what a phisher wants.

- Anonymous senders must not influence the URL slug — opaque random IDs only
- Rate limits per IP, plus a global ceiling
- An `abuse@` address and a documented takedown path, published before launch
- We can delete a reported secret without being able to read it, which is the
  right answer to give a reporter

### Legal

The operator is a BV, so GDPR applies and this feature is the point at which
WoolKey starts processing personal data.

- Lawful basis for account email and hashed IPs
- Privacy policy rewritten — the current "nothing is stored" is already narrowed
  for the API and will need narrowing again
- Right to erasure: `DELETE /api/account` must actually delete, not soft-delete,
  and must remove `secret_meta` rows
- Breach notification duty, with a documented procedure
- Terms of service, which do not exist today

### Operations

Confirmed on the host:

| | |
|---|---|
| PHP | 8.3.33 |
| `password_hash` algorithms | **argon2id available** |
| `sodium` | **not available** — use `openssl`, or WebCrypto client-side |
| `post_max_size` | 8 MB, ample for 100 KB payloads |
| MySQL | available; **no database created yet** |
| Disk | 30 MB used of 30 GB |
| Cron | `crontab` present, none configured. cPanel's `Cron` UAPI module is **not** installed, so schedule it over SSH rather than through the API |

Browsers have PBKDF2 natively but **not Argon2id**. Client-side Argon2 needs a
~40 KB wasm blob, which is more served code to trust and cuts against §4. Start
with PBKDF2-SHA256 at 600 000 iterations, stored per user so it can be raised.

---

## 10. Crypto agility

Every encrypted blob carries `alg_version`. We cannot re-encrypt data we cannot
read, so changing a cipher or KDF means clients re-wrap on next login, and old
versions must stay readable until every user has been through that path.

Getting this wrong is expensive and cannot be fixed server-side. It costs one
column now.

---

## 11. Build order

The release includes accounts, per the owner's decision. This is implementation
sequencing, not a staged launch.

1. **Crypto core** — key derivation, wrapping, AES-GCM record format, `alg_version`.
   Test vectors first; everything else depends on this being right.
2. **Schema and migrations** — including the backup split.
3. **Anonymous sharing** — create, metadata, atomic reveal, TTL, revocation token.
   End to end and testable without any account code.
4. **Accounts** — register, verify, prelogin, login, sessions, auto-lock.
5. **Recovery codes** — generation, one-time display, unwrap-and-reset.
6. **Account features** — history with encrypted labels, higher limits,
   notifications, revocation from history.
7. **Legal and public pages** — privacy, terms, security, abuse.

Honest scoping: the encryption is roughly 20% of this. Accounts, email, deletion,
the anonymous tier, and the legal pages are the rest. This is a multi-week piece
of work, not a weekend.

Item 1 is worth reviewing before anything is built on top of it.

---

## 12. Later, not now

- **CLI tool.** The genuine answer to §4's served-JavaScript problem: versioned,
  checksummed, installed deliberately, not re-fetched per visit. Fits the existing
  API and developer audience better than a browser extension would, and is far
  cheaper to build.
- **Passkeys.** Another wrapper around `accountKey` via WebAuthn PRF.
- **Optional per-link passphrase.** Makes an intercepted link useless on its own.
  The highest-value deferred item, and worth pulling forward if this is used for
  anything sensitive.

---

## 13. Open questions

- Email provider. Interface is swappable by decision; the actual choice is unmade,
  and verification mail landing in spam is a launch blocker.
- Whether cPanel is still the right home at launch. It is fine to build on, but
  manual tar deploys, hand-run backups and no monitoring are thin once real users
  depend on this and we hold their accounts.
- Whether the rate limiter moves from temp files to the database, now that one
  exists.
- Session lifetime and auto-lock default.
- Whether anonymous sending survives contact with the first abuse report.

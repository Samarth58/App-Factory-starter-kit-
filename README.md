# App Factory Backend Starter Kit

A production-grade, modular Node.js / Fastify backend substrate designed to serve as a reliable, secure, and extensible foundation for manufacturing backend applications in the App Factory pipeline.

---

## 1. System Overview

The **App Factory Backend Starter Kit** provides a battle-tested architecture featuring **Fastify v5**, **TypeScript v5** (`NodeNext`), **PostgreSQL**, **Drizzle ORM**, **Zod**, **Argon2id**, and a **dual-token JWT authentication system** with PostgreSQL-backed session rotation and replay detection.

### Core Stack & Technologies
- **Runtime & Web Framework**: [Node.js](https://nodejs.org/) v20+ / v22+ (ES Modules), [Fastify](https://fastify.dev/) `v5.2.1`
- **Language**: [TypeScript](https://www.typescriptlang.org/) `v5.8.2` (Strict mode, `NodeNext` module resolution)
- **Database & ORM**: [PostgreSQL](https://www.postgresql.org/) v14+, [pg](https://node-postgres.com/) `v8.16.3` (Connection pool), [Drizzle ORM](https://orm.drizzle.team/) `v0.44.5` & [Drizzle Kit](https://orm.drizzle.team/kit-docs/overview) `v0.31.4`
- **Request Validation & Schemas**: [Zod](https://zod.dev/) `v3.24.2`
- **Password Hashing**: [Argon2id](https://github.com/ranisalt/node-argon2) (`argon2: ^0.41.1`)
- **Authentication & Sessions**: [jsonwebtoken](https://github.com/auth0/node-jsonwebtoken) `v9.0.2` (15-minute Access JWTs, 30-day Refresh JWTs, single-use session rotation, 20-second concurrency grace window, token theft revocation)
- **Authorization & RBAC**: Role-Based Access Control (`user` and `admin` roles, `authGuard`, `adminGuard`, IDOR ownership checks)
- **API Documentation**: OpenAPI 3.0.3 specification and interactive UI via `@fastify/swagger` `v9.9.1` and `@fastify/swagger-ui` `v6.1.1` mounted at `/docs` and `/docs/json`
- **Rate Limiting**: Centralized and route-level rate limiting via `@fastify/rate-limit` `v11.2.0`
- **Domain Architecture**: Canonical modular domain structure demonstrated by `src/modules/example/`
- **Testing**: [Vitest](https://vitest.dev/) `v3.2.4` with multi-layer test database isolation safety guards

---

## 2. Architecture & Request Flow

Every incoming HTTP request flows through a centralized pipeline ensuring observability, rate-limit enforcement, authentication, role-based authorization, schema validation, and standardized envelope responses:

```mermaid
sequenceDiagram
    autonumber
    participant C as Client
    participant F as Fastify Core & Plugins
    participant G as Guards (authGuard / adminGuard)
    participant R as Route Handler (Zod Parse)
    participant S as Service Layer
    participant D as PostgreSQL (Drizzle ORM)

    C->>F: HTTP Request (Headers + Body)
    Note over F: Assign / Validate x-request-id<br/>Rate Limiting check (@fastify/rate-limit)
    
    alt Rate Limit Exceeded
        F-->>C: 429 RATE_LIMIT_EXCEEDED (fail envelope)
    end

    F->>G: Route preHandler Hook
    alt Protected Route (authGuard)
        G->>G: Verify Access JWT (typ: 'access')
        G->>D: Verify user exists & deletedAt IS NULL
        alt Invalid / Expired / Deleted User
            G-->>C: 401 UNAUTHORIZED (fail envelope)
        end
        alt Admin Route (adminGuard)
            G->>G: Verify user.role === 'admin'
            alt Non-Admin User
                G-->>C: 403 FORBIDDEN (fail envelope)
            end
        end
        G->>R: Attach request.userId
    end

    R->>R: Zod safeParse(body, query, params)
    alt Validation Failed
        R-->>C: 400 VALIDATION_ERROR (issues array)
    end

    R->>S: Execute Service Call (userId, validatedData)
    S->>D: Drizzle Query / Transaction (Tenant Isolated)
    D-->>S: Query Results
    S-->>R: Domain Result + Pagination Meta
    R-->>C: 200/201 ok(data, meta) + x-request-id Header
```

---

## 3. Standardized Response Envelopes & Error Codes

All HTTP endpoints return responses formatted using standardized envelopes exported from `src/utils/response.ts`.

### Success Envelope (`ok(data, meta?)`)
```typescript
import { ok } from '../utils/response.js';

// Without pagination meta
return reply.status(200).send(ok(data));

// With pagination meta
return reply.status(200).send(ok(items, meta));
```

**JSON Structure:**
```json
{
  "success": true,
  "data": { ... },
  "meta": {
    "nextCursor": "eyJpZCI6IjEyMyJ9",
    "hasMore": true,
    "limit": 20
  }
}
```

### Error Envelope (`fail(code, message, details?)`)
```typescript
import { fail } from '../utils/response.js';

return reply.status(400).send(
  fail('VALIDATION_ERROR', 'Invalid request body', parsed.error.issues)
);
```

**JSON Structure:**
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid request body",
    "details": [
      {
        "code": "too_small",
        "minimum": 8,
        "type": "string",
        "inclusive": true,
        "exact": false,
        "message": "String must contain at least 8 character(s)",
        "path": ["password"]
      }
    ]
  }
}
```

### Standard Error Codes (`ERROR_CODES`)

| Code | HTTP Status | Description / Common Triggers |
| :--- | :--- | :--- |
| `VALIDATION_ERROR` | `400` | Zod schema validation failure on body, query, or path parameters |
| `UNAUTHORIZED` | `401` | Missing, expired, malformed JWT, invalid login credentials, or soft-deleted user |
| `FORBIDDEN` | `403` | Authenticated user lacks required permissions (e.g. non-admin accessing admin routes) |
| `RESOURCE_NOT_FOUND` | `404` | Target endpoint route or database resource not found |
| `CONFLICT` | `409` | Unique constraint conflict (e.g. email already registered) |
| `RATE_LIMIT_EXCEEDED` | `429` | IP quota exceeded for global or route-level rate limiter |
| `INTERNAL_SERVER_ERROR` | `500` | Unhandled server exception (sanitized to prevent internal leaks) |
| `SERVICE_UNAVAILABLE` | `503` | Database connectivity failure during health check |

---

## 4. Quick Start

### Prerequisites
- **Node.js**: `v20.x` or `v22.x` (ES Modules enabled)
- **npm**: `v10.x` or later
- **PostgreSQL**: `v14+` running instance (local, Docker, or managed cloud database)

### Installation & Setup

1. **Clone the repository:**
   ```bash
   git clone https://github.com/Samarth58/App-Factory-starter-kit-.git
   cd App-Factory-starter-kit-
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Configure environment variables:**
   ```bash
   cp .env.example .env
   ```
   Edit `.env` and configure `DATABASE_URL`, `JWT_SECRET`, and `TEST_DATABASE_URL`.

4. **Generate and run database migrations:**
   ```bash
   npm run db:generate
   npm run db:migrate
   ```

5. **Start the development server:**
   ```bash
   npm run dev
   ```

6. **Verify the server is running:**
   ```bash
   curl http://localhost:3000/health
   ```
   Interactive Swagger UI is available at: [http://localhost:3000/docs](http://localhost:3000/docs).

---

## 5. Environment Configuration

Startup environment variables are parsed and strictly validated using Zod in `src/config/env.ts`.

### Variable Reference

| Variable | Required | Default | Allowed Values / Format | Description |
| :--- | :--- | :--- | :--- | :--- |
| `DATABASE_URL` | **Yes** | — | `postgresql://user:pass@host:port/dbname` | PostgreSQL connection URL for application runtime |
| `JWT_SECRET` | **Yes** | — | Non-empty string | Secret key for signing and verifying Access and Refresh JWTs |
| `PORT` | No | `3000` | Integer `1` – `65535` | HTTP port on which Fastify listens |
| `NODE_ENV` | No | `development` | `development`, `test`, `production` | Application runtime environment |
| `RATE_LIMIT_MAX` | No | `100` | Positive integer | Global max requests per IP within the time window |
| `RATE_LIMIT_WINDOW_MS` | No | `60000` | Positive integer (ms) | Global rate limiting window duration in milliseconds (default: 1 min) |
| `TEST_DATABASE_URL` | **Yes (for tests)** | — | `postgresql://.../app_test_db` | Dedicated test database URL. Must contain `'test'` in database name |

### Example Configuration (`.env.example`)
```env
NODE_ENV=development
PORT=3000
DATABASE_URL=postgresql://postgres:password@localhost:5432/app_db
JWT_SECRET=your-secret-key-change-this-to-a-long-random-string

# Test Database Configuration (REQUIRED for running Vitest integration tests)
TEST_DATABASE_URL=postgresql://postgres:password@localhost:5432/app_test_db

# Optional Rate Limit Overrides
RATE_LIMIT_MAX=100
RATE_LIMIT_WINDOW_MS=60000
```

> [!NOTE]
> If any required variable is missing or malformed, the application throws an explicit startup error (e.g. `Invalid environment configuration: DATABASE_URL: DATABASE_URL is required`) without logging secret credentials.

---

## 6. Project Structure

```text
.
├── .env.example                  # Environment variables template
├── .eslintrc.json                # ESLint code quality configuration
├── .github/
│   └── workflows/
│       └── ci.yml                # GitHub Actions CI validation pipeline
├── .prettierrc.json              # Prettier formatting rules
├── AGENTS.md                     # AI Agent coding guidelines and operational rules
├── ARCHITECTURE.md               # Detailed architectural specification & sequence diagrams
├── Dockerfile                    # Multi-stage production container build (node:20-alpine)
├── README.md                     # Project documentation & reference manual
├── db/
│   └── migrate.ts                # Drizzle migration runner (tsx db/migrate.ts)
├── docker-compose.yml            # Local PostgreSQL 16 & Fastify app stack
├── drizzle/                      # Generated SQL migration files & snapshot metadata
│   ├── 0000_silky_wolfsbane.sql
│   ├── 0001_sturdy_rhodey.sql
│   └── meta/
├── drizzle.config.ts             # Drizzle Kit migration configuration
├── package.json                  # Manifest, dependencies, and lifecycle scripts
├── tsconfig.json                 # TypeScript compiler configuration (NodeNext)
├── vitest.config.ts              # Vitest test runner configuration
├── src/
│   ├── app.ts                    # Fastify application factory (buildApp), plugins, error hooks
│   ├── server.ts                 # Server entrypoint with graceful shutdown handlers
│   ├── auth/
│   │   ├── jwt.ts                # Access & Refresh JWT signing, verification, and JTI utilities
│   │   ├── password.ts           # Argon2id password hashing and verification
│   │   └── sessionService.ts     # PostgreSQL session rotation, replay detection & revocation
│   ├── config/
│   │   └── env.ts                # Centralized Zod-validated environment configuration
│   ├── db/
│   │   ├── connection.ts         # pg.Pool and Drizzle client instance
│   │   └── schema.ts             # Drizzle table schemas (users, user_sessions, examples)
│   ├── middleware/
│   │   ├── authGuard.ts          # Bearer JWT verification and active-user DB lookup
│   │   └── adminGuard.ts         # RBAC verification hook (user.role === 'admin')
│   ├── modules/
│   │   └── example/              # Canonical reference domain module (CRUD, service, schemas)
│   │       ├── exampleRoutes.ts
│   │       ├── exampleSchemas.ts
│   │       ├── exampleService.ts
│   │       └── index.ts
│   ├── plugins/
│   │   ├── rateLimiter.ts        # Centralized @fastify/rate-limit plugin configuration
│   │   └── swagger.ts            # Centralized @fastify/swagger and OpenAPI UI plugin
│   ├── routes/
│   │   ├── admin.ts              # Administrative user management & role control routes
│   │   ├── auth.ts               # POST /register, /login, /refresh, /logout
│   │   ├── health.ts             # GET /health
│   │   └── users.ts              # GET, PUT, DELETE /users/:id (IDOR protected)
│   ├── types/
│   │   └── fastify.d.ts          # FastifyRequest interface augmentation (userId)
│   └── utils/
│       ├── pagination.ts         # Generic cursor & limit-offset pagination helpers
│       └── response.ts           # Standardized ok() and fail() envelope helpers
└── tests/
    ├── admin.test.ts             # RBAC, admin routes, and demotion safety tests
    ├── auth.test.ts              # User registration, login, and credential validation tests
    ├── config.test.ts            # Zod environment variable parsing and validation tests
    ├── dbGuard.test.ts           # Test database safety guard unit tests
    ├── envelope.test.ts          # Standard response envelope structure tests
    ├── errors.test.ts            # Global 404 and 500 error sanitization tests
    ├── example.test.ts           # Canonical domain module CRUD & tenant isolation tests
    ├── globalSetup.ts            # Test migration runner executed before test suite
    ├── health.test.ts            # Health check endpoint tests
    ├── pagination.test.ts        # Cursor and limit-offset pagination utility tests
    ├── preSetup.ts               # Worker-level database isolation validation
    ├── rateLimit.test.ts         # Global and route-level rate limiting tests
    ├── requestId.test.ts         # x-request-id tracking and reflection tests
    ├── sessions.test.ts          # Refresh token rotation, grace window, and replay detection tests
    ├── setup.ts                  # Per-test database safety verification and table truncation
    ├── swagger.test.ts           # OpenAPI specification and Swagger UI endpoint tests
    ├── users.test.ts             # User profile CRUD, IDOR, and soft-delete tests
    └── helpers/
        ├── dbGuard.ts            # Test database URL validation and connection assertion
        └── dnsFallback.ts        # DNS fallback helper for cloud database connections
```

---

## 7. Authentication, Sessions & Security

The Starter Kit implements an industry-standard dual-token authentication model with PostgreSQL-backed session rotation and replay detection.

### Token Specifications

| Token Type | Lifetime | Secret / Key | Payload Claims | Storage / Transmission |
| :--- | :--- | :--- | :--- | :--- |
| **Access Token** | 15 minutes (`15m`) | `JWT_SECRET` | `{ userId: string, typ: 'access' }` | `Authorization: Bearer <token>` header |
| **Refresh Token** | 30 days (`30d`) | `JWT_SECRET` | `{ userId: string, jti: string, typ: 'refresh' }` | Request body / Secure Client Storage |

### Password Security
- Passwords are hashed using **Argon2id** (`argon2.argon2id`) via `hashPassword()` in `src/auth/password.ts`.
- Memory and CPU hardness protects against GPU-accelerated brute-force and dictionary attacks.
- Passwords must be at least 8 characters long (enforced by Zod schema).

### Refresh Token Rotation & Session Replay Protection
- Refresh token identifiers (`jti`) are randomly generated (32 bytes hex) and their SHA-256 hashes (`jtiHash`) are stored in `user_sessions`.
- **Atomic Rotation (`POST /refresh`)**:
  1. Validates cryptographic signature and verifies `typ === 'refresh'`.
  2. Queries `user_sessions` with `FOR UPDATE` transaction lock.
  3. Marks the old session as revoked (`revoked_at = NOW()`).
  4. Mints a new session in PostgreSQL and issues a fresh Access + Refresh token pair.
- **Replay & Theft Detection**:
  - **Grace Period Window (`REFRESH_REUSE_GRACE_SECONDS = 20`)**: If an already-revoked token is used within 20 seconds of revocation, a new token pair is issued to accommodate concurrent network retries on mobile devices.
  - **Suspected Token Theft**: If an already-revoked token is presented **after** the 20-second grace window, suspected token theft triggers immediate revocation of **all** active sessions for that user (`revokeAllSessionsForUser`), invalidating all active refresh tokens.
- **Explicit Logout (`POST /logout`)**: Revokes the specific refresh session in PostgreSQL.

### Active User Verification in `authGuard`
Valid cryptographic signatures alone are not sufficient. On every protected route, `authGuard` extracts `request.userId` from the Access JWT and performs a database lookup to ensure the user exists and is not soft-deleted (`deletedAt IS NULL`).

---

## 8. Role-Based Access Control (RBAC) & Admin APIs

The application supports role-based access control with `user` and `admin` roles stored in the `users.role` column.

### Guards & Authorization
- **`authGuard`** (`src/middleware/authGuard.ts`): Verifies JWT Bearer token, checks user is active (`deletedAt IS NULL`), and attaches `request.userId` to Fastify request.
- **`adminGuard`** (`src/middleware/adminGuard.ts`): Executes `authGuard` verification and strictly asserts `user.role === 'admin'`. Returns `403 FORBIDDEN` for non-admin callers.
- **IDOR / Ownership Protection**: Self-service user endpoints (`/users/:id`) verify `request.userId === params.id`.

### Admin Protections
- **Self-Demotion Protection**: An administrator cannot demote their own account from `admin` to `user`.
- **Last-Admin Protection**: An administrator cannot demote the last remaining active administrator in the system.

---

## 9. API Reference

All endpoints return standardized JSON envelopes (`ok()` or `fail()`) and include the `x-request-id` header.

### System & Documentation Endpoints

#### `GET /health`
Public health check verifying service status and PostgreSQL connectivity.
- **Auth**: None
- **Response `200 OK`**:
  ```json
  {
    "success": true,
    "data": {
      "status": "ok"
    }
  }
  ```

#### `GET /docs`
Interactive Swagger UI documentation.

#### `GET /docs/json`
OpenAPI 3.0.3 JSON schema specification.

---

### Authentication Endpoints (`/auth`)

#### `POST /register`
Registers a new user account and issues initial Access and Refresh tokens.
- **Auth**: None | **Rate Limit**: 10 requests / min
- **Request Body**:
  ```json
  {
    "email": "user@example.com",
    "password": "password123",
    "name": "Jane Doe"
  }
  ```
- **Response `201 Created`**:
  ```json
  {
    "success": true,
    "data": {
      "user": {
        "id": "123e4567-e89b-12d3-a456-426614174000",
        "email": "user@example.com",
        "name": "Jane Doe",
        "role": "user",
        "created_at": "2026-10-06T00:00:00.000Z"
      },
      "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
      "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
    }
  }
  ```
- **Errors**: `400 VALIDATION_ERROR`, `409 CONFLICT` (Email already registered).

#### `POST /login`
Authenticates credentials and returns a fresh Access and Refresh token pair.
- **Auth**: None | **Rate Limit**: 10 requests / min
- **Request Body**:
  ```json
  {
    "email": "user@example.com",
    "password": "password123"
  }
  ```
- **Response `200 OK`**: Same envelope structure as `/register`.
- **Errors**: `400 VALIDATION_ERROR`, `401 UNAUTHORIZED` (Invalid email or password).

#### `POST /refresh`
Rotates an active refresh token with single-use replay protection.
- **Auth**: None | **Rate Limit**: 30 requests / min
- **Request Body**:
  ```json
  {
    "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
  ```
- **Response `200 OK`**:
  ```json
  {
    "success": true,
    "data": {
      "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
      "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
      "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
    }
  }
  ```
- **Errors**: `400 VALIDATION_ERROR`, `401 UNAUTHORIZED` (Expired, invalid, or reused token).

#### `POST /logout`
Revokes the presented refresh token session in PostgreSQL.
- **Auth**: None
- **Request Body**: `{ "refreshToken": "..." }`
- **Response `200 OK`**: `{ "success": true, "data": { "success": true } }`

---

### User Endpoints (`/users`)

All user endpoints require `Authorization: Bearer <access_token>` and enforce `request.userId === params.id`.

#### `GET /users/:id`
Retrieves own user profile.
- **Response `200 OK`**:
  ```json
  {
    "success": true,
    "data": {
      "id": "123e4567-e89b-12d3-a456-426614174000",
      "email": "user@example.com",
      "name": "Jane Doe",
      "role": "user",
      "created_at": "2026-10-06T00:00:00.000Z"
    }
  }
  ```
- **Errors**: `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`, `404 RESOURCE_NOT_FOUND`.

#### `PUT /users/:id`
Updates own profile (`name`, `email`). At least one field is required.
- **Request Body**: `{ "name": "New Name", "email": "new@example.com" }`
- **Response `200 OK`**: `{ "success": true, "data": { "user": { ... } } }`
- **Errors**: `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`, `404 RESOURCE_NOT_FOUND`, `409 CONFLICT`.

#### `DELETE /users/:id`
Soft-deletes own account (`deleted_at = NOW()`) and revokes all active sessions.
- **Response `200 OK`**: `{ "success": true, "data": { "success": true } }`

---

### Admin Endpoints (`/admin`)

All admin endpoints require `Authorization: Bearer <access_token>` from a user with `role === 'admin'`.

| Method | Path | Summary | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/admin/users` | List all users | Returns array of all active users |
| `GET` | `/admin/users/:id` | Inspect user | Returns detailed user record by ID |
| `PATCH` | `/admin/users/:id/role` | Update user role | Updates role (`user` / `admin`). Enforces self-demotion & last-admin protection |
| `POST` | `/admin/users/:id/revoke-sessions` | Force logout | Revokes all active refresh sessions for target user |
| `DELETE` | `/admin/users/:id` | Admin soft-delete | Soft-deletes user account and revokes all active sessions |

---

### Reference Example Module Endpoints (`/examples`)

Demonstrates the canonical domain CRUD pattern with tenant isolation and dual-mode pagination. Requires `Authorization: Bearer <access_token>`.

| Method | Path | Summary | Description |
| :--- | :--- | :--- | :--- |
| `POST` | `/examples` | Create example | Creates a new example record owned by `request.userId` |
| `GET` | `/examples` | List examples | Returns paginated list of user's own examples (supports cursor and offset) |
| `GET` | `/examples/:id` | Get example by ID | Retrieves single example record (tenant-isolated) |
| `PUT` | `/examples/:id` | Update example | Updates example fields (`name`, `description`) |
| `DELETE` | `/examples/:id` | Delete example | Soft-deletes example record (`deleted_at = NOW()`) |

---

## 10. Reusable Pagination Utility

Located at `src/utils/pagination.ts`, the pagination utility provides type-safe cursor and limit-offset pagination helpers.

### Configuration Constants
- `DEFAULT_PAGE_SIZE = 20`
- `MAX_PAGE_SIZE = 100`

### 1. Cursor-Based Pagination
Ideal for infinite scrolling and high-scale feeds. Uses opaque, URL-safe Base64-encoded cursors.

```typescript
import { cursorPaginationSchema, buildCursorPagination } from '../utils/pagination.js';

// 1. Validate query params (limit defaults to 20, max 100)
const query = cursorPaginationSchema.parse(request.query);

// 2. Fetch limit + 1 items from database
const items = await db.select().from(table).limit(query.limit + 1)...;

// 3. Build paginated result
const result = buildCursorPagination(items, query.limit, (item) => ({
  id: item.id,
  createdAt: item.createdAt.toISOString(),
}));

return reply.status(200).send(ok(result.data, result.meta));
```

**Response Metadata (`result.meta`):**
```json
{
  "nextCursor": "eyJpZCI6IjEyMyIsImNyZWF0ZWRBdCI6IjIwMjYtMTAtMDYifQ",
  "hasMore": true,
  "limit": 20
}
```

### 2. Limit-Offset Pagination
Ideal for traditional numbered table pagination.

```typescript
import { limitOffsetPaginationSchema, buildLimitOffsetPagination } from '../utils/pagination.js';

// 1. Validate query params (limit default 20, offset default 0)
const query = limitOffsetPaginationSchema.parse(request.query);

// 2. Query page and total count
const items = await db.select().from(table).limit(query.limit).offset(query.offset)...;
const [{ count }] = await db.select({ count: sql<number>`count(*)` }).from(table)...;

// 3. Build paginated result
const result = buildLimitOffsetPagination(items, Number(count), {
  limit: query.limit,
  offset: query.offset,
});

return reply.status(200).send(ok(result.data, result.meta));
```

**Response Metadata (`result.meta`):**
```json
{
  "total": 142,
  "limit": 20,
  "offset": 0,
  "hasMore": true
}
```

---

## 11. Reference Domain Module Pattern

The `src/modules/example/` directory serves as the reference architecture for building new domain modules:

```text
src/modules/example/
├── exampleSchemas.ts      # Zod validation schemas for request body, params, and queries
├── exampleService.ts      # Drizzle database operations with tenant isolation (userId)
├── exampleRoutes.ts       # Fastify route handlers, OpenAPI annotations, authGuard
└── index.ts               # Clean public barrel exports
```

### Extension Recipe: Creating a New Domain Module
1. **Define Schema**: Add table in `src/db/schema.ts` with `userId` foreign key and `deletedAt` timestamp.
2. **Generate Migration**: Run `npm run db:generate` and `npm run db:migrate`.
3. **Create Module Directory**: Create `src/modules/<feature_name>/`.
4. **Define Schemas**: Create `<feature>Schemas.ts` using Zod for body, query, and path params.
5. **Create Service**: Create `<feature>Service.ts` encapsulating database queries scoped to `userId`.
6. **Create Routes**: Create `<feature>Routes.ts` with `authGuard`, OpenAPI annotations, and `ok()`/`fail()` response envelopes.
7. **Register in `src/app.ts`**: Import and register `app.register(<feature>Routes)`.
8. **Add Tests**: Create `tests/<feature>.test.ts` verifying authentication, authorization, CRUD, and error handling.

---

## 12. Database Schema & Migrations

Database tables are declared with Drizzle ORM in `src/db/schema.ts`.

### `users` Table
| Column | PostgreSQL Type | Nullable | Default | Description |
| :--- | :--- | :--- | :--- | :--- |
| `id` | `UUID` | No | `gen_random_uuid()` | Primary Key |
| `email` | `TEXT` | No | — | Unique active user email address |
| `password_hash` | `TEXT` | No | — | Argon2id password hash |
| `name` | `TEXT` | Yes | `NULL` | Optional display name |
| `role` | `TEXT` (`'user'`, `'admin'`) | No | `'user'` | Role-based access control role |
| `created_at` | `TIMESTAMP` | No | `NOW()` | Account creation timestamp |
| `deleted_at` | `TIMESTAMP` | Yes | `NULL` | Soft-delete timestamp |

- **Index**: `uniqueIndex('users_email_active_unique').on(email).where(deletedAt IS NULL)` allowing email re-registration after soft deletion.

### `user_sessions` Table
| Column | PostgreSQL Type | Nullable | Default | Description |
| :--- | :--- | :--- | :--- | :--- |
| `id` | `UUID` | No | `gen_random_uuid()` | Primary Key |
| `user_id` | `UUID` | No | — | FK referencing `users.id` (ON DELETE CASCADE) |
| `jti_hash` | `TEXT` | No | — | SHA-256 hash of refresh token JTI (Unique) |
| `expires_at` | `TIMESTAMPTZ` | No | — | Session expiration timestamp (30 days) |
| `revoked_at` | `TIMESTAMPTZ` | Yes | `NULL` | Revocation timestamp |
| `created_at` | `TIMESTAMPTZ` | No | `NOW()` | Session creation timestamp |

- **Indexes**: `user_sessions_user_id_idx` on `user_id`, `user_sessions_jti_hash_unique` on `jti_hash`.

### `examples` Table (Reference Module)
| Column | PostgreSQL Type | Nullable | Default | Description |
| :--- | :--- | :--- | :--- | :--- |
| `id` | `UUID` | No | `gen_random_uuid()` | Primary Key |
| `user_id` | `UUID` | No | — | FK referencing `users.id` (ON DELETE CASCADE) |
| `name` | `TEXT` | No | — | Resource name |
| `description` | `TEXT` | Yes | `NULL` | Optional description |
| `created_at` | `TIMESTAMPTZ` | No | `NOW()` | Creation timestamp |
| `updated_at` | `TIMESTAMPTZ` | No | `NOW()` | Last update timestamp |
| `deleted_at` | `TIMESTAMPTZ` | Yes | `NULL` | Soft-delete timestamp |

- **Indexes**: `examples_user_id_idx` on `user_id`, `examples_created_at_idx` on `created_at`.

### Migration Commands
```bash
# Generate SQL migration file from src/db/schema.ts
npm run db:generate

# Execute pending migrations against database
npm run db:migrate
```

---

## 13. Rate Limiting & Observability

- **Rate Limiter Plugin** (`src/plugins/rateLimiter.ts`):
  - Configured with `@fastify/rate-limit`.
  - Global defaults: `100` requests per `60000ms` (1 min) per IP (configurable via `RATE_LIMIT_MAX` and `RATE_LIMIT_WINDOW_MS`).
  - Route overrides: `/register` (10/min), `/login` (10/min), `/refresh` (30/min).
  - Rate limit response headers: `x-ratelimit-limit`, `x-ratelimit-remaining`, `x-ratelimit-reset`, `retry-after`.
  - Exceeded quota returns `429 RATE_LIMIT_EXCEEDED` standard envelope.
- **Request ID Tracing**:
  - Automatically generates a UUID or validates incoming `x-request-id` headers (matching `^[A-Za-z0-9._-]{1,64}$`).
  - Attached to all outgoing response headers via `onSend` hook.
- **Structured Pino Logging & Redaction**:
  - Fastify Pino logger enabled in non-test environments.
  - Automatically redacts sensitive fields in logs: `authorization`, `cookie`, `password`, `token`, `refreshToken`.
- **Graceful Process Shutdown**:
  - `src/server.ts` handles `SIGINT`, `SIGTERM`, `unhandledRejection`, and `uncaughtException`.
  - Drains Fastify server connections, closes PostgreSQL pool, and enforces a 10-second timeout failsafe.

---

## 14. Testing & Test Database Safety

Integration testing is powered by **Vitest**. Tests execute against a live PostgreSQL test database with comprehensive isolation and safety protections.

### Test Database Safety Isolation
To prevent catastrophic accidental data loss on development or production databases:
1. **Safety Verification Guard** (`tests/helpers/dbGuard.ts`):
   - Asserts that `TEST_DATABASE_URL` is configured and that its database name contains `'test'`.
   - Strictly verifies that `TEST_DATABASE_URL` does not point to the same database as `DATABASE_URL`.
2. **Worker Pre-Setup** (`tests/preSetup.ts`): Validates database configuration before test modules load.
3. **Global Migration Runner** (`tests/globalSetup.ts`): Runs migrations (`./drizzle`) against the test database.
4. **Runtime Connection Assertion** (`tests/setup.ts`): Executes `SELECT current_database()` to confirm the active connected database contains `'test'` before performing any operations.
5. **Safe Table Truncation**: Truncates only application tables (`examples`, `user_sessions`, `users`) via `TRUNCATE ... RESTART IDENTITY CASCADE` before each test. Migration tables (`__drizzle_migrations`) are never truncated.

### Test Categories

| Test Suite | File | Coverage Areas |
| :--- | :--- | :--- |
| **Authentication** | `tests/auth.test.ts` | Registration, login, duplicate email rejection, password hashing, invalid credentials |
| **Sessions & Replay** | `tests/sessions.test.ts` | Refresh token rotation, replay detection, 20s grace window, token theft revocation, logout |
| **RBAC & Admin** | `tests/admin.test.ts` | Admin authorization, user inspection, role updates, self-demotion & last-admin protection, session revocation |
| **Users & IDOR** | `tests/users.test.ts` | User retrieval, updates, email uniqueness, IDOR protection, self-soft-deletion with session cleanup |
| **Domain CRUD** | `tests/example.test.ts` | Reference example CRUD operations, tenant isolation, soft-deletion |
| **Pagination** | `tests/pagination.test.ts` | Cursor-based Base64 pagination, limit-offset pagination, boundary and limit validation |
| **Rate Limiting** | `tests/rateLimit.test.ts` | Global rate limits, route-specific overrides, 429 error envelopes, rate limit headers |
| **Swagger / OpenAPI** | `tests/swagger.test.ts` | OpenAPI 3.0.3 schema generation, Swagger UI endpoint, Bearer auth definition |
| **Health Check** | `tests/health.test.ts` | Service status check, database ping, response envelope |
| **Error Handling** | `tests/errors.test.ts` | 404 handler, 500 error sanitization, stack trace suppression |
| **Environment** | `tests/config.test.ts` | Zod environment parsing, defaults, invalid port/environment rejection |
| **Database Guard** | `tests/dbGuard.test.ts` | URL parsing, safety guard validation, production protection triggers |
| **Request Tracking** | `tests/requestId.test.ts` | Request ID header generation, preservation, and format validation |
| **Response Envelope** | `tests/envelope.test.ts` | Helper format consistency for `ok()` and `fail()` |

### Running Tests
```bash
# Run the complete test suite
npm test

# Run tests in watch mode
npm run test:watch
```

---

## 15. Docker Support

The repository includes a multi-stage `Dockerfile` and `docker-compose.yml` for running PostgreSQL and the backend together.

> [!NOTE]
> Docker is **optional**. You can run the application directly with Node.js and a local or cloud PostgreSQL database.

### Running with Docker Compose

```bash
# Start PostgreSQL and Backend in foreground
docker compose up --build

# Start in detached mode (background)
docker compose up -d

# View service logs
docker compose logs -f

# Apply migrations inside running setup
npm run db:migrate

# Stop services
docker compose down

# Stop services and remove persistent database volume
docker compose down -v
```

### Docker Architecture
- **PostgreSQL Service (`postgres`)**: Runs `postgres:16-alpine` on port `5432` with persistent Docker volume `postgres_data` and integrated `pg_isready` health check.
- **Application Service (`app`)**: Multi-stage `node:20-alpine` build running compiled output `dist/server.js` via `npm start` as non-root user `node`. Includes automated container health check against `/health`.

---

## 16. Continuous Integration (CI)

The repository includes automated CI validation via GitHub Actions in `.github/workflows/ci.yml`.

### CI Pipeline Steps (on `push` and `pull_request` to `main`):
1. Spins up a `postgres:16-alpine` service container with health check on port `5432`.
2. Sets up Node.js `v22` with npm caching.
3. Installs clean dependencies via `npm ci`.
4. Executes TypeScript type-checking: `npx tsc --noEmit`.
5. Executes ESLint code quality checks: `npm run lint`.
6. Compiles TypeScript production build: `npm run build`.
7. Executes full automated test suite against PostgreSQL service: `npm test`.

---

## 17. Development Workflow & Commands

All available development and lifecycle scripts from `package.json`:

| Command | Description |
| :--- | :--- |
| `npm run dev` | Starts development server with live TypeScript execution (`node --loader ts-node/esm src/server.ts`) |
| `npm run build` | Compiles TypeScript source files to JavaScript in `dist/` (`tsc`) |
| `npm start` | Runs the compiled production server (`node dist/server.js`) |
| `npm run type-check` | Runs TypeScript type-checking without emitting files (`tsc --noEmit`) |
| `npm run lint` | Checks code quality and conventions using ESLint (`eslint src --ext .ts`) |
| `npm run format` | Formats all TypeScript source files using Prettier (`prettier --write "src/**/*.ts"`) |
| `npm run db:generate` | Generates SQL migration files from schema definitions (`drizzle-kit generate`) |
| `npm run db:migrate` | Runs pending database migrations using TypeScript runner (`tsx db/migrate.ts`) |
| `npm test` | Executes the complete Vitest test suite once (`vitest run`) |
| `npm run test:watch` | Runs Vitest in interactive watch mode (`vitest`) |

---

## 18. Application Entry Points

- **Development Entrypoint**: `src/server.ts` — instantiated via `npm run dev`.
- **Application Factory**: `src/app.ts` (`buildApp()`) — configures Fastify instance, plugins (Swagger, Rate Limiting), error handlers, and route modules.
- **Production Entrypoint**: `dist/server.js` — executed via `npm start` after running `npm run build`.

---

## 19. Security Summary

| Mechanism | Implementation Detail |
| :--- | :--- |
| **Password Hashing** | Argon2id (`argon2.argon2id`) memory-hard hashing |
| **Access Tokens** | Short-lived (15m) HS256 JWTs with cryptographic verification |
| **Refresh Rotation** | Long-lived (30d) JWTs with SHA-256 JTI hashing in `user_sessions` |
| **Replay Protection** | 20s grace period for mobile retries; immediate all-session revocation upon theft detection |
| **Active User Checks** | Database verification in `authGuard` ensuring `deletedAt IS NULL` |
| **Role-Based Access (RBAC)** | `adminGuard` enforcing `user.role === 'admin'` with self/last-admin demotion safeguards |
| **IDOR Protection** | Route-level ownership verification (`request.userId === params.id`) |
| **Rate Limiting** | Global (100 req/min) and strict route limits (10 req/min for auth) via `@fastify/rate-limit` |
| **Data Redaction** | Pino logger automatically redacts passwords, tokens, cookies, and auth headers |
| **Error Sanitization** | Global 500 handler prevents leaking database connection strings or stack traces |
| **Test DB Isolation** | Strict validation preventing tests from running against non-test databases |
| **Graceful Shutdown** | Drains Fastify connections and terminates connection pools cleanly on SIGINT/SIGTERM |

---

## 20. License

Private / Proprietary — Designed for the App Factory manufacturing pipeline.
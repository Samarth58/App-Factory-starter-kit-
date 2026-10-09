# App Factory Backend Starter Kit — Agent Guide (`AGENTS.md`)

This guide provides practical instructions, coding conventions, and operational rules for AI coding agents and developers working in this codebase.

---

## 1. Project Purpose & Tech Stack

The **App Factory Backend Starter Kit** is a production-grade backend substrate designed to serve as a reliable, modular foundation for manufacturing backend applications in the App Factory pipeline.

### Core Technologies
- **Runtime & Framework**: [Node.js](https://nodejs.org/) (ES Modules), [Fastify](https://fastify.dev/) v5.x
- **Language**: [TypeScript](https://www.typescriptlang.org/) v5.x (`NodeNext` module resolution)
- **Database & ORM**: [PostgreSQL](https://www.postgresql.org/), [pg](https://node-postgres.com/) (connection pooling), [Drizzle ORM](https://orm.drizzle.team/) & [Drizzle Kit](https://orm.drizzle.team/kit-docs/overview)
- **Validation**: [Zod](https://zod.dev/) v3.x
- **Authentication**: Access JWTs (`15m`), Refresh JWTs (`30d`), [Argon2id](https://github.com/ranisalt/node-argon2) password hashing, PostgreSQL-backed session rotation with replay detection
- **Documentation**: OpenAPI 3.0.3 via `@fastify/swagger` and `@fastify/swagger-ui` mounted at `/docs`
- **Rate Limiting**: `@fastify/rate-limit` with environment defaults and route-level overrides
- **Testing**: [Vitest](https://vitest.dev/) with database isolation guards

---

## 2. Directory Structure

```
.
├── .env.example              # Environment variables template
├── drizzle.config.ts         # Drizzle Kit migration configuration
├── package.json              # Package manifest and lifecycle scripts
├── tsconfig.json             # TypeScript compiler settings
├── drizzle/                  # Generated SQL migration files
├── src/
│   ├── app.ts                # Fastify application factory (buildApp), plugins, error handler
│   ├── server.ts             # Server entrypoint with graceful shutdown handlers
│   ├── auth/                 # JWT utilities, Argon2 hashing, session rotation service
│   ├── config/               # Centralized Zod-validated environment config (env.ts)
│   ├── db/                   # Connection pool (connection.ts), schema (schema.ts), migrate runner
│   ├── middleware/           # authGuard (JWT verification), adminGuard (RBAC verification)
│   ├── modules/              # Domain modules (e.g., example/)
│   │   └── example/          # Reference CRUD implementation (schemas, service, routes)
│   ├── plugins/              # Centralized Fastify plugins (swagger.ts, rateLimiter.ts)
│   ├── routes/               # Core routes (health.ts, auth.ts, users.ts, admin.ts)
│   ├── types/                # Ambient and Fastify type augmentations
│   └── utils/                # Standard response envelopes (response.ts), pagination (pagination.ts)
└── tests/                    # Integration and unit test suite
    ├── helpers/              # Database safety guards (dbGuard.ts)
    ├── setup.ts              # Per-test safety verification and table truncation
    ├── globalSetup.ts        # Test migration runner
    └── *.test.ts             # Domain, auth, admin, pagination, swagger, rate-limit tests
```

---

## 3. Environment Configuration

All environment variables are parsed and validated at boot using Zod in [`src/config/env.ts`](file:///d:/App-factory(starter-kit)/src/config/env.ts).

### Variables (`.env.example`)
```ini
NODE_ENV=development
PORT=3000
DATABASE_URL=postgresql://postgres:password@localhost:5432/app_db
JWT_SECRET=your-secret-key-change-this-to-a-long-random-string

# Optional Rate Limiting Overrides
RATE_LIMIT_MAX=100
RATE_LIMIT_WINDOW_MS=60000

# Test Database Configuration (REQUIRED for Vitest)
TEST_DATABASE_URL=postgresql://postgres:password@localhost:5432/app_test_db
```

### Safety Rules
1. **Never commit `.env` or print secrets/tokens** in code, tests, or documentation.
2. `DATABASE_URL` must point to a development or production database.
3. `TEST_DATABASE_URL` is dedicated exclusively to test execution and must contain `test` in the database name.

---

## 4. Database Setup, Migrations & Test Isolation

### Drizzle Schema Workflow
- Core database tables reside in [`src/db/schema.ts`](file:///d:/App-factory(starter-kit)/src/db/schema.ts).
- When modifying database tables:
  1. Update table definitions in `src/db/schema.ts`.
  2. Generate a new migration file: `npm run db:generate`.
  3. **DO NOT edit or delete existing migration files in `drizzle/`**.
  4. Run migrations against development: `npm run db:migrate`.

### Test Database Isolation
- Vitest tests automatically run against `TEST_DATABASE_URL`.
- The safety guard in [`tests/helpers/dbGuard.ts`](file:///d:/App-factory(starter-kit)/tests/helpers/dbGuard.ts) strictly prevents running tests against `DATABASE_URL` or any database whose name does not contain `test`.
- [`tests/setup.ts`](file:///d:/App-factory(starter-kit)/tests/setup.ts) truncates application tables (`examples`, `user_sessions`, `users`) before each test using `TRUNCATE ... RESTART IDENTITY CASCADE`. Migration tables (`__drizzle_migrations`) are never truncated.

---

## 5. API Conventions: Response Envelopes & Error Codes

All HTTP endpoints must return the standard JSON response format defined in [`src/utils/response.ts`](file:///d:/App-factory(starter-kit)/src/utils/response.ts).

### Success Response
```typescript
import { ok } from '../utils/response.js';

return reply.status(200).send(ok(data, meta));
```
**JSON Structure**:
```json
{
  "success": true,
  "data": { ... },
  "meta": { "nextCursor": "...", "hasMore": false } // Optional metadata (e.g. pagination)
}
```

### Error Response
```typescript
import { fail } from '../utils/response.js';

return reply.status(400).send(fail('VALIDATION_ERROR', 'Invalid request body', parsed.error.issues));
```
**JSON Structure**:
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid request body",
    "details": []
  }
}
```

### Standard Error Codes (`ERROR_CODES` in [`src/app.ts`](file:///d:/App-factory(starter-kit)/src/app.ts))
- `VALIDATION_ERROR` (HTTP 400) — Schema or parameter validation failures
- `UNAUTHORIZED` (HTTP 401) — Missing, invalid, expired, or reused token
- `FORBIDDEN` (HTTP 403) — Insufficient role / permission (e.g., non-admin)
- `RESOURCE_NOT_FOUND` (HTTP 404) — Missing endpoint or missing database entity
- `CONFLICT` (HTTP 409) — Unique constraint violation (e.g., duplicate email)
- `RATE_LIMIT_EXCEEDED` (HTTP 429) — Rate limit quota exceeded
- `INTERNAL_SERVER_ERROR` (HTTP 500) — Unhandled server error
- `SERVICE_UNAVAILABLE` (HTTP 503) — Database connection failure (e.g., `/health`)

---

## 6. Authentication, RBAC & Guards

### Authentication Flow
- **Access Token**: Short-lived JWT (15 minutes), payload `{ userId, typ: 'access' }`.
- **Refresh Token**: Long-lived JWT (30 days), payload `{ userId, jti, typ: 'refresh' }`.
- **Rotation**: Calling `POST /refresh` with a valid refresh token issues a new access + refresh token pair.
- **Single-Use & Replay Detection**:
  - Each refresh token JTI hash is stored in `user_sessions`.
  - When rotated, the old session is marked `revoked_at = now()`.
  - If an already-revoked token is used within 20 seconds (`REFRESH_REUSE_GRACE_SECONDS`), a fresh token pair is issued to handle mobile network concurrency.
  - If used after 20 seconds, suspected token theft triggers immediate revocation of **all** sessions for that user (`revokeAllSessionsForUser`).

### Route Guards
- [`authGuard`](file:///d:/App-factory(starter-kit)/src/middleware/authGuard.ts): Validates JWT `Bearer` token in `Authorization` header, verifies token type is `access`, checks user exists and is not soft-deleted (`deletedAt IS NULL`), and attaches `request.userId`.
- [`adminGuard`](file:///d:/App-factory(starter-kit)/src/middleware/adminGuard.ts): Invokes `authGuard` check and enforces `user.role === 'admin'`.

---

## 7. Pagination Utility Usage

The pagination utility in [`src/utils/pagination.ts`](file:///d:/App-factory(starter-kit)/src/utils/pagination.ts) supports both cursor-based and limit-offset pagination.

### Cursor Pagination
```typescript
import { cursorPaginationSchema, buildCursorPagination } from '../../utils/pagination.js';

// Query validation
const query = cursorPaginationSchema.parse(request.query);

// Fetch limit + 1 items
const items = await db.select().from(table).limit(query.limit + 1)...;

// Build paginated result with opaque Base64 cursor
const result = buildCursorPagination(items, query.limit, (item) => ({
  id: item.id,
  createdAt: item.createdAt.toISOString(),
}));

return reply.status(200).send(ok(result.data, result.meta));
```

### Limit-Offset Pagination
```typescript
import { limitOffsetPaginationSchema, buildLimitOffsetPagination } from '../../utils/pagination.js';

const query = limitOffsetPaginationSchema.parse(request.query);
const items = await db.select().from(table).limit(query.limit).offset(query.offset)...;
const [{ count }] = await db.select({ count: sql<number>`count(*)` }).from(table)...;

const result = buildLimitOffsetPagination(items, Number(count), {
  limit: query.limit,
  offset: query.offset,
});

return reply.status(200).send(ok(result.data, result.meta));
```

---

## 8. Rate Limiting Configuration

Configured centrally via [`src/plugins/rateLimiter.ts`](file:///d:/App-factory(starter-kit)/src/plugins/rateLimiter.ts).

- **Global Defaults**: `100` requests / minute per IP (configurable via `RATE_LIMIT_MAX` and `RATE_LIMIT_WINDOW_MS`).
- **Route-Specific Limits**:
  ```typescript
  app.post('/register', {
    config: {
      rateLimit: { max: 10, timeWindow: 60000 },
    },
    ...
  });
  ```
- **Error Behavior**: Automatically returns HTTP 429 with standard `RATE_LIMIT_EXCEEDED` envelope and rate-limit headers (`x-ratelimit-limit`, `x-ratelimit-remaining`, `retry-after`).

---

## 9. OpenAPI / Swagger Documentation Conventions

Configured via [`src/plugins/swagger.ts`](file:///d:/App-factory(starter-kit)/src/plugins/swagger.ts).

### Annotating Routes
Always include `schema` metadata on registered routes:
```typescript
app.post(
  '/items',
  {
    schema: {
      tags: ['Items'],
      summary: 'Create item',
      description: 'Creates a new item resource.',
      security: [{ bearerAuth: [] }], // Required for protected routes
    },
  },
  async (request, reply) => { ... },
);
```
- **Swagger UI URL**: `http://localhost:3000/docs`
- **OpenAPI JSON URL**: `http://localhost:3000/docs/json`

---

## 10. How to Add a New Domain Module

Follow the canonical pattern established in [`src/modules/example/`](file:///d:/App-factory(starter-kit)/src/modules/example/):

1. **Define Schema**:
   Add table definition to [`src/db/schema.ts`](file:///d:/App-factory(starter-kit)/src/db/schema.ts) with `userId`, timestamps, and soft-delete column `deletedAt`. Run `npm run db:generate`.
2. **Create Module Folder**: `src/modules/<feature_name>/`
3. **Add Validation Schemas**: `<feature>Schemas.ts` (using Zod for body, query, and path params).
4. **Add Service Layer**: `<feature>Service.ts` (encapsulate all Drizzle database queries, tenant isolation by `userId`, and pagination).
5. **Add Route Handler**: `<feature>Routes.ts` (apply `authGuard`, Zod validation, OpenAPI annotations, standard response envelopes).
6. **Export Module**: `index.ts` re-exporting schemas, service, and routes.
7. **Register in App**: In [`src/routes/apiV1.ts`](file:///d:/App-factory(starter-kit)/src/routes/apiV1.ts), import and register `app.register(<feature>Routes)` (automatically mounts under `/api/v1` and root backward-compatible routes).
8. **Add Tests**: Create `tests/<feature>.test.ts` verifying authentication, authorization, CRUD operations, tenant isolation, and error edge cases.

---

## 11. Essential Commands & Verification

```bash
# Development Server
npm run dev

# Build (TypeScript Compiler)
npm run build

# Typecheck (No emit)
npm run type-check

# Linting
npm run lint

# Format Code
npm run format

# Run Full Test Suite (requires TEST_DATABASE_URL)
npm test

# Run Specific Test File
npx vitest run tests/example.test.ts
npx vitest run tests/rateLimit.test.ts
npx vitest run tests/swagger.test.ts
```

---

## 12. Golden Rules for Agents

- 🛑 **NEVER run destructive SQL commands or tests against `DATABASE_URL`**.
- 🛑 **NEVER print secrets, API keys, passwords, or JWT tokens in responses or logs**.
- 🛑 **NEVER delete or edit existing migration files in `drizzle/`**.
- 🛑 **DO NOT modify completed modules unless explicitly tasked with a cross-cutting change**.
- ✅ **Always verify code changes with `npm run type-check`, `npm run lint`, and targeted Vitest tests**.

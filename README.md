# Codeduck - Submission Service

Submission Service is a TypeScript/Express microservice for accepting code submissions, validating the target problem, persisting submission records in MongoDB, and publishing evaluation work to a Redis-backed BullMQ queue.

The repository currently contains the submission domain layer, queue producer, persistence model, infrastructure configuration, logging, validation helpers, and health/ping HTTP routes. Submission HTTP routes/controllers are not wired yet; the core submission workflow is implemented in `src/services/submission.service.ts`.

## Table of Contents

- [Architecture](#architecture)
- [Technology Stack](#technology-stack)
- [Project Structure](#project-structure)
- [Runtime Configuration](#runtime-configuration)
- [Getting Started](#getting-started)
- [Available Scripts](#available-scripts)
- [HTTP Routes](#http-routes)
- [Submission Model](#submission-model)
- [Process Flows](#process-flows)
- [Queue Behavior](#queue-behavior)
- [Logging and Correlation IDs](#logging-and-correlation-ids)
- [Error Handling](#error-handling)
- [Development Notes](#development-notes)

## Architecture

```mermaid
flowchart LR
    Client[Client or API Gateway] --> Express[Express Server]
    Express --> Middleware[JSON Parser + Correlation Middleware]
    Middleware --> Routers[Versioned Routers]
    Routers --> Ping[Ping / Health Routes]

    SubmissionCaller[Submission Controller or Caller] --> SubmissionService[Submission Service]
    SubmissionService --> ProblemAPI[Problem Service API]
    SubmissionService --> Repository[Submission Repository]
    Repository --> MongoDB[(MongoDB)]
    SubmissionService --> Producer[Submission Producer]
    Producer --> Queue[BullMQ submissionQueue]
    Queue --> Redis[(Redis)]
    Worker[Evaluation Worker] -. consumes .-> Queue
```

The intended service boundary is:

- Express owns HTTP transport, routing, request parsing, correlation IDs, and error middleware.
- `SubmissionService` owns business orchestration for submissions.
- `SubmissionRepository` owns MongoDB access through Mongoose.
- `submission.producer.ts` owns queue publishing.
- `submission.queue.ts` owns BullMQ queue construction and retry configuration.
- `problem.api.ts` owns calls to the external Problem Service.

## Technology Stack

| Area | Technology / Library | Usage |
| --- | --- | --- |
| Runtime | Node.js | JavaScript runtime for the service |
| Language | TypeScript | Strictly typed application code |
| HTTP Server | Express 5 | API server, routers, middleware |
| Database | MongoDB | Stores submission records |
| ODM | Mongoose | Submission schema, indexes, CRUD operations |
| Queue | BullMQ | Publishes submission evaluation jobs |
| Queue Broker | Redis | BullMQ backing store and queue coordination |
| Redis Client | ioredis | Redis connections for queue infrastructure |
| HTTP Client | Axios | Fetches problem details from Problem Service |
| Validation | Zod | Request body/query validation helpers |
| Logging | Winston | Structured JSON logs |
| Log Rotation | winston-daily-rotate-file | Daily log files under `logs/` |
| Request Context | AsyncLocalStorage | Stores per-request correlation IDs |
| IDs | uuid | Generates correlation IDs |
| Dev Runner | nodemon | Restarts service during development |
| TS Runner | ts-node | Runs TypeScript directly |

## Project Structure

```text
src/
  apis/
    problem.api.ts                # Problem Service HTTP client
  config/
    db.config.ts                  # MongoDB connection helper
    index.ts                      # Environment-backed server config
    logger.config.ts              # Winston logger
    redis.config.ts               # Redis connection factory
  controllers/
    ping.controller.ts            # Ping route handler
  middlewares/
    correlation.middleware.ts     # Request correlation ID setup
    error.middleware.ts           # App and generic error handlers
  models/
    submission.model.ts           # Mongoose submission schema
  producers/
    submission.producer.ts        # Adds submission jobs to BullMQ
  queues/
    submission.queue.ts           # BullMQ queue definition
  repositories/
    submission.repository.ts      # Submission persistence interface/class
  routers/
    v1/
      index.router.ts             # v1 router mount
      ping.router.ts              # Ping and health endpoints
    v2/
      index.router.ts             # v2 router placeholder
  services/
    submission.service.ts         # Submission business workflow
  utils/
    errors/app.error.ts           # Custom app errors
    helpers/request.helpers.ts    # AsyncLocalStorage helper
  validators/
    index.ts                      # Zod middleware helpers
    ping.validator.ts             # Ping body schema
```

## Runtime Configuration

The service reads environment variables through `dotenv`.

| Variable | Default | Description |
| --- | --- | --- |
| `PORT` | `3001` | Port used by the Express server |
| `DB_URL` | `mongodb://localhost:27017/problem-service` | MongoDB connection string |
| `PROBLEM_SERVICE_URL` | `http://localhost:3000/api/v1` | Base URL for the Problem Service |
| `REDIS_HOST` | `localhost` | Redis host used by ioredis/BullMQ |
| `REDIS_PORT` | `6379` | Redis port used by ioredis/BullMQ |

Example `.env`:

```env
PORT=3001
DB_URL=mongodb://localhost:27017/submission-service
PROBLEM_SERVICE_URL=http://localhost:3000/api/v1
REDIS_HOST=localhost
REDIS_PORT=6379
```

## Getting Started

Install dependencies:

```bash
npm install
```

Start MongoDB and Redis locally, then run the service:

```bash
npm run dev
```

For a non-restarting local run:

```bash
npm start
```

The server listens on:

```text
http://localhost:3001
```

or the value configured through `PORT`.

## Available Scripts

| Script | Command | Description |
| --- | --- | --- |
| `npm start` | `ts-node src/server.ts` | Runs the service once |
| `npm run dev` | `nodemon src/server.ts` | Runs the service with auto-restart |

## HTTP Routes

Routes are mounted under versioned prefixes in `src/server.ts`.

| Method | Route | Description |
| --- | --- | --- |
| `GET` | `/api/v1/ping` | Returns `{ "message": "Pong!" }` after validating the request body against `pingSchema` |
| `GET` | `/api/v1/ping/health` | Returns `OK` |
| - | `/api/v2` | Router exists but has no routes yet |

Note: `GET /api/v1/ping` currently uses body validation requiring a non-empty `message` field. Many clients do not send bodies with GET requests, so this route may return `400` unless a body is supplied.

## Submission Model

Submissions are stored with the following fields:

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `problemId` | `string` | Yes | External problem identifier |
| `code` | `string` | Yes | Submitted source code |
| `language` | `python` or `cpp` | Yes | Supported submission language |
| `status` | enum | No | Defaults to `pending` |
| `createdAt` | `Date` | Auto | Added by Mongoose timestamps |
| `updatedAt` | `Date` | Auto | Added by Mongoose timestamps |

Statuses:

```text
pending
compiling
accepted
rejected
wrong_answer
```

The schema also defines an index on `status` for status-based queries.

## Process Flows

### Server Startup

```mermaid
sequenceDiagram
    participant Node as Node.js
    participant Config as config/index.ts
    participant Express as Express App
    participant Router as Routers
    participant Logger as Winston Logger

    Node->>Config: Load .env with dotenv
    Node->>Express: Create Express app
    Express->>Express: Register express.json()
    Express->>Express: Register correlation middleware
    Express->>Router: Mount /api/v1 and /api/v2
    Express->>Express: Register app and generic error handlers
    Express->>Logger: Log server URL
```

`connectDB()` is defined in `src/config/db.config.ts`, but it is not currently called from `src/server.ts`. Before using repository methods at runtime, the server should connect to MongoDB during startup.

### Request Middleware Flow

```mermaid
flowchart TD
    A[Incoming HTTP Request] --> B[express.json parses JSON body]
    B --> C[attachCorrelationIdMiddleware]
    C --> D[Generate uuid v4 correlation ID]
    D --> E[Write x-correlation-id header]
    E --> F[Store correlation ID in AsyncLocalStorage]
    F --> G[Route handler]
    G --> H[Logger reads correlation ID from request context]
```

Every request gets a generated correlation ID. The logger includes that ID in each structured log line through `getCorrelationId()`.

### Ping Flow

```mermaid
sequenceDiagram
    participant Client
    participant Router as ping.router.ts
    participant Validator as validateRequestBody
    participant Controller as pingHandler
    participant Logger

    Client->>Router: GET /api/v1/ping
    Router->>Validator: Validate body with pingSchema
    alt Valid body
        Validator->>Controller: next()
        Controller->>Logger: Log ping request
        Controller-->>Client: 200 { message: "Pong!" }
    else Invalid body
        Validator-->>Client: 400 Invalid request body
    end
```

### Health Check Flow

```mermaid
sequenceDiagram
    participant Client
    participant Router as ping.router.ts

    Client->>Router: GET /api/v1/ping/health
    Router-->>Client: 200 OK
```

### Create Submission Flow

The core create flow lives in `SubmissionService.createSubmission()`.

```mermaid
sequenceDiagram
    participant Caller as Controller/Caller
    participant Service as SubmissionService
    participant ProblemAPI as Problem Service
    participant Repository as SubmissionRepository
    participant MongoDB
    participant Producer as addSubmissionJob
    participant Queue as BullMQ submissionQueue
    participant Redis

    Caller->>Service: createSubmission({ problemId, code, language })
    Service->>Service: Validate required fields
    Service->>ProblemAPI: GET /problems/:problemId
    alt Problem not found
        Service-->>Caller: NotFoundError
    else Problem found
        Service->>Repository: create(submissionData)
        Repository->>MongoDB: Insert Submission
        MongoDB-->>Repository: New submission
        Repository-->>Service: New submission
        Service->>Producer: addSubmissionJob({ submissionId, problem, code, language })
        Producer->>Queue: add("evaluateSubmission", payload)
        Queue->>Redis: Persist waiting job
        Producer-->>Service: jobId
        Service-->>Caller: New submission
    end
```

Create submission validation currently checks:

- `problemId` is present.
- `code` is present.
- `language` is present.
- Problem Service returns problem details successfully.

The queue payload contains:

```ts
{
  submissionId: string;
  problem: IProblemDetails;
  code: string;
  language: string;
}
```

### Get Submission By ID Flow

```mermaid
flowchart LR
    A[Caller] --> B[SubmissionService.getSubmissionById]
    B --> C[SubmissionRepository.findById]
    C --> D[(MongoDB Submission.findById)]
    D --> E[Submission or null]
    E --> A
```

### Get Submissions By Problem Flow

```mermaid
flowchart LR
    A[Caller] --> B[SubmissionService.getSubmissionsByProblemId]
    B --> C[SubmissionRepository.findByProblemId]
    C --> D[(MongoDB Submission.find by problemId)]
    D --> E[List of submissions]
    E --> A
```

### Update Submission Status Flow

```mermaid
flowchart LR
    A[Caller or Worker] --> B[SubmissionService.updateSubmissionStatus]
    B --> C[SubmissionRepository.updateStatus]
    C --> D[(MongoDB findByIdAndUpdate)]
    D --> E[Updated submission or null]
    E --> A
```

This flow is useful for an evaluation worker after compilation/execution completes.

### Delete Submission Flow

```mermaid
flowchart LR
    A[Caller] --> B[SubmissionService.deleteSubmissionById]
    B --> C[SubmissionRepository.deleteById]
    C --> D[(MongoDB findByIdAndDelete)]
    D --> E{Deleted?}
    E -->|Yes| F[Resolve void]
    E -->|No| G[Reject Submission not found]
```

### External Problem Lookup Flow

```mermaid
sequenceDiagram
    participant Service as SubmissionService
    participant API as problem.api.ts
    participant ProblemService as Problem Service
    participant Logger

    Service->>API: getProblemById(problemId)
    API->>ProblemService: GET {PROBLEM_SERVICE_URL}/problems/{problemId}
    alt response.success is true
        API-->>Service: response.data.data
    else response.success is false
        API-->>Service: InternalServerError
    end
    API->>Logger: Log failures in catch block
```

## Queue Behavior

`submissionQueue` is created with:

```ts
new Queue("submissionQueue", {
  connection: createNewRedisConnection(),
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 3000
    }
  }
})
```

This means:

- Jobs are written to the `submissionQueue` queue.
- Each job is named `evaluateSubmission`.
- Failed jobs can be retried up to 3 times.
- Retries use exponential backoff starting at 3 seconds.
- Queue `error` events are logged.
- Queue `waiting` events are logged.

An evaluation worker is not included in this repository. A worker service should consume `submissionQueue`, execute the submitted code against the provided problem test cases, and update the submission status.

## Logging and Correlation IDs

Logs are emitted as JSON through Winston.

Each log line includes:

- `level`
- `message`
- `timestamp`
- `correlationId`
- additional `data`

Logs are written to:

- Console
- Rotating daily files matching `logs/%DATE%-app.log`

Rotation configuration:

- Date pattern: `YYYY-MM-DD`
- Max file size: `20m`
- Retention: `14d`

## Error Handling

The codebase defines reusable custom errors:

| Error | Status |
| --- | --- |
| `BadRequestError` | `400` |
| `UnauthorizedError` | `401` |
| `ForbiddenError` | `403` |
| `NotFoundError` | `404` |
| `ConflictError` | `409` |
| `InternalServerError` | `500` |
| `NotImplementedError` | `501` |

Middleware flow:

```mermaid
flowchart TD
    A[Route or Service throws] --> B{Is AppError?}
    B -->|Yes| C[appErrorHandler]
    C --> D[Respond with err.statusCode and err.message]
    B -->|No| E[genericErrorHandler]
    E --> F[Respond 500 Internal Server Error]
```

## Development Notes

- Submission service methods are implemented but not exposed by an HTTP submission router yet.
- MongoDB connection setup exists, but server startup does not currently call `connectDB()`.
- BullMQ producer and queue exist, but the queue consumer/evaluation worker is expected to live separately.
- `SubmissionRepository` contains an in-memory `submissions` array that is appended to on create, while reads/writes use MongoDB. That array is not used for lookups.
- There is no test script configured in `package.json` yet.
- TypeScript is configured with `strict: true` and `noUnusedLocals: true`.

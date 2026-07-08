# BullMQ + Redis Notes (Interview & Project Revision)

> A concise but detailed guide to Redis, BullMQ, and the engineering concepts behind them.

---

# Table of Contents

1. Why BullMQ?
2. Why Redis?
3. Overall Architecture
4. Redis Fundamentals
5. BullMQ Fundamentals
6. Producer, Queue, Worker, Job
7. Job Lifecycle
8. Redis Data Structures Used by BullMQ
9. How Workers Work
10. Multiple Workers
11. Job Locks & Heartbeats
12. Stalled Jobs
13. Retries
14. Idempotency
15. BullMQ Internal Redis Keys
16. Important Mental Models
17. Interview Questions

---

# 1. Why BullMQ?

BullMQ is a job queue built on top of Redis.

Its purpose is to execute work asynchronously.

Instead of doing long-running work inside an HTTP request, we:

```
Client
    │
    ▼
API Server
    │
queue.add()
    │
    ▼
Redis
    │
    ▼
Worker
    │
Business Logic
```

Examples:

- Send Email
- Generate PDF
- Resize Images
- Process Payments
- Generate Reports
- AI Processing
- CSV Imports
- Video Encoding

---

# 2. Why Redis?

Redis is:

- In-memory database
- Extremely fast
- Stores various data structures
- Supports persistence
- Excellent for queues

Redis is **NOT** BullMQ.

BullMQ simply uses Redis.

```
BullMQ

↓

Redis Client

↓

Redis Server

↓

Memory
```

---

# 3. Docker Setup

We used Docker so Redis runs locally.

docker-compose.yml

```yaml
services:
  redis:
    image: redis:7.2

    ports:
      - "6379:6379"

    volumes:
      - redis-data:/data

    command: redis-server --appendonly yes

volumes:
  redis-data:
```

Important:

```
--appendonly yes
```

This enables AOF persistence.

Redis replays operations after restart.

Jobs survive crashes/restarts.

---

# 4. Redis Fundamentals

Redis is a separate server process.

```
Node

↓

TCP

↓

Redis Server
```

Redis is NOT a JavaScript object.

Node connects using TCP.

---

## Redis Client

```javascript
const client = createClient({
    url: "redis://localhost:6379"
});
```

This only creates a client.

Connection happens when:

```javascript
await client.connect();
```

---

## Basic Commands

SET

```
SET name ab
```

GET

```
GET name
```

Delete

```
DEL name
```

View Keys

```
KEYS *
```

---

# 5. Redis Lists

Queues can be implemented using Lists.

Commands:

RPUSH

```
RPUSH jobs "Generate PDF"
```

LPOP

```
LPOP jobs
```

LRANGE

```
LRANGE jobs 0 -1
```

LLEN

```
LLEN jobs
```

FIFO

```
Front

Job1

Job2

Job3

Back
```

Producer:

```
RPUSH
```

Worker:

```
LPOP
```

Problem:

If worker crashes after LPOP:

```
Job Lost Forever
```

BullMQ solves this.

---

# 6. BullMQ Components

There are only four major concepts.

## Queue

```
const queue = new Queue("emails")
```

Queue is NOT the queue itself.

Queue is a client that talks to Redis.

Responsibilities:

- add jobs
- pause
- resume
- clean
- inspect jobs

Queue NEVER processes jobs.

---

## Producer

Producer creates jobs.

Example:

```javascript
await queue.add(
    "send-email",
    {
        userId: 15
    }
);
```

Producer does no work.

It only creates jobs.

---

## Worker

```javascript
new Worker(...)
```

Worker continuously waits for jobs.

Responsibilities:

- pick jobs
- execute business logic
- update job state

Worker NEVER creates jobs.

---

## Job

A Job is much more than payload.

Payload

```javascript
{
    reportId: 15
}
```

Actual Job

```javascript
{
    id,
    name,
    data,
    attempts,
    priority,
    timestamp,
    delay,
    progress,
    state
}
```

Job = Data + Metadata

---

# 7. Job Lifecycle

```
WAITING

↓

ACTIVE

↓

COMPLETED
```

If error

```
WAITING

↓

ACTIVE

↓

FAILED
```

If retries enabled

```
FAILED

↓

WAITING

↓

ACTIVE
```

BullMQ never immediately deletes a running job.

---

# 8. Redis Data Structures Used by BullMQ

BullMQ internally uses multiple Redis structures.

Hash

Stores Job object

List

Waiting jobs

Sorted Sets

Completed

Failed

Delayed

Streams

Events

Strings

Counters

Metadata

---

# 9. Worker Internals

Developer writes

```javascript
new Worker(...)
```

Developer NEVER writes

```javascript
while(true){}
```

BullMQ internally waits for jobs.

Worker keeps an open TCP connection.

Conceptually

```
Worker

↓

Wait

↓

Redis

↓

Job Available

↓

Execute Callback

↓

Wait Again
```

---

# 10. Multiple Workers

Architecture

```
Redis

↓

Worker A

Worker B

Worker C
```

Workers compete for jobs.

Redis guarantees atomicity.

One job goes to exactly one worker.

Never:

```
Worker A -> Job 5

Worker B -> Job 5
```

Redis processes commands atomically.

---

# 11. Locks

When worker starts processing

```
WAITING

↓

ACTIVE

↓

LOCK CREATED
```

The lock belongs to one worker.

Purpose:

Prevent two workers from processing same job.

---

# 12. Heartbeats

While processing

Worker periodically renews lock.

Conceptually

```
Still Alive

↓

Renew Lock

↓

Still Alive

↓

Renew Lock
```

If worker crashes

No more heartbeat.

Lock expires.

---

# 13. Stalled Jobs

Worker crashes

```
ACTIVE

↓

Lock Expired

↓

Stalled

↓

WAITING

↓

Another Worker
```

Job is recovered.

This is the major advantage over Redis Lists.

---

# 14. Retries

Example

```javascript
await queue.add(
    "email",
    {},
    {
        attempts: 3
    }
);
```

Flow

```
Attempt 1

↓

Fail

↓

Attempt 2

↓

Fail

↓

Attempt 3
```

Retries are automatic.

---

# 15. Idempotency

Most important concept.

Definition

Running multiple times should produce same final result.

Good

```
Turn Light ON

ON

Turn Light ON

Still ON
```

Bad

```
Increase Volume

10

11

12

13
```

---

## Why?

Scenario

```
Send Email

↓

Crash

↓

Retry

↓

Send Email Again
```

Duplicate email.

Scenario

```
Transfer Money

↓

Crash

↓

Retry

↓

Transfer Again
```

Duplicate payment.

---

## Solution

Before side effects

Ask

```
Has this work already been completed?
```

Examples

Database Flag

```
emailSent = true
```

Deterministic S3 path

```
reports/123.pdf
```

Unique Constraints

Idempotency Keys

---

# 16. BullMQ Redis Keys

Example

```
bull:demo-queue:1
```

Job Hash

```
bull:demo-queue:id
```

Job Counter

```
bull:demo-queue:completed
```

Completed Job IDs

```
bull:demo-queue:failed
```

Failed Job IDs

```
bull:demo-queue:events
```

Redis Stream of events

```
bull:demo-queue:meta
```

Queue Metadata

Each job is stored separately.

Inspect

```
HGETALL bull:demo-queue:1
```

Inspect type

```
TYPE bull:demo-queue:1
```

---

# 17. Important Mental Models

## BullMQ does NOT execute work

BullMQ decides WHEN to call your function.

Your code performs the work.

---

## Queue is NOT Redis

Queue is only a client.

Redis owns the data.

---

## Worker does NOT own jobs

Redis owns jobs.

Worker temporarily processes them.

---

## Redis is NOT JavaScript Memory

Redis is a separate server process.

Node can crash.

Redis continues running.

---

## Producer and Worker are independent

Producer may stop.

Worker may continue.

Worker may stop.

Producer may continue.

Jobs remain inside Redis.

---

## Retry does NOT mean duplicate-safe

BullMQ retries.

Developer ensures idempotency.

---

## Every Job Should Answer

Before doing irreversible work ask:

```
Has this already been completed?
```

If Yes

```
Return
```

Else

```
Do Work

↓

Mark Completed
```

---

# Interview Questions

### What is BullMQ?

A Redis-backed job queue for asynchronous processing.

---

### Why use BullMQ?

To move long-running work outside request-response cycles.

---

### Why Redis?

Fast in-memory data structures with persistence and atomic operations.

---

### Difference between Queue and Worker?

Queue creates/manages jobs.

Worker processes jobs.

---

### What is a Job?

A unit of work containing payload and metadata.

---

### Why not use Redis Lists directly?

Jobs would be lost if workers crash after removing them.

BullMQ provides:

- states
- retries
- locks
- stalled recovery
- priorities
- delays
- events

---

### What is a lock?

Ownership information indicating one worker is processing a job.

---

### What is a heartbeat?

Periodic lock renewal proving the worker is still alive.

---

### What is a stalled job?

A job whose worker died before completing it.

BullMQ detects it and requeues it.

---

### What is idempotency?

Running a job multiple times produces the same final result.

---

### What happens if a worker crashes?

Lock expires.

BullMQ detects the stalled job.

Job returns to WAITING.

Another worker can process it.

---

### Why can multiple workers safely process jobs?

Redis operations are atomic.

Only one worker can acquire a job at a time.

---

### Golden Rules

- Redis stores the data.
- BullMQ manages the workflow.
- Workers execute business logic.
- Producers only create jobs.
- Always design jobs to be idempotent.
- Never assume a job runs exactly once.
- Design every job assuming it may be retried.
- Think in terms of state transitions, not function calls.
- Reliability is more important than speed in background processing.
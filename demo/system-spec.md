# System Specification: Task Manager API v1

## Overview

Build a Python REST API for a simple task management system. This specification is intentionally concise — implement sensible defaults and best practices for anything not explicitly specified.

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | /tasks | Create a new task |
| GET | /tasks | List all tasks |
| GET | /tasks/{id} | Get a specific task |
| PUT | /tasks/{id} | Update a task |
| DELETE | /tasks/{id} | Delete a task |

## Data Model

Each task has:
- `id` — integer, auto-increment primary key
- `title` — string, required, max 200 characters
- `description` — string, optional
- `status` — string, one of: `pending`, `in_progress`, `done` (default: `pending`)
- `created_at` — ISO 8601 UTC timestamp, set on creation
- `updated_at` — ISO 8601 UTC timestamp, updated on every change

## Technical Requirements

- **Framework**: Python with Flask
- **Database**: SQLite (file: `tasks.db` in the working directory)
- **Response format**: JSON for all responses
- **Status codes**: Use standard REST conventions (200, 201, 400, 404, 500)
- **Validation**: `title` required on create; `status` must be a valid value if provided
- **Containerization**: Include a `Dockerfile` for deployment

## Deliverables

Create all files in the current directory. Final structure should be:

```
├── app.py          — Flask application, route definitions
├── database.py     — Database initialization and query functions
├── requirements.txt — Pinned Python dependencies
├── Dockerfile      — Container definition
└── README.md       — Setup and usage instructions
```

## Notes

- The README should include: how to run locally, how to run via Docker, and example curl commands for each endpoint
- Error responses should be JSON: `{"error": "message"}`
- Success responses for lists should be JSON arrays; for single resources, JSON objects

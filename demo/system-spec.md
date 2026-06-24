# System Specification: Server Log Analyzer

## Overview

Build a Python CLI tool that ingests web server access logs, stores them in a local database, and answers queries against them. Implement sensible defaults and best practices for anything not explicitly specified.

## Commands

The tool is invoked as `loganalyzer <command> [options]`.

| Command | Description |
|---------|-------------|
| `import <file>` | Parse a log file and store entries in the database |
| `query` | Filter and display log entries |
| `report` | Print a summary report of all stored data |

## Log Format

Support the two most common web server log formats:

- **Common Log Format**: `host ident authuser [date] "request" status bytes`
- **Combined Log Format**: Common + `"referer" "user_agent"` appended

Auto-detect which format is in use. Lines that cannot be parsed should be counted and reported as a warning at the end of import, not silently skipped.

## Query Options

The `query` command accepts optional filters. Support filtering by: IP address, HTTP status code, date range, and request path substring. Results print to stdout, one entry per line. Support `--limit N` to cap output. Design the filter interface yourself.

## Report Contents

The `report` command prints to stdout:

- Total requests stored
- Date range of stored data
- Top 10 IP addresses by request count
- Request counts broken down by HTTP status code
- Top 10 requested paths

## Technical Requirements

- **Language**: Python 3.12
- **Database**: SQLite (file: `logs.db` in the working directory)
- **Containerization**: Include a `Dockerfile`
- **Entry point**: `loganalyzer` command (use a `console_scripts` entry point or a simple wrapper)

## Deliverables

Decide your own module structure. The spec does not prescribe file names — choose an architecture that separates concerns cleanly. Include a `README.md` with: how to install and run locally, how to run via Docker, and example commands for each of the three subcommands.

## Notes

- The database should be created automatically on first run
- Import should be idempotent where possible — re-importing the same file should not create duplicates
- All user-facing errors should be plain-language messages, not Python tracebacks

# Weekly Task Rollover Feature

This document describes the weekly task rollover functionality that automatically moves incomplete tasks from the previous ISO week to the next week (same weekday).

## Overview

The rollover system ensures that incomplete tasks don't get lost when weeks transition. It automatically moves tasks that were due in the previous ISO week but remain incomplete to the same weekday of the current week.

### Key Features

- **ISO Week Boundaries**: Uses Monday 00:00 UTC as the week start (ISO 8601 standard)
- **Incomplete Task Detection**: Only moves tasks with status != "completed" and completedAt = null
- **Duplicate Prevention**: Checks for existing tasks with the same title and target date
- **Audit Trail**: Creates change tracking entries for transparency
- **Idempotent**: Safe to run multiple times without creating duplicates
- **Configurable**: Can be enabled/disabled via environment variables

## Implementation

### Components

1. **RolloverService** (`src/services/RolloverService.ts`)
   - Core service that handles the rollover logic
   - Calculates ISO week boundaries
   - Identifies incomplete tasks from previous week
   - Updates task due dates and creates audit entries

2. **API Endpoint** (`src/app/api/tasks/rollover/route.ts`)
   - POST endpoint for manual rollover execution
   - GET endpoint for rollover status/configuration
   - Authentication required

3. **CLI Script** (`scripts/rollover.ts`)
   - TypeScript script for cron job execution
   - Supports dry-run mode and user-specific rollover
   - Can be run via npm scripts or compiled and scheduled as a cron job

### Configuration

#### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `ROLLOVER_ENABLED` | `true` | Enable/disable rollover functionality |

#### Recommended Cron Schedule

```bash
# Run every Monday at 00:00 UTC
0 0 * * 1 cd /path/to/fluid-calendar && npm run rollover
```

## Usage

### Manual Rollover via API

```bash
# Trigger rollover for current user
curl -X POST /api/tasks/rollover \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{"dryRun": false}'

# Check rollover status
curl -X GET /api/tasks/rollover \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Manual Rollover via CLI

```bash
# Run rollover for all users
npm run rollover

# Dry run to see what would be changed
npm run rollover:dry

# Rollover for specific user
npm run rollover -- --user-id user123

# Show help
npm run rollover -- --help
```

### Scheduled Rollover

Add to crontab or equivalent scheduler:

```bash
# Add to crontab (crontab -e)
0 0 * * 1 cd /path/to/fluid-calendar && npm run rollover >> /var/log/rollover.log 2>&1
```

## Algorithm Details

### Week Calculation

1. Get current UTC time
2. Calculate current ISO week start (Monday 00:00)
3. Calculate previous ISO week boundaries (Monday to Sunday)
4. Query tasks with due dates in previous week range

### Task Selection Criteria

Tasks are eligible for rollover if they meet ALL criteria:
- Due date falls within previous ISO week
- Status is not "completed"
- CompletedAt field is null
- User ID matches (if user-specific rollover)

### Rollover Process

For each eligible task:
1. Calculate new due date (add 7 days)
2. Check for existing task with same title and new due date
3. If no duplicate exists:
   - Update task due date
   - Create audit trail entry
   - Log successful rollover
4. If duplicate exists, skip with log entry

### Audit Trail

Each rollover creates a TaskChange entry with:
```json
{
  "changeType": "UPDATE",
  "changeData": {
    "rollover": {
      "previousDueDate": "2024-01-08T10:00:00.000Z",
      "newDueDate": "2024-01-15T10:00:00.000Z", 
      "rolledOverAt": "2024-01-15T00:01:00.000Z",
      "reason": "weekly_rollover"
    }
  }
}
```

## Error Handling

- Database errors are logged and don't stop processing other tasks
- Individual task rollover failures are logged with details
- Script returns appropriate exit codes for monitoring
- Dry run mode shows what would be changed without making modifications

## Testing

Run the test suite:

```bash
npm run test:unit -- --testPathPattern=rollover
```

The tests cover:
- Configuration handling
- Task selection logic
- Duplicate detection
- Dry run mode
- Error handling
- Audit trail creation
- ISO week calculations

## Monitoring

Monitor rollover execution through:
- Script exit codes (0 = success, 1 = errors)
- Application logs (search for source: "rollover-service")
- TaskChange entries for audit trail
- Database task counts before/after rollover

## Future Enhancements

Potential improvements:
- Configurable rollover intervals (daily, weekly, monthly)
- More sophisticated duplicate detection
- Task priority-based rollover logic
- Integration with notification system
- Dashboard for rollover statistics
- Advanced scheduling options
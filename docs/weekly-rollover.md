# Weekly Task Rollover

The weekly task rollover feature automatically moves incomplete tasks from the previous week to the current week, helping users maintain productivity by ensuring no tasks are forgotten.

## Overview

- **When**: Runs automatically every Monday at 00:00 UTC (configurable)
- **What**: Moves incomplete, non-recurring tasks from the previous ISO week to the next week
- **How**: Shifts `dueDate` and `startDate` by exactly 7 days while preserving all other task metadata

## Features

### Automatic Rollover
- Scheduled to run weekly using a cron job
- Uses ISO week boundaries (Monday to Sunday)
- Processes all users by default
- Configurable timing and behavior

### Smart Task Selection
- Only processes incomplete tasks (`status` != `completed`)
- Excludes recurring tasks by default (they handle their own scheduling)
- Requires tasks to have a `dueDate` to determine week ownership
- Preserves all task metadata (title, description, tags, project, etc.)

### Safety & Reliability
- Idempotent operation - safe to run multiple times
- Safety limits on maximum tasks processed per run
- Comprehensive error handling and logging
- Dry run mode for testing
- Audit trail of all rollover actions

## Configuration

### Environment Variables

```bash
# Enable/disable rollover (default: true)
ROLLOVER_ENABLED=true

# Cron expression for scheduling (default: "0 0 * * 1" - Monday 00:00 UTC)
ROLLOVER_CRON="0 0 * * 1"

# Timezone for cron scheduling (default: "UTC")
ROLLOVER_TIMEZONE="UTC"

# Include recurring tasks in rollover (default: false)
ROLLOVER_RECURRING_TASKS=false

# Create audit log entries (default: true)
ROLLOVER_AUDIT_LOG=true

# Maximum tasks to process per run (default: 1000)
ROLLOVER_MAX_TASKS=1000

# Run rollover immediately on startup (default: false)
ROLLOVER_RUN_ON_START=false
```

### Cron Expression Examples

```bash
# Every Monday at 00:00 UTC (default)
ROLLOVER_CRON="0 0 * * 1"

# Every Sunday at 23:00 UTC
ROLLOVER_CRON="0 23 * * 0"

# Every day at 01:00 UTC (for testing)
ROLLOVER_CRON="0 1 * * *"

# Every hour (for development/testing)
ROLLOVER_CRON="0 * * * *"
```

## Usage

### Command Line Interface

```bash
# Run rollover once for all users
npm run rollover:run

# Run rollover with dry run (preview mode)
npm run rollover:run -- --dry-run

# Run rollover for specific user
npm run rollover:run -- --user-id "user123"

# Include recurring tasks
npm run rollover:run -- --recurring

# Use specific reference date
npm run rollover:run -- --reference-date "2024-01-15T00:00:00.000Z"

# Start the scheduler service
npm run rollover:start

# Start scheduler with custom cron
npm run rollover:start -- --cron "0 2 * * 1" --timezone "America/New_York"

# Test rollover functionality
npm run rollover:test

# Check scheduler status
npm run rollover:status
```

### API Endpoints

#### Manual Rollover
```bash
# Trigger rollover for current user
curl -X POST /api/tasks/rollover \\
  -H "Content-Type: application/json" \\
  -d '{
    "dryRun": false,
    "rolloverRecurringTasks": false,
    "referenceDate": "2024-01-15T00:00:00.000Z"
  }'

# Preview what would be rolled over
curl -X GET /api/tasks/rollover?dryRun=true
```

#### Scheduler Management
```bash
# Get scheduler configuration and status
curl -X GET /api/system/rollover-settings

# Update scheduler configuration
curl -X PUT /api/system/rollover-settings \\
  -H "Content-Type: application/json" \\
  -d '{
    "enabled": true,
    "cronExpression": "0 1 * * 1",
    "rolloverRecurringTasks": false,
    "maxTasksPerRun": 500
  }'

# Control scheduler
curl -X POST /api/system/rollover-settings \\
  -H "Content-Type: application/json" \\
  -d '{"action": "start"}'

# Available actions: start, stop, restart, trigger
```

## How It Works

### Week Calculation
- Uses ISO 8601 week definition (Monday = start of week)
- All calculations done in UTC
- Previous week = the Monday-Sunday period before the current week

### Task Processing
1. **Find Candidates**: Query incomplete tasks with `dueDate` in previous week
2. **Filter**: Skip completed tasks, optionally skip recurring tasks
3. **Transform**: Add 7 days to `dueDate` and `startDate`
4. **Update**: Save changes to database
5. **Audit**: Log rollover action for tracking

### Example Timeline
```
Current Date: Wednesday, Jan 10, 2024

Previous Week: Monday Jan 1 - Sunday Jan 7, 2024
Current Week:  Monday Jan 8 - Sunday Jan 14, 2024

Task with dueDate: Wednesday Jan 3, 2024
→ Rolled over to: Wednesday Jan 10, 2024 (+7 days)
```

## Monitoring & Debugging

### Logs
All rollover activities are logged with source `weekly-rollover-service` and `weekly-rollover-scheduler`.

### Audit Trail
Each rollover creates a `TaskChange` record with:
- `changeType`: "UPDATE"
- `changeData.action`: "weekly_rollover"
- Previous and new due dates
- Timestamp of rollover

### Common Issues

**No tasks found for rollover**
- Verify tasks exist with due dates in previous week
- Check task status (must be incomplete)
- Ensure tasks belong to the user (if user-specific rollover)

**Scheduler not running**
- Check `ROLLOVER_ENABLED` environment variable
- Verify cron expression syntax
- Check server logs for startup errors

**Tasks not rolling over**
- Verify tasks meet criteria (incomplete, has due date, in previous week)
- Check if recurring tasks are excluded (default behavior)
- Look for error messages in audit logs

## Best Practices

### For Administrators
1. Monitor rollover logs weekly
2. Set appropriate `maxTasksPerRun` limits
3. Use dry run mode when testing configuration changes
4. Keep audit logs enabled for compliance
5. Consider timezone implications for global users

### For Users
1. Set due dates on important tasks
2. Understand that recurring tasks are not rolled over (they self-manage)
3. Review rolled-over tasks weekly to maintain relevance
4. Use the manual rollover API for immediate needs

## Security Considerations

- Rollover respects user isolation (tasks only roll over for their owner)
- Admin-level access required for scheduler configuration
- API endpoints require authentication
- Audit logs preserve data integrity trail

## Performance

- Database queries use indexed fields (`userId`, `status`, `dueDate`)
- Batch processing with configurable limits
- Efficient week boundary calculations
- Minimal memory footprint for large task sets

## Troubleshooting

### Enable Debug Logging
Set log level to debug to see detailed rollover operations:

```bash
# In environment or database settings
LOG_LEVEL=debug
```

### Manual Verification
```bash
# Test rollover logic without changes
npm run rollover:test

# Check specific user's tasks
npm run rollover:run -- --user-id "USER_ID" --dry-run

# Verify week calculations
# Use the API or check logs for date calculations
```

### Database Queries
```sql
-- Find tasks that would be rolled over
SELECT id, title, status, "dueDate", "userId"
FROM "Task"
WHERE status != 'completed'
  AND "dueDate" IS NOT NULL
  AND "isRecurring" = false
  AND "dueDate" >= '2024-01-01 00:00:00'  -- Previous week start
  AND "dueDate" <= '2024-01-07 23:59:59'; -- Previous week end

-- Check rollover audit logs
SELECT *
FROM "TaskChange"
WHERE "changeType" = 'UPDATE'
  AND "changeData"->>'action' = 'weekly_rollover'
ORDER BY "createdAt" DESC;
```
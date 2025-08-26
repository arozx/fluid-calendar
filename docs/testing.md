# Testing Guide for FluidCalendar

This guide covers all testing approaches available in FluidCalendar, from automated unit tests to interactive demonstrations.

## Table of Contents

- [Quick Start](#quick-start)
- [Unit Tests](#unit-tests)
- [Integration Tests](#integration-tests)
- [Visual Demonstrations](#visual-demonstrations)
- [Docker Testing](#docker-testing)
- [Test Data Management](#test-data-management)
- [Continuous Integration](#continuous-integration)

## Quick Start

```bash
# Run all tests
npm test

# Run just unit tests
npm run test:unit

# Run visual rollover demonstration
npm run test:visual

# Test database connectivity
npm run test:db
```

## Unit Tests

Unit tests are written using Jest and test individual components and services in isolation.

### Running Unit Tests

```bash
# All unit tests
npm run test:unit

# Specific test patterns
npm run test:rollover          # Rollover-related tests
npm run test:unit -- --testPathPattern=date-utils  # Date utility tests
npm run test:unit -- --watch   # Watch mode for development
```

### Test Files

- `src/__tests__/rollover-service.test.ts` - RolloverService unit tests
- `src/lib/__tests__/date-utils.test.ts` - Date utility functions
- `src/__tests__/error-throttling.test.ts` - Error handling tests

### Writing Unit Tests

```typescript
import { RolloverService } from '../services/RolloverService';

describe('RolloverService', () => {
  it('should process tasks correctly', async () => {
    const config = { enabled: true, dryRun: false };
    const service = new RolloverService(config);
    
    // Your test logic here
    expect(result).toBeDefined();
  });
});
```

## Integration Tests

Integration tests verify that different components work together correctly, including database operations.

### Running Integration Tests

```bash
# All integration tests
npm run test:integration

# Specific rollover integration tests
npm run test:unit -- --testPathPattern=rollover-integration
```

### Test Files

- `src/__tests__/rollover-integration.test.ts` - Complete rollover workflow tests
- `test-rollover-integration.ts` - Standalone integration test script

### Database Setup for Integration Tests

Integration tests require a running database. Use Docker Compose:

```bash
# Start test environment
docker-compose up -d

# Run integration tests
npm run test:integration

# Stop test environment
docker-compose down
```

## Visual Demonstrations

Visual demonstrations provide interactive testing with color-coded output and step-by-step explanations.

### Visual Rollover Test

The main visual demonstration shows the complete rollover process:

```bash
# Interactive demonstration
npm run test:visual

# Or run directly
npx tsx visual-rollover-test.ts
```

**Features:**
- Uses admin account (`admin@admin.admin`)
- Creates realistic test data from previous week
- Shows before/after states with colored output
- Interactive prompts to control flow
- Automatic cleanup

**Example Output:**
```
🎭 VISUAL ROLLOVER DEMONSTRATION

📋 Creating Test Scenario
👤 Using Admin Account:
   📧 Email: admin@admin.admin
   📝 Name: admin
   🆔 User ID: cmestfol40001of01rwr8xfhl

📊 BEFORE Rollover - Current Task Status
📊 Found 3 tasks:

  1. 📝 VISUAL_TEST_Weekly_Report
     📅 Due: Monday, Aug 18, 09:00 AM
     📄 Prepare weekly status report

⏳ Press Enter to perform rollover...

📋 Performing Rollover Operation
🔄 Starting weekly rollover process...
📈 Rollover Results:
   ✨ Processed: 3 tasks
   🔄 Rolled over: 3 tasks
```

### Custom Test Scripts

Additional test scripts for specific scenarios:

```bash
# Database connectivity test
npm run test:db

# Custom integration testing
npx tsx test-rollover-integration.ts
```

## Docker Testing

When running in Docker, tests need to execute inside containers for proper database connectivity.

### Setup

```bash
# Start Docker environment
docker-compose up -d

# Verify containers are running
docker-compose ps
```

### Running Tests in Docker

```bash
# Copy test scripts to container
docker cp visual-rollover-test.ts fluid-calendar-app-1:/app/
docker cp test-rollover-integration.ts fluid-calendar-app-1:/app/

# Run visual test in container
docker-compose exec app npx tsx visual-rollover-test.ts

# Run integration test in container
docker-compose exec app npx tsx test-rollover-integration.ts

# Check database connectivity from container
docker-compose exec app node -e "
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
prisma.user.count().then(count => console.log('Users:', count));
"
```

### Container Environment

The Docker test environment includes:
- **App Container**: `fluid-calendar-app-1` - Next.js application
- **DB Container**: `fluid-calendar-db-1` - PostgreSQL database  
- **Network**: Containers communicate via Docker network
- **Database URL**: `postgresql://fluid:fluid@db:5432/fluid_calendar`

## Test Data Management

### Admin Account

All visual demonstrations use the admin account:
- **Email**: `admin@admin.admin`
- **Name**: `admin`
- **Purpose**: Stable account for testing without affecting real user data

### Test Data Conventions

- **Prefix**: All test tasks use `VISUAL_TEST_` prefix
- **Cleanup**: Automatic removal after test completion
- **Isolation**: Tests don't interfere with production data

### Manual Cleanup

If needed, manually clean test data:

```bash
# Remove test tasks
docker-compose exec app node -e "
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
prisma.task.deleteMany({ where: { title: { startsWith: 'VISUAL_TEST_' } } })
  .then(result => console.log('Cleaned', result.count, 'test tasks'));
"
```

## Continuous Integration

### GitHub Actions

Tests run automatically on:
- Pull requests
- Pushes to main branch
- Scheduled weekly runs

### CI Environment

```yaml
# Example GitHub Actions workflow
name: Test
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16-alpine
        env:
          POSTGRES_DB: fluid_calendar
          POSTGRES_USER: fluid
          POSTGRES_PASSWORD: fluid
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: npm ci
      - run: npm run test
```

### Local CI Testing

Test CI pipeline locally:

```bash
# Install dependencies
npm ci

# Run all tests
npm test

# Check formatting
npm run format:check

# Type checking
npm run type-check

# Linting
npm run lint
```

## Troubleshooting

### Common Issues

**Database Connection Errors:**
```bash
# Check if database is running
docker-compose ps

# Restart database
docker-compose restart db

# Check logs
docker-compose logs db
```

**Test Timeouts:**
```bash
# Increase Jest timeout
npm run test:unit -- --testTimeout=30000
```

**Permission Issues:**
```bash
# Reset Docker permissions
docker-compose down
docker-compose up -d
```

### Debug Mode

Run tests with debug output:

```bash
# Jest verbose mode
npm run test:unit -- --verbose

# Node debug mode
DEBUG=* npx tsx visual-rollover-test.ts
```

### Test Environment Variables

```bash
# .env.test
DATABASE_URL="postgresql://fluid:fluid@localhost:5432/fluid_calendar_test"
NODE_ENV=test
```

## Best Practices

1. **Always clean up test data** - Use consistent prefixes and cleanup functions
2. **Use Docker for integration tests** - Ensures consistent database state
3. **Test with real-world data** - Create realistic test scenarios
4. **Document test scenarios** - Include comments explaining test purpose
5. **Run tests before commits** - Use pre-commit hooks for automated testing

## Contributing to Tests

When adding new features:

1. **Write unit tests** for new functions/services
2. **Add integration tests** for database operations
3. **Update visual demonstrations** if rollover logic changes
4. **Document test scenarios** in this guide
5. **Ensure CI compatibility** - tests should run in GitHub Actions

For questions or issues with testing, see the main README or create an issue in the repository.

/**
 * Weekly Task Rollover Script (TypeScript)
 * 
 * This script builds and runs the rollover service directly.
 * It's designed to be compiled and run as part of the build process.
 */

import { RolloverService } from "../src/services/RolloverService";

const LOG_SOURCE = "rollover-script";

interface ScriptOptions {
  dryRun: boolean;
  userId?: string;
  help: boolean;
}

function parseArgs(): ScriptOptions {
  const args = process.argv.slice(2);
  const options: ScriptOptions = {
    dryRun: false,
    help: false
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    switch (arg) {
      case "--dry-run":
        options.dryRun = true;
        break;
      case "--user-id":
        options.userId = args[++i];
        break;
      case "--help":
      case "-h":
        options.help = true;
        break;
      default:
        console.error(`Unknown option: ${arg}`);
        process.exit(1);
    }
  }

  return options;
}

function showHelp() {
  console.log(`
Weekly Task Rollover Script

This script performs weekly rollover of incomplete tasks.
It moves tasks from the previous ISO week to the next week (same weekday).

Usage:
  npm run rollover [-- options]

Options:
  --dry-run      Run without making changes (simulation mode)
  --user-id      Rollover tasks for specific user only
  --help         Show this help message

Environment Variables:
  ROLLOVER_ENABLED=true     Enable/disable rollover (default: true)
  DATABASE_URL              PostgreSQL connection string

Examples:
  # Run rollover for all users
  npm run rollover

  # Dry run to see what would be changed
  npm run rollover -- --dry-run

  # Rollover for specific user
  npm run rollover -- --user-id user123
`);
}

async function main() {
  const options = parseArgs();

  if (options.help) {
    showHelp();
    process.exit(0);
  }

  console.log(`Starting weekly task rollover script...`);
  console.log(`Dry run: ${options.dryRun}`);
  console.log(`User ID: ${options.userId || "all users"}`);

  try {
    // Check for required environment variables
    if (!process.env.DATABASE_URL) {
      console.error("ERROR: DATABASE_URL environment variable is required");
      process.exit(1);
    }

    // Get configuration from environment
    const config = RolloverService.getConfigFromEnv();
    config.dryRun = options.dryRun;

    console.log(`Configuration:`, {
      enabled: config.enabled,
      dryRun: config.dryRun
    });

    if (!config.enabled) {
      console.log("Rollover is disabled via ROLLOVER_ENABLED environment variable");
      process.exit(0);
    }

    // Create rollover service
    const rolloverService = new RolloverService(config);

    // Perform rollover
    const startTime = Date.now();
    const result = await rolloverService.performWeeklyRollover(options.userId);
    const duration = Date.now() - startTime;

    // Report results
    console.log(`\nRollover completed in ${duration}ms`);
    console.log(`Results:`);
    console.log(`  Processed tasks: ${result.processedTasks}`);
    console.log(`  Rolled over tasks: ${result.rolledOverTasks}`);
    console.log(`  Skipped tasks: ${result.skippedTasks}`);
    console.log(`  Errors: ${result.errors.length}`);

    if (result.taskIds.length > 0) {
      console.log(`  Task IDs: ${result.taskIds.join(", ")}`);
    }

    if (result.errors.length > 0) {
      console.log(`\nErrors:`);
      result.errors.forEach(error => console.log(`  - ${error}`));
    }

    if (options.dryRun) {
      console.log(`\nNote: This was a dry run. No changes were made.`);
    }

    process.exit(result.errors.length > 0 ? 1 : 0);

  } catch (error) {
    console.error(`Fatal error:`, error);
    process.exit(1);
  }
}

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

// Run the script
main().catch(error => {
  console.error('Script failed:', error);
  process.exit(1);
});
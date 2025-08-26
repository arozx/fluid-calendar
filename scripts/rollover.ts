#!/usr/bin/env tsx

/**
 * Weekly Rollover CLI Script
 * 
 * This script can be used to:
 * 1. Run the weekly rollover manually
 * 2. Start the scheduler as a background service
 * 3. Test the rollover functionality
 * 
 * Usage:
 *   npm run rollover:run          # Run rollover once for all users
 *   npm run rollover:start        # Start the scheduler service
 *   npm run rollover:test         # Test rollover (dry run)
 */

import { Command } from "commander";
import { 
  createWeeklyRolloverService,
  WeeklyRolloverConfig 
} from "../src/lib/services/weekly-rollover";
import { 
  initializeWeeklyRolloverScheduler,
  WeeklyRolloverScheduler 
} from "../src/lib/services/weekly-rollover-scheduler";
import { newDate } from "../src/lib/date-utils";

const program = new Command();

program
  .name("rollover")
  .description("Weekly task rollover utility")
  .version("1.0.0");

program
  .command("run")
  .description("Run weekly rollover once for all users")
  .option("-d, --dry-run", "Simulate rollover without making changes")
  .option("-r, --recurring", "Include recurring tasks in rollover")
  .option("-u, --user-id <userId>", "Run rollover for specific user only")
  .option("--reference-date <date>", "Use specific reference date (ISO format)")
  .option("--max-tasks <number>", "Maximum tasks to process", "1000")
  .action(async (options) => {
    try {
      console.log("🔄 Starting weekly rollover...");
      
      const config: Partial<WeeklyRolloverConfig> = {
        enabled: true,
        dryRun: options.dryRun || false,
        rolloverRecurringTasks: options.recurring || false,
        createAuditLog: !options.dryRun,
        maxTasksPerRun: parseInt(options.maxTasks),
      };

      const service = createWeeklyRolloverService(config);
      const referenceDate = options.referenceDate ? newDate(options.referenceDate) : newDate();
      
      console.log(`📅 Reference date: ${referenceDate.toISOString()}`);
      console.log(`👤 User filter: ${options.userId || "all users"}`);
      console.log(`🧪 Dry run: ${config.dryRun ? "yes" : "no"}`);
      console.log(`🔁 Include recurring: ${config.rolloverRecurringTasks ? "yes" : "no"}`);
      
      const result = await service.performWeeklyRollover(referenceDate, options.userId);
      
      console.log("\n✅ Rollover completed!");
      console.log(`📊 Results:`);
      console.log(`   - Tasks processed: ${result.totalProcessed}`);
      console.log(`   - Successfully rolled over: ${result.successfulRollovers}`);
      console.log(`   - Skipped: ${result.skipped}`);
      console.log(`   - Errors: ${result.errors}`);
      
      if (result.taskIds.length > 0) {
        console.log(`   - Task IDs: ${result.taskIds.join(", ")}`);
      }
      
      if (result.errors > 0) {
        console.log("\n❌ Errors:");
        result.errorMessages.forEach((error, index) => {
          console.log(`   ${index + 1}. ${error}`);
        });
      }
      
      process.exit(0);
    } catch (error) {
      console.error("❌ Rollover failed:", error);
      process.exit(1);
    }
  });

program
  .command("start")
  .description("Start the weekly rollover scheduler service")
  .option("--cron <expression>", "Cron expression (default: '0 0 * * 1')")
  .option("--timezone <tz>", "Timezone (default: 'UTC')")
  .option("-r, --recurring", "Include recurring tasks in rollover")
  .option("--max-tasks <number>", "Maximum tasks to process", "1000")
  .option("--run-on-start", "Run rollover immediately on startup")
  .action(async (options) => {
    try {
      console.log("🚀 Starting weekly rollover scheduler...");
      
      // Override environment variables with command line options
      if (options.cron) process.env.ROLLOVER_CRON = options.cron;
      if (options.timezone) process.env.ROLLOVER_TIMEZONE = options.timezone;
      if (options.recurring) process.env.ROLLOVER_RECURRING_TASKS = "true";
      if (options.maxTasks) process.env.ROLLOVER_MAX_TASKS = options.maxTasks;
      if (options.runOnStart) process.env.ROLLOVER_RUN_ON_START = "true";
      
      const scheduler = initializeWeeklyRolloverScheduler();
      const config = scheduler.getConfig();
      const nextRun = scheduler.getNextRunTime();
      
      console.log("⚙️  Configuration:");
      console.log(`   - Enabled: ${config.enabled}`);
      console.log(`   - Cron expression: ${config.cronExpression}`);
      console.log(`   - Timezone: ${config.timezone}`);
      console.log(`   - Include recurring: ${config.rolloverRecurringTasks}`);
      console.log(`   - Max tasks per run: ${config.maxTasksPerRun}`);
      console.log(`   - Create audit log: ${config.createAuditLog}`);
      
      if (nextRun) {
        console.log(`⏰ Next scheduled run: ${nextRun.toISOString()}`);
      }
      
      console.log("\n✅ Scheduler started successfully!");
      console.log("Press Ctrl+C to stop the scheduler.");
      
      // Keep the process running
      process.stdin.resume();
      
    } catch (error) {
      console.error("❌ Failed to start scheduler:", error);
      process.exit(1);
    }
  });

program
  .command("test")
  .description("Test rollover functionality (dry run)")
  .option("-u, --user-id <userId>", "Test rollover for specific user only")
  .option("--reference-date <date>", "Use specific reference date (ISO format)")
  .action(async (options) => {
    try {
      console.log("🧪 Testing weekly rollover (dry run)...");
      
      const service = createWeeklyRolloverService({
        enabled: true,
        dryRun: true,
        rolloverRecurringTasks: false,
        createAuditLog: false,
        maxTasksPerRun: 1000,
      });
      
      const referenceDate = options.referenceDate ? newDate(options.referenceDate) : newDate();
      
      console.log(`📅 Reference date: ${referenceDate.toISOString()}`);
      console.log(`👤 User filter: ${options.userId || "all users"}`);
      
      const result = await service.performWeeklyRollover(referenceDate, options.userId);
      
      console.log("\n✅ Test completed!");
      console.log(`📊 Results (simulation):`);
      console.log(`   - Tasks that would be processed: ${result.totalProcessed}`);
      console.log(`   - Tasks that would be rolled over: ${result.successfulRollovers}`);
      console.log(`   - Tasks that would be skipped: ${result.skipped}`);
      
      if (result.taskIds.length > 0) {
        console.log(`   - Task IDs that would be affected: ${result.taskIds.join(", ")}`);
      } else {
        console.log("   - No tasks found for rollover");
      }
      
      process.exit(0);
    } catch (error) {
      console.error("❌ Test failed:", error);
      process.exit(1);
    }
  });

program
  .command("status")
  .description("Show rollover scheduler status")
  .action(async () => {
    try {
      console.log("📊 Weekly Rollover Scheduler Status");
      
      // This would require the scheduler to be running
      console.log("ℹ️  Use the API endpoint /api/system/rollover-settings to check status");
      console.log("ℹ️  Or use the web interface to view scheduler status");
      
      process.exit(0);
    } catch (error) {
      console.error("❌ Failed to get status:", error);
      process.exit(1);
    }
  });

// Parse command line arguments
program.parse();

// If no command was provided, show help
if (!process.argv.slice(2).length) {
  program.outputHelp();
}
import { CronJob } from "cron";
import { createWeeklyRolloverService } from "@/lib/services/weekly-rollover";
import { logger } from "@/lib/logger";
import { newDate } from "@/lib/date-utils";

const LOG_SOURCE = "weekly-rollover-scheduler";

export interface RolloverSchedulerConfig {
  /**
   * Cron expression for when to run the rollover
   * Default: "0 0 * * 1" (Every Monday at 00:00 UTC)
   */
  cronExpression: string;
  
  /**
   * Timezone for the cron job
   * Default: "UTC"
   */
  timezone: string;
  
  /**
   * Whether to rollover recurring tasks
   */
  rolloverRecurringTasks: boolean;
  
  /**
   * Whether to create audit logs
   */
  createAuditLog: boolean;
  
  /**
   * Maximum tasks to process in one run
   */
  maxTasksPerRun: number;
  
  /**
   * Whether the scheduler is enabled
   */
  enabled: boolean;
  
  /**
   * Whether to run immediately on startup (for testing)
   */
  runOnStart: boolean;
}

export const DEFAULT_SCHEDULER_CONFIG: RolloverSchedulerConfig = {
  cronExpression: "0 0 * * 1", // Every Monday at 00:00 UTC
  timezone: "UTC",
  rolloverRecurringTasks: false,
  createAuditLog: true,
  maxTasksPerRun: 1000,
  enabled: true,
  runOnStart: false,
};

export class WeeklyRolloverScheduler {
  private cronJob: CronJob | null = null;
  private config: RolloverSchedulerConfig;
  private rolloverService: ReturnType<typeof createWeeklyRolloverService>;

  constructor(config: Partial<RolloverSchedulerConfig> = {}) {
    this.config = { ...DEFAULT_SCHEDULER_CONFIG, ...config };
    this.rolloverService = createWeeklyRolloverService({
      enabled: this.config.enabled,
      rolloverRecurringTasks: this.config.rolloverRecurringTasks,
      createAuditLog: this.config.createAuditLog,
      maxTasksPerRun: this.config.maxTasksPerRun,
      dryRun: false,
    });
  }

  /**
   * Start the weekly rollover scheduler
   */
  start(): void {
    if (!this.config.enabled) {
      logger.info("Weekly rollover scheduler is disabled", {}, LOG_SOURCE);
      return;
    }

    if (this.cronJob) {
      logger.warn("Weekly rollover scheduler is already running", {}, LOG_SOURCE);
      return;
    }

    logger.info(
      "Starting weekly rollover scheduler",
      {
        cronExpression: this.config.cronExpression,
        timezone: this.config.timezone,
        rolloverRecurringTasks: this.config.rolloverRecurringTasks,
        runOnStart: this.config.runOnStart,
      },
      LOG_SOURCE
    );

    this.cronJob = new CronJob(
      this.config.cronExpression,
      () => this.executeRollover(),
      null, // onComplete
      false, // start immediately
      this.config.timezone,
      null, // context
      this.config.runOnStart // runOnInit
    );

    this.cronJob.start();

    logger.info(
      "Weekly rollover scheduler started successfully",
      {
        nextRun: this.cronJob.nextDate()?.toJSDate()?.toISOString(),
      },
      LOG_SOURCE
    );
  }

  /**
   * Stop the weekly rollover scheduler
   */
  stop(): void {
    if (!this.cronJob) {
      logger.warn("Weekly rollover scheduler is not running", {}, LOG_SOURCE);
      return;
    }

    this.cronJob.stop();
    this.cronJob = null;

    logger.info("Weekly rollover scheduler stopped", {}, LOG_SOURCE);
  }

  /**
   * Get the next scheduled run time
   */
  getNextRunTime(): Date | null {
    return this.cronJob?.nextDate()?.toJSDate() || null;
  }

  /**
   * Check if the scheduler is running
   */
  isRunning(): boolean {
    return this.cronJob ? true : false; // CronJob doesn't expose running property reliably
  }

  /**
   * Manually trigger a rollover execution
   */
  async triggerManually(): Promise<void> {
    logger.info("Manual rollover trigger requested", {}, LOG_SOURCE);
    await this.executeRollover();
  }

  /**
   * Execute the weekly rollover for all users
   */
  private async executeRollover(): Promise<void> {
    const startTime = newDate();
    
    logger.info(
      "Starting scheduled weekly rollover",
      {
        startTime: startTime.toISOString(),
      },
      LOG_SOURCE
    );

    try {
      // Perform rollover for all users (no userId specified)
      const result = await this.rolloverService.performWeeklyRollover();

      const endTime = newDate();
      const durationMs = endTime.getTime() - startTime.getTime();

      logger.info(
        "Scheduled weekly rollover completed",
        {
          ...result,
          startTime: startTime.toISOString(),
          endTime: endTime.toISOString(),
          durationMs,
          durationSeconds: Math.round(durationMs / 1000),
        },
        LOG_SOURCE
      );

      // Log summary if there were any issues
      if (result.errors > 0) {
        logger.warn(
          "Weekly rollover completed with errors",
          {
            errors: result.errors,
            errorMessages: result.errorMessages,
          },
          LOG_SOURCE
        );
      }

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      
      logger.error(
        "Scheduled weekly rollover failed",
        {
          error: errorMsg,
          startTime: startTime.toISOString(),
        },
        LOG_SOURCE
      );
    }
  }

  /**
   * Update the scheduler configuration
   */
  updateConfig(newConfig: Partial<RolloverSchedulerConfig>): void {
    const wasRunning = this.isRunning();
    
    if (wasRunning) {
      this.stop();
    }

    this.config = { ...this.config, ...newConfig };
    
    // Recreate the rollover service with new config
    this.rolloverService = createWeeklyRolloverService({
      enabled: this.config.enabled,
      rolloverRecurringTasks: this.config.rolloverRecurringTasks,
      createAuditLog: this.config.createAuditLog,
      maxTasksPerRun: this.config.maxTasksPerRun,
      dryRun: false,
    });

    if (wasRunning && this.config.enabled) {
      this.start();
    }

    logger.info(
      "Weekly rollover scheduler configuration updated",
      {
        enabled: this.config.enabled,
        cronExpression: this.config.cronExpression,
        timezone: this.config.timezone,
        rolloverRecurringTasks: this.config.rolloverRecurringTasks,
        createAuditLog: this.config.createAuditLog,
        maxTasksPerRun: this.config.maxTasksPerRun,
        runOnStart: this.config.runOnStart,
      },
      LOG_SOURCE
    );
  }

  /**
   * Get current configuration
   */
  getConfig(): RolloverSchedulerConfig {
    return { ...this.config };
  }
}

// Global scheduler instance
let globalScheduler: WeeklyRolloverScheduler | null = null;

/**
 * Get or create the global weekly rollover scheduler instance
 */
export function getWeeklyRolloverScheduler(
  config?: Partial<RolloverSchedulerConfig>
): WeeklyRolloverScheduler {
  if (!globalScheduler) {
    globalScheduler = new WeeklyRolloverScheduler(config);
  }
  return globalScheduler;
}

/**
 * Initialize and start the weekly rollover scheduler with environment-based config
 */
export function initializeWeeklyRolloverScheduler(): WeeklyRolloverScheduler {
  const config: Partial<RolloverSchedulerConfig> = {
    enabled: process.env.ROLLOVER_ENABLED !== "false",
    cronExpression: process.env.ROLLOVER_CRON || "0 0 * * 1",
    timezone: process.env.ROLLOVER_TIMEZONE || "UTC",
    rolloverRecurringTasks: process.env.ROLLOVER_RECURRING_TASKS === "true",
    createAuditLog: process.env.ROLLOVER_AUDIT_LOG !== "false",
    maxTasksPerRun: parseInt(process.env.ROLLOVER_MAX_TASKS || "1000"),
    runOnStart: process.env.ROLLOVER_RUN_ON_START === "true",
  };

  const scheduler = getWeeklyRolloverScheduler(config);
  
  if (config.enabled) {
    scheduler.start();
  }

  return scheduler;
}

// Graceful shutdown handling
if (typeof process !== "undefined") {
  process.on("SIGTERM", () => {
    if (globalScheduler) {
      logger.info("Shutting down weekly rollover scheduler", {}, LOG_SOURCE);
      globalScheduler.stop();
    }
  });

  process.on("SIGINT", () => {
    if (globalScheduler) {
      logger.info("Shutting down weekly rollover scheduler", {}, LOG_SOURCE);
      globalScheduler.stop();
    }
  });
}
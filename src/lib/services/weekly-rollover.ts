import { TaskStatus, Task } from "@/types/task";
import { newDate, isInPreviousISOWeek, addDays } from "@/lib/date-utils";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

const LOG_SOURCE = "weekly-rollover-service";

export interface WeeklyRolloverConfig {
  /**
   * Whether weekly rollover is enabled
   */
  enabled: boolean;
  
  /**
   * Whether to rollover recurring tasks (default: false)
   * Recurring tasks typically handle their own scheduling
   */
  rolloverRecurringTasks: boolean;
  
  /**
   * Whether to create an audit log entry for rolled over tasks
   */
  createAuditLog: boolean;
  
  /**
   * Maximum number of tasks to rollover in a single run (safety limit)
   */
  maxTasksPerRun: number;
  
  /**
   * Dry run mode - log what would be done but don't make changes
   */
  dryRun: boolean;
}

export interface RolloverResult {
  totalProcessed: number;
  successfulRollovers: number;
  skipped: number;
  errors: number;
  errorMessages: string[];
  taskIds: string[];
}

export class WeeklyRolloverService {
  private config: WeeklyRolloverConfig;

  constructor(config: Partial<WeeklyRolloverConfig> = {}) {
    this.config = {
      enabled: true,
      rolloverRecurringTasks: false,
      createAuditLog: true,
      maxTasksPerRun: 1000,
      dryRun: false,
      ...config,
    };
  }

  /**
   * Perform the weekly rollover of incomplete tasks
   * @param referenceDate Optional reference date, defaults to current date
   * @param userId Optional user ID to limit rollover to specific user
   * @returns Promise<RolloverResult>
   */
  async performWeeklyRollover(
    referenceDate?: Date,
    userId?: string
  ): Promise<RolloverResult> {
    const result: RolloverResult = {
      totalProcessed: 0,
      successfulRollovers: 0,
      skipped: 0,
      errors: 0,
      errorMessages: [],
      taskIds: [],
    };

    if (!this.config.enabled) {
      logger.info("Weekly rollover is disabled", {}, LOG_SOURCE);
      return result;
    }

    const refDate = referenceDate || newDate();
    logger.info(
      "Starting weekly rollover",
      {
        referenceDate: refDate.toISOString(),
        enabled: this.config.enabled,
        rolloverRecurringTasks: this.config.rolloverRecurringTasks,
        createAuditLog: this.config.createAuditLog,
        maxTasksPerRun: this.config.maxTasksPerRun,
        dryRun: this.config.dryRun,
        userId: userId || "all users",
      },
      LOG_SOURCE
    );

    try {
      // Find all incomplete tasks from the previous week
      const incompleteTasks = await this.findIncompleteTasksFromPreviousWeek(
        refDate,
        userId
      );

      result.totalProcessed = incompleteTasks.length;

      if (incompleteTasks.length === 0) {
        logger.info("No incomplete tasks found for rollover", {}, LOG_SOURCE);
        return result;
      }

      if (incompleteTasks.length > this.config.maxTasksPerRun) {
        const errorMsg = `Too many tasks to rollover: ${incompleteTasks.length} > ${this.config.maxTasksPerRun}`;
        logger.error(errorMsg, {}, LOG_SOURCE);
        result.errors = 1;
        result.errorMessages.push(errorMsg);
        return result;
      }

      // Process each task
      for (const task of incompleteTasks) {
        try {
          const shouldRollover = await this.shouldRolloverTask(task);
          
          if (!shouldRollover) {
            result.skipped++;
            logger.debug(
              `Skipping task rollover`,
              { taskId: task.id, title: task.title },
              LOG_SOURCE
            );
            continue;
          }

          if (this.config.dryRun) {
            logger.info(
              "DRY RUN: Would rollover task",
              {
                taskId: task.id,
                title: task.title,
                currentDueDate: task.dueDate?.toISOString(),
                currentStartDate: task.startDate?.toISOString(),
              },
              LOG_SOURCE
            );
            result.successfulRollovers++;
            result.taskIds.push(task.id);
            continue;
          }

          await this.rolloverTask(task);
          result.successfulRollovers++;
          result.taskIds.push(task.id);

          logger.info(
            "Successfully rolled over task",
            { taskId: task.id, title: task.title },
            LOG_SOURCE
          );
        } catch (error) {
          result.errors++;
          const errorMsg = `Failed to rollover task ${task.id}: ${
            error instanceof Error ? error.message : String(error)
          }`;
          result.errorMessages.push(errorMsg);
          logger.error(errorMsg, { taskId: task.id }, LOG_SOURCE);
        }
      }

      logger.info(
        "Weekly rollover completed",
        {
          totalProcessed: result.totalProcessed,
          successful: result.successfulRollovers,
          skipped: result.skipped,
          errors: result.errors,
        },
        LOG_SOURCE
      );

      return result;
    } catch (error) {
      const errorMsg = `Weekly rollover failed: ${
        error instanceof Error ? error.message : String(error)
      }`;
      logger.error(errorMsg, {}, LOG_SOURCE);
      result.errors++;
      result.errorMessages.push(errorMsg);
      return result;
    }
  }

  private async findIncompleteTasksFromPreviousWeek(
    referenceDate: Date,
    userId?: string
  ) {
    const tasks = await prisma.task.findMany({
      where: {
        // Filter by user if specified
        ...(userId && { userId }),
        
        // Only incomplete tasks
        status: {
          not: TaskStatus.COMPLETED,
        },
        
        // Must have a due date to determine which week they belong to
        dueDate: {
          not: null,
        },
        
        // Optionally exclude recurring tasks based on config
        ...(this.config.rolloverRecurringTasks
          ? {}
          : { isRecurring: false }),
      },
      include: {
        tags: true,
        project: true,
      },
    });

    // Filter tasks that belong to the previous week
    return tasks.filter((task: any) => {
      if (!task.dueDate) return false;
      return isInPreviousISOWeek(task.dueDate, referenceDate);
    });
  }

  private async shouldRolloverTask(task: Task): Promise<boolean> {
    // Skip if task is already completed
    if (task.status === TaskStatus.COMPLETED) {
      return false;
    }

    // Skip recurring tasks if configured to do so
    if (task.isRecurring && !this.config.rolloverRecurringTasks) {
      return false;
    }

    // Skip if task doesn't have a due date
    if (!task.dueDate) {
      return false;
    }

    return true;
  }

  private async rolloverTask(task: Task): Promise<void> {
    const newDueDate = task.dueDate ? addDays(task.dueDate, 7) : null;
    const newStartDate = task.startDate ? addDays(task.startDate, 7) : null;

    const updateData: any = {
      dueDate: newDueDate,
      startDate: newStartDate,
      updatedAt: newDate(),
    };

    // Update the task
    await prisma.task.update({
      where: { id: task.id },
      data: updateData,
    });

    // Create audit log if enabled
    if (this.config.createAuditLog) {
      await this.createAuditLogEntry(task, newDueDate, newStartDate);
    }
  }

  private async createAuditLogEntry(
    task: Task,
    newDueDate: Date | null,
    newStartDate: Date | null
  ): Promise<void> {
    try {
      // Use the TaskChange model to track the rollover
      await prisma.taskChange.create({
        data: {
          taskId: task.id,
          userId: task.userId,
          changeType: "UPDATE",
          changeData: {
            action: "weekly_rollover",
            previousDueDate: task.dueDate?.toISOString(),
            newDueDate: newDueDate?.toISOString(),
            previousStartDate: task.startDate?.toISOString(),
            newStartDate: newStartDate?.toISOString(),
            rolledOverAt: newDate().toISOString(),
          },
          synced: false,
        },
      });
    } catch (error) {
      logger.error(
        "Failed to create audit log entry for task rollover",
        {
          taskId: task.id,
          error: error instanceof Error ? error.message : String(error),
        },
        LOG_SOURCE
      );
      // Don't throw - audit log failure shouldn't prevent rollover
    }
  }
}

/**
 * Default rollover configuration
 */
export const DEFAULT_ROLLOVER_CONFIG: WeeklyRolloverConfig = {
  enabled: true,
  rolloverRecurringTasks: false,
  createAuditLog: true,
  maxTasksPerRun: 1000,
  dryRun: false,
};

/**
 * Create a new WeeklyRolloverService with default configuration
 */
export function createWeeklyRolloverService(
  config?: Partial<WeeklyRolloverConfig>
): WeeklyRolloverService {
  return new WeeklyRolloverService(config);
}
import { startOfISOWeek, endOfISOWeek, addWeeks } from "date-fns";
import type { Task } from "@prisma/client";

import { newDate } from "@/lib/date-utils";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { TaskChangeTracker } from "@/lib/task-sync/task-change-tracker";
import type { ChangeType } from "@/lib/task-sync/task-change-tracker";

const LOG_SOURCE = "rollover-service";

export interface RolloverConfig {
  enabled: boolean;
  dryRun?: boolean;
}

export interface RolloverResult {
  processedTasks: number;
  rolledOverTasks: number;
  skippedTasks: number;
  errors: string[];
  taskIds: string[];
}

export class RolloverService {
  private config: RolloverConfig;

  constructor(config: RolloverConfig) {
    this.config = config;
  }

  /**
   * Performs weekly rollover of incomplete tasks
   * Moves incomplete tasks from previous ISO week to next week (same weekday)
   */
  async performWeeklyRollover(userId?: string): Promise<RolloverResult> {
    const result: RolloverResult = {
      processedTasks: 0,
      rolledOverTasks: 0,
      skippedTasks: 0,
      errors: [],
      taskIds: []
    };

    if (!this.config.enabled) {
      logger.info("Rollover is disabled", { source: LOG_SOURCE });
      return result;
    }

    try {
      // Get current UTC time for ISO week calculations
      const now = newDate();
      
      // Calculate previous ISO week boundaries in UTC
      const currentWeekStart = startOfISOWeek(now);
      const previousWeekStart = addWeeks(currentWeekStart, -1);
      const previousWeekEnd = endOfISOWeek(previousWeekStart);

      logger.info("Starting weekly rollover", {
        source: LOG_SOURCE,
        previousWeekStart: previousWeekStart.toISOString(),
        previousWeekEnd: previousWeekEnd.toISOString(),
        currentWeekStart: currentWeekStart.toISOString(),
        userId: userId || null,
        dryRun: this.config.dryRun || false
      });

      // Find incomplete tasks from previous week
      const incompleteTasks = await this.getIncompleteTasksFromPreviousWeek(
        previousWeekStart,
        previousWeekEnd,
        userId
      );

      result.processedTasks = incompleteTasks.length;

      logger.info(`Found ${incompleteTasks.length} incomplete tasks from previous week`, {
        source: LOG_SOURCE,
        userId: userId || null
      });

      // Process each task
      for (const task of incompleteTasks) {
        try {
          // Check if task should be rolled over
          if (await this.shouldRolloverTask(task)) {
            await this.rolloverTask(task, result);
          } else {
            result.skippedTasks++;
            logger.debug(`Skipped task rollover`, {
              source: LOG_SOURCE,
              taskId: task.id,
              title: task.title,
              reason: "duplicate_or_invalid"
            });
          }
        } catch (error) {
          const errorMsg = `Failed to rollover task ${task.id}: ${error instanceof Error ? error.message : String(error)}`;
          result.errors.push(errorMsg);
          logger.error(errorMsg, {
            source: LOG_SOURCE,
            taskId: task.id,
            error: error instanceof Error ? error.message : String(error)
          });
        }
      }

      logger.info("Weekly rollover completed", {
        source: LOG_SOURCE,
        processedTasks: result.processedTasks,
        rolledOverTasks: result.rolledOverTasks,
        skippedTasks: result.skippedTasks,
        errorsCount: result.errors.length,
        userId: userId || null
      });

      return result;
    } catch (error) {
      const errorMsg = `Weekly rollover failed: ${error instanceof Error ? error.message : String(error)}`;
      result.errors.push(errorMsg);
      logger.error(errorMsg, {
        source: LOG_SOURCE,
        error: error instanceof Error ? error.message : String(error),
        userId: userId || null
      });
      return result;
    }
  }

  /**
   * Get incomplete tasks from the previous ISO week
   */
  private async getIncompleteTasksFromPreviousWeek(
    weekStart: Date,
    weekEnd: Date,
    userId?: string
  ) {
    return prisma.task.findMany({
      where: {
        ...(userId && { userId }),
        dueDate: {
          gte: weekStart,
          lte: weekEnd
        },
        status: {
          not: "completed"
        },
        // Don't rollover tasks that are already completed
        completedAt: null
      },
      orderBy: {
        dueDate: "asc"
      }
    });
  }

  /**
   * Check if a task should be rolled over
   * Prevents duplicates and validates conditions
   */
  private async shouldRolloverTask(task: Task): Promise<boolean> {
    if (!task.dueDate) {
      return false;
    }

    // Calculate new due date (add 7 days)
    const newDueDate = addWeeks(task.dueDate, 1);

    // Check if there's already a task with the same title and new due date
    // to prevent duplicates (simple duplicate detection)
    const existingTask = await prisma.task.findFirst({
      where: {
        userId: task.userId,
        title: task.title,
        dueDate: newDueDate,
        id: {
          not: task.id // Don't match the same task
        }
      }
    });

    if (existingTask) {
      logger.debug(`Task already exists for new due date`, {
        source: LOG_SOURCE,
        originalTaskId: task.id,
        existingTaskId: existingTask.id,
        title: task.title,
        newDueDate: newDueDate.toISOString()
      });
      return false;
    }

    return true;
  }

  /**
   * Rollover a single task to the next week
   */
  private async rolloverTask(task: Task, result: RolloverResult): Promise<void> {
    if (!task.dueDate) {
      throw new Error("Task has no due date");
    }

    const newDueDate = addWeeks(task.dueDate, 1);
    const oldDueDate = task.dueDate;

    if (this.config.dryRun) {
      logger.info("DRY RUN: Would rollover task", {
        source: LOG_SOURCE,
        taskId: task.id,
        title: task.title,
        oldDueDate: oldDueDate.toISOString(),
        newDueDate: newDueDate.toISOString()
      });
      result.rolledOverTasks++;
      result.taskIds.push(task.id);
      return;
    }

    // Update the task's due date
    await prisma.task.update({
      where: { id: task.id },
      data: {
        dueDate: newDueDate,
        updatedAt: newDate()
      }
    });

    // Create audit trail entry using TaskChangeTracker
    if (task.userId) {
      const changeTracker = new TaskChangeTracker();
      await changeTracker.trackChange(
        task.id,
        "UPDATE" as ChangeType,
        task.userId,
        {
          rollover: {
            previousDueDate: oldDueDate.toISOString(),
            newDueDate: newDueDate.toISOString(),
            rolledOverAt: newDate().toISOString(),
            reason: "weekly_rollover"
          }
        }
      );
    }

    result.rolledOverTasks++;
    result.taskIds.push(task.id);

    logger.info("Task rolled over successfully", {
      source: LOG_SOURCE,
      taskId: task.id,
      title: task.title,
      oldDueDate: oldDueDate.toISOString(),
      newDueDate: newDueDate.toISOString()
    });
  }

  /**
   * Get rollover configuration from environment variables
   */
  static getConfigFromEnv(): RolloverConfig {
    return {
      enabled: process.env.ROLLOVER_ENABLED !== "false" // Default: true
    };
  }
}
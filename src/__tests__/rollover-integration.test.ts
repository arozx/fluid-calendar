/**
 * Integration test for rollover functionality
 * Tests the service and API endpoints
 */

import { startOfISOWeek, endOfISOWeek, addWeeks } from "date-fns";

// Mock dependencies before importing
jest.mock("@/lib/date-utils", () => ({
  newDate: jest.fn(() => new Date("2024-01-15T12:00:00Z")) // Monday
}));

jest.mock("@/lib/logger", () => ({
  logger: {
    info: jest.fn(),
    debug: jest.fn(),
    error: jest.fn()
  }
}));

jest.mock("@/lib/prisma", () => ({
  prisma: {
    task: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn()
    }
  }
}));

jest.mock("@/lib/task-sync/task-change-tracker", () => ({
  TaskChangeTracker: jest.fn().mockImplementation(() => ({
    trackChange: jest.fn()
  }))
}));

import { RolloverService } from "../services/RolloverService";
import { prisma } from "@/lib/prisma";

describe("Rollover Integration Tests", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("End-to-End Rollover Scenario", () => {
    it("should perform complete rollover workflow", async () => {
      // Setup test data - tasks from previous week (Jan 8-14, 2024)
      const incompleteTasks = [
        {
          id: "task-1",
          title: "Weekly Report",
          dueDate: new Date("2024-01-08T09:00:00Z"), // Monday previous week
          userId: "user-1",
          status: "todo"
        },
        {
          id: "task-2", 
          title: "Team Meeting Prep",
          dueDate: new Date("2024-01-12T14:00:00Z"), // Friday previous week
          userId: "user-1",
          status: "in_progress"
        },
        {
          id: "task-3",
          title: "Code Review",
          dueDate: new Date("2024-01-10T11:00:00Z"), // Wednesday previous week
          userId: "user-2",
          status: "todo"
        }
      ];

      // Mock database responses
      (prisma.task.findMany as jest.Mock).mockResolvedValue(incompleteTasks);
      (prisma.task.findFirst as jest.Mock).mockResolvedValue(null); // No duplicates
      (prisma.task.update as jest.Mock).mockResolvedValue({});

      // Execute rollover
      const config = { enabled: true };
      const service = new RolloverService(config);
      const result = await service.performWeeklyRollover();

      // Verify results
      expect(result.processedTasks).toBe(3);
      expect(result.rolledOverTasks).toBe(3);
      expect(result.skippedTasks).toBe(0);
      expect(result.errors).toHaveLength(0);
      expect(result.taskIds).toEqual(["task-1", "task-2", "task-3"]);

      // Verify database queries
      expect(prisma.task.findMany).toHaveBeenCalledWith({
        where: {
          dueDate: {
            gte: new Date("2024-01-08T00:00:00.000Z"),
            lte: new Date("2024-01-14T23:59:59.999Z")
          },
          status: { not: "completed" },
          completedAt: null
        },
        orderBy: { dueDate: "asc" }
      });

      // Verify task updates with correct new dates
      expect(prisma.task.update).toHaveBeenCalledTimes(3);
      
      // Task 1: Monday Jan 8 → Monday Jan 15
      expect(prisma.task.update).toHaveBeenCalledWith({
        where: { id: "task-1" },
        data: {
          dueDate: new Date("2024-01-15T09:00:00Z"),
          updatedAt: expect.any(Date)
        }
      });

      // Task 2: Friday Jan 12 → Friday Jan 19
      expect(prisma.task.update).toHaveBeenCalledWith({
        where: { id: "task-2" },
        data: {
          dueDate: new Date("2024-01-19T14:00:00Z"),
          updatedAt: expect.any(Date)
        }
      });

      // Task 3: Wednesday Jan 10 → Wednesday Jan 17
      expect(prisma.task.update).toHaveBeenCalledWith({
        where: { id: "task-3" },
        data: {
          dueDate: new Date("2024-01-17T11:00:00Z"),
          updatedAt: expect.any(Date)
        }
      });
    });

    it("should handle mixed scenario with duplicates and errors", async () => {
      const incompleteTasks = [
        {
          id: "task-1",
          title: "Unique Task",
          dueDate: new Date("2024-01-08T09:00:00Z"),
          userId: "user-1",
          status: "todo"
        },
        {
          id: "task-2",
          title: "Duplicate Task",
          dueDate: new Date("2024-01-09T10:00:00Z"),
          userId: "user-1", 
          status: "todo"
        },
        {
          id: "task-3",
          title: "Error Task",
          dueDate: new Date("2024-01-10T11:00:00Z"),
          userId: "user-1",
          status: "todo"
        }
      ];

      // Mock responses
      (prisma.task.findMany as jest.Mock).mockResolvedValue(incompleteTasks);
      
      // Mock duplicate detection - task-2 will have a duplicate
      (prisma.task.findFirst as jest.Mock)
        .mockResolvedValueOnce(null) // task-1: no duplicate
        .mockResolvedValueOnce({ id: "existing-task", title: "Duplicate Task" }) // task-2: has duplicate
        .mockResolvedValueOnce(null); // task-3: no duplicate

      // Mock updates - task-3 will fail
      (prisma.task.update as jest.Mock)
        .mockResolvedValueOnce({}) // task-1: success
        .mockRejectedValueOnce(new Error("Database connection failed")); // task-3: error

      const config = { enabled: true };
      const service = new RolloverService(config);
      const result = await service.performWeeklyRollover();

      // Verify mixed results
      expect(result.processedTasks).toBe(3);
      expect(result.rolledOverTasks).toBe(1); // Only task-1 succeeded
      expect(result.skippedTasks).toBe(1); // task-2 skipped due to duplicate
      expect(result.errors).toHaveLength(1); // task-3 failed
      expect(result.taskIds).toEqual(["task-1"]); // Only successful task
      expect(result.errors[0]).toContain("Database connection failed");
    });

    it("should validate ISO week boundary calculations", () => {
      // Test various dates to ensure correct week boundaries
      const testCases = [
        {
          date: new Date("2024-01-15T12:00:00Z"), // Monday
          expectedPrevWeekStart: new Date("2024-01-08T00:00:00.000Z"),
          expectedPrevWeekEnd: new Date("2024-01-14T23:59:59.999Z")
        },
        {
          date: new Date("2024-01-17T12:00:00Z"), // Wednesday  
          expectedPrevWeekStart: new Date("2024-01-08T00:00:00.000Z"),
          expectedPrevWeekEnd: new Date("2024-01-14T23:59:59.999Z")
        },
        {
          date: new Date("2024-01-21T12:00:00Z"), // Sunday
          expectedPrevWeekStart: new Date("2024-01-08T00:00:00.000Z"),
          expectedPrevWeekEnd: new Date("2024-01-14T23:59:59.999Z")
        }
      ];

      testCases.forEach(({ date, expectedPrevWeekStart, expectedPrevWeekEnd }) => {
        const currentWeekStart = startOfISOWeek(date);
        const previousWeekStart = addWeeks(currentWeekStart, -1);
        const previousWeekEnd = endOfISOWeek(previousWeekStart);

        expect(previousWeekStart).toEqual(expectedPrevWeekStart);
        expect(previousWeekEnd).toEqual(expectedPrevWeekEnd);
      });
    });

    it("should correctly calculate rollover dates preserving time", () => {
      const testTasks = [
        {
          originalDate: new Date("2024-01-08T09:30:00Z"), // Monday 9:30 AM
          expectedNewDate: new Date("2024-01-15T09:30:00Z") // Next Monday 9:30 AM
        },
        {
          originalDate: new Date("2024-01-12T17:15:00Z"), // Friday 5:15 PM
          expectedNewDate: new Date("2024-01-19T17:15:00Z") // Next Friday 5:15 PM
        },
        {
          originalDate: new Date("2024-01-10T12:00:00Z"), // Wednesday noon
          expectedNewDate: new Date("2024-01-17T12:00:00Z") // Next Wednesday noon
        }
      ];

      testTasks.forEach(({ originalDate, expectedNewDate }) => {
        const newDate = addWeeks(originalDate, 1);
        expect(newDate).toEqual(expectedNewDate);
      });
    });
  });

  describe("Configuration and Environment", () => {
    it("should respect environment configuration", () => {
      const originalEnv = process.env;

      // Test enabled by default
      delete process.env.ROLLOVER_ENABLED;
      expect(RolloverService.getConfigFromEnv().enabled).toBe(true);

      // Test explicitly enabled
      process.env.ROLLOVER_ENABLED = "true";
      expect(RolloverService.getConfigFromEnv().enabled).toBe(true);

      // Test disabled
      process.env.ROLLOVER_ENABLED = "false";
      expect(RolloverService.getConfigFromEnv().enabled).toBe(false);

      process.env = originalEnv;
    });
  });
});
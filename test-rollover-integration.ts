#!/usr/bin/env tsx
/**
 * Integration test for rollover functionality with real database
 * This creates test data, runs rollover, and verifies the results
 */

import { PrismaClient } from "@prisma/client";
import { RolloverService } from "./src/services/RolloverService";

const prisma = new PrismaClient();

async function cleanup() {
  console.log("Cleaning up test data...");
  await prisma.task.deleteMany({
    where: {
      title: {
        startsWith: "TEST_ROLLOVER_"
      }
    }
  });
  await prisma.user.deleteMany({
    where: {
      email: "rollover-test@example.com"
    }
  });
}

async function createTestData() {
  console.log("Creating test data...");

  // Create test user
  const user = await prisma.user.create({
    data: {
      email: "rollover-test@example.com",
      name: "Rollover Test User"
    }
  });

  // Calculate current and previous week dates based on today
  const today = new Date();
  const currentWeekStart = new Date(today);
  currentWeekStart.setDate(today.getDate() - today.getDay() + (today.getDay() === 0 ? -6 : 1)); // Monday
  currentWeekStart.setHours(0, 0, 0, 0);
  
  const previousWeekStart = new Date(currentWeekStart);
  previousWeekStart.setDate(currentWeekStart.getDate() - 7);

  console.log(`Previous week start: ${previousWeekStart.toISOString()}`);
  console.log(`Current week start: ${currentWeekStart.toISOString()}`);

  // Create tasks from previous week (should be rolled over)
  const monday = new Date(previousWeekStart);
  monday.setHours(9, 0, 0, 0);
  
  const wednesday = new Date(previousWeekStart);
  wednesday.setDate(previousWeekStart.getDate() + 2);
  wednesday.setHours(14, 0, 0, 0);
  
  const friday = new Date(previousWeekStart);
  friday.setDate(previousWeekStart.getDate() + 4);
  friday.setHours(16, 30, 0, 0);

  const tasksToRollover = await Promise.all([
    prisma.task.create({
      data: {
        title: "TEST_ROLLOVER_Monday_Task",
        description: "Task from previous Monday",
        status: "todo",
        dueDate: monday,
        userId: user.id
      }
    }),
    prisma.task.create({
      data: {
        title: "TEST_ROLLOVER_Wednesday_Task",
        description: "Task from previous Wednesday",
        status: "in_progress",
        dueDate: wednesday,
        userId: user.id
      }
    }),
    prisma.task.create({
      data: {
        title: "TEST_ROLLOVER_Friday_Task",
        description: "Task from previous Friday",
        status: "todo",
        dueDate: friday,
        userId: user.id
      }
    })
  ]);

  // Create a completed task (should NOT be rolled over)
  const tuesday = new Date(previousWeekStart);
  tuesday.setDate(previousWeekStart.getDate() + 1);
  tuesday.setHours(10, 0, 0, 0);
  
  const completedTask = await prisma.task.create({
    data: {
      title: "TEST_ROLLOVER_Completed_Task",
      description: "Completed task from previous week",
      status: "completed",
      dueDate: tuesday,
      completedAt: new Date(tuesday.getTime() + 5 * 60 * 60 * 1000), // 5 hours later
      userId: user.id
    }
  });

  // Create a current week task (should NOT be rolled over)
  const currentTuesday = new Date(currentWeekStart);
  currentTuesday.setDate(currentWeekStart.getDate() + 1);
  currentTuesday.setHours(11, 0, 0, 0);
  
  const currentWeekTask = await prisma.task.create({
    data: {
      title: "TEST_ROLLOVER_Current_Week_Task",
      description: "Task from current week",
      status: "todo",
      dueDate: currentTuesday,
      userId: user.id
    }
  });

  console.log(`Created ${tasksToRollover.length} tasks to rollover`);
  console.log(`Created 1 completed task (should be skipped)`);
  console.log(`Created 1 current week task (should be skipped)`);

  return { user, tasksToRollover, completedTask, currentWeekTask, previousWeekStart, currentWeekStart };
}

async function testRollover(userId: string) {
  console.log("\nTesting rollover functionality...");

  // Configure rollover service for testing
  const config = {
    enabled: true,
    dryRun: false // Actually perform the rollover
  };

  const rolloverService = new RolloverService(config);

  // Perform rollover
  const result = await rolloverService.performWeeklyRollover(userId);

  console.log("Rollover Results:");
  console.log(`  Processed tasks: ${result.processedTasks}`);
  console.log(`  Rolled over tasks: ${result.rolledOverTasks}`);
  console.log(`  Skipped tasks: ${result.skippedTasks}`);
  console.log(`  Errors: ${result.errors.length}`);
  
  if (result.errors.length > 0) {
    console.log("  Error details:");
    result.errors.forEach((error: string) => console.log(`    - ${error}`));
  }

  return result;
}

async function verifyResults(userId: string, originalTaskIds: string[], previousWeekStart: Date) {
  console.log("\nVerifying rollover results...");

  // Check that the original tasks were updated
  const updatedTasks = await prisma.task.findMany({
    where: {
      id: {
        in: originalTaskIds
      }
    },
    orderBy: {
      dueDate: "asc"
    }
  });

  console.log("Updated task due dates:");
  updatedTasks.forEach(task => {
    console.log(`  - ${task.title}: ${task.dueDate?.toISOString()}`);
  });

  // Calculate expected dates (7 days later)
  const mondayExpected = new Date(previousWeekStart);
  mondayExpected.setDate(previousWeekStart.getDate() + 7);
  mondayExpected.setHours(9, 0, 0, 0);
  
  const wednesdayExpected = new Date(previousWeekStart);
  wednesdayExpected.setDate(previousWeekStart.getDate() + 9); // +2 days for Wednesday, +7 for next week
  wednesdayExpected.setHours(14, 0, 0, 0);
  
  const fridayExpected = new Date(previousWeekStart);
  fridayExpected.setDate(previousWeekStart.getDate() + 11); // +4 days for Friday, +7 for next week
  fridayExpected.setHours(16, 30, 0, 0);

  const expectedDates = [mondayExpected, wednesdayExpected, fridayExpected];

  let successCount = 0;
  for (let i = 0; i < updatedTasks.length; i++) {
    const task = updatedTasks[i];
    const expected = expectedDates[i];
    if (task.dueDate?.getTime() === expected.getTime()) {
      console.log(`  ✓ ${task.title} correctly rolled over`);
      successCount++;
    } else {
      console.log(`  ✗ ${task.title} incorrect date. Expected: ${expected.toISOString()}, Got: ${task.dueDate?.toISOString()}`);
    }
  }

  // Check that completed and current week tasks were not affected
  const unaffectedTasks = await prisma.task.findMany({
    where: {
      userId,
      title: {
        in: ["TEST_ROLLOVER_Completed_Task", "TEST_ROLLOVER_Current_Week_Task"]
      }
    }
  });

  console.log("\nUnaffected tasks (should remain unchanged):");
  unaffectedTasks.forEach(task => {
    console.log(`  - ${task.title}: ${task.dueDate?.toISOString()} (status: ${task.status})`);
  });

  return {
    rolledOverCorrectly: successCount,
    totalExpected: expectedDates.length,
    unaffectedCount: unaffectedTasks.length
  };
}

async function main() {
  console.log("=== Rollover Integration Test ===\n");

  try {
    // Cleanup any existing test data
    await cleanup();

    // Create test data
    const { user, tasksToRollover, previousWeekStart } = await createTestData();
    const taskIds = tasksToRollover.map(t => t.id);

    // Run rollover
    const rolloverResult = await testRollover(user.id);

    // Verify results
    const verificationResult = await verifyResults(user.id, taskIds, previousWeekStart);

    console.log("\n=== Test Summary ===");
    console.log(`Expected to rollover: ${verificationResult.totalExpected} tasks`);
    console.log(`Actually rolled over: ${rolloverResult.rolledOverTasks} tasks`);
    console.log(`Correctly rolled over: ${verificationResult.rolledOverCorrectly} tasks`);
    console.log(`Unaffected tasks: ${verificationResult.unaffectedCount} tasks`);
    
    const success = (
      rolloverResult.rolledOverTasks === verificationResult.totalExpected &&
      verificationResult.rolledOverCorrectly === verificationResult.totalExpected &&
      rolloverResult.errors.length === 0
    );

    if (success) {
      console.log("✅ INTEGRATION TEST PASSED!");
    } else {
      console.log("❌ INTEGRATION TEST FAILED!");
      process.exit(1);
    }

  } catch (error) {
    console.error("Test failed with error:", error);
    process.exit(1);
  } finally {
    // Cleanup test data
    await cleanup();
    await prisma.$disconnect();
  }
}

// Run the test
main().catch(error => {
  console.error("Unhandled error:", error);
  process.exit(1);
});

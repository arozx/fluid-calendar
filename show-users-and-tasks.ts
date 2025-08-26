#!/usr/bin/env tsx
/**
 * Show existing users and their tasks for rollover testing
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function showUsers() {
  console.log("=== EXISTING USERS IN DATABASE ===\n");
  
  const users = await prisma.user.findMany({
    include: {
      _count: {
        select: {
          tasks: true
        }
      }
    },
    orderBy: {
      createdAt: 'desc'
    }
  });

  if (users.length === 0) {
    console.log("❌ No users found in the database");
    return null;
  }

  users.forEach((user, index) => {
    console.log(`${index + 1}. User: ${user.name || 'No name'}`);
    console.log(`   📧 Email: ${user.email || 'No email'}`);
    console.log(`   🆔 ID: ${user.id}`);
    console.log(`   📝 Tasks: ${user._count.tasks}`);
    console.log(`   📅 Created: ${user.createdAt.toLocaleDateString()}`);
    console.log();
  });

  return users;
}

async function showUserTasks(userId: string) {
  console.log(`=== TASKS FOR USER ${userId} ===\n`);
  
  const tasks = await prisma.task.findMany({
    where: {
      userId: userId
    },
    orderBy: {
      dueDate: 'asc'
    }
  });

  if (tasks.length === 0) {
    console.log("❌ No tasks found for this user");
    return;
  }

  // Calculate current week start for categorization
  const today = new Date();
  const currentWeekStart = new Date(today);
  currentWeekStart.setDate(today.getDate() - today.getDay() + (today.getDay() === 0 ? -6 : 1));
  currentWeekStart.setHours(0, 0, 0, 0);

  const previousWeekStart = new Date(currentWeekStart);
  previousWeekStart.setDate(currentWeekStart.getDate() - 7);

  const previousWeekEnd = new Date(previousWeekStart);
  previousWeekEnd.setDate(previousWeekStart.getDate() + 6);
  previousWeekEnd.setHours(23, 59, 59, 999);

  console.log(`📅 Week boundaries:`);
  console.log(`   Previous week: ${previousWeekStart.toLocaleDateString()} - ${previousWeekEnd.toLocaleDateString()}`);
  console.log(`   Current week starts: ${currentWeekStart.toLocaleDateString()}`);
  console.log();

  const categorizedTasks = {
    previousWeekIncomplete: [],
    previousWeekCompleted: [],
    currentWeek: [],
    other: []
  };

  tasks.forEach(task => {
    if (!task.dueDate) {
      categorizedTasks.other.push(task);
    } else if (task.dueDate >= previousWeekStart && task.dueDate <= previousWeekEnd) {
      if (task.status === 'completed') {
        categorizedTasks.previousWeekCompleted.push(task);
      } else {
        categorizedTasks.previousWeekIncomplete.push(task);
      }
    } else if (task.dueDate >= currentWeekStart) {
      categorizedTasks.currentWeek.push(task);
    } else {
      categorizedTasks.other.push(task);
    }
  });

  console.log(`🔄 TASKS THAT WOULD BE ROLLED OVER (${categorizedTasks.previousWeekIncomplete.length}):`);
  if (categorizedTasks.previousWeekIncomplete.length === 0) {
    console.log("   ➜ None found");
  } else {
    categorizedTasks.previousWeekIncomplete.forEach(task => {
      const statusIcon = task.status === 'in_progress' ? '🔄' : '📝';
      console.log(`   ${statusIcon} ${task.title}`);
      console.log(`      Due: ${task.dueDate?.toLocaleDateString()} at ${task.dueDate?.toLocaleTimeString()}`);
      console.log(`      Status: ${task.status.toUpperCase()}`);
    });
  }

  console.log(`\n✅ COMPLETED TASKS FROM PREVIOUS WEEK (${categorizedTasks.previousWeekCompleted.length}) - Will be ignored:`);
  if (categorizedTasks.previousWeekCompleted.length === 0) {
    console.log("   ➜ None found");
  } else {
    categorizedTasks.previousWeekCompleted.forEach(task => {
      console.log(`   ✅ ${task.title}`);
      console.log(`      Due: ${task.dueDate?.toLocaleDateString()} (Completed)`);
    });
  }

  console.log(`\n📅 CURRENT WEEK TASKS (${categorizedTasks.currentWeek.length}) - Will be ignored:`);
  if (categorizedTasks.currentWeek.length === 0) {
    console.log("   ➜ None found");
  } else {
    categorizedTasks.currentWeek.forEach(task => {
      const statusIcon = task.status === 'completed' ? '✅' : 
                        task.status === 'in_progress' ? '🔄' : '📝';
      console.log(`   ${statusIcon} ${task.title}`);
      console.log(`      Due: ${task.dueDate?.toLocaleDateString()}`);
    });
  }

  console.log(`\n📦 OTHER TASKS (${categorizedTasks.other.length}):`);
  if (categorizedTasks.other.length === 0) {
    console.log("   ➜ None found");
  } else {
    categorizedTasks.other.forEach(task => {
      const statusIcon = task.status === 'completed' ? '✅' : 
                        task.status === 'in_progress' ? '🔄' : '📝';
      console.log(`   ${statusIcon} ${task.title}`);
      console.log(`      Due: ${task.dueDate?.toLocaleDateString() || 'No date'}`);
    });
  }
}

async function main() {
  try {
    const users = await showUsers();
    
    if (users && users.length > 0) {
      // Show tasks for the first user as an example
      console.log("=== EXAMPLE: ANALYZING FIRST USER'S TASKS ===\n");
      await showUserTasks(users[0].id);
      
      console.log("\n=== INSTRUCTIONS ===");
      console.log("To test rollover with a specific user, run:");
      console.log(`DATABASE_URL="postgresql://fluid:fluid@localhost:5432/fluid_calendar" npm run rollover -- --user-id ${users[0].id}`);
      console.log("\nOr to test with all users:");
      console.log(`DATABASE_URL="postgresql://fluid:fluid@localhost:5432/fluid_calendar" npm run rollover:dry`);
    }
    
  } catch (error) {
    console.error("❌ Error:", error);
  } finally {
    await prisma.$disconnect();
  }
}

main();

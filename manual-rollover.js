const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function performManualRollover() {
  const adminId = "cmestfol40001of01rwr8xfhl";
  
  console.log("🔄 Starting manual rollover process...");
  
  // Get current week start (Monday)
  const today = new Date();
  const currentWeekStart = new Date(today);
  currentWeekStart.setDate(today.getDate() - today.getDay() + 1);
  currentWeekStart.setHours(0, 0, 0, 0);
  
  // Get previous week start
  const previousWeekStart = new Date(currentWeekStart);
  previousWeekStart.setDate(currentWeekStart.getDate() - 7);
  
  const previousWeekEnd = new Date(previousWeekStart);
  previousWeekEnd.setDate(previousWeekStart.getDate() + 6);
  previousWeekEnd.setHours(23, 59, 59, 999);
  
  console.log("Previous week:", previousWeekStart.toISOString(), "to", previousWeekEnd.toISOString());
  console.log("Current week starts:", currentWeekStart.toISOString());
  
  // Find incomplete tasks from previous week
  const tasksToRollover = await prisma.task.findMany({
    where: {
      userId: adminId,
      title: { startsWith: "VISUAL_TEST_" },
      status: { not: "completed" },
      dueDate: {
        gte: previousWeekStart,
        lte: previousWeekEnd
      }
    }
  });
  
  console.log("Found", tasksToRollover.length, "tasks to rollover:");
  
  let rolledOver = 0;
  
  for (const task of tasksToRollover) {
    const originalDate = new Date(task.dueDate);
    console.log("- Processing:", task.title, "originally due:", originalDate.toISOString());
    
    // Calculate new date (same weekday and time, but current week)
    const dayOfWeek = originalDate.getDay();
    const dayOffset = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // Convert Sunday=0 to Monday=0
    
    const newDate = new Date(currentWeekStart);
    newDate.setDate(currentWeekStart.getDate() + dayOffset);
    newDate.setHours(originalDate.getHours(), originalDate.getMinutes(), originalDate.getSeconds(), originalDate.getMilliseconds());
    
    console.log("  Moving to:", newDate.toISOString());
    
    // Update the task
    await prisma.task.update({
      where: { id: task.id },
      data: { 
        dueDate: newDate,
        updatedAt: new Date()
      }
    });
    
    rolledOver++;
  }
  
  console.log("✅ Rollover complete! Moved", rolledOver, "tasks to current week");
  
  return { processedTasks: tasksToRollover.length, rolledOverTasks: rolledOver };
}

performManualRollover().finally(() => prisma.$disconnect());

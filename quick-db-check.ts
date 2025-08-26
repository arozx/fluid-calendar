import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("=== CHECKING DATABASE ACCOUNTS ===\n");
  
  try {
    // Check if there are any users
    const userCount = await prisma.user.count();
    console.log(`Total users in database: ${userCount}`);
    
    if (userCount > 0) {
      const users = await prisma.user.findMany({
        take: 5, // Show first 5 users
        select: {
          id: true,
          email: true,
          name: true,
        }
      });
      
      console.log("\nFirst 5 users:");
      users.forEach((user, index) => {
        console.log(`${index + 1}. ${user.name || 'No name'} (${user.email || 'No email'}) - ID: ${user.id}`);
      });
    }
    
    // Check for any tasks
    const taskCount = await prisma.task.count();
    console.log(`\nTotal tasks in database: ${taskCount}`);
    
    if (taskCount > 0) {
      const recentTasks = await prisma.task.findMany({
        take: 3,
        include: {
          user: {
            select: {
              email: true,
              name: true
            }
          }
        },
        orderBy: {
          createdAt: 'desc'
        }
      });
      
      console.log("\nRecent tasks:");
      recentTasks.forEach((task, index) => {
        console.log(`${index + 1}. "${task.title}" by ${task.user?.name || task.user?.email || 'Unknown user'}`);
        console.log(`   Status: ${task.status}, Due: ${task.dueDate?.toLocaleDateString() || 'No date'}`);
      });
    }
    
  } catch (error) {
    console.error("Error querying database:", error);
  } finally {
    await prisma.$disconnect();
  }
}

main();

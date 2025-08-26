#!/usr/bin/env tsx
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  try {
    console.log('🔍 Looking for admin user...');
    
    const admin = await prisma.user.findUnique({
      where: { email: 'admin@admin.admin' }
    });
    
    if (admin) {
      console.log('✅ Admin found:', admin);
      
      // Create test tasks for admin
      await prisma.task.deleteMany({
        where: {
          title: { startsWith: 'VISUAL_TEST_' }
        }
      });
      
      console.log('🧹 Cleaned old test tasks');
      
      // Create a task from last week
      const lastWeek = new Date();
      lastWeek.setDate(lastWeek.getDate() - 7);
      
      const task = await prisma.task.create({
        data: {
          title: 'VISUAL_TEST_Admin_Task',
          description: 'Test task for admin rollover',
          status: 'todo',
          dueDate: lastWeek,
          userId: admin.id
        }
      });
      
      console.log('📝 Created test task:', task.title);
      console.log('✅ Admin account setup complete!');
      
    } else {
      console.log('❌ Admin user not found');
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();

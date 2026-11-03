import dotenv from 'dotenv';
import { Role } from '@shopright/shared-types';
import { prisma } from '../prisma.js';
import { hashPassword } from '../modules/auth/tokenService.js';

dotenv.config();

async function main() {
  const adminEmail = process.env.ADMIN_EMAIL ?? 'admin@shopright.local';
  const adminPassword = process.env.ADMIN_PASSWORD ?? 'Password123!';
  const adminName = process.env.ADMIN_NAME ?? 'Super Admin';
  const adminPhone = process.env.ADMIN_PHONE ?? '+919999999999';

  console.log(`Checking existing admin with email: ${adminEmail}...`);
  const existing = await prisma.user.findUnique({ where: { email: adminEmail } });

  const passwordHash = await hashPassword(adminPassword);

  if (existing) {
    await prisma.user.update({
      where: { email: adminEmail },
      data: { passwordHash },
    });
    console.log(`Admin account ${adminEmail} updated with latest password.`);
    return;
  }

  const admin = await prisma.user.create({
    data: {
      name: adminName,
      email: adminEmail,
      phone: adminPhone,
      passwordHash,
      role: Role.ADMIN,
    },
  });

  console.log(`✅ Admin account provisioned successfully! ID: ${admin.id}, Email: ${admin.email}`);
}

main()
  .catch((e) => {
    console.error('Error seeding admin user:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

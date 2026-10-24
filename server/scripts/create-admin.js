// Create a real administrator account. Usage:
//   node scripts/create-admin.js "Full Name" admin@example.com
// The password is read from the ADMIN_PASSWORD environment variable.
import bcrypt from 'bcrypt';
import { prisma, disconnectDb } from '../src/config/db.js';

const [name, email] = process.argv.slice(2);
const password = process.env.ADMIN_PASSWORD;
if (!name || !email || !password || password.length < 8) {
  console.error('Usage: ADMIN_PASSWORD=<secret-min-8-chars> node scripts/create-admin.js "Full Name" admin@example.com');
  process.exit(1);
}
await prisma.$connect();
const existing = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
if (existing) {
  console.error('A user with this email already exists.');
  process.exit(1);
}
await prisma.user.create({ data: { name, email: email.toLowerCase(), passwordHash: await bcrypt.hash(password, 12), role: 'SUPER_ADMIN' } });
console.log(`Super admin created: ${email.toLowerCase()}`);
await disconnectDb();
process.exit(0);

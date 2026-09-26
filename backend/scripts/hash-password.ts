/**
 * Generates a bcrypt hash for DEMO_PASSWORD_HASH: npm run hash-password
 *
 * Prompts for the password instead of taking it as a command-line argument,
 * so it never lands in shell history. (The input is still visible while typing.)
 */
import bcrypt from 'bcryptjs';
import { createInterface } from 'node:readline/promises';

// Work factor: each +1 doubles hashing time. 12 is ~250 ms on a laptop, slow
// enough to hinder offline brute force of a leaked hash, fast enough for login.
const COST = 12;

const rl = createInterface({ input: process.stdin, output: process.stdout });
const password = await rl.question('Password to hash (input is visible): ');
rl.close();

// bcrypt ignores everything past 72 bytes, so reject rather than silently truncate.
if (password.length === 0 || Buffer.byteLength(password) > 72) {
  console.error('Password must be 1-72 bytes long.');
  process.exit(1);
}

console.log(await bcrypt.hash(password, COST));

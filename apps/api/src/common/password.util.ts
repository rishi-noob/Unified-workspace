import * as bcrypt from 'bcryptjs';
import { promisify } from 'node:util';

const hashAsync = promisify(bcrypt.hash) as (plain: string, salt: string | number) => Promise<string>;
const compareAsync = promisify(bcrypt.compare) as (plain: string, hash: string) => Promise<boolean>;

export async function hashPassword(plain: string, rounds = 12): Promise<string> {
  return hashAsync(plain, rounds) as Promise<string>;
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return compareAsync(plain, hash) as Promise<boolean>;
}

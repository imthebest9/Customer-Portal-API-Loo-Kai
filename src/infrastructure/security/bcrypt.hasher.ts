import bcrypt from 'bcryptjs';
import { injectable } from 'tsyringe';
import { IHasher } from '../../application/ports/hasher.port';

const SALT_ROUNDS = 10;

@injectable()
export class BcryptHasher implements IHasher {
  async hash(plain: string): Promise<string> {
    return bcrypt.hash(plain, SALT_ROUNDS);
  }

  async compare(plain: string, hash: string): Promise<boolean> {
    return bcrypt.compare(plain, hash);
  }
}

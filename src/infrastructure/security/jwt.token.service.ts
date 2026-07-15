import jwt, { SignOptions } from 'jsonwebtoken';
import { inject, injectable } from 'tsyringe';
import { ITokenService, TokenPayload } from '../../application/ports/token.port';
import { UnauthorizedError } from '../../domain/errors/app-error';
import { TOKENS } from '../../shared/tokens';
import type { AppConfig } from '../config/env';

@injectable()
export class JwtTokenService implements ITokenService {
  constructor(@inject(TOKENS.Config) private readonly config: AppConfig) {}

  sign(payload: TokenPayload): string {
    const options: SignOptions = {
      expiresIn: this.config.JWT_EXPIRES_IN as SignOptions['expiresIn'],
    };
    return jwt.sign(payload, this.config.JWT_SECRET, options);
  }

  verify(token: string): TokenPayload {
    try {
      const decoded = jwt.verify(token, this.config.JWT_SECRET);
      if (typeof decoded === 'string') {
        throw new UnauthorizedError('Invalid token');
      }
      const { sub, email, role } = decoded as jwt.JwtPayload & Partial<TokenPayload>;
      if (!sub || !email || !role) {
        throw new UnauthorizedError('Invalid token payload');
      }
      return { sub, email, role };
    } catch (err) {
      if (err instanceof UnauthorizedError) throw err;
      throw new UnauthorizedError('Invalid or expired token');
    }
  }
}

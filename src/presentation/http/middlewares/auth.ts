import { NextFunction, Request, RequestHandler, Response } from 'express';
import { ITokenService } from '../../../application/ports/token.port';
import { CustomerService } from '../../../application/services/customer.service';
import { Role } from '../../../domain/entities/enums';
import { ForbiddenError, UnauthorizedError } from '../../../domain/errors/app-error';

/**
 * Factory for the JWT authentication middleware. Verifies the `Authorization:
 * Bearer <token>` header, confirms the account it names is still active, and
 * attaches the decoded payload to `req.user`.
 */
export function createAuthMiddleware(
  tokenService: ITokenService,
  customerService: CustomerService,
): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction): void => {
    void (async () => {
      const header = req.headers.authorization;
      if (!header || !header.startsWith('Bearer ')) {
        throw new UnauthorizedError('Missing or malformed Authorization header');
      }
      const token = header.slice('Bearer '.length).trim();
      const payload = tokenService.verify(token);
      // A valid signature is not enough — the account may have been
      // deactivated or deleted since the token was issued.
      await customerService.assertActiveAccount(payload.sub);
      req.user = payload;
    })().then(() => next(), next);
  };
}

/** Role-based authorization guard. Must run after the auth middleware. */
export function requireRole(...roles: Role[]): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      throw new UnauthorizedError('Authentication required');
    }
    if (!roles.includes(req.user.role)) {
      throw new ForbiddenError('Insufficient permissions');
    }
    next();
  };
}

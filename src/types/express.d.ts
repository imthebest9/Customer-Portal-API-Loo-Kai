import { TokenPayload } from '../application/ports/token.port';

/**
 * Express request augmentation.
 * - `user` is populated by the auth middleware after JWT verification.
 * - `validated` holds Zod-parsed, normalised input (Express 5's `req.query` is a
 *   read-only getter, so validated input is stored here rather than mutated in place).
 */
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: TokenPayload;
      validated?: {
        body: Record<string, unknown>;
        query: Record<string, unknown>;
        params: Record<string, unknown>;
      };
    }
  }
}

export {};

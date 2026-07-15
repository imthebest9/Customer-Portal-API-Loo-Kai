import { Role } from '../../domain/entities/enums';

export interface TokenPayload {
  sub: string; // customer id
  email: string;
  role: Role;
}

export interface ITokenService {
  sign(payload: TokenPayload): string;
  verify(token: string): TokenPayload;
}

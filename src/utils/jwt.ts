import jwt, { SignOptions } from 'jsonwebtoken';
import { env } from '../config/env.js';
import { UserPayload } from '../types/index.js';

export function signJwt(payload: UserPayload, expiresIn: string = env.JWT_EXPIRES_IN): string {
  const options: SignOptions = {
    expiresIn: expiresIn as unknown as SignOptions['expiresIn'],
  };
  return jwt.sign(payload, env.JWT_SECRET, options);
}

export function verifyJwt(token: string): UserPayload {
  return jwt.verify(token, env.JWT_SECRET) as UserPayload;
}

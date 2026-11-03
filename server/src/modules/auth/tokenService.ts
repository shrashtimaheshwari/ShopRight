import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { Role } from '@shopright/shared-types';
import { config } from '../../config/env.js';
import { prisma } from '../../prisma.js';

const BCRYPT_ROUNDS = 12; // Security Doc §2: bcrypt cost >= 12

export interface JwtUserPayload {
  sub: string;
  role: Role;
  email: string;
}

export async function hashPassword(plainText: string): Promise<string> {
  return bcrypt.hash(plainText, BCRYPT_ROUNDS);
}

export async function comparePassword(plainText: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plainText, hash);
}

export function generateAccessToken(payload: JwtUserPayload): string {
  return jwt.sign(payload, config.JWT_ACCESS_SECRET, {
    expiresIn: config.JWT_ACCESS_EXPIRES_IN as any,
  });
}

export function verifyAccessToken(token: string): JwtUserPayload {
  return jwt.verify(token, config.JWT_ACCESS_SECRET) as JwtUserPayload;
}

export function hashRefreshToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export async function createRefreshToken(userId: string): Promise<string> {
  // Generate a cryptographically secure 32-byte random token
  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashRefreshToken(rawToken);

  // 7 days expiration
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  await prisma.refreshToken.create({
    data: {
      userId,
      tokenHash,
      expiresAt,
    },
  });

  return rawToken;
}

export async function verifyAndRotateRefreshToken(
  rawToken: string
): Promise<{ userId: string; newAccessToken: string; newRefreshToken: string } | null> {
  const tokenHash = hashRefreshToken(rawToken);

  const storedToken = await prisma.refreshToken.findUnique({
    where: { tokenHash },
    include: { user: true },
  });

  if (!storedToken) return null;
  if (storedToken.revokedAt != null) return null; // Already revoked
  if (storedToken.expiresAt < new Date()) return null; // Expired

  // Rotate token: revoke current, issue new
  await prisma.refreshToken.update({
    where: { id: storedToken.id },
    data: { revokedAt: new Date() },
  });

  const newAccessToken = generateAccessToken({
    sub: storedToken.user.id,
    role: storedToken.user.role as Role,
    email: storedToken.user.email,
  });

  const newRefreshToken = await createRefreshToken(storedToken.user.id);

  return {
    userId: storedToken.user.id,
    newAccessToken,
    newRefreshToken,
  };
}

export async function revokeRefreshToken(rawToken: string): Promise<boolean> {
  const tokenHash = hashRefreshToken(rawToken);

  const storedToken = await prisma.refreshToken.findUnique({
    where: { tokenHash },
  });

  if (!storedToken) return false;

  await prisma.refreshToken.update({
    where: { id: storedToken.id },
    data: { revokedAt: new Date() },
  });

  return true;
}

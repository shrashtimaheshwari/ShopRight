import { Request, Response } from 'express';
import crypto from 'crypto';
import { z } from 'zod';
import { OAuth2Client } from 'google-auth-library';
import { Role, ApiErrorCode } from '@shopright/shared-types';
import { config } from '../../config/env.js';
import { prisma } from '../../prisma.js';
import { AppError } from '../../middleware/errorHandler.js';
import {
  hashPassword,
  comparePassword,
  generateAccessToken,
  createRefreshToken,
  verifyAndRotateRefreshToken,
  revokeRefreshToken,
} from './tokenService.js';

const registerSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Invalid email address'),
  phone: z.string().min(8, 'Phone number must be at least 8 characters'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  role: z.nativeEnum(Role),
});

const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required'),
});

const googleAuthSchema = z.object({
  idToken: z.string().min(1, 'Google idToken is required'),
  role: z.nativeEnum(Role).optional(),
});

const googleClient = new OAuth2Client(config.GOOGLE_CLIENT_ID);

export async function registerHandler(req: Request, res: Response): Promise<void> {
  const parseResult = registerSchema.safeParse(req.body);
  if (!parseResult.success) {
    throw new AppError(
      400,
      ApiErrorCode.VALIDATION_ERROR,
      'Invalid registration payload',
      parseResult.error.format()
    );
  }

  const { name, email, phone, password, role } = parseResult.data;

  // Security Doc §2 & API Doc §2: Block self-signup as ADMIN
  if (role === Role.ADMIN) {
    throw new AppError(
      403,
      ApiErrorCode.FORBIDDEN_ROLE,
      'ADMIN accounts cannot be self-registered.'
    );
  }

  // Check unique email
  const existingUser = await prisma.user.findUnique({ where: { email } });
  if (existingUser) {
    throw new AppError(
      400,
      ApiErrorCode.VALIDATION_ERROR,
      'An account with this email address already exists.'
    );
  }

  const passwordHash = await hashPassword(password);

  const user = await prisma.user.create({
    data: {
      name,
      email,
      phone,
      passwordHash,
      role,
      ...(role === Role.DELIVERY_PARTNER
        ? {
            deliveryProfile: {
              create: {
                isAvailable: false,
              },
            },
          }
        : {}),
    },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      role: true,
      createdAt: true,
    },
  });

  const accessToken = generateAccessToken({
    sub: user.id,
    role: user.role as Role,
    email: user.email,
  });

  const refreshToken = await createRefreshToken(user.id);

  res.status(201).json({
    success: true,
    data: {
      accessToken,
      refreshToken,
      user,
    },
  });
}

export async function loginHandler(req: Request, res: Response): Promise<void> {
  const parseResult = loginSchema.safeParse(req.body);
  if (!parseResult.success) {
    throw new AppError(
      400,
      ApiErrorCode.VALIDATION_ERROR,
      'Email and password are required.'
    );
  }

  const { email, password } = parseResult.data;

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    throw new AppError(
      401,
      ApiErrorCode.INVALID_CREDENTIALS,
      'Invalid email or password.'
    );
  }

  const passwordMatch = await comparePassword(password, user.passwordHash);
  if (!passwordMatch) {
    throw new AppError(
      401,
      ApiErrorCode.INVALID_CREDENTIALS,
      'Invalid email or password.'
    );
  }

  const accessToken = generateAccessToken({
    sub: user.id,
    role: user.role as Role,
    email: user.email,
  });

  const refreshToken = await createRefreshToken(user.id);

  res.status(200).json({
    success: true,
    data: {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        createdAt: user.createdAt,
      },
    },
  });
}

export async function refreshHandler(req: Request, res: Response): Promise<void> {
  const parseResult = refreshSchema.safeParse(req.body);
  if (!parseResult.success) {
    throw new AppError(
      400,
      ApiErrorCode.VALIDATION_ERROR,
      'Refresh token is required.'
    );
  }

  const rotated = await verifyAndRotateRefreshToken(parseResult.data.refreshToken);
  if (!rotated) {
    throw new AppError(
      401,
      ApiErrorCode.UNAUTHORIZED,
      'Refresh token is invalid, expired, or has been revoked.'
    );
  }

  res.status(200).json({
    success: true,
    data: {
      accessToken: rotated.newAccessToken,
      refreshToken: rotated.newRefreshToken,
    },
  });
}

export async function logoutHandler(req: Request, res: Response): Promise<void> {
  const { refreshToken } = req.body ?? {};
  if (refreshToken && typeof refreshToken === 'string') {
    await revokeRefreshToken(refreshToken);
  }

  res.status(200).json({
    success: true,
    data: {
      message: 'Logged out successfully.',
    },
  });
}

export async function getMeHandler(req: Request, res: Response): Promise<void> {
  const userId = req.user?.sub;
  if (!userId) {
    throw new AppError(401, ApiErrorCode.UNAUTHORIZED, 'Authentication required.');
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      role: true,
      createdAt: true,
    },
  });

  if (!user) {
    throw new AppError(404, ApiErrorCode.NOT_FOUND, 'User not found.');
  }

  res.status(200).json({
    success: true,
    data: user,
  });
}

export async function googleAuthHandler(req: Request, res: Response): Promise<void> {
  const parseResult = googleAuthSchema.safeParse(req.body);
  if (!parseResult.success) {
    throw new AppError(
      400,
      ApiErrorCode.VALIDATION_ERROR,
      'Invalid Google Auth payload',
      parseResult.error.format()
    );
  }

  const { idToken, role: requestedRole } = parseResult.data;
  const role = requestedRole ?? Role.CUSTOMER;

  if (role === Role.ADMIN) {
    throw new AppError(
      403,
      ApiErrorCode.FORBIDDEN_ROLE,
      'ADMIN accounts cannot be registered via Google authentication.'
    );
  }

  let payload;
  try {
    const ticket = await googleClient.verifyIdToken({
      idToken,
      audience: config.GOOGLE_CLIENT_ID,
    });
    payload = ticket.getPayload();
  } catch (err) {
    throw new AppError(
      401,
      ApiErrorCode.UNAUTHORIZED,
      'Invalid or expired Google ID token.'
    );
  }

  if (!payload || !payload.email) {
    throw new AppError(
      400,
      ApiErrorCode.VALIDATION_ERROR,
      'Google ID token does not contain a verified email address.'
    );
  }

  const email = payload.email.toLowerCase();
  const name = payload.name || payload.email.split('@')[0];

  let user = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      role: true,
      createdAt: true,
    },
  });

  if (!user) {
    const dummyPassword = crypto.randomUUID();
    const passwordHash = await hashPassword(dummyPassword);

    user = await prisma.user.create({
      data: {
        name,
        email,
        phone: '',
        passwordHash,
        role,
        ...(role === Role.DELIVERY_PARTNER
          ? {
              deliveryProfile: {
                create: {
                  isAvailable: false,
                },
              },
            }
          : {}),
      },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        createdAt: true,
      },
    });
  }

  const accessToken = generateAccessToken({
    sub: user.id,
    role: user.role as Role,
    email: user.email,
  });

  const refreshToken = await createRefreshToken(user.id);

  res.status(200).json({
    success: true,
    data: {
      accessToken,
      refreshToken,
      user,
    },
  });
}

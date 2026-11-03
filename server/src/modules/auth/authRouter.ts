import { Router } from 'express';
import {
  registerHandler,
  loginHandler,
  refreshHandler,
  logoutHandler,
  getMeHandler,
  googleAuthHandler,
} from './authController.js';
import { authenticate } from './authMiddleware.js';
import { asyncHandler } from '../../middleware/asyncHandler.js';

export const authRouter = Router();

authRouter.post('/register', asyncHandler(registerHandler));
authRouter.post('/login', asyncHandler(loginHandler));
authRouter.post('/google', asyncHandler(googleAuthHandler));
authRouter.post('/refresh', asyncHandler(refreshHandler));
authRouter.post('/logout', asyncHandler(logoutHandler));
authRouter.get('/me', authenticate, asyncHandler(getMeHandler));

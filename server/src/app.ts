import express, { Express, Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { config } from './config/env.js';
import { requestLogger } from './middleware/requestLogger.js';
import { errorHandler, AppError } from './middleware/errorHandler.js';
import { healthRouter } from './routes/health.js';
import { authRouter } from './modules/auth/index.js';
import { shopsRouter } from './modules/shops/index.js';
import { ordersRouter, addressesRouter } from './modules/orders/index.js';
import { merchantRouter } from './modules/shops/merchantRouter.js';
import { deliveryRouter } from './modules/delivery/index.js';
import { adminRouter } from './modules/admin/index.js';
import { ApiErrorCode } from '@shopright/shared-types';

export function createApp(): Express {
  const app = express();

  // 1. Security Headers (Security Doc §8)
  app.use(helmet());

  // 2. CORS configuration (Security Doc §8)
  app.use(
    cors({
      origin: (origin, callback) => {
        // Allow requests with no origin (like mobile apps or curl/Postman) in development
        if (!origin || config.corsOriginsList.includes(origin) || config.NODE_ENV === 'test') {
          callback(null, true);
        } else {
          callback(new Error('Blocked by CORS policy'));
        }
      },
      credentials: true,
    })
  );

  // 3. Request parsing
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // 4. Sanitized request logging (Security Doc §7)
  if (config.NODE_ENV !== 'test') {
    app.use(requestLogger);
  }

  // 5. Root & Versioned API Health check
  app.use('/', healthRouter);
  app.use('/api/v1', healthRouter);

  // 6. Authentication Routes (API Doc §2)
  app.use('/auth', authRouter);
  app.use('/api/v1/auth', authRouter);

  // 7. Shops & Product Catalog Routes (API Doc §3 & §4)
  app.use('/shops', shopsRouter);
  app.use('/api/v1/shops', shopsRouter);

  // 8. Addresses Routes (API Doc §3)
  app.use('/addresses', addressesRouter);
  app.use('/api/v1/addresses', addressesRouter);

  // 9. Orders Routes (API Doc §3)
  app.use('/orders', ordersRouter);
  app.use('/api/v1/orders', ordersRouter);

  // 10. Merchant Routes (API Doc §5 — shopkeeper role)
  app.use('/merchant', merchantRouter);
  app.use('/api/v1/merchant', merchantRouter);

  // 11. Delivery Partner Routes (API Doc §6)
  app.use('/delivery', deliveryRouter);
  app.use('/api/v1/delivery', deliveryRouter);

  // 12. Admin Routes (API Doc §7 — admin role only)
  app.use('/admin', adminRouter);
  app.use('/api/v1/admin', adminRouter);

  // 6. 404 handler for unknown routes
  app.use((req: Request, _res: Response, next: NextFunction) => {
    next(
      new AppError(
        404,
        ApiErrorCode.NOT_FOUND,
        `Route ${req.method} ${req.originalUrl} not found`
      )
    );
  });

  // 7. Global error handling middleware (API Doc §1 envelope)
  app.use(errorHandler);

  return app;
}

export const app = createApp();

import { PaymentMethod, ApiErrorCode } from '@shopright/shared-types';
import { PaymentProvider } from './types.js';
import { CodProvider } from './codProvider.js';
import { AppError } from '../../middleware/errorHandler.js';

export * from './types.js';
export * from './codProvider.js';

const codProvider = new CodProvider();

/**
 * Payment Provider Factory (ADR-008, Security Doc §10).
 * Allows plugging in sandbox Razorpay or other gateways later without changing order logic.
 */
export function getPaymentProvider(method: PaymentMethod): PaymentProvider {
  switch (method) {
    case PaymentMethod.COD:
      return codProvider;
    case PaymentMethod.RAZORPAY_TEST:
      throw new AppError(
        501,
        ApiErrorCode.VALIDATION_ERROR,
        'Razorpay test mode provider is scheduled for Milestone 5 checkout flow.'
      );
    default:
      throw new AppError(
        400,
        ApiErrorCode.VALIDATION_ERROR,
        `Unsupported payment method: ${method}`
      );
  }
}

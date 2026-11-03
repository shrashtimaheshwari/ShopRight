import { PaymentMethod, PaymentStatus } from '@shopright/shared-types';

export interface PaymentInitiationResult {
  status: PaymentStatus;
  providerRef?: string | null;
}

export interface PaymentProvider {
  readonly method: PaymentMethod;
  createPayment(orderId: string, amountPaise: number): Promise<PaymentInitiationResult>;
  verifyPayment(orderId: string, payload?: unknown): Promise<boolean>;
}

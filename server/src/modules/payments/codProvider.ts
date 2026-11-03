import { PaymentMethod, PaymentStatus } from '@shopright/shared-types';
import { PaymentProvider, PaymentInitiationResult } from './types.js';

export class CodProvider implements PaymentProvider {
  public readonly method = PaymentMethod.COD;

  async createPayment(_orderId: string, _amountPaise: number): Promise<PaymentInitiationResult> {
    return {
      status: PaymentStatus.PENDING,
      providerRef: null,
    };
  }

  async verifyPayment(_orderId: string, _payload?: unknown): Promise<boolean> {
    // COD payment is marked verified/collected by the delivery partner on completion
    return true;
  }
}

-- Add UPI_QR to PaymentMethod enum
ALTER TYPE "PaymentMethod" ADD VALUE IF NOT EXISTS 'UPI_QR';

-- Add YouPI-specific fields to Payment
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "checkoutUrl" TEXT;
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "expiresAt" TIMESTAMP(3);

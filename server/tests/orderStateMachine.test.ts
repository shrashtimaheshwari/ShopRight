import { describe, it, expect } from 'vitest';
import { OrderStatus, Role, ApiErrorCode } from '@shopright/shared-types';
import {
  executeOrderTransition,
  OrderTransitionContext,
} from '../src/stateMachine/orderStateMachine.js';

describe('Shared Order State Machine', () => {
  const baseContext: OrderTransitionContext = {
    currentStatus: OrderStatus.PLACED,
    event: 'ACCEPT',
    actorRole: Role.SHOPKEEPER,
    actorId: 'shopkeeper-1',
    orderCustomerId: 'customer-1',
    shopOwnerId: 'shopkeeper-1',
    assignedPartnerId: 'partner-1',
  };

  describe('Happy Path Legal Transitions', () => {
    it('shopkeeper can accept a PLACED order -> ACCEPTED', () => {
      const next = executeOrderTransition({
        ...baseContext,
        currentStatus: OrderStatus.PLACED,
        event: 'ACCEPT',
      });
      expect(next).toBe(OrderStatus.ACCEPTED);
    });

    it('shopkeeper can reject a PLACED order -> REJECTED', () => {
      const next = executeOrderTransition({
        ...baseContext,
        currentStatus: OrderStatus.PLACED,
        event: 'REJECT',
      });
      expect(next).toBe(OrderStatus.REJECTED);
    });

    it('shopkeeper can transition ACCEPTED -> PREPARING', () => {
      const next = executeOrderTransition({
        ...baseContext,
        currentStatus: OrderStatus.ACCEPTED,
        event: 'START_PREPARING',
      });
      expect(next).toBe(OrderStatus.PREPARING);
    });

    it('shopkeeper can transition PREPARING -> READY', () => {
      const next = executeOrderTransition({
        ...baseContext,
        currentStatus: OrderStatus.PREPARING,
        event: 'MARK_READY',
      });
      expect(next).toBe(OrderStatus.READY);
    });

    it('assigned delivery partner can transition READY -> PICKED_UP', () => {
      const next = executeOrderTransition({
        ...baseContext,
        currentStatus: OrderStatus.READY,
        event: 'PICKUP',
        actorRole: Role.DELIVERY_PARTNER,
        actorId: 'partner-1',
      });
      expect(next).toBe(OrderStatus.PICKED_UP);
    });

    it('assigned delivery partner can transition PICKED_UP -> DELIVERED', () => {
      const next = executeOrderTransition({
        ...baseContext,
        currentStatus: OrderStatus.PICKED_UP,
        event: 'DELIVER',
        actorRole: Role.DELIVERY_PARTNER,
        actorId: 'partner-1',
      });
      expect(next).toBe(OrderStatus.DELIVERED);
    });

    it('customer can cancel their own PLACED order -> CANCELLED', () => {
      const next = executeOrderTransition({
        ...baseContext,
        currentStatus: OrderStatus.PLACED,
        event: 'CANCEL',
        actorRole: Role.CUSTOMER,
        actorId: 'customer-1',
      });
      expect(next).toBe(OrderStatus.CANCELLED);
    });

    it('admin can cancel an ACCEPTED order -> CANCELLED', () => {
      const next = executeOrderTransition({
        ...baseContext,
        currentStatus: OrderStatus.ACCEPTED,
        event: 'CANCEL',
        actorRole: Role.ADMIN,
        actorId: 'admin-1',
      });
      expect(next).toBe(OrderStatus.CANCELLED);
    });

    it('admin can cancel a PREPARING order -> CANCELLED', () => {
      const next = executeOrderTransition({
        ...baseContext,
        currentStatus: OrderStatus.PREPARING,
        event: 'CANCEL',
        actorRole: Role.ADMIN,
        actorId: 'admin-1',
      });
      expect(next).toBe(OrderStatus.CANCELLED);
    });

    it('customer can cancel their own ACCEPTED order -> CANCELLED', () => {
      const next = executeOrderTransition({
        ...baseContext,
        currentStatus: OrderStatus.ACCEPTED,
        event: 'CANCEL',
        actorRole: Role.CUSTOMER,
        actorId: 'customer-1',
      });
      expect(next).toBe(OrderStatus.CANCELLED);
    });
  });

  describe('Illegal Status Transitions (409 INVALID_STATE_TRANSITION)', () => {
    it('cannot CANCEL once an order reaches READY', () => {
      expect(() =>
        executeOrderTransition({
          ...baseContext,
          currentStatus: OrderStatus.READY,
          event: 'CANCEL',
          actorRole: Role.CUSTOMER,
          actorId: 'customer-1',
        })
      ).toThrowError(
        expect.objectContaining({
          statusCode: 409,
          code: ApiErrorCode.INVALID_STATE_TRANSITION,
        })
      );
    });

    it('cannot CANCEL once an order reaches PICKED_UP', () => {
      expect(() =>
        executeOrderTransition({
          ...baseContext,
          currentStatus: OrderStatus.PICKED_UP,
          event: 'CANCEL',
          actorRole: Role.CUSTOMER,
          actorId: 'customer-1',
        })
      ).toThrowError(
        expect.objectContaining({
          statusCode: 409,
          code: ApiErrorCode.INVALID_STATE_TRANSITION,
        })
      );
    });

    it('cannot PICKUP an order before it is READY (e.g. from PREPARING)', () => {
      expect(() =>
        executeOrderTransition({
          ...baseContext,
          currentStatus: OrderStatus.PREPARING,
          event: 'PICKUP',
          actorRole: Role.DELIVERY_PARTNER,
          actorId: 'partner-1',
        })
      ).toThrowError(
        expect.objectContaining({
          statusCode: 409,
          code: ApiErrorCode.INVALID_STATE_TRANSITION,
        })
      );
    });

    it('cannot transition from terminal state DELIVERED', () => {
      expect(() =>
        executeOrderTransition({
          ...baseContext,
          currentStatus: OrderStatus.DELIVERED,
          event: 'CANCEL',
          actorRole: Role.ADMIN,
          actorId: 'admin-1',
        })
      ).toThrowError(
        expect.objectContaining({
          statusCode: 409,
          code: ApiErrorCode.INVALID_STATE_TRANSITION,
        })
      );
    });

    it('cannot transition from terminal state CANCELLED', () => {
      expect(() =>
        executeOrderTransition({
          ...baseContext,
          currentStatus: OrderStatus.CANCELLED,
          event: 'ACCEPT',
          actorRole: Role.SHOPKEEPER,
          actorId: 'shopkeeper-1',
        })
      ).toThrowError(
        expect.objectContaining({
          statusCode: 409,
          code: ApiErrorCode.INVALID_STATE_TRANSITION,
        })
      );
    });

    it('cannot transition from terminal state REJECTED', () => {
      expect(() =>
        executeOrderTransition({
          ...baseContext,
          currentStatus: OrderStatus.REJECTED,
          event: 'ACCEPT',
          actorRole: Role.SHOPKEEPER,
          actorId: 'shopkeeper-1',
        })
      ).toThrowError(
        expect.objectContaining({
          statusCode: 409,
          code: ApiErrorCode.INVALID_STATE_TRANSITION,
        })
      );
    });

    it('cannot ACCEPT from PREPARING (skipping states)', () => {
      expect(() =>
        executeOrderTransition({
          ...baseContext,
          currentStatus: OrderStatus.PREPARING,
          event: 'ACCEPT',
          actorRole: Role.SHOPKEEPER,
          actorId: 'shopkeeper-1',
        })
      ).toThrowError(
        expect.objectContaining({
          statusCode: 409,
          code: ApiErrorCode.INVALID_STATE_TRANSITION,
        })
      );
    });

    it('cannot DELIVER from READY (skipping PICKED_UP)', () => {
      expect(() =>
        executeOrderTransition({
          ...baseContext,
          currentStatus: OrderStatus.READY,
          event: 'DELIVER',
          actorRole: Role.DELIVERY_PARTNER,
          actorId: 'partner-1',
        })
      ).toThrowError(
        expect.objectContaining({
          statusCode: 409,
          code: ApiErrorCode.INVALID_STATE_TRANSITION,
        })
      );
    });

    it('admin cannot cancel a DELIVERED order (terminal)', () => {
      expect(() =>
        executeOrderTransition({
          ...baseContext,
          currentStatus: OrderStatus.DELIVERED,
          event: 'CANCEL',
          actorRole: Role.ADMIN,
          actorId: 'admin-1',
        })
      ).toThrowError(
        expect.objectContaining({
          statusCode: 409,
          code: ApiErrorCode.INVALID_STATE_TRANSITION,
        })
      );
    });
  });

  describe('Authorization & Ownership Violations (403)', () => {
    it('rejects a role attempting an event not allowed for it (e.g. customer trying to ACCEPT)', () => {
      expect(() =>
        executeOrderTransition({
          ...baseContext,
          currentStatus: OrderStatus.PLACED,
          event: 'ACCEPT',
          actorRole: Role.CUSTOMER,
          actorId: 'customer-1',
        })
      ).toThrowError(
        expect.objectContaining({
          statusCode: 403,
          code: ApiErrorCode.FORBIDDEN_ROLE,
        })
      );
    });

    it('rejects shopkeeper attempting to accept an order of a shop they do not own', () => {
      expect(() =>
        executeOrderTransition({
          ...baseContext,
          currentStatus: OrderStatus.PLACED,
          event: 'ACCEPT',
          actorRole: Role.SHOPKEEPER,
          actorId: 'different-shopkeeper-99',
        })
      ).toThrowError(
        expect.objectContaining({
          statusCode: 403,
          code: ApiErrorCode.FORBIDDEN_RESOURCE,
        })
      );
    });

    it('rejects delivery partner attempting to pickup an order assigned to someone else', () => {
      expect(() =>
        executeOrderTransition({
          ...baseContext,
          currentStatus: OrderStatus.READY,
          event: 'PICKUP',
          actorRole: Role.DELIVERY_PARTNER,
          actorId: 'different-partner-99',
        })
      ).toThrowError(
        expect.objectContaining({
          statusCode: 403,
          code: ApiErrorCode.NOT_ASSIGNED_PARTNER,
        })
      );
    });

    it('rejects customer attempting to cancel someone elses order', () => {
      expect(() =>
        executeOrderTransition({
          ...baseContext,
          currentStatus: OrderStatus.PLACED,
          event: 'CANCEL',
          actorRole: Role.CUSTOMER,
          actorId: 'malicious-customer-99',
        })
      ).toThrowError(
        expect.objectContaining({
          statusCode: 403,
          code: ApiErrorCode.FORBIDDEN_RESOURCE,
        })
      );
    });

    it('rejects delivery partner trying to ACCEPT (wrong role)', () => {
      expect(() =>
        executeOrderTransition({
          ...baseContext,
          currentStatus: OrderStatus.PLACED,
          event: 'ACCEPT',
          actorRole: Role.DELIVERY_PARTNER,
          actorId: 'partner-1',
        })
      ).toThrowError(
        expect.objectContaining({
          statusCode: 403,
          code: ApiErrorCode.FORBIDDEN_ROLE,
        })
      );
    });

    it('rejects admin trying to PICKUP (wrong role)', () => {
      expect(() =>
        executeOrderTransition({
          ...baseContext,
          currentStatus: OrderStatus.READY,
          event: 'PICKUP',
          actorRole: Role.ADMIN,
          actorId: 'admin-1',
        })
      ).toThrowError(
        expect.objectContaining({
          statusCode: 403,
          code: ApiErrorCode.FORBIDDEN_ROLE,
        })
      );
    });

    it('rejects PICKUP when no delivery partner is assigned (null assignedPartnerId)', () => {
      expect(() =>
        executeOrderTransition({
          ...baseContext,
          currentStatus: OrderStatus.READY,
          event: 'PICKUP',
          actorRole: Role.DELIVERY_PARTNER,
          actorId: 'partner-1',
          assignedPartnerId: null, // unassigned
        })
      ).toThrowError(
        expect.objectContaining({
          statusCode: 403,
          code: ApiErrorCode.NOT_ASSIGNED_PARTNER,
        })
      );
    });
  });

  describe('Unknown Event (400)', () => {
    it('throws 400 VALIDATION_ERROR for an unrecognized event string', () => {
      expect(() =>
        executeOrderTransition({
          ...baseContext,
          event: 'TELEPORT' as any,
        })
      ).toThrowError(
        expect.objectContaining({
          statusCode: 400,
          code: ApiErrorCode.VALIDATION_ERROR,
        })
      );
    });
  });
});

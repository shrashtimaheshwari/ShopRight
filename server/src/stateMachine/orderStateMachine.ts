import { OrderStatus, Role, ApiErrorCode } from '@shopright/shared-types';
import { AppError } from '../middleware/errorHandler.js';

export type OrderEvent =
  | 'ACCEPT'
  | 'REJECT'
  | 'START_PREPARING'
  | 'MARK_READY'
  | 'PICKUP'
  | 'DELIVER'
  | 'CANCEL';

export interface OrderTransitionContext {
  currentStatus: OrderStatus;
  event: OrderEvent;
  actorRole: Role;
  actorId: string;
  orderCustomerId: string;
  shopOwnerId: string;
  assignedPartnerId?: string | null;
}

interface TransitionRule {
  from: OrderStatus[];
  to: OrderStatus;
  allowedRoles: Role[];
  validateActor: (ctx: OrderTransitionContext) => void;
}

const TRANSITION_RULES: Record<OrderEvent, TransitionRule> = {
  ACCEPT: {
    from: [OrderStatus.PLACED],
    to: OrderStatus.ACCEPTED,
    allowedRoles: [Role.SHOPKEEPER],
    validateActor: (ctx) => {
      if (ctx.actorId !== ctx.shopOwnerId) {
        throw new AppError(
          403,
          ApiErrorCode.FORBIDDEN_RESOURCE,
          'Only the owning shopkeeper can accept this order.'
        );
      }
    },
  },
  REJECT: {
    from: [OrderStatus.PLACED],
    to: OrderStatus.REJECTED,
    allowedRoles: [Role.SHOPKEEPER],
    validateActor: (ctx) => {
      if (ctx.actorId !== ctx.shopOwnerId) {
        throw new AppError(
          403,
          ApiErrorCode.FORBIDDEN_RESOURCE,
          'Only the owning shopkeeper can reject this order.'
        );
      }
    },
  },
  START_PREPARING: {
    from: [OrderStatus.ACCEPTED],
    to: OrderStatus.PREPARING,
    allowedRoles: [Role.SHOPKEEPER],
    validateActor: (ctx) => {
      if (ctx.actorId !== ctx.shopOwnerId) {
        throw new AppError(
          403,
          ApiErrorCode.FORBIDDEN_RESOURCE,
          'Only the owning shopkeeper can update status to PREPARING.'
        );
      }
    },
  },
  MARK_READY: {
    from: [OrderStatus.PREPARING],
    to: OrderStatus.READY,
    allowedRoles: [Role.SHOPKEEPER],
    validateActor: (ctx) => {
      if (ctx.actorId !== ctx.shopOwnerId) {
        throw new AppError(
          403,
          ApiErrorCode.FORBIDDEN_RESOURCE,
          'Only the owning shopkeeper can mark order as READY.'
        );
      }
    },
  },
  PICKUP: {
    from: [OrderStatus.READY],
    to: OrderStatus.PICKED_UP,
    allowedRoles: [Role.DELIVERY_PARTNER],
    validateActor: (ctx) => {
      if (!ctx.assignedPartnerId || ctx.actorId !== ctx.assignedPartnerId) {
        throw new AppError(
          403,
          ApiErrorCode.NOT_ASSIGNED_PARTNER,
          'Only the assigned delivery partner can pick up this order.'
        );
      }
    },
  },
  DELIVER: {
    from: [OrderStatus.PICKED_UP],
    to: OrderStatus.DELIVERED,
    allowedRoles: [Role.DELIVERY_PARTNER],
    validateActor: (ctx) => {
      if (!ctx.assignedPartnerId || ctx.actorId !== ctx.assignedPartnerId) {
        throw new AppError(
          403,
          ApiErrorCode.NOT_ASSIGNED_PARTNER,
          'Only the assigned delivery partner can mark this order as DELIVERED.'
        );
      }
    },
  },
  CANCEL: {
    from: [OrderStatus.PLACED, OrderStatus.ACCEPTED, OrderStatus.PREPARING],
    to: OrderStatus.CANCELLED,
    allowedRoles: [Role.CUSTOMER, Role.ADMIN],
    validateActor: (ctx) => {
      if (ctx.actorRole === Role.CUSTOMER && ctx.actorId !== ctx.orderCustomerId) {
        throw new AppError(
          403,
          ApiErrorCode.FORBIDDEN_RESOURCE,
          'Customers can only cancel their own orders.'
        );
      }
    },
  },
};

/**
 * Shared Order State Machine (Design Doc §5.3, Security Doc §4, ADR-006).
 * Enforces valid lifecycle transitions, role restrictions, and resource ownership.
 *
 * @returns The new OrderStatus on success.
 * @throws AppError(409) on illegal status transition.
 * @throws AppError(403) on unauthorized role or resource ownership failure.
 */
export function executeOrderTransition(ctx: OrderTransitionContext): OrderStatus {
  const rule = TRANSITION_RULES[ctx.event];
  if (!rule) {
    throw new AppError(
      400,
      ApiErrorCode.VALIDATION_ERROR,
      `Unknown order event: ${ctx.event}`
    );
  }

  // 1. Role validation
  if (!rule.allowedRoles.includes(ctx.actorRole)) {
    throw new AppError(
      403,
      ApiErrorCode.FORBIDDEN_ROLE,
      `Role ${ctx.actorRole} is not permitted to trigger event ${ctx.event}.`
    );
  }

  // 2. State transition legality validation
  if (!rule.from.includes(ctx.currentStatus)) {
    throw new AppError(
      409,
      ApiErrorCode.INVALID_STATE_TRANSITION,
      `Cannot execute ${ctx.event} on an order with status ${ctx.currentStatus}.`
    );
  }

  // 3. Ownership / assignment validation
  rule.validateActor(ctx);

  return rule.to;
}

import { z } from 'zod';
import { ORDER_STATUSES, OrderStatus } from '../../domain/entities/enums';

/**
 * Zod schemas validate and normalise all request input at the HTTP boundary
 * (via the `validate` middleware) before it reaches controllers/services.
 */

const email = z.string().trim().toLowerCase().email('A valid email is required');
const password = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128, 'Password must be at most 128 characters');

export const registerSchema = z.object({
  body: z.object({
    name: z.string().trim().min(1, 'Name is required').max(255),
    email,
    password,
    phone: z.string().trim().max(50).optional(),
    address: z.string().trim().max(500).optional(),
  }),
});

export const loginSchema = z.object({
  body: z.object({
    email,
    password: z.string().min(1, 'Password is required'),
  }),
});

export const updateProfileSchema = z.object({
  body: z
    .object({
      name: z.string().trim().min(1).max(255).optional(),
      phone: z.string().trim().max(50).nullable().optional(),
      address: z.string().trim().max(500).nullable().optional(),
    })
    .refine((data) => Object.keys(data).length > 0, {
      message: 'At least one field must be provided',
    }),
});

export const changePasswordSchema = z.object({
  body: z.object({
    currentPassword: z.string().min(1, 'Current password is required'),
    newPassword: password,
  }),
});

export const placeOrderSchema = z.object({
  body: z.object({
    items: z
      .array(
        z.object({
          productId: z.string().uuid('productId must be a valid UUID'),
          quantity: z.number().int().positive('quantity must be a positive integer'),
        }),
      )
      .min(1, 'An order must contain at least one item'),
  }),
});

export const updateOrderStatusSchema = z.object({
  params: z.object({
    id: z.string().uuid('id must be a valid UUID'),
  }),
  body: z.object({
    status: z.enum(ORDER_STATUSES as [OrderStatus, ...OrderStatus[]]),
  }),
});

export const idParamSchema = z.object({
  params: z.object({
    id: z.string().uuid('id must be a valid UUID'),
  }),
});

export const paginationSchema = z.object({
  query: z.object({
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(10),
  }),
});

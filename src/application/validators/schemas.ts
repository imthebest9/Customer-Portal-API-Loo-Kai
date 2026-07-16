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

/**
 * Phone numbers are accepted in the formats people actually type — "+60 12-345 6789",
 * "(03) 2345 6789", "0123456789" — but validated on the digits they carry rather than
 * their punctuation: E.164 caps a number at 15 digits, and 7 is the shortest realistic
 * subscriber number. Separators are permitted and not significant.
 *
 * A country-aware library (libphonenumber) could go further and reject numbers that are
 * well-formed but unassigned; that needs a country to resolve local formats against,
 * which the brief doesn't define, so this stops at format rather than guessing.
 */
const PHONE_SHAPE = /^\+?[0-9\s().-]+$/;
const phone = z
  .string()
  .trim()
  .max(30)
  .regex(PHONE_SHAPE, 'Phone number may contain only digits, spaces and + ( ) - .')
  .refine(
    (value) => {
      const digits = value.replace(/\D/g, '').length;
      return digits >= 7 && digits <= 15;
    },
    { message: 'Phone number must contain between 7 and 15 digits' },
  );

/**
 * Every body schema is `.strict()`: an unknown field is a 422, not a silent
 * drop. A client sending `role: "admin"` to register is either confused or
 * probing, and both deserve a straight answer rather than a 201 that quietly
 * ignored the field.
 */
export const registerSchema = z.object({
  body: z
    .object({
      name: z.string().trim().min(1, 'Name is required').max(255),
      email,
      password,
      phone: phone.optional(),
      address: z.string().trim().max(500).optional(),
    })
    .strict(),
});

export const loginSchema = z.object({
  body: z
    .object({
      email,
      password: z.string().min(1, 'Password is required'),
    })
    .strict(),
});

export const updateProfileSchema = z.object({
  body: z
    .object({
      name: z.string().trim().min(1).max(255).optional(),
      phone: phone.nullable().optional(),
      address: z.string().trim().max(500).nullable().optional(),
    })
    .strict()
    .refine((data) => Object.keys(data).length > 0, {
      message: 'At least one field must be provided',
    }),
});

export const changePasswordSchema = z.object({
  body: z
    .object({
      currentPassword: z.string().min(1, 'Current password is required'),
      newPassword: password,
    })
    .strict(),
});

const orderItem = z
  .object({
    productId: z.string().uuid('productId must be a valid UUID'),
    quantity: z
      .number({ invalid_type_error: 'quantity must be a number' })
      .int('quantity must be a whole number')
      .positive('quantity must be a positive integer')
      // An upper bound keeps a typo (or a hostile client) from creating an order
      // whose total overflows past exact integer arithmetic.
      .max(1000, 'quantity may not exceed 1000 per item'),
  })
  .strict();

export const placeOrderSchema = z.object({
  body: z
    .object({
      items: z
        .array(orderItem)
        .min(1, 'An order must contain at least one item')
        .max(50, 'An order may contain at most 50 distinct products')
        // One line per product. Two lines for the same product describe the same
        // purchase twice: they'd render as indistinguishable duplicate line items
        // and invite a client to send quantity 2 + 1 where it means 3.
        .refine((items) => new Set(items.map((i) => i.productId)).size === items.length, {
          message:
            'Each product may appear only once — combine duplicates into a single item with a higher quantity',
        }),
    })
    .strict(),
});

export const updateOrderStatusSchema = z.object({
  params: z.object({
    id: z.string().uuid('id must be a valid UUID'),
  }),
  body: z
    .object({
      status: z.enum(ORDER_STATUSES as [OrderStatus, ...OrderStatus[]], {
        errorMap: () => ({ message: `status must be one of: ${ORDER_STATUSES.join(', ')}` }),
      }),
    })
    .strict(),
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

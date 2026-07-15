import path from 'node:path';
import { Express } from 'express';
import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';
import { config } from '../../../infrastructure/config/env';

/**
 * Builds the OpenAPI spec from JSDoc annotations on the route files and mounts
 * Swagger UI at /api-docs (generated automatically when the API runs).
 * Reusable component schemas are defined here once and referenced via $ref.
 */
const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.3',
    info: {
      title: 'Customer Portal API',
      version: '1.0.0',
      description:
        'Backend for a customer-facing portal. Customers manage their profile and orders; admins manage customers and orders. JWT auth with role-based authorization.',
    },
    servers: [{ url: `http://localhost:${config.PORT}`, description: 'Local' }],
    components: {
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      },
      parameters: {
        PageParam: {
          name: 'page',
          in: 'query',
          schema: { type: 'integer', minimum: 1, default: 1 },
          description: '1-based page number',
        },
        LimitParam: {
          name: 'limit',
          in: 'query',
          schema: { type: 'integer', minimum: 1, maximum: 100, default: 10 },
          description: 'Items per page',
        },
        IdParam: {
          name: 'id',
          in: 'path',
          required: true,
          schema: { type: 'string', format: 'uuid' },
        },
      },
      schemas: {
        Role: { type: 'string', enum: ['customer', 'admin'] },
        OrderStatus: {
          type: 'string',
          enum: ['Pending', 'Shipped', 'Delivered', 'Cancelled'],
        },
        Customer: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            name: { type: 'string' },
            email: { type: 'string', format: 'email' },
            role: { $ref: '#/components/schemas/Role' },
            phone: { type: 'string', nullable: true },
            address: { type: 'string', nullable: true },
            isActive: { type: 'boolean' },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
        },
        Product: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            name: { type: 'string' },
            price: { type: 'number' },
            isActive: { type: 'boolean' },
          },
        },
        OrderItem: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            productId: { type: 'string', format: 'uuid' },
            productName: { type: 'string' },
            quantity: { type: 'integer' },
            unitPrice: { type: 'number' },
          },
        },
        Order: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            customerId: { type: 'string', format: 'uuid' },
            status: { $ref: '#/components/schemas/OrderStatus' },
            totalAmount: { type: 'number' },
            items: { type: 'array', items: { $ref: '#/components/schemas/OrderItem' } },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
        },
        AuthResponse: {
          type: 'object',
          properties: {
            customer: { $ref: '#/components/schemas/Customer' },
            token: { type: 'string' },
          },
        },
        RegisterRequest: {
          type: 'object',
          required: ['name', 'email', 'password'],
          properties: {
            name: { type: 'string' },
            email: { type: 'string', format: 'email' },
            password: { type: 'string', minLength: 8 },
            phone: { type: 'string' },
            address: { type: 'string' },
          },
        },
        LoginRequest: {
          type: 'object',
          required: ['email', 'password'],
          properties: {
            email: { type: 'string', format: 'email' },
            password: { type: 'string' },
          },
        },
        UpdateProfileRequest: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            phone: { type: 'string', nullable: true },
            address: { type: 'string', nullable: true },
          },
        },
        ChangePasswordRequest: {
          type: 'object',
          required: ['currentPassword', 'newPassword'],
          properties: {
            currentPassword: { type: 'string' },
            newPassword: { type: 'string', minLength: 8 },
          },
        },
        PlaceOrderRequest: {
          type: 'object',
          required: ['items'],
          properties: {
            items: {
              type: 'array',
              minItems: 1,
              items: {
                type: 'object',
                required: ['productId', 'quantity'],
                properties: {
                  productId: { type: 'string', format: 'uuid' },
                  quantity: { type: 'integer', minimum: 1 },
                },
              },
            },
          },
        },
        UpdateOrderStatusRequest: {
          type: 'object',
          required: ['status'],
          properties: { status: { $ref: '#/components/schemas/OrderStatus' } },
        },
        Pagination: {
          type: 'object',
          properties: {
            page: { type: 'integer' },
            limit: { type: 'integer' },
            total: { type: 'integer' },
            totalPages: { type: 'integer' },
          },
        },
        PaginatedOrders: {
          allOf: [
            { $ref: '#/components/schemas/Pagination' },
            {
              type: 'object',
              properties: {
                data: { type: 'array', items: { $ref: '#/components/schemas/Order' } },
              },
            },
          ],
        },
        PaginatedCustomers: {
          allOf: [
            { $ref: '#/components/schemas/Pagination' },
            {
              type: 'object',
              properties: {
                data: { type: 'array', items: { $ref: '#/components/schemas/Customer' } },
              },
            },
          ],
        },
        PaginatedProducts: {
          allOf: [
            { $ref: '#/components/schemas/Pagination' },
            {
              type: 'object',
              properties: {
                data: { type: 'array', items: { $ref: '#/components/schemas/Product' } },
              },
            },
          ],
        },
      },
    },
  },
  // Scan route files for @openapi annotations (both .ts in dev and .js when built).
  // `glob` treats backslashes as escapes, so always use forward slashes (Windows-safe).
  apis: [path.join(__dirname, '..', 'routes', '*.{ts,js}').replace(/\\/g, '/')],
};

export const openApiSpec = swaggerJsdoc(options);

export function mountSwagger(app: Express): void {
  app.get('/api-docs.json', (_req, res) => res.json(openApiSpec));
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(openApiSpec));
}

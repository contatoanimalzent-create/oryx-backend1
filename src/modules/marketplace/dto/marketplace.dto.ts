import { z } from 'zod';

export const createProductSchema = z.object({
  title: z.string().min(3).max(120),
  description: z.string().min(10).max(2000),
  category: z.enum(['REPLICA', 'TACTICAL_GEAR', 'AMMO', 'ACCESSORY', 'PATCH', 'COSMETIC', 'OTHER']),
  condition: z.enum(['NEW', 'LIKE_NEW', 'USED', 'FOR_PARTS']).default('USED'),
  priceCents: z.number().int().positive().max(10_000_000),
  city: z.string().min(2).max(100),
  state: z.string().length(2),
  photoUrls: z.array(z.string().url()).max(8).default([]),
});

export const updateProductSchema = createProductSchema.partial().extend({
  status: z.enum(['DRAFT', 'ACTIVE', 'EXPIRED', 'REMOVED']).optional(),
});

export const createOrderSchema = z.object({
  items: z
    .array(
      z.object({
        productId: z.string().uuid(),
        qty: z.number().int().positive().max(20).default(1),
      }),
    )
    .min(1)
    .max(20),
  shippingAddress: z.object({
    street: z.string(),
    number: z.string(),
    complement: z.string().optional(),
    neighborhood: z.string(),
    city: z.string(),
    state: z.string().length(2),
    postalCode: z.string().regex(/^\d{8}$/, 'CEP must be 8 digits'),
  }),
});

export type CreateProductDto = z.infer<typeof createProductSchema>;
export type UpdateProductDto = z.infer<typeof updateProductSchema>;
export type CreateOrderDto = z.infer<typeof createOrderSchema>;

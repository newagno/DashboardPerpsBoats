/**
 * Input validation schemas using Zod.
 * All API inputs are validated before processing.
 */
const { z } = require('zod');

// ── Common validators ─────────────────────────────────────────────────────────
const ethereumAddress = z.string()
    .regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid Ethereum address format')
    .transform(v => v.toLowerCase());

const apiKeyString = z.string()
    .min(8, 'API key too short')
    .max(256, 'API key too long')
    .regex(/^[a-zA-Z0-9_\-]+$/, 'API key contains invalid characters');

// ── Route-specific schemas ────────────────────────────────────────────────────

const nonceQuerySchema = z.object({
    address: ethereumAddress
});

const verifyBodySchema = z.object({
    address: ethereumAddress,
    signature: z.string().min(1, 'Signature required'),
    message: z.object({
        intent: z.literal('Login to Dashboard'),
        address: z.string(),
        nonce: z.string().uuid('Invalid nonce format'),
        timestamp: z.number().int().positive()
    }),
    chainId: z.union([
        z.string().regex(/^0x[a-fA-F0-9]+$/, 'Invalid hex chainId'),
        z.number().int().positive()
    ])
});

const extendedStatsSchema = z.object({
    apiKey: apiKeyString
});

const nadoStatsSchema = z.object({
    address: ethereumAddress.optional(),
    walletAddress: ethereumAddress
});

const variationalStatsSchema = z.object({
    address: ethereumAddress.optional(),
    walletAddress: ethereumAddress,
    vrToken: z.string().min(1).max(4096).optional()
});

const storeKeySchema = z.object({
    type: z.enum(['extended', 'variational']),
    entryId: z.string().min(1).max(128),
    value: z.string().min(1).max(4096)
});

// ── Middleware factory ────────────────────────────────────────────────────────

/**
 * Creates an Express middleware that validates req.body against the given schema.
 * @param {z.ZodSchema} schema - Zod schema to validate against
 * @param {'body' | 'query'} source - Where to read input from
 */
const validate = (schema, source = 'body') => (req, res, next) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
        const errors = result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`);
        return res.status(400).json({
            error: 'Validation failed',
            details: errors
        });
    }
    // Replace raw input with validated & transformed data
    req[source === 'body' ? 'validatedBody' : 'validatedQuery'] = result.data;
    next();
};

module.exports = {
    schemas: {
        nonceQuerySchema,
        verifyBodySchema,
        extendedStatsSchema,
        nadoStatsSchema,
        variationalStatsSchema,
        storeKeySchema
    },
    validate
};

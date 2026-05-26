/**
 * Input validation schemas using Zod.
 * All API inputs are validated before processing.
 */
const { z } = require('zod');

// ── Common validators ─────────────────────────────────────────────────────────
const ethereumAddress = z.string()
    .regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid Ethereum address format')
    .transform(v => v.toLowerCase());

// Starknet L2 addresses are 66 chars (0x + 64 hex)
const starknetOrEthAddress = z.string()
    .regex(/^0x[a-fA-F0-9]{40,64}$/, 'Invalid address format (expected ETH or Starknet address)')
    .transform(v => v.toLowerCase());

const entryId = z.string()
    .min(1, 'entryId required')
    .max(128, 'entryId too long')
    .regex(/^[a-zA-Z0-9_\-]+$/, 'entryId contains invalid characters');

const keyType = z.enum(['extended', 'variational'], { message: 'type must be extended or variational' });

const apiKeyString = z.string()
    .min(8, 'API key too short')
    .max(256, 'API key too long')
    .regex(/^[a-zA-Z0-9_\-]+$/, 'API key contains invalid characters');

// ── Route-specific schemas ────────────────────────────────────────────────────


const nadoStatsSchema = z.object({
    address: starknetOrEthAddress.optional().nullable(),
    walletAddress: starknetOrEthAddress.optional()
}).refine(data => data.address || data.walletAddress, {
    message: 'address or walletAddress is required'
});

const nadoSyncSchema = z.object({
    address: starknetOrEthAddress.optional(),
    walletAddress: starknetOrEthAddress.optional()
}).refine(data => data.address || data.walletAddress, {
    message: 'address or walletAddress is required'
});

const variationalStatsSchema = z.object({
    address: starknetOrEthAddress.optional(),
    walletAddress: starknetOrEthAddress.optional(),
    vrToken: z.string().min(1).max(4096).optional()
}).refine(data => data.address || data.walletAddress, {
    message: 'address or walletAddress is required'
});

const storeKeySchema = z.object({
    type: keyType,
    entryId: entryId,
    value: z.string().min(1).max(4096)
});

const keyCheckQuerySchema = z.object({
    type: keyType,
    entryId: entryId
});

const keyRemoveBodySchema = z.object({
    type: keyType,
    entryId: entryId
});

const extendedEntryIdSchema = z.object({
    entryId: entryId
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
        extendedEntryIdSchema,
        nadoStatsSchema,
        nadoSyncSchema,
        variationalStatsSchema,
        storeKeySchema,
        keyCheckQuerySchema,
        keyRemoveBodySchema
    },
    validate
};

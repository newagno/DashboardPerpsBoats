import { Request, Response, NextFunction } from 'express';
import express from 'express';
const router = express.Router();
import * as exchangeController from '../controllers/exchangeController';
import validation from '../utils/validation';
const { validate, schemas } = validation;
import apiLimiter from '../middlewares/rateLimiter';
import csrfProtect from '../middlewares/csrf';

router.get('/api/health', exchangeController.getHealth_1);
router.post('/api/exchanges/keys/store', csrfProtect, validate(schemas.storeKeySchema, 'body'), exchangeController.keys_store_2);
router.get('/api/exchanges/keys/check', validate(schemas.keyCheckQuerySchema, 'query'), exchangeController.keys_check_3);
router.post('/api/exchanges/keys/remove', csrfProtect, validate(schemas.keyRemoveBodySchema, 'body'), exchangeController.keys_remove_4);
router.post('/api/exchanges/manual-override/save', csrfProtect, exchangeController.manual_override_save_5);
router.get('/api/exchanges/manual-override/get', exchangeController.manual_override_get_6);
router.post('/api/exchanges/state/save', csrfProtect, exchangeController.state_save_7);
router.get('/api/exchanges/state/get', exchangeController.state_get_8);
router.post('/api/exchanges/extended/stats', apiLimiter, csrfProtect, validate(schemas.extendedEntryIdSchema, 'body'), exchangeController.extended_stats_9);
router.post('/api/exchanges/extended/sync-history', apiLimiter, csrfProtect, validate(schemas.extendedEntryIdSchema, 'body'), exchangeController.extended_sync_history_10);
router.post('/api/exchanges/nado/stats', apiLimiter, csrfProtect, validate(schemas.nadoStatsSchema, 'body'), exchangeController.nado_stats_11);
router.post('/api/exchanges/nado/sync-history', apiLimiter, csrfProtect, validate(schemas.nadoSyncSchema, 'body'), exchangeController.nado_sync_history_12);
router.post('/api/exchanges/variational/stats', apiLimiter, csrfProtect, validate(schemas.variationalStatsSchema, 'body'), exchangeController.variational_stats_13);

export default router;
const express = require('express');
const router = express.Router();
const { getAll, getToday, getCustomerAppointments, create, confirm, cancel, complete, reschedule, getAvailableSlots } = require('../controllers/appointmentController');
const { authenticateToken } = require('../middleware/auth');
const { requireAdmin } = require('../middleware/admin');

const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

router.get('/', authenticateToken, asyncHandler(getAll));
router.get('/today', authenticateToken, requireAdmin, asyncHandler(getToday));
router.get('/slots', asyncHandler(getAvailableSlots));
router.post('/', authenticateToken, asyncHandler(create));
router.put('/:id/confirm', authenticateToken, requireAdmin, asyncHandler(confirm));
router.put('/:id/cancel', authenticateToken, asyncHandler(cancel));
router.put('/:id/complete', authenticateToken, requireAdmin, asyncHandler(complete));
router.put('/:id/reschedule', authenticateToken, requireAdmin, asyncHandler(reschedule));
router.get('/customer/:id', authenticateToken, requireAdmin, asyncHandler(getCustomerAppointments));

module.exports = router;

import { z } from 'zod';
import { protectedProcedure, requireRole, router } from '../_core/trpc';
import {
  approveOperationalTransferRequest, cancelOperationalTransferRequest, completeOperationalTransferRequest,
  createOperationalTransferRequest, getOperationalTransferOptions, getOperationalTransferWorkers,
  listOperationalTransferRequests, rejectOperationalTransferRequest,
} from '../db/operational-transfers';

const operationProcedure = protectedProcedure.use(requireRole(
  'super_admin', 'admin_affairs', 'supervisor_tolan', 'supervisor_malqa', 'restaurant_operations'
));
const id = z.number().int().positive();
const workDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const transferId = z.object({ id });

export const operationalTransfersRouter = router({
  options: operationProcedure.input(z.object({ workDate, toCostCenterId: id }))
    .query(({ input, ctx }) => getOperationalTransferOptions({ ...input, actorUserId: ctx.user.id, actorRole: String(ctx.user.role) })),
  workers: operationProcedure.input(z.object({ workDate, toCostCenterId: id, sourceGroupId: id }))
    .query(({ input, ctx }) => getOperationalTransferWorkers({ ...input, actorUserId: ctx.user.id, actorRole: String(ctx.user.role) })),
  list: operationProcedure.input(z.object({ workDate, costCenterId: id }))
    .query(({ input, ctx }) => listOperationalTransferRequests({ ...input, actorUserId: ctx.user.id, actorRole: String(ctx.user.role) })),
  create: operationProcedure.input(z.object({ workDate, workerId: id, sourceGroupId: id, toGroupId: id, toCostCenterId: id }))
    .mutation(({ input, ctx }) => createOperationalTransferRequest({ ...input, actorUserId: ctx.user.id, actorRole: String(ctx.user.role) })),
  approve: operationProcedure.input(transferId)
    .mutation(({ input, ctx }) => approveOperationalTransferRequest({ ...input, actorUserId: ctx.user.id, actorRole: String(ctx.user.role) })),
  reject: operationProcedure.input(z.object({ id, reason: z.string().trim().min(1).max(500) }))
    .mutation(({ input, ctx }) => rejectOperationalTransferRequest({ ...input, actorUserId: ctx.user.id, actorRole: String(ctx.user.role) })),
  cancel: operationProcedure.input(transferId)
    .mutation(({ input, ctx }) => cancelOperationalTransferRequest({ ...input, actorUserId: ctx.user.id, actorRole: String(ctx.user.role) })),
  complete: operationProcedure.input(z.object({ id, restaurantId: id }))
    .mutation(({ input, ctx }) => completeOperationalTransferRequest({ ...input, actorUserId: ctx.user.id, actorRole: String(ctx.user.role) })),
});

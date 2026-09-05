import { z } from "zod";
import { reprocessZktecoRawEvent } from "../biometric/zkteco-adms-service";
import { adminProcedure, router } from "../_core/trpc";
import {
  createBiometricDevice,
  listBiometricDevices,
  listBiometricMappings,
  listBiometricRawEvents,
  resetBiometricDeviceAcceptanceWindow,
  setBiometricMappingActive,
  updateBiometricDevice,
  upsertBiometricMapping,
} from "../db/biometric";

const processingStatus = z.enum(['pending','processed','duplicate','unmapped','review','error']);

export const biometricRouter = router({
  devices: adminProcedure.query(async () => listBiometricDevices()),

  createDevice: adminProcedure
    .input(z.object({
      name: z.string().trim().min(2).max(120),
      serialNumber: z.string().trim().min(2).max(100),
      model: z.string().trim().max(80).nullable().optional(),
      protocolMode: z.enum(['ta_push','ac_push','unknown']).default('ta_push'),
      locationName: z.string().trim().max(160).nullable().optional(),
      costCenterId: z.number().int().positive().nullable().optional(),
      timezone: z.string().trim().max(64).default('Asia/Riyadh'),
    }))
    .mutation(async ({ input, ctx }) => {
      const id = await createBiometricDevice({ ...input, createdBy: ctx.user.id });
      return { success: true, id };
    }),

  updateDevice: adminProcedure
    .input(z.object({
      id: z.number().int().positive(),
      name: z.string().trim().min(2).max(120).optional(),
      model: z.string().trim().max(80).nullable().optional(),
      protocolMode: z.enum(['ta_push','ac_push','unknown']).optional(),
      locationName: z.string().trim().max(160).nullable().optional(),
      costCenterId: z.number().int().positive().nullable().optional(),
      timezone: z.string().trim().max(64).optional(),
      isActive: z.boolean().optional(),
    }))
    .mutation(async ({ input }) => {
      const { id, isActive, ...rest } = input;
      await updateBiometricDevice(id, {
        ...rest,
        ...(isActive === undefined ? {} : { isActive: isActive ? 1 : 0 }),
      });
      return { success: true };
    }),

  resetAcceptanceWindow: adminProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      const acceptEventsAfter = await resetBiometricDeviceAcceptanceWindow(input.id);
      return { success: true, acceptEventsAfter };
    }),

  mappings: adminProcedure
    .input(z.object({ deviceId: z.number().int().positive().optional() }).optional())
    .query(async ({ input }) => listBiometricMappings(input?.deviceId)),

  upsertMapping: adminProcedure
    .input(z.object({
      deviceId: z.number().int().positive(),
      workerId: z.number().int().positive(),
      deviceUserId: z.string().trim().min(1).max(50),
    }))
    .mutation(async ({ input }) => {
      await upsertBiometricMapping(input);
      return { success: true };
    }),

  setMappingActive: adminProcedure
    .input(z.object({ id: z.number().int().positive(), isActive: z.boolean() }))
    .mutation(async ({ input }) => {
      await setBiometricMappingActive(input.id, input.isActive);
      return { success: true };
    }),

  retryRawEvent: adminProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input }) => reprocessZktecoRawEvent(input.id)),

  rawEvents: adminProcedure
    .input(z.object({
      deviceId: z.number().int().positive().optional(),
      status: processingStatus.optional(),
      limit: z.number().int().min(1).max(500).default(100),
    }).optional())
    .query(async ({ input }) => listBiometricRawEvents(input ?? {})),
});

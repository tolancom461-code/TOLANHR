import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { protectedProcedure,requirePermissionFlag } from '../_core/trpc';
import { createMysqlAttendanceSourceReviewStore } from './mysql-store';
import { SourceReviewError,type SourceReviewStore } from './types';
import { REVIEW_MOVEMENTS,REVIEW_STATUSES,reviewFilter } from './validation';

async function applicationReview(): Promise<{store:SourceReviewStore}> {
  const database = process.env.ATTENDANCE_SOURCE_DB_CONFIRMED_NAME;
  if (!database||!/^[A-Za-z0-9_]+$/.test(database)) throw new SourceReviewError('SOURCE_REVIEW_SCHEMA_NOT_READY');
  const { getDb } = await import('../db/connection');
  const db = await getDb(); const client = db?.$client;
  if (!client||typeof client.promise!=='function') throw new SourceReviewError('SOURCE_REVIEW_UNAVAILABLE');
  return {store:createMysqlAttendanceSourceReviewStore(client.promise(),database,process.env.BIOMETRIC_SOURCE_STREAM_ID??null)};
}
function publicError(error: unknown) {
  if (error instanceof TRPCError) return error;
  const code = error instanceof SourceReviewError?error.code:'';
  if (code==='SOURCE_REVIEW_NOT_FOUND') return new TRPCError({code:'NOT_FOUND',message:'المحاولة غير موجودة.'});
  if (code==='SOURCE_REVIEW_INVALID_INPUT') return new TRPCError({code:'BAD_REQUEST',message:'تحقق من خيارات البحث والفترة.'});
  if (/SCHEMA|DATABASE_MISMATCH/.test(code)) return new TRPCError({code:'PRECONDITION_FAILED',message:'سجل حركات المصادر غير جاهز للقراءة في قاعدة الاتصال الحالية.'});
  return new TRPCError({code:'INTERNAL_SERVER_ERROR',message:'تعذرت قراءة حركات المصادر. أعد المحاولة.'});
}
export function createAttendanceSourceReviewProcedures(load:()=>Promise<{store:SourceReviewStore}>=applicationReview) {
  const allowed = protectedProcedure.use(requirePermissionFlag('canViewAttendanceLog'));
  const guarded = async<T>(operation:(store:SourceReviewStore)=>Promise<T>)=>{
    try {return await operation((await load()).store);} catch(error){throw publicError(error);}
  };
  return {
    list:allowed.input(z.object({search:z.string().max(128).optional(),source:z.enum(['all','qr','biometric']).default('all'),
      movement:z.enum(REVIEW_MOVEMENTS).default('all'),status:z.enum(REVIEW_STATUSES).default('all'),
      dateFrom:z.string().optional(),dateTo:z.string().optional(),timeBasis:z.enum(['event_time','received_at']).default('event_time'),
      groupId:z.number().int().positive().max(2147483647).optional(),sort:z.enum(['asc','desc']).default('desc'),
      page:z.number().int().min(1).max(100000).default(1),limit:z.union([z.literal(20),z.literal(50),z.literal(100)]).default(20)}).strict()
      .default({source:'all',movement:'all',status:'all',timeBasis:'event_time',sort:'desc',page:1,limit:20})
      .superRefine((value,context)=>{try{reviewFilter(value);}catch{context.addIssue({code:z.ZodIssueCode.custom,message:'تحقق من خيارات البحث والفترة.'});}}))
      .query(({input})=>guarded(store=>store.list(input))),
    detail:allowed.input(z.object({id:z.string().uuid()}).strict()).query(({input})=>guarded(store=>store.detail(input.id))),
  };
}
export const sourceEventsReviewProcedures = createAttendanceSourceReviewProcedures();

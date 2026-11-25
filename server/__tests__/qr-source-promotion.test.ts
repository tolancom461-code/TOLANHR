import { afterEach, describe, expect, it, vi } from 'vitest';
import { TRPCError } from '@trpc/server';
import { recordQrWithSourceInbox } from '../attendance-source-inbox/qr-observer';
import { prepareSourceEvent } from '../attendance-source-inbox/validation';

const mocks = vi.hoisted(() => ({ application: vi.fn() }));
vi.mock('../attendance-source-promotion/application', () => ({ getSourceAttendancePromotion: mocks.application }));
const original = { ...process.env };
afterEach(() => { process.env = { ...original }; vi.clearAllMocks(); });
const attemptId = '7d3c0919-977c-4bce-b5d7-07333c676819';
const timestamp = new Date('2026-11-25T12:00:00.000Z');
const result = { success: true,workerId: 1,eventType: 'check_in' as const,eventId: 42,timestamp,workDate: '2026-11-25' };

function fixture() {
  process.env.ATTENDANCE_SOURCE_QR_ENABLED = 'true';
  process.env.BIOMETRIC_SOURCE_PROMOTION_ENABLED = 'true';
  process.env.ATTENDANCE_SOURCE_DB_CONFIRMED_NAME = 'synthetic';
  const receipt = { ...prepareSourceEvent({ source:'qr',sourceEventId:`7:${attemptId}`,workerId:1,
    eventType:'check_in',eventTimeUtc:timestamp.toISOString(),sourceUserName:'Synthetic',sourcePersonCode:null }),
    receivedAtUtc:'2026-11-25T12:00:00.000001Z',attendanceEventId:null,decisionCode:null,decisionNote:null,processedAtUtc:null };
  const store = { assertReady:vi.fn(async()=>{}),getBySourceEventId:vi.fn(async()=>null as any),
    insert:vi.fn(async()=>({ event:receipt,replayed:false })),recordExistingWorkflowOutcome:vi.fn(async()=>receipt) };
  const promotion = { recordQr:vi.fn(async(_input:any,execute:any)=>execute({ database:{},eventTime:timestamp,deferFinance:true })),
    resumeQr:vi.fn(async()=>result) };
  mocks.application.mockReturnValue(promotion);
  let writes = 0;
  const execute = vi.fn(async(observation?:any,execution?:any)=>{
    await observation?.beforeValidation({ eventTime:timestamp,workerName:'Synthetic',personCode:null });
    writes++;
    observation?.attendanceSaved(result.eventId);
    if (execution) expect(execution.eventTime).toEqual(timestamp);
    return result;
  });
  const pool = { execute:vi.fn(async()=>[[{id:42,worker_id:1,event_type:'check_in',work_date:'2026-11-25'}]]) };
  const dependencies = { getPool:vi.fn(async()=>pool as any),createStore:vi.fn(()=>store as any),execute };
  return { receipt,store,promotion,execute,dependencies,writes:()=>writes };
}

describe('QR admission handoff to the shared source coordinator',()=>{
  it('interrupts the outer legacy insert after one coordinated insert using the original server time',async()=>{
    const lab=fixture();
    await expect(recordQrWithSourceInbox({workerId:1,eventType:'check_in',actorId:7,attemptId},lab.dependencies)).resolves.toEqual(result);
    expect(lab.writes()).toBe(1);
    expect(lab.execute).toHaveBeenCalledTimes(2);
    expect(lab.promotion.recordQr).toHaveBeenCalledWith(expect.objectContaining({source:'qr',workerId:1,sourceEventId:`7:${attemptId}`,eventTimeUtc:timestamp.toISOString()}),expect.any(Function));
    expect(lab.store.insert).not.toHaveBeenCalled();
    expect(lab.store.recordExistingWorkflowOutcome).not.toHaveBeenCalled();
  });
  it('preserves legacy behavior when armed without a durable activation',async()=>{
    const lab=fixture();lab.promotion.recordQr.mockResolvedValueOnce(null as any);
    await expect(recordQrWithSourceInbox({workerId:1,eventType:'check_in',actorId:7,attemptId},lab.dependencies)).resolves.toEqual(result);
    expect(lab.writes()).toBe(1);expect(lab.execute).toHaveBeenCalledTimes(1);
    expect(lab.store.insert).toHaveBeenCalledTimes(1);
    expect(lab.store.recordExistingWorkflowOutcome).toHaveBeenCalledWith(expect.objectContaining({status:'accepted',attendanceEventId:42}));
  });
  it('returns a prior coordinated outcome without invoking attendance again',async()=>{
    const lab=fixture();lab.store.getBySourceEventId.mockResolvedValueOnce({...lab.receipt,status:'accepted',attendanceEventId:42});
    await expect(recordQrWithSourceInbox({workerId:1,eventType:'check_in',actorId:7,attemptId},lab.dependencies)).resolves.toEqual(result);
    expect(lab.promotion.resumeQr).not.toHaveBeenCalled();expect(lab.execute).not.toHaveBeenCalled();expect(lab.writes()).toBe(0);
  });
  it('preserves the coordinator rejection without running the outer insert or a second outcome write',async()=>{
    const lab=fixture();lab.promotion.recordQr.mockRejectedValueOnce(new TRPCError({code:'BAD_REQUEST',message:'SOURCE_FIRST_ARRIVAL'}));
    await expect(recordQrWithSourceInbox({workerId:1,eventType:'check_in',actorId:7,attemptId},lab.dependencies)).rejects.toMatchObject({code:'BAD_REQUEST',message:'SOURCE_FIRST_ARRIVAL'});
    expect(lab.writes()).toBe(0);expect(lab.store.insert).not.toHaveBeenCalled();expect(lab.store.recordExistingWorkflowOutcome).not.toHaveBeenCalled();
  });
});

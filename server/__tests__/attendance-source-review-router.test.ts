import { describe,expect,it,vi } from 'vitest';
import { router } from '../_core/trpc';
import { createAttendanceSourceReviewProcedures } from '../attendance-source-review/router';
const id='26fd61f5-1c4a-493b-bfe0-c427fdbdb9db';
function fixture(role:string|null){
  const store={list:vi.fn(async()=>({items:[]})),detail:vi.fn(async()=>({item:{id}}))};
  const load=vi.fn(async()=>({store}));const procedures=createAttendanceSourceReviewProcedures(load as any);const api=router(procedures);
  return {caller:api.createCaller({user:role?{id:7,role}:null} as any),store,load,procedures};
}
describe('read-only source review permissions and strict API',()=>{
  it('allows HR and financial attendance reviewers while denying guard/other roles before loading a database',async()=>{
    for(const role of ['admin_affairs','accountant','auditor','finance_manager','super_admin']){
      const f=fixture(role);await f.caller.list({});await f.caller.detail({id});expect(f.load).toHaveBeenCalledTimes(2);
    }
    for(const role of [null,'guard','data_entry','executive','unknown']){
      const f=fixture(role);await expect(f.caller.list({})).rejects.toMatchObject({code:role?'FORBIDDEN':'UNAUTHORIZED'});
      await expect(f.caller.detail({id})).rejects.toMatchObject({code:role?'FORBIDDEN':'UNAUTHORIZED'});expect(f.load).not.toHaveBeenCalled();
    }
  });
  it('provides safe defaults and forwards selected calendar basis, group, aggregate filter and paging unchanged',async()=>{
    const f=fixture('auditor');await f.caller.list({});
    expect(f.store.list).toHaveBeenCalledWith({source:'all',movement:'all',status:'all',timeBasis:'event_time',sort:'desc',page:1,limit:20});
    await f.caller.list({search:'RAD',source:'biometric',movement:'check_in',status:'needs_review',timeBasis:'received_at',
      dateFrom:'2026-11-25',dateTo:'2026-11-25',groupId:4,sort:'asc',page:2,limit:50});
    expect(f.store.list).toHaveBeenLastCalledWith(expect.objectContaining({search:'RAD',status:'needs_review',groupId:4,page:2,limit:50}));
  });
  it('rejects malformed dates, query injection, unsupported options and extra fields before store loading',async()=>{
    const f=fixture('auditor');
    for(const input of [{dateFrom:'2026-02-30'},{dateFrom:'2026-11-26',dateTo:'2026-11-25'},{limit:21},
      {sort:'desc; DROP TABLE workers'},{movement:'0'},{groupId:0},{search:'bad\u0000input'},{token:'private'}]){
      await expect(f.caller.list(input as never)).rejects.toMatchObject({code:'BAD_REQUEST'});
    }
    await expect(f.caller.detail({id,sql:'private'} as never)).rejects.toMatchObject({code:'BAD_REQUEST'});
    expect(f.load).not.toHaveBeenCalled();
  });
  it('exposes neither mutations nor raw backend errors',async()=>{
    const f=fixture('auditor');f.store.list.mockRejectedValueOnce(new Error('PRIVATE_SQL_AND_CREDENTIAL'));
    const error=await f.caller.list({}).catch(error=>error);
    expect(error).toMatchObject({code:'INTERNAL_SERVER_ERROR'});expect(error.message).not.toContain('PRIVATE');
    expect(Object.keys(f.procedures)).toEqual(['list','detail']);
    expect(f.procedures.list._def.type).toBe('query');expect(f.procedures.detail._def.type).toBe('query');
  });
});

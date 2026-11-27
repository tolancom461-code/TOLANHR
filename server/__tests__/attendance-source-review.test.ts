import { beforeEach,describe,expect,it,vi } from 'vitest';
import type { Pool } from 'mysql2/promise';
import { buildSourceReviewQuery,createMysqlAttendanceSourceReviewStore,decodeSourceReviewRow,sourceReviewWhere } from '../attendance-source-review/mysql-store';
import { reviewFilter,riyadhCalendarBounds } from '../attendance-source-review/validation';

const guard = vi.hoisted(()=>({ready:vi.fn()}));
vi.mock('../attendance-source-inbox/mysql-store',()=>({createMysqlAttendanceSourceInboxStore:()=>({assertReady:guard.ready})}));
const streamId='78d31b88-7cc4-4a9d-b8ae-12b621ca7b5f';
const receiptId='26fd61f5-1c4a-493b-bfe0-c427fdbdb9db';
const activation={streamId,startedAtUtc:'2026-11-25T10:00:00.123456Z'};
beforeEach(()=>{guard.ready.mockReset();guard.ready.mockResolvedValue(undefined);});
function row() {return {id:receiptId,source:'biometric',source_event_id:'bio:synthetic',source_person_code:null,
  source_device_id:'99',source_device_user_id:'0001',source_identity_id:'old-identity',source_user_name:null,event_type:'check_in',
  raw_state:'0',raw_status:'accepted',display_status:'accepted',decision_code:'SOURCE_ACCEPTED',resolved_worker_id:7,
  worker_code:'W7',worker_name:'Historical worker snapshot',current_group_id:4,current_group_name:'Current group',
  display_source_name:'Historical enrollment snapshot',display_device_name:'Historical device snapshot',before_activation:0,cohort_member:1,
  accepted_id:45,winner_id:null,approved_id:45,approved_worker_id:7,approved_type:'check_in',approved_method:'biometric',
  approved_time_iso:'2026-11-25T10:03:04.000000Z',approved_work_date:'2026-11-25',event_time_iso:'2026-11-25T10:03:04.123456Z',
  received_at_iso:'2026-11-25T10:03:05.456789Z',processed_at_iso:'2026-11-25T10:03:06.654321Z'};}

describe('source review filter and historical projection boundary',()=>{
  it('uses inclusive Riyadh calendar start and exclusive next-day end regardless of process timezone',()=>{
    expect(riyadhCalendarBounds('2026-11-25','2026-11-25')).toEqual({lowerUtc:'2026-11-24 21:00:00.000000',upperUtcExclusive:'2026-11-25 21:00:00.000000'});
    expect(riyadhCalendarBounds(undefined,'2026-12-31').upperUtcExclusive).toBe('2026-12-31 21:00:00.000000');
    expect(riyadhCalendarBounds()).toEqual({lowerUtc:null,upperUtcExclusive:null});
  });
  it('rejects hostile/unsupported filters without executing property getters',()=>{
    for(const value of [{sort:'desc; DROP TABLE workers'}, {source:null},{limit:21},{page:0},{groupId:0},
      {dateFrom:'2026-02-30'},{dateFrom:'2026-11-26',dateTo:'2026-11-25'},{search:'bad\u0000search'},{token:'private'}]){
      expect(()=>reviewFilter(value as never)).toThrowError('SOURCE_REVIEW_INVALID_INPUT');
    }
    const getter=vi.fn(()=>{throw new Error('PRIVATE');});
    const value={};Object.defineProperty(value,'search',{get:getter,enumerable:true});
    expect(()=>reviewFilter(value)).toThrowError('SOURCE_REVIEW_INVALID_INPUT');
    expect(getter).not.toHaveBeenCalled();
  });
  it('binds escaped case-insensitive infix search and all cohort filters before paging while summaries omit only status',()=>{
    const input=reviewFilter({search:'RAD%_!',source:'biometric',movement:'check_in',status:'accepted',dateFrom:'2026-11-25',dateTo:'2026-11-25',
      timeBasis:'received_at',groupId:4,page:2,limit:20});
    const filtered=sourceReviewWhere(input);const summary=sourceReviewWhere(input,false);
    expect(filtered.sql).toContain('LOWER(worker_name) LIKE LOWER(?)');
    expect(filtered.sql).toContain('received_at>=?');expect(filtered.sql).toContain('received_at<?');
    expect(filtered.params).toContain('%RAD!%!_!!%');
    expect(filtered.params).toContain('accepted');expect(summary.params).not.toContain('accepted');
    expect(summary.params).toContain('biometric');expect(summary.params).toContain(4);
    expect(filtered.sql).not.toContain('RAD');expect(filtered.sql).not.toContain('LIMIT');
    expect(sourceReviewWhere(reviewFilter({status:'needs_review'})).sql).toContain("display_status IN ('unmapped','manual_review','rejected')");
  });
  it('binds exact versioned identity and frozen link UUID for acted BIO records instead of matching reused PINs or current links',()=>{
    const base=buildSourceReviewQuery({directory:true,activation},streamId);
    expect(base.sql).toContain('h.id=n.journal_link');expect(base.sql).toContain('h.worker_id=n.journal_worker');
    expect(base.sql).toContain('h.source_identity_id=n.source_identity_id');
    expect(base.sql).toContain('h.device_id_snapshot=n.source_device_id');expect(base.sql).toContain('h.device_user_id_snapshot=n.source_device_user_id');
    expect(base.sql).toContain("CASE WHEN n.source='qr' THEN n.worker_id WHEN n.status IN ('accepted','rejected','manual_review') THEN h.worker_id ELSE c.worker_id END");
    expect(base.sql).toContain("n.status IN ('pending','unmapped','review_only')");
    expect(base.sql).not.toContain('COALESCE(h.worker_id,c.worker_id)');
    expect(base.sql).toContain('a.worker_id=');expect(base.sql).toContain('a.event_type=n.event_type');
    expect(base.sql).not.toContain('p.decision_code');
    expect(base.sql).toContain("n.decision_code='SOURCE_FIRST_ARRIVAL'");
    expect(base.sql).toContain("n.journal_activation=ctx.activation_iso");
    expect(base.sql).toContain("DATE_SUB(COALESCE(a.event_time,p.event_time),INTERVAL 3 HOUR)");
    expect(base.params).toEqual([streamId,'2026-11-25 10:00:00.123456',activation.startedAtUtc,streamId]);
  });
  it('keeps legacy QR records readable with optional directory/activation absent and does not invent a processing cohort',()=>{
    const base=buildSourceReviewQuery({directory:false,activation:null},null);
    expect(base.sql).not.toContain('`attendance_biometric_worker_links`');
    expect(base.sql).not.toContain('`attendance_biometric_users`');
    expect(base.params).toEqual([null,null,null,null]);
    const result=decodeSourceReviewRow({...row(),source:'qr',source_user_name:'Captured QR worker',worker_name:'Captured QR worker',before_activation:null});
    expect(result.worker?.id).toBe(7);expect(result.beforeActivation).toBeNull();
  });
  it('uses the binary ASCII UUID contract across JSON decisions, configured streams and link joins',()=>{
    for (const directory of [true,false]) {
      for (const state of [activation,null]) {
        const {sql,params}=buildSourceReviewQuery({directory,activation:state},streamId);
        expect(sql).toContain('CAST(? AS CHAR CHARACTER SET ascii) COLLATE ascii_bin AS configured_stream');
        expect(sql).toContain('CAST(? AS CHAR CHARACTER SET ascii) COLLATE ascii_bin AS activation_stream');
        for (const key of ['l','s']) {
          expect(sql).toContain(`CAST(LOWER(JSON_UNQUOTE(JSON_EXTRACT(b.journal,'$.${key}'))) AS CHAR CHARACTER SET ascii) COLLATE ascii_bin`);
        }
        expect(sql).toContain('h.id=n.journal_link');
        expect(sql).toContain('h.stream_id=n.journal_stream');
        expect(sql).toContain('c.stream_id=u.stream_id');
        expect(params[0]).toBe(streamId);
        expect(params[3]).toBe(state?.streamId??null);
        expect(sql).not.toMatch(/SET NAMES|ALTER TABLE|UPDATE /);
      }
    }
  });
  it('requires complete immutable winner receipt evidence, including stream/activation and stored-second time agreement',()=>{
    const {sql}=buildSourceReviewQuery({directory:true,activation},streamId);
    expect(sql).toContain("JSON_CONTAINS_PATH(b.journal,'all','$.v','$.s','$.a','$.w','$.l','$.p')");
    expect(sql).toContain('n.decision_complete=1');
    expect(sql).toContain('n.journal_stream IS NOT NULL');
    expect(sql).toContain('e.journal_stream=n.journal_stream AND e.journal_activation=n.journal_activation');
    expect(sql).toContain("e.source=p.method AND e.status='accepted'");
    expect(sql).toContain("e.decision_code='SOURCE_ACCEPTED'");
    expect(sql).toContain("e.source_event_id REGEXP '^bio:[a-f0-9]{64}$'");
    expect(sql).toContain('e.received_at<=n.received_at');
    expect(sql).toContain('n.event_time_utc>=DATE_SUB(p.event_time,INTERVAL 3 HOUR)');
    expect(sql).toContain('TIMESTAMPDIFF(MICROSECOND,DATE_SUB(p.event_time,INTERVAL 3 HOUR),n.event_time_utc)<=54000000000');
    expect(sql).toContain('eh.id=e.journal_link');
    expect(sql).toContain('e.content_valid=1');
    expect(sql).toContain('n.content_valid=1');
    expect(sql).toContain('SHA2(CONCAT(');
    expect(sql).toContain('MICROSECOND(n.event_time_utc)>=500000');
    expect(sql).toContain('MICROSECOND(e.event_time_utc)>=500000');
    expect(sql).toContain("WHERE (SELECT COUNT(*) FROM notes e WHERE e.attendance_event_id=p.id AND e.source<>n.source AND e.status='accepted')=1");
    expect(sql).toContain('LEFT JOIN winner_candidates p ON p.receipt_id=n.id');
    const candidates=sql.slice(sql.indexOf('winner_candidates AS'),sql.indexOf('resolved AS'));
    const candidateJoin=candidates.slice(candidates.indexOf('JOIN attendance_events p'),candidates.indexOf('WHERE (SELECT COUNT(*)'));
    expect(candidateJoin).not.toMatch(/SELECT|EXISTS/);
    expect(candidateJoin).toContain("n.journal_worker=CASE WHEN n.source='qr' THEN n.worker_id ELSE h.worker_id END");
    expect(candidateJoin).toContain("p.worker_id=CASE WHEN n.source='qr' THEN n.worker_id ELSE h.worker_id END");
    // A missing/mismatched accepted receipt leaves winner_id NULL; neither forged note.p nor QR_COOLDOWN is trusted.
    expect(sql).toContain("WHEN winner_id IS NOT NULL THEN 'already_recorded' ELSE 'manual_review'");
  });
  it('returns only safe review fields, exact source UTC precision and the original historical worker snapshot',()=>{
    const result=decodeSourceReviewRow({...row(),decision_note:'PRIVATE_RAW_JOURNAL',content_sha256:'PRIVATE_HASH',token:'PRIVATE_TOKEN'});
    expect(result.worker).toEqual({id:7,code:'W7',name:'Historical worker snapshot',currentGroupId:4,currentGroupName:'Current group'});
    expect(result.sourceUserName).toBe('Historical enrollment snapshot');
    expect(result.original.sourceIdentityId).toBe('old-identity');expect(result.deviceUserId).toBe('0001');
    expect(result.eventTimeUtc).toBe('2026-11-25T10:03:04.123456Z');
    expect(result.approvedMovement?.eventTimeUtc).toBe('2026-11-25T10:03:04.000000Z');
    expect(JSON.stringify(result)).not.toContain('PRIVATE');expect(result.reason).toContain('الحضور');
  });
  it('never calls cooldown a proven duplicate or claims uncertain/pending QR lacked attendance',()=>{
    const cooldown=decodeSourceReviewRow({...row(),source:'qr',raw_status:'rejected',display_status:'rejected',decision_code:'QR_COOLDOWN',accepted_id:null,approved_id:null});
    expect(cooldown.displayStatus).toBe('rejected');expect(cooldown.reason).toContain('ليست بالضرورة');
    const uncertain=decodeSourceReviewRow({...row(),source:'qr',raw_status:'manual_review',display_status:'manual_review',decision_code:'QR_POST_INSERT_FAILURE',accepted_id:null,approved_id:null});
    expect(uncertain.reason).toContain('قد تكون');expect(uncertain.approvedMovement).toBeNull();
    const pending=decodeSourceReviewRow({...row(),source:'qr',raw_status:'pending',display_status:'pending',decision_code:null,accepted_id:null,approved_id:null});
    expect(pending.reason).toContain('لم تثبت نتيجة نهائية');
  });
  it('retains historical raw status while flagging a deleted/invalid actual attendance reference and never reassigns it',()=>{
    const result=decodeSourceReviewRow({...row(),display_status:'manual_review',accepted_id:null,approved_id:null});
    expect(result.rawStatus).toBe('accepted');expect(result.referenceIssue).toBe(true);expect(result.approvedMovement).toBeNull();
    expect(result.worker?.name).toBe('Historical worker snapshot');expect(result.reason).toContain('تعذر التحقق');
    const archival=decodeSourceReviewRow({...row(),raw_status:'unmapped',display_status:'manual_review',accepted_id:null,approved_id:null,decision_code:null,cohort_member:0});
    expect(archival.reason).toContain('خارج دفعة المعالجة');
  });
});

describe('read-only source review SQL execution',()=>{
  function fixture(){
    const execute=vi.fn(async(sql:string,_params:unknown[]=[])=>{
      if(sql.includes('information_schema.TABLES'))return [[{TABLE_NAME:'attendance_biometric_users'},{TABLE_NAME:'attendance_biometric_worker_links'}]];
      if(sql.includes('FROM `groups`'))return [[{id:4,name:'Current group'}]];
      if(sql.includes('AS needs_review'))return [[{total:41,accepted:20,already_recorded:3,needs_review:10,pending:8}]];
      if(sql.includes('SELECT COUNT(*) AS total FROM review'))return [[{total:20}]];
      if(sql.includes('SELECT * FROM review'))return [[row()]];
      throw new Error('PRIVATE_SQL');
    });
    const connection={query:vi.fn(async()=>[[{database_name:'SYNTHETIC_DATABASE'}]]),execute,release:vi.fn()};
    const pool={getConnection:vi.fn(async()=>connection)};
    return {store:createMysqlAttendanceSourceReviewStore(pool as unknown as Pool,'SYNTHETIC_DATABASE',streamId),pool,connection,execute};
  }
  it('filters and sorts SQL globally before LIMIT/OFFSET and returns status-independent comparable summary counts',async()=>{
    const f=fixture();const result=await f.store.list({status:'accepted',search:'rad',page:2,limit:20,sort:'asc'});
    expect(result.page).toEqual({number:2,limit:20,total:20,totalPages:1});
    expect(result.summary).toEqual({all:41,accepted:20,alreadyRecorded:3,needsReview:10,pending:8});
    const list=f.execute.mock.calls.find(([sql])=>sql.includes('SELECT * FROM review'))!;
    expect(list[0]).toMatch(/WHERE .*display_status=\?.*ORDER BY event_time_utc ASC,id ASC LIMIT 20 OFFSET 20/s);
    expect(list[1]).toContain('%rad%');expect(list[1]).toContain('accepted');
    const summary=f.execute.mock.calls.find(([sql])=>sql.includes('AS needs_review'))!;
    expect(summary[1]).not.toContain('accepted');
    expect(f.execute.mock.calls.every(([sql])=>/^(?:WITH|SELECT)\b/.test(sql))).toBe(true);
    expect(f.connection.release).toHaveBeenCalledTimes(1);
  });
  it('refuses invalid filters before any database acquisition and sanitizes readiness failure',async()=>{
    const f=fixture();expect(()=>f.store.list({sort:'privateSQL'} as never)).toThrowError('SOURCE_REVIEW_INVALID_INPUT');
    expect(f.pool.getConnection).not.toHaveBeenCalled();
    guard.ready.mockRejectedValueOnce(new Error('PRIVATE_CREDENTIAL_SQL'));
    await expect(f.store.list()).rejects.toMatchObject({code:'SOURCE_REVIEW_UNAVAILABLE',message:'SOURCE_REVIEW_UNAVAILABLE'});
    expect(f.pool.getConnection).not.toHaveBeenCalled();
  });
});

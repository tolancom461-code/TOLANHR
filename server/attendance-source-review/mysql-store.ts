import type { Pool, PoolConnection, RowDataPacket } from 'mysql2/promise';
import { createMysqlAttendanceSourceInboxStore } from '../attendance-source-inbox/mysql-store';
import { normalizeUtc } from '../attendance-source-inbox/validation';
import { SourceReviewError, type SourceReviewStore, type SourceReviewItem, type SourceReviewFilter } from './types';
import { invalid, reviewFilter, reviewId, riyadhCalendarBounds } from './validation';

const UUID_SQL = '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';
const ACTED = "n.status IN ('accepted','rejected','manual_review')";
const UNACTED = "n.status IN ('pending','unmapped','review_only')";
const validInt = (key: string) => `CASE WHEN JSON_TYPE(JSON_EXTRACT(b.journal,'$.${key}'))='INTEGER'
 AND JSON_UNQUOTE(JSON_EXTRACT(b.journal,'$.${key}')) REGEXP '^[1-9][0-9]{0,9}$'
 AND CAST(JSON_UNQUOTE(JSON_EXTRACT(b.journal,'$.${key}')) AS UNSIGNED)<=2147483647
 THEN CAST(JSON_UNQUOTE(JSON_EXTRACT(b.journal,'$.${key}')) AS UNSIGNED) ELSE NULL END`;
const validUuid = (key: string) => `CASE WHEN LOWER(JSON_UNQUOTE(JSON_EXTRACT(b.journal,'$.${key}'))) REGEXP '${UUID_SQL}'
 THEN LOWER(JSON_UNQUOTE(JSON_EXTRACT(b.journal,'$.${key}'))) ELSE NULL END`;
const timeMatches = (attendance: string,receipt: string) => {
  const floor = `TIMESTAMPADD(MICROSECOND,-MICROSECOND(${receipt}.event_time_utc),${receipt}.event_time_utc)`;
  return `(DATE_SUB(${attendance}.event_time,INTERVAL 3 HOUR)=${floor} OR
   DATE_SUB(${attendance}.event_time,INTERVAL 3 HOUR)=TIMESTAMPADD(SECOND,IF(MICROSECOND(${receipt}.event_time_utc)>=500000,1,0),${floor}))`;
};
// Match the original receipt's ordered JSON contract without returning its checksum or journal.
function contentValidSql() {
  const fields: Array<[string,string,boolean?]> = [['source','b.source'],['sourceEventId','b.source_event_id'],['workerId','b.worker_id',true],
    ['sourcePersonCode','b.source_person_code'],['sourceDeviceId','b.source_device_id'],['sourceDeviceUserId','b.source_device_user_id'],
    ['sourceIdentityId','b.source_identity_id'],['sourceUserName','b.source_user_name'],['eventType','b.event_type'],['rawState','b.raw_state'],
    ['eventTimeUtc',"DATE_FORMAT(b.event_time_utc,'%Y-%m-%dT%H:%i:%s.%fZ')"]];
  const parts=["'{'"];
  fields.forEach(([key,column,numeric],index)=>{
    parts.push(`'${index?',':''}"${key}":'`);
    parts.push(numeric?`COALESCE(CAST(${column} AS CHAR),'null')`:`COALESCE(JSON_QUOTE(${column}),'null')`);
  });
  parts.push("'}'");
  return `LOWER(b.content_sha256)=LOWER(SHA2(CONCAT(${parts.join(',')}),256))`;
}
const emptyLinks = `(SELECT ${['id','stream_id','source_identity_id','current_source_identity_id','worker_id',
  'device_id_snapshot','device_user_id_snapshot','display_name_snapshot','device_name_snapshot','worker_name_snapshot']
  .map(name => `NULL AS ${name}`).join(',')} WHERE FALSE)`;
const emptyUsers = `(SELECT ${['stream_id','source_identity_id','device_id','device_user_id','display_name','device_name']
  .map(name => `NULL AS ${name}`).join(',')} WHERE FALSE)`;

interface State { streamId: string; startedAtUtc: string }
interface Context { directory: boolean; activation: State | null }

/** Builds fixed read-only SQL. Only bound values carry filters, identifiers and search text. */
export function buildSourceReviewQuery(context: Context, streamId: string | null) {
  const links = context.directory ? '`attendance_biometric_worker_links`' : emptyLinks;
  const users = context.directory ? '`attendance_biometric_users`' : emptyUsers;
  const worker = `CASE WHEN n.source='qr' THEN n.worker_id WHEN ${ACTED} THEN h.worker_id ELSE c.worker_id END`;
  const journalValid = "n.journal_version=1 AND n.journal_stream IS NOT NULL AND n.journal_activation REGEXP '^[1-9][0-9]{3}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}[.][0-9]{6}Z$'";
  const fullDecision = `${journalValid} AND n.content_valid=1 AND n.decision_complete=1 AND n.journal_worker IS NOT NULL AND n.journal_winner IS NOT NULL`;
  const sql = `WITH context AS (SELECT ? AS configured_stream,CAST(? AS DATETIME(6)) AS activation_sql,? AS activation_iso,? AS activation_stream),
 base AS (SELECT s.*,CASE WHEN JSON_VALID(s.decision_note) THEN s.decision_note ELSE '{}' END AS journal
  FROM attendance_source_events s),
 notes AS (SELECT b.*,${contentValidSql()} AS content_valid,
  CASE WHEN JSON_TYPE(JSON_EXTRACT(b.journal,'$.v'))='INTEGER' AND JSON_UNQUOTE(JSON_EXTRACT(b.journal,'$.v'))='1' THEN 1 ELSE 0 END AS journal_version,
  CASE WHEN JSON_TYPE(b.journal)='OBJECT' AND JSON_LENGTH(b.journal)=6
   AND JSON_CONTAINS_PATH(b.journal,'all','$.v','$.s','$.a','$.w','$.l','$.p') THEN 1 ELSE 0 END AS decision_complete,
  ${validInt('w')} AS journal_worker,${validInt('p')} AS journal_winner,
  ${validUuid('l')} AS journal_link,${validUuid('s')} AS journal_stream,
  JSON_UNQUOTE(JSON_EXTRACT(b.journal,'$.a')) AS journal_activation FROM base b),
 resolved AS (SELECT n.id,n.source,n.source_event_id,n.source_person_code,n.source_device_id,n.source_device_user_id,
  n.source_identity_id,n.source_user_name,n.event_type,n.raw_state,n.status AS raw_status,n.decision_code,
  n.event_time_utc,n.received_at,n.processed_at,n.content_valid,
  ${worker} AS resolved_worker_id,COALESCE(w.code,'') AS worker_code,
  CASE WHEN n.source='qr' THEN COALESCE(n.source_user_name,w.full_name,'عامل غير متاح')
   WHEN ${ACTED} THEN h.worker_name_snapshot ELSE w.full_name END AS worker_name,
  w.group_id AS current_group_id,g.name AS current_group_name,
  CASE WHEN ${ACTED} THEN COALESCE(h.display_name_snapshot,n.source_user_name)
   ELSE COALESCE(u.display_name,n.source_user_name) END AS display_source_name,
  CASE WHEN ${ACTED} THEN h.device_name_snapshot ELSE u.device_name END AS display_device_name,
  CASE WHEN ctx.activation_sql IS NULL THEN NULL
   WHEN n.event_time_utc<ctx.activation_sql OR n.received_at<ctx.activation_sql THEN 1 ELSE 0 END AS before_activation,
  CASE WHEN ${journalValid} AND n.journal_stream=ctx.activation_stream AND n.journal_activation=ctx.activation_iso
   AND n.event_time_utc>=ctx.activation_sql AND n.received_at>=ctx.activation_sql THEN 1 ELSE 0 END AS cohort_member,
  a.id AS accepted_id,p.id AS winner_id,
  COALESCE(a.id,p.id) AS approved_id,COALESCE(a.worker_id,p.worker_id) AS approved_worker_id,
  COALESCE(a.event_type,p.event_type) AS approved_type,COALESCE(a.method,p.method) AS approved_method,
  DATE_FORMAT(DATE_SUB(COALESCE(a.event_time,p.event_time),INTERVAL 3 HOUR),'%Y-%m-%dT%H:%i:%s.%fZ') AS approved_time_iso,
  DATE_FORMAT(COALESCE(a.work_date,p.work_date),'%Y-%m-%d') AS approved_work_date,
  DATE_FORMAT(n.event_time_utc,'%Y-%m-%dT%H:%i:%s.%fZ') AS event_time_iso,
  DATE_FORMAT(n.received_at,'%Y-%m-%dT%H:%i:%s.%fZ') AS received_at_iso,
  DATE_FORMAT(n.processed_at,'%Y-%m-%dT%H:%i:%s.%fZ') AS processed_at_iso
 FROM notes n CROSS JOIN context ctx
 LEFT JOIN ${links} h ON n.source='biometric' AND ${ACTED} AND ${fullDecision}
  AND h.id=n.journal_link AND h.stream_id=n.journal_stream AND h.worker_id=n.journal_worker
  AND h.source_identity_id=n.source_identity_id AND h.device_id_snapshot=n.source_device_id
  AND h.device_user_id_snapshot=n.source_device_user_id
 LEFT JOIN ${users} u ON n.source='biometric' AND ${UNACTED}
  AND u.stream_id=COALESCE(CASE WHEN ${journalValid} THEN n.journal_stream END,ctx.configured_stream) AND u.source_identity_id=n.source_identity_id
  AND u.device_id=n.source_device_id AND u.device_user_id=n.source_device_user_id
 LEFT JOIN ${links} c ON c.stream_id=u.stream_id AND c.current_source_identity_id=u.source_identity_id
 LEFT JOIN workers w ON w.id=${worker} LEFT JOIN \`groups\` g ON g.id=w.group_id
 LEFT JOIN attendance_events a ON n.status='accepted' AND a.id=n.attendance_event_id
  AND n.content_valid=1 AND a.worker_id=${worker} AND a.event_type=n.event_type AND a.method=n.source AND ${timeMatches('a','n')}
 LEFT JOIN attendance_events p ON n.status='rejected' AND n.decision_code='SOURCE_FIRST_ARRIVAL'
  AND ${fullDecision} AND n.journal_worker=${worker}
  AND (n.source<>'qr' OR JSON_TYPE(JSON_EXTRACT(n.journal,'$.l'))='NULL')
  AND p.id=n.journal_winner AND p.worker_id=${worker}
  AND p.event_type=n.event_type AND p.method IN ('qr','biometric') AND p.method<>n.source
  AND n.event_time_utc>=DATE_SUB(p.event_time,INTERVAL 3 HOUR)
  AND TIMESTAMPDIFF(MICROSECOND,DATE_SUB(p.event_time,INTERVAL 3 HOUR),n.event_time_utc)<=54000000000
  AND n.event_time_utc>=STR_TO_DATE(n.journal_activation,'%Y-%m-%dT%H:%i:%s.%fZ')
  AND n.received_at>=STR_TO_DATE(n.journal_activation,'%Y-%m-%dT%H:%i:%s.%fZ')
  AND (SELECT COUNT(*) FROM notes e WHERE e.attendance_event_id=p.id AND e.source<>n.source AND e.status='accepted')=1
  AND EXISTS (SELECT 1 FROM notes e LEFT JOIN ${links} eh ON e.source='biometric'
   AND eh.id=e.journal_link AND eh.stream_id=e.journal_stream AND eh.worker_id=e.journal_worker
   AND eh.source_identity_id=e.source_identity_id AND eh.device_id_snapshot=e.source_device_id
   AND eh.device_user_id_snapshot=e.source_device_user_id
   WHERE e.attendance_event_id=p.id AND e.source=p.method AND e.status='accepted'
    AND e.event_type=n.event_type AND e.decision_code='SOURCE_ACCEPTED'
    AND e.content_valid=1 AND e.journal_version=1 AND e.decision_complete=1 AND e.journal_winner IS NOT NULL
    AND e.journal_stream=n.journal_stream AND e.journal_activation=n.journal_activation AND e.journal_worker=n.journal_worker
    AND e.received_at<=n.received_at AND e.event_time_utc>=STR_TO_DATE(e.journal_activation,'%Y-%m-%dT%H:%i:%s.%fZ')
    AND e.received_at>=STR_TO_DATE(e.journal_activation,'%Y-%m-%dT%H:%i:%s.%fZ') AND ${timeMatches('p','e')}
    AND ((e.source='qr' AND e.worker_id=n.journal_worker AND JSON_TYPE(JSON_EXTRACT(e.journal,'$.l'))='NULL')
      OR (e.source='biometric' AND e.worker_id IS NULL AND e.source_person_code IS NULL AND e.source_user_name IS NULL
       AND e.source_event_id REGEXP '^bio:[a-f0-9]{64}$' AND eh.id IS NOT NULL)))),
 review AS (SELECT r.*,CASE
  WHEN raw_status='accepted' THEN CASE WHEN accepted_id IS NOT NULL THEN 'accepted' ELSE 'manual_review' END
  WHEN raw_status='rejected' AND decision_code='SOURCE_FIRST_ARRIVAL' THEN CASE WHEN winner_id IS NOT NULL THEN 'already_recorded' ELSE 'manual_review' END
  WHEN content_valid=0 THEN 'manual_review'
  WHEN source='biometric' AND raw_status IN ('pending','unmapped') AND before_activation=1 THEN 'before_activation'
  WHEN source='biometric' AND raw_status IN ('pending','unmapped') AND cohort_member=0 THEN 'manual_review'
  WHEN raw_status IN ('pending','unmapped') THEN CASE WHEN resolved_worker_id IS NULL THEN 'unmapped' ELSE 'pending' END
  ELSE raw_status END AS display_status FROM resolved r)`;
  return { sql, params: [streamId,context.activation?.startedAtUtc.replace('T',' ').slice(0,-1) ?? null,
    context.activation?.startedAtUtc ?? null,context.activation?.streamId ?? null] as Array<string|null> };
}

export function sourceReviewWhere(input: ReturnType<typeof reviewFilter>, includeStatus = true) {
  const clauses: string[] = []; const params: Array<string|number> = [];
  if (input.source !== 'all') { clauses.push('source=?'); params.push(input.source); }
  if (input.movement !== 'all') { clauses.push('event_type=?'); params.push(input.movement); }
  if (input.groupId !== undefined) { clauses.push('current_group_id=?'); params.push(input.groupId); }
  if (includeStatus && input.status !== 'all') {
    if (input.status === 'needs_review') clauses.push("display_status IN ('unmapped','manual_review','rejected')");
    else { clauses.push('display_status=?'); params.push(input.status); }
  }
  const bounds = riyadhCalendarBounds(input.dateFrom,input.dateTo);
  const clock = input.timeBasis === 'received_at' ? 'received_at' : 'event_time_utc';
  if (bounds.lowerUtc) { clauses.push(`${clock}>=?`); params.push(bounds.lowerUtc); }
  if (bounds.upperUtcExclusive) { clauses.push(`${clock}<?`); params.push(bounds.upperUtcExclusive); }
  if (input.search) {
    const pattern = `%${input.search.replace(/[!%_]/g,value=>`!${value}`)}%`;
    const columns = ['worker_name','worker_code','source_device_user_id','display_source_name','display_device_name'];
    clauses.push(`(${columns.map(column=>`LOWER(${column}) LIKE LOWER(?) ESCAPE '!'`).join(' OR ')})`);
    params.push(...columns.map(()=>pattern));
  }
  return { sql: clauses.length ? ` WHERE ${clauses.join(' AND ')}` : '',params };
}

export function createMysqlAttendanceSourceReviewStore(pool: Pool, expectedDatabase: string, configuredStream: string|null = null): SourceReviewStore {
  if (typeof expectedDatabase !== 'string' || !/^[A-Za-z0-9_]+$/.test(expectedDatabase)) throw invalid();
  const streamId = configuredStream === null ? null : reviewId(configuredStream);
  const inbox = createMysqlAttendanceSourceInboxStore(pool,expectedDatabase);
  let readiness: Promise<void>|undefined;
  async function use<T>(operation: (connection: PoolConnection,context: Context)=>Promise<T>): Promise<T> {
    let connection: PoolConnection|undefined;
    try {
      if (!readiness) readiness = inbox.assertReady().catch(error=>{readiness=undefined;throw error;});
      await readiness;
      connection = await pool.getConnection();
      const [[selected]] = await connection.query<RowDataPacket[]>('SELECT DATABASE() AS database_name');
      if (selected?.database_name !== expectedDatabase) throw new SourceReviewError('SOURCE_REVIEW_DATABASE_MISMATCH');
      await connection.query("SET SESSION time_zone = '+00:00'");
      const [tables] = await connection.execute<RowDataPacket[]>(
        "SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA=? AND TABLE_TYPE='BASE TABLE' AND TABLE_NAME IN ('attendance_biometric_users','attendance_biometric_worker_links','attendance_source_promotion_state')",[expectedDatabase]);
      const names = new Set(tables.map(row=>row.TABLE_NAME));
      let activation: State|null = null;
      if (names.has('attendance_source_promotion_state')) {
        const [rows] = await connection.execute<RowDataPacket[]>(
          "SELECT id,stream_id,DATE_FORMAT(started_at_utc,'%Y-%m-%dT%H:%i:%s.%fZ') AS started_at_utc_iso FROM attendance_source_promotion_state LIMIT 2");
        if (rows.length===1 && rows[0].id==='primary') {
          try { activation={streamId:reviewId(rows[0].stream_id),startedAtUtc:normalizeUtc(rows[0].started_at_utc_iso)}; } catch { /* Unknown cutover is not inferred from legacy data. */ }
        }
      }
      return await operation(connection,{directory:names.has('attendance_biometric_users')&&names.has('attendance_biometric_worker_links'),activation});
    } catch (error) {
      if (error instanceof SourceReviewError) throw error;
      const code = (error as {code?:string})?.code;
      throw new SourceReviewError(code==='INBOX_SCHEMA_NOT_READY'||code==='ER_NO_SUCH_TABLE'||code==='ER_BAD_FIELD_ERROR'
        ? 'SOURCE_REVIEW_SCHEMA_NOT_READY' : 'SOURCE_REVIEW_UNAVAILABLE');
    } finally { connection?.release(); }
  }
  return {
    list(value: SourceReviewFilter = {}) {
      const input = reviewFilter(value);
      return use(async (connection,context) => {
        const base = buildSourceReviewQuery(context,streamId);
        const filtered = sourceReviewWhere(input); const summaryFilter = sourceReviewWhere(input,false);
        const [[counts]] = await connection.execute<RowDataPacket[]>(`${base.sql} SELECT COUNT(*) AS total,
          COALESCE(SUM(display_status='accepted'),0) AS accepted,COALESCE(SUM(display_status='already_recorded'),0) AS already_recorded,
          COALESCE(SUM(display_status IN ('unmapped','manual_review','rejected')),0) AS needs_review,
          COALESCE(SUM(display_status='pending'),0) AS pending FROM review${summaryFilter.sql}`,[...base.params,...summaryFilter.params]);
        const [[totalRow]] = await connection.execute<RowDataPacket[]>(`${base.sql} SELECT COUNT(*) AS total FROM review${filtered.sql}`,[...base.params,...filtered.params]);
        const clock = input.timeBasis==='received_at'?'received_at':'event_time_utc';
        const direction = input.sort==='asc'?'ASC':'DESC';
        const [rows] = await connection.execute<RowDataPacket[]>(`${base.sql} SELECT * FROM review${filtered.sql}
          ORDER BY ${clock} ${direction},id ${direction} LIMIT ${input.limit} OFFSET ${(input.page-1)*input.limit}`,[...base.params,...filtered.params]);
        const [groups] = await connection.execute<RowDataPacket[]>('SELECT id,name FROM `groups` ORDER BY name,id');
        const total = count(totalRow.total);
        return { items:rows.map(decodeSourceReviewRow),page:{number:input.page,limit:input.limit,total,totalPages:Math.max(1,Math.ceil(total/input.limit))},
          summary:{all:count(counts.total),accepted:count(counts.accepted),alreadyRecorded:count(counts.already_recorded),needsReview:count(counts.needs_review),pending:count(counts.pending)},
          groups:groups.map(row=>({id:Number(row.id),name:String(row.name)})),activation:context.activation?{startedAtUtc:context.activation.startedAtUtc}:null };
      });
    },
    detail(value: string) {
      const id = reviewId(value);
      return use(async (connection,context)=>{
        const base = buildSourceReviewQuery(context,streamId);
        const [rows] = await connection.execute<RowDataPacket[]>(`${base.sql} SELECT * FROM review WHERE id=? LIMIT 1`,[...base.params,id]);
        if (!rows[0]) throw new SourceReviewError('SOURCE_REVIEW_NOT_FOUND');
        return { item:decodeSourceReviewRow(rows[0]) };
      });
    },
  };
}

function count(value: unknown): number {
  const number = Number(value);
  if (!Number.isSafeInteger(number)||number<0) throw new SourceReviewError('SOURCE_REVIEW_UNAVAILABLE');
  return number;
}
const LABELS: Record<string,string> = {accepted:'سُجلت في الحضور',already_recorded:'سبق تسجيل الحركة',pending:'بانتظار المعالجة',
  unmapped:'تحتاج ربط عامل',review_only:'محفوظة للمراجعة',manual_review:'تحتاج التحقق',rejected:'مرفوضة',before_activation:'قبل بدء المعالجة'};
export function decodeSourceReviewRow(row: Record<string,any>): SourceReviewItem {
  const referenceIssue = (row.raw_status==='accepted'&&!row.accepted_id)||
    (row.decision_code==='SOURCE_FIRST_ARRIVAL'&&!row.winner_id);
  let reason = row.display_status==='accepted'?'اعتُمدت الحركة في سجل الحضور؛ احتساب المستحقات يتبع قواعد الدوام والرواتب.'
    :row.display_status==='already_recorded'?'سبق تسجيل الحركة من المصدر الآخر؛ المحاولة محفوظة دون إنشاء حركة حضور أخرى.'
    :row.display_status==='before_activation'?'وقت الحركة أو استلامها يسبق بدء المعالجة التلقائية؛ تبقى محفوظة للأرشفة.'
    :row.display_status==='unmapped'?'هوية الجهاز غير مرتبطة بعامل حاليًا؛ يلزم التحقق والربط من ملف العامل.'
    :row.display_status==='review_only'?'نوع الحركة محفوظ للمراجعة ولا يُرحّل إلى الحضور تلقائيًا.'
    :row.display_status==='pending'?'المحاولة محفوظة ولم تثبت نتيجة نهائية بعد؛ تحقق من سجل الحضور عند الحاجة.'
    :'تحتاج المحاولة التحقق من سجل الحضور قبل اتخاذ أي إجراء.';
  if (referenceIssue) reason='المحاولة تحمل نتيجة سابقة، لكن تعذر التحقق من مرجع حركة الحضور الحالي؛ تحتاج مراجعة.';
  else if (row.source==='biometric'&&['pending','unmapped'].includes(row.raw_status)&&!Number(row.cohort_member)&&!Number(row.before_activation))
    reason='محفوظة للأرشفة خارج دفعة المعالجة التلقائية؛ وجود ربط حالي لا يعني ترحيل هذه المحاولة.';
  else if (row.decision_code==='QR_COOLDOWN') reason='رفضتها قاعدة منع الحركات المتقاربة خلال ثلاث دقائق؛ ليست بالضرورة تكرار النوع نفسه.';
  else if (row.decision_code==='SOURCE_PERIOD_LOCKED') reason='الفترة مقفلة للرواتب؛ المحاولة محفوظة للتحقق دون تغيير الفترة.';
  else if (row.decision_code==='SOURCE_TIME_FUTURE') reason='وقت الجهاز يقع في المستقبل؛ يلزم التحقق من ساعة الجهاز وسجل الحضور.';
  else if (row.decision_code==='SOURCE_WORKER_INACTIVE') reason='العامل غير نشط؛ تحتاج المحاولة مراجعة.';
  else if (row.decision_code==='QR_POST_INSERT_FAILURE') reason='قد تكون حركة الحضور حُفظت قبل تعثر تسجيل النتيجة؛ تحقق من سجل الحضور.';
  const workerId = row.resolved_worker_id==null?null:Number(row.resolved_worker_id);
  return {id:row.id,source:row.source,eventType:row.event_type,rawStatus:row.raw_status,displayStatus:row.display_status,
    statusLabel:LABELS[row.display_status]??'تحتاج التحقق',reason,
    worker:workerId===null?null:{id:workerId,code:row.worker_code??'',name:row.worker_name??'عامل غير متاح',
      currentGroupId:row.current_group_id==null?null:Number(row.current_group_id),currentGroupName:row.current_group_name??null},
    sourceUserName:row.display_source_name??row.source_user_name??null,deviceUserId:row.source_device_user_id??null,deviceName:row.display_device_name??null,
    eventTimeUtc:row.event_time_iso,receivedAtUtc:row.received_at_iso,processedAtUtc:row.processed_at_iso??null,
    approvedMovement:!row.approved_id?null:{id:Number(row.approved_id),workerId:Number(row.approved_worker_id),eventType:row.approved_type,
      method:row.approved_method,eventTimeUtc:row.approved_time_iso,workDate:row.approved_work_date,kind:row.accepted_id?'accepted':'already_recorded'},
    referenceIssue,beforeActivation:row.before_activation==null?null:Boolean(Number(row.before_activation)),
    original:{sourceEventId:row.source_event_id,sourcePersonCode:row.source_person_code??null,sourceDeviceId:row.source_device_id??null,
      sourceDeviceUserId:row.source_device_user_id??null,sourceIdentityId:row.source_identity_id??null,sourceUserName:row.source_user_name??null,rawState:row.raw_state??null} };
}

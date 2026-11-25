import { useEffect, useState } from 'react';
import { ArrowDownLeft, ArrowUpRight, CheckCircle2, ChevronLeft, ChevronRight, Clock3, CopyCheck, Fingerprint, Inbox, Info, Loader2, QrCode, RefreshCw, Search, SlidersHorizontal } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { RIYADH_OFFSET_MS } from '@shared/attendance-time';
import type { SourceReviewItem } from '../../../server/attendance-source-review/types';

const movements = [
  ['all','كل أنواع الحركات'],['check_in','دخول'],['check_out','خروج'],['break_out','خروج للاستراحة'],
  ['break_in','عودة من الاستراحة'],['overtime_in','بداية عمل إضافي'],['overtime_out','نهاية عمل إضافي'],
] as const;
const statuses = [
  ['all','كل النتائج'],['accepted','معتمدة للحضور'],['already_recorded','مسجّلة مسبقًا'],['needs_review','تحتاج متابعة'],
  ['pending','تنتظر المعالجة'],['unmapped','غير مرتبطة بعامل'],['manual_review','تحتاج مراجعة'],
  ['rejected','غير معتمدة'],['review_only','حركات إضافية للمراجعة'],['before_activation','سابقة للتفعيل'],
] as const;
type Movement = typeof movements[number][0];
type StatusFilter = typeof statuses[number][0];
type Preset = 'today'|'week'|'month'|'custom';
const statusColors: Record<string,string> = {
  accepted:'border-emerald-200 bg-emerald-50 text-emerald-800',
  already_recorded:'border-sky-200 bg-sky-50 text-sky-800',
  pending:'border-amber-200 bg-amber-50 text-amber-800',
  unmapped:'border-amber-200 bg-amber-50 text-amber-800',
  manual_review:'border-orange-200 bg-orange-50 text-orange-800',
  rejected:'border-rose-200 bg-rose-50 text-rose-800',
  review_only:'border-slate-200 bg-slate-50 text-slate-700',
  before_activation:'border-slate-200 bg-slate-50 text-slate-600',
};
function todayRiyadh() { return new Date(Date.now()+RIYADH_OFFSET_MS).toISOString().slice(0,10); }
function period(preset: Exclude<Preset,'custom'>) {
  const today=todayRiyadh();
  const from=new Date(`${today}T00:00:00Z`);
  if(preset==='week') from.setUTCDate(from.getUTCDate()-6);
  return {from:preset==='month'?`${today.slice(0,7)}-01`:from.toISOString().slice(0,10),to:today};
}
function dateText(value:string|null|undefined) {
  if(!value||!Number.isFinite(new Date(value).getTime())) return '—';
  return new Date(value).toLocaleDateString('ar-SA',{timeZone:'Asia/Riyadh',calendar:'gregory',year:'numeric',month:'short',day:'numeric'});
}
function timeText(value:string|null|undefined) {
  if(!value||!Number.isFinite(new Date(value).getTime())) return '—';
  return new Date(value).toLocaleTimeString('ar-SA',{timeZone:'Asia/Riyadh',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:true});
}
function movementText(value:string) { return movements.find(([key])=>key===value)?.[1]??'حركة غير محددة'; }
function StatusBadge({item}:{item:Pick<SourceReviewItem,'displayStatus'|'statusLabel'>}) {
  return <Badge variant="outline" className={statusColors[item.displayStatus]??statusColors.manual_review}>{item.statusLabel}</Badge>;
}
function SourceBadge({source}:{source:string}) {
  if(source!=='qr'&&source!=='biometric') return <Badge variant="outline">{source==='manual'?'تسجيل يدوي':'مصدر آخر'}</Badge>;
  return <Badge variant="outline" className={source==='biometric'?'border-indigo-200 bg-indigo-50 text-indigo-800':'border-cyan-200 bg-cyan-50 text-cyan-800'}>
    {source==='biometric'?<Fingerprint className="h-3 w-3"/>:<QrCode className="h-3 w-3"/>}{source==='biometric'?'البصمة':'QR'}</Badge>;
}
function Moment({value}:{value:string|null|undefined}) {
  return <div className="whitespace-nowrap"><div className="font-medium tabular-nums">{timeText(value)}</div><div className="mt-1 text-xs text-muted-foreground">{dateText(value)}</div></div>;
}
function FilterSelect({label,value,onChange,options}:{label:string;value:string;onChange:(value:string)=>void;options:readonly(readonly[string,string])[]}) {
  return <div className="space-y-1.5"><Label className="text-xs text-muted-foreground">{label}</Label>
    <Select value={value} onValueChange={onChange}><SelectTrigger aria-label={label} className="w-full bg-background"><SelectValue/></SelectTrigger>
      <SelectContent>{options.map(([key,text])=><SelectItem key={key} value={key}>{text}</SelectItem>)}</SelectContent></Select></div>;
}

export default function AttendanceSourceEvents() {
  const initial=period('today');
  const [search,setSearch]=useState('');const [query,setQuery]=useState('');
  const [preset,setPreset]=useState<Preset>('today');const [dateFrom,setDateFrom]=useState(initial.from);const [dateTo,setDateTo]=useState(initial.to);
  const [source,setSource]=useState<'all'|'qr'|'biometric'>('all');const [movement,setMovement]=useState<Movement>('all');
  const [status,setStatus]=useState<StatusFilter>('all');const [groupId,setGroupId]=useState('all');
  const [timeBasis,setTimeBasis]=useState<'event_time'|'received_at'>('event_time');const [sort,setSort]=useState<'desc'|'asc'>('desc');
  const [page,setPage]=useState(1);const [limit,setLimit]=useState<20|50|100>(20);const [detailId,setDetailId]=useState<string|null>(null);
  useEffect(()=>{const timer=setTimeout(()=>{setQuery(search.trim());setPage(1);},250);return()=>clearTimeout(timer);},[search]);
  const invalidDates=!dateFrom||!dateTo||dateFrom>dateTo;
  const list=trpc.attendanceSources.list.useQuery({search:query||undefined,source,movement,status,timeBasis,dateFrom,dateTo,sort,page,limit,
    groupId:groupId==='all'?undefined:Number(groupId)},{enabled:!invalidDates,retry:false,staleTime:10_000});
  const detail=trpc.attendanceSources.detail.useQuery({id:detailId??''},{enabled:Boolean(detailId),retry:false});
  const resetPage=()=>setPage(1);
  const changeStatus=(value:StatusFilter)=>{setStatus(value);resetPage();};
  const selectPeriod=(value:Preset)=>{setPreset(value);if(value!=='custom'){const range=period(value);setDateFrom(range.from);setDateTo(range.to);}resetPage();};
  const resetFilters=()=>{const range=period('today');setSearch('');setQuery('');setPreset('today');setDateFrom(range.from);setDateTo(range.to);
    setSource('all');setMovement('all');setStatus('all');setGroupId('all');setTimeBasis('event_time');setSort('desc');setPage(1);};
  const data=list.data;const rows=data?.items??[];const total=data?.page.total??0;const totalPages=data?.page.totalPages??1;
  const updating=list.isFetching||search.trim()!==query;
  const cards=[
    {key:'all',label:'كل الحركات',value:data?.summary.all,icon:Inbox,color:'text-slate-700',caption:'في الفترة المحددة'},
    {key:'accepted',label:'معتمدة للحضور',value:data?.summary.accepted,icon:CheckCircle2,color:'text-emerald-700',caption:'مرتبطة بسجل الحضور'},
    {key:'already_recorded',label:'مسجّلة مسبقًا',value:data?.summary.alreadyRecorded,icon:CopyCheck,color:'text-sky-700',caption:'محفوظة دون تكرار الحركة'},
    {key:'needs_review',label:'تحتاج متابعة',value:data?.summary.needsReview,icon:Info,color:'text-orange-700',caption:'للتحقق أو استكمال الربط'},
    {key:'pending',label:'تنتظر المعالجة',value:data?.summary.pending,icon:Clock3,color:'text-amber-700',caption:'متابعة نتيجة المحاولة'},
  ] as const;
  return <div dir="rtl" className="space-y-6 p-4 md:p-6">
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div><div className="mb-2 flex items-center gap-2 text-xs font-medium text-muted-foreground"><Inbox className="h-4 w-4"/>الحضور والانصراف · للمالية والشؤون الإدارية</div>
        <h1 className="text-2xl font-bold tracking-tight">الحركات الواردة <span className="text-base font-normal text-muted-foreground">— QR والبصمة</span></h1>
        <p className="mt-2 text-sm text-muted-foreground">استعرض المحاولات الواردة، وتحقق مما اعتُمد في الحضور وسبب نتيجة كل حركة.</p></div>
      <Button variant="outline" disabled={updating||invalidDates} onClick={()=>void list.refetch()}><RefreshCw className={`h-4 w-4 ${list.isFetching?'animate-spin':''}`}/>تحديث السجل</Button>
    </header>
    <div className="flex items-start gap-3 rounded-xl border border-sky-100 bg-sky-50/60 px-4 py-3 text-sm text-sky-950">
      <Info className="mt-0.5 h-4 w-4 shrink-0"/><p>يحتفظ هذا السجل بكل المحاولات. تُحسب المستحقات من سجل الحضور المعتمد وقواعد الدوام والرواتب. <span className="font-medium">جميع الأوقات بتوقيت الرياض.</span></p>
    </div>
    <section aria-label="ملخص الفترة المحددة" className="grid grid-cols-2 gap-3 xl:grid-cols-5">{cards.map(card=><button key={card.key} type="button" onClick={()=>changeStatus(card.key)}
      aria-pressed={status===card.key} className={`rounded-xl border bg-card p-4 text-right transition-colors hover:border-primary/50 ${status===card.key?'border-primary ring-1 ring-primary/20':'border-border'}`}>
      <div className="flex items-center justify-between gap-2"><span className="text-sm text-muted-foreground">{card.label}</span><card.icon className={`h-4 w-4 ${card.color}`}/></div>
      <div className={`mt-3 text-3xl font-semibold tabular-nums ${card.color}`}>{card.value===undefined?'—':card.value.toLocaleString('ar-SA')}</div>
      <p className="mt-2 text-xs text-muted-foreground">{card.caption}</p></button>)}</section>
    <p className="!mt-2 text-xs text-muted-foreground">أعداد الملخص تتبع الفترة وبقية الفلاتر، دون فلتر النتيجة. اضغط بطاقة لتصفية السجل حسب نتيجتها.</p>
    <Card className="gap-0 overflow-hidden shadow-none"><CardContent className="space-y-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-2 text-sm font-semibold"><SlidersHorizontal className="h-4 w-4"/>تصفية الحركات</div>
        <div className="flex flex-wrap gap-1 rounded-lg bg-muted/50 p-1">{([['today','اليوم'],['week','آخر 7 أيام'],['month','هذا الشهر'],['custom','فترة محددة']] as const).map(([key,text])=><Button key={key} type="button" size="sm" variant={preset===key?'default':'ghost'} onClick={()=>selectPeriod(key)}>{text}</Button>)}</div></div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="space-y-1.5 sm:col-span-2"><Label className="text-xs text-muted-foreground" htmlFor="source-review-search">البحث عن عامل أو مستخدم جهاز</Label><div className="relative"><Search className="absolute right-3 top-2.5 h-4 w-4 text-muted-foreground"/>
          <Input id="source-review-search" className="bg-background pr-10" value={search} onChange={event=>setSearch(event.target.value)} placeholder="اكتب أي جزء من الاسم أو الكود أو رقم البصمة…"/></div></div>
        <div className="space-y-1.5"><Label className="text-xs text-muted-foreground" htmlFor="source-date-from">من تاريخ</Label><Input id="source-date-from" aria-label="من تاريخ" type="date" value={dateFrom} onChange={event=>{setDateFrom(event.target.value);setPreset('custom');resetPage();}}/></div>
        <div className="space-y-1.5"><Label className="text-xs text-muted-foreground" htmlFor="source-date-to">إلى تاريخ</Label><Input id="source-date-to" aria-label="إلى تاريخ" type="date" value={dateTo} onChange={event=>{setDateTo(event.target.value);setPreset('custom');resetPage();}}/></div>
        <FilterSelect label="مصدر الحركة" value={source} onChange={value=>{setSource(value as typeof source);resetPage();}} options={ [['all','QR والبصمة'],['qr','QR'],['biometric','البصمة']] }/>
        <FilterSelect label="نوع الحركة" value={movement} onChange={value=>{setMovement(value as Movement);resetPage();}} options={movements}/>
        <FilterSelect label="نتيجة المعالجة" value={status} onChange={value=>changeStatus(value as StatusFilter)} options={statuses}/>
        <FilterSelect label="المجموعة الحالية" value={groupId} onChange={value=>{setGroupId(value);resetPage();}} options={[['all','كل المجموعات'],...(data?.groups??[]).map(group=>[String(group.id),group.name] as const)]}/>
      </div>
      <div className="flex flex-wrap items-end justify-between gap-3 border-t pt-3"><div className="flex flex-wrap gap-3">
        <div className="w-[180px]"><FilterSelect label="التاريخ والترتيب حسب" value={timeBasis} onChange={value=>{setTimeBasis(value as typeof timeBasis);resetPage();}} options={ [['event_time','وقت الحركة الأصلي'],['received_at','وقت وصول الحركة']] }/></div>
        <div className="w-[160px]"><FilterSelect label="اتجاه الترتيب" value={sort} onChange={value=>{setSort(value as typeof sort);resetPage();}} options={ [['desc','الأحدث أولًا'],['asc','الأقدم أولًا']] }/></div>
      </div><Button type="button" variant="ghost" size="sm" onClick={resetFilters}>إعادة ضبط الفلاتر</Button></div>
      <p className="text-xs leading-5 text-muted-foreground">الفترة حسب {timeBasis==='event_time'?'تاريخ الحركة الأصلي':'تاريخ وصول الحركة'} بتوقيت الرياض. يوم العمل الإداري يظهر في تفاصيل الحركة المعتمدة.</p>
      {invalidDates&&<p role="alert" className="text-sm text-destructive">حدد فترة صحيحة؛ يجب أن يكون تاريخ البداية قبل تاريخ النهاية أو مساويًا له.</p>}
    </CardContent></Card>
    <Card className="gap-0 overflow-hidden shadow-none"><div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
      <div className="text-sm font-semibold">سجل الحركات <span className="mr-2 font-normal text-muted-foreground">{total.toLocaleString('ar-SA')} حركة حسب الفلاتر</span></div>
      <div aria-live="polite" className="flex items-center gap-2 text-xs text-muted-foreground">{updating&&<Loader2 className="h-3.5 w-3.5 animate-spin"/>}{updating?'جارٍ تحديث النتائج':'اضغط «التفاصيل» لعرض سبب النتيجة'}</div>
    </div>
    {list.error?<div role="alert" className="m-4 rounded-lg border border-destructive/20 bg-destructive/5 p-5 text-sm"><p>{list.error.message}</p><Button className="mt-3" size="sm" variant="outline" onClick={()=>void list.refetch()}>إعادة المحاولة</Button></div>
      :list.isLoading?<div className="flex items-center justify-center gap-2 p-12 text-sm text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin"/>جارٍ قراءة الحركات…</div>
      :!rows.length?<div className="space-y-2 p-12 text-center"><Inbox className="mx-auto h-9 w-9 text-muted-foreground/60"/><p className="font-medium">لا توجد حركات مطابقة</p><p className="text-sm text-muted-foreground">جرّب تغيير الفترة أو تخفيف الفلاتر.</p></div>
      :<Table className="min-w-[1080px]"><TableHeader><TableRow className="bg-muted/35"><TableHead className="text-right">العامل</TableHead><TableHead className="text-right">المصدر</TableHead><TableHead className="text-right">الحركة</TableHead><TableHead className="text-right">وقت الحركة الأصلي</TableHead><TableHead className="text-right">وقت الوصول</TableHead><TableHead className="text-right">نتيجة المعالجة</TableHead><TableHead className="text-right">التفاصيل</TableHead></TableRow></TableHeader>
        <TableBody>{rows.map(item=><TableRow key={item.id}>
          <TableCell className="min-w-[175px] whitespace-normal py-4"><div className="font-medium">{item.worker?.name||item.sourceUserName||'مستخدم جهاز غير مرتبط'}</div>
            <div className="mt-1 flex flex-wrap gap-x-2 text-xs text-muted-foreground">{item.worker?.code&&<bdi>{item.worker.code}</bdi>}{item.deviceUserId&&<span>رقم البصمة <bdi>{item.deviceUserId}</bdi></span>}</div>
            {item.worker?.currentGroupName&&<p className="mt-1 text-xs text-muted-foreground">{item.worker.currentGroupName}</p>}</TableCell>
          <TableCell><SourceBadge source={item.source}/></TableCell>
          <TableCell><span className="inline-flex items-center gap-1.5 whitespace-nowrap">{item.eventType==='check_in'?<ArrowDownLeft className="h-4 w-4 text-emerald-600"/>:item.eventType==='check_out'?<ArrowUpRight className="h-4 w-4 text-indigo-600"/>:<Clock3 className="h-4 w-4 text-slate-500"/>}{movementText(item.eventType)}</span></TableCell>
          <TableCell><Moment value={item.eventTimeUtc}/></TableCell><TableCell><Moment value={item.receivedAtUtc}/></TableCell>
          <TableCell className="max-w-[255px] whitespace-normal"><StatusBadge item={item}/><p className="mt-1.5 line-clamp-2 text-xs leading-5 text-muted-foreground">{item.reason}</p></TableCell>
          <TableCell><Button size="sm" variant="ghost" onClick={()=>setDetailId(item.id)} aria-label={`تفاصيل حركة ${item.worker?.name||item.deviceUserId||'المستخدم'} ${movementText(item.eventType)}`}>التفاصيل<ChevronLeft className="h-3.5 w-3.5"/></Button></TableCell>
        </TableRow>)}</TableBody></Table>}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3"><div className="flex items-center gap-2 text-xs text-muted-foreground"><span>عدد الحركات في الصفحة</span>
        <Select value={String(limit)} onValueChange={value=>{setLimit(Number(value) as 20|50|100);resetPage();}}><SelectTrigger aria-label="عدد الحركات في الصفحة" className="h-8 w-[74px]"><SelectValue/></SelectTrigger><SelectContent>{[20,50,100].map(size=><SelectItem key={size} value={String(size)}>{size}</SelectItem>)}</SelectContent></Select></div>
        <div className="flex items-center gap-3"><Button size="sm" variant="outline" disabled={page<=1||updating||invalidDates} onClick={()=>setPage(value=>value-1)}><ChevronRight className="h-4 w-4"/>السابق</Button><span className="text-xs text-muted-foreground">{list.isLoading?'جارٍ تحميل الصفحة…':`الصفحة ${page} من ${Math.max(1,totalPages)}`}</span><Button size="sm" variant="outline" disabled={page>=totalPages||updating||invalidDates} onClick={()=>setPage(value=>value+1)}>التالي<ChevronLeft className="h-4 w-4"/></Button></div>
      </div>
    </Card>
    {data?.activation&&<p className="flex flex-wrap gap-1 text-xs text-muted-foreground">بدأ اعتماد حركات البصمة الجديدة في {dateText(data.activation.startedAtUtc)}، الساعة {timeText(data.activation.startedAtUtc)} بتوقيت الرياض. الحركات الأقدم محفوظة للمراجعة.</p>}
    <Dialog open={Boolean(detailId)} onOpenChange={open=>{if(!open)setDetailId(null);}}><DialogContent dir="rtl" className="max-h-[90vh] overflow-y-auto sm:max-w-[720px]">
      <DialogHeader className="pr-6 text-right sm:text-right"><DialogTitle>تفاصيل الحركة الواردة</DialogTitle><DialogDescription>راجع وقت الحركة ونتيجتها وصلتها بسجل الحضور. جميع الأوقات بتوقيت الرياض.</DialogDescription></DialogHeader>
      {detail.isLoading?<p className="flex items-center gap-2 py-8 text-sm"><Loader2 className="h-4 w-4 animate-spin"/>جارٍ قراءة التفاصيل…</p>
        :detail.error?<p role="alert" className="text-sm text-destructive">{detail.error.message}</p>
        :detail.data?.item?<MovementDetails item={detail.data.item}/>:null}
    </DialogContent></Dialog>
  </div>;
}

function MovementDetails({item}:{item:SourceReviewItem}) {
  return <div className="space-y-5">
    <div className="rounded-xl border bg-muted/20 p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-lg font-semibold">{item.worker?.name||item.sourceUserName||'مستخدم جهاز غير مرتبط'}</p><p className="mt-1 text-xs text-muted-foreground">{item.worker?.code&&<bdi>{item.worker.code}</bdi>}{item.worker?.currentGroupName&&<> · المجموعة الحالية: {item.worker.currentGroupName}</>}</p></div><StatusBadge item={item}/></div>
      <div className="mt-3 flex items-center gap-2"><SourceBadge source={item.source}/><span className="text-sm font-medium">{movementText(item.eventType)}</span></div></div>
    <section><h3 className="mb-3 text-sm font-semibold">الأوقات المسجلة</h3><div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      {[['وقت الحركة الأصلي',item.eventTimeUtc],['وقت الوصول إلى تولان',item.receivedAtUtc],['وقت معالجة النتيجة',item.processedAtUtc]].map(([label,value])=><div key={label} className="rounded-lg border p-3"><p className="mb-2 text-xs text-muted-foreground">{label}</p><Moment value={value}/></div>)}</div></section>
    <section className="rounded-xl border p-4"><h3 className="text-sm font-semibold">ماذا حدث لهذه المحاولة؟</h3><p className="mt-2 text-sm leading-7">{item.reason}</p>
      {item.referenceIssue&&<p className="mt-3 rounded-md bg-amber-50 p-3 text-sm leading-6 text-amber-900">تحتاج صلة هذه المحاولة بسجل الحضور إلى تحقق. راجع مرجع الحركة قبل الاستناد إليها في المراجعة.</p>}
      {item.approvedMovement&&<div className="mt-4 rounded-lg border border-emerald-100 bg-emerald-50/50 p-3"><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-semibold text-emerald-900">{item.approvedMovement.kind==='already_recorded'?'الحركة التي سُجلت مسبقًا':'الحركة المعتمدة في سجل الحضور'}</p><SourceBadge source={item.approvedMovement.method??''}/></div>
        <div className="mt-3 flex flex-wrap items-start justify-between gap-3"><div><p className="mb-1 text-sm">{movementText(item.approvedMovement.eventType)}</p><Moment value={item.approvedMovement.eventTimeUtc}/></div>
          <div className="text-xs leading-6 text-muted-foreground"><p>رقم حركة الحضور: <bdi>{item.approvedMovement.id}</bdi></p><p>يوم العمل الإداري: <bdi>{item.approvedMovement.workDate}</bdi></p></div></div>
        <p className="mt-3 text-xs leading-5 text-emerald-900/80">احتساب المستحقات يتبع قواعد الوردية والرواتب على سجل الحضور.</p></div>}
    </section>
    {item.source==='biometric'&&<section><h3 className="mb-3 text-sm font-semibold">بيانات مستخدم الجهاز</h3><dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
      {[['رقم المستخدم في الجهاز',item.deviceUserId],['اسم مستخدم الجهاز',item.sourceUserName],['الجهاز',item.deviceName]].map(([label,value])=><div key={label} className="rounded-lg border p-3"><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-2 break-words">{value||'غير متوفر'}</dd></div>)}</dl>
      {item.original.sourceUserName&&item.original.sourceUserName!==item.sourceUserName&&<p className="mt-2 text-xs text-muted-foreground">الاسم المحفوظ مع المحاولة: <bdi>{item.original.sourceUserName}</bdi></p>}
    </section>}
  </div>;
}

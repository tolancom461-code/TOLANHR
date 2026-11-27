import { useEffect, useRef, useState } from 'react';
import { Loader2, Search } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
    {source==='biometric'?'بصمة':'QR'}</Badge>;
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
  const [activeTab,setActiveTab]=useState('records');
  const recordsTabRef=useRef<HTMLButtonElement>(null);
  useEffect(()=>{const timer=setTimeout(()=>{setQuery(search.trim());setPage(1);},250);return()=>clearTimeout(timer);},[search]);
  const invalidDates=!dateFrom||!dateTo||dateFrom>dateTo;
  const list=trpc.attendanceSources.list.useQuery({search:query||undefined,source,movement,status,timeBasis,dateFrom,dateTo,sort,page,limit,
    groupId:groupId==='all'?undefined:Number(groupId)},{enabled:!invalidDates,retry:false,staleTime:10_000});
  const detail=trpc.attendanceSources.detail.useQuery({id:detailId??''},{enabled:Boolean(detailId),retry:false});
  const resetPage=()=>setPage(1);
  const changeStatus=(value:StatusFilter)=>{setStatus(value);resetPage();};
  const openRecords=(value:StatusFilter)=>{changeStatus(value);setActiveTab('records');recordsTabRef.current?.focus();};
  const selectPeriod=(value:Preset)=>{setPreset(value);if(value!=='custom'){const range=period(value);setDateFrom(range.from);setDateTo(range.to);}resetPage();};
  const resetFilters=()=>{const range=period('today');setSearch('');setQuery('');setPreset('today');setDateFrom(range.from);setDateTo(range.to);
    setSource('all');setMovement('all');setStatus('all');setGroupId('all');setTimeBasis('event_time');setSort('desc');setPage(1);};
  const data=list.data;const rows=data?.items??[];const total=data?.page.total??0;const totalPages=data?.page.totalPages??1;
  const updating=list.isFetching||search.trim()!==query;
  const cards=[
    {key:'accepted',label:'معتمدة للحضور',value:data?.summary.accepted,color:'text-emerald-700'},
    {key:'already_recorded',label:'مسجّلة مسبقًا',value:data?.summary.alreadyRecorded,color:'text-sky-700'},
    {key:'needs_review',label:'تحتاج متابعة',value:data?.summary.needsReview,color:'text-orange-700'},
    {key:'pending',label:'تنتظر المعالجة',value:data?.summary.pending,color:'text-amber-700'},
  ] as const;
  const filterTags=[
    ...(movement==='all'?[]:[{label:movementText(movement),name:'نوع الحركة',clear:()=>{setMovement('all');resetPage();}}]),
    ...(status==='all'?[]:[{label:statuses.find(([key])=>key===status)![1],name:'النتيجة',clear:()=>changeStatus('all')}]),
    ...(timeBasis==='event_time'?[]:[{label:'وقت الوصول',name:'وقت الوصول',clear:()=>{setTimeBasis('event_time');resetPage();}}]),
    ...(sort==='desc'?[]:[{label:'الأقدم أولًا',name:'الترتيب',clear:()=>{setSort('desc');resetPage();}}]),
  ];
  const hasFilters=Boolean(search||source!=='all'||groupId!=='all'||preset!=='today'||filterTags.length);
  return <div dir="rtl" className="space-y-4 p-4 md:p-6">
    <h1 className="sr-only">الحركات الواردة — QR - بصمة</h1>
    <Tabs dir="rtl" value={activeTab} onValueChange={setActiveTab} className="gap-4">
      <div className="flex items-center gap-3">
        <TabsList aria-label="الحركات الواردة — QR - بصمة" className="grid h-auto min-w-0 flex-1 grid-cols-2 gap-1 rounded-xl border bg-muted/40 p-1 sm:max-w-lg">
          <TabsTrigger ref={recordsTabRef} value="records" className="min-h-11 whitespace-normal rounded-lg px-3 text-sm data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">سجل الحركات</TabsTrigger>
          <TabsTrigger value="summary" className="min-h-11 whitespace-normal rounded-lg px-3 text-sm data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">الملخص والمتابعة</TabsTrigger>
        </TabsList>
        <Button variant="outline" className="h-11" disabled={updating||invalidDates} onClick={()=>void list.refetch()}>
          {list.isFetching&&<Loader2 className="h-4 w-4 animate-spin"/>}تحديث
        </Button>
      </div>

      <Card className="gap-0 py-0 shadow-none">
        <CardContent className="space-y-4 p-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(240px,1fr)_150px_190px_160px]">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground" htmlFor="source-review-search">بحث</Label>
              <div className="relative">
                <Search className="absolute right-3 top-2.5 h-4 w-4 text-muted-foreground"/>
                <Input id="source-review-search" className="bg-background pr-10" value={search} onChange={event=>setSearch(event.target.value)} placeholder="الاسم، الكود، رقم البصمة"/>
              </div>
            </div>
            <FilterSelect label="المصدر" value={source} onChange={value=>{setSource(value as typeof source);resetPage();}} options={ [['all','QR - بصمة'],['qr','QR'],['biometric','بصمة']] }/>
            <FilterSelect label="المجموعة الحالية" value={groupId} onChange={value=>{setGroupId(value);resetPage();}} options={[['all','كل المجموعات'],...(data?.groups??[]).map(group=>[String(group.id),group.name] as const)]}/>
            <FilterSelect label="الفترة" value={preset} onChange={value=>selectPeriod(value as Preset)} options={ [['today','اليوم'],['week','آخر 7 أيام'],['month','هذا الشهر'],['custom','فترة محددة']] }/>
          </div>
          {preset==='custom'&&<div className="grid grid-cols-1 gap-3 border-t pt-4 sm:grid-cols-2">
            <div className="space-y-1.5"><Label className="text-xs text-muted-foreground" htmlFor="source-date-from">من تاريخ</Label><Input id="source-date-from" aria-label="من تاريخ" type="date" value={dateFrom} onChange={event=>{setDateFrom(event.target.value);resetPage();}}/></div>
            <div className="space-y-1.5"><Label className="text-xs text-muted-foreground" htmlFor="source-date-to">إلى تاريخ</Label><Input id="source-date-to" aria-label="إلى تاريخ" type="date" value={dateTo} onChange={event=>{setDateTo(event.target.value);resetPage();}}/></div>
          </div>}
          <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
            <div className="flex flex-wrap gap-2">
              {filterTags.filter(tag=>activeTab==='records'||tag.name!=='النتيجة').map(tag=><button key={tag.name} type="button" onClick={tag.clear} aria-label={`إلغاء فلتر ${tag.name}`} className="inline-flex items-center gap-2 rounded-full border bg-muted/30 px-3 py-1 text-xs transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                {tag.label}<span aria-hidden="true" className="text-base leading-none text-muted-foreground">×</span>
              </button>)}
              <span className="self-center text-xs text-muted-foreground">{timeBasis==='event_time'?'وقت الحركة الأصلي':'وقت الوصول'} · الرياض</span>
            </div>
            <Button type="button" variant="ghost" size="sm" onClick={resetFilters} disabled={!hasFilters}>مسح الفلاتر</Button>
          </div>
          {invalidDates&&<p role="alert" className="text-sm text-destructive">الفترة غير صحيحة</p>}
        </CardContent>
      </Card>

      {list.error&&<div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/20 bg-destructive/5 p-4 text-sm">
        <p>{list.error.message}</p><Button size="sm" variant="outline" onClick={()=>void list.refetch()}>إعادة المحاولة</Button>
      </div>}

      <TabsContent value="records" className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <FilterSelect label="الحركة" value={movement} onChange={value=>{setMovement(value as Movement);resetPage();}} options={movements}/>
          <FilterSelect label="النتيجة" value={status} onChange={value=>changeStatus(value as StatusFilter)} options={statuses}/>
          <FilterSelect label="التاريخ حسب" value={timeBasis} onChange={value=>{setTimeBasis(value as typeof timeBasis);resetPage();}} options={ [['event_time','وقت الحركة الأصلي'],['received_at','وقت الوصول']] }/>
          <FilterSelect label="الترتيب" value={sort} onChange={value=>{setSort(value as typeof sort);resetPage();}} options={ [['desc','الأحدث أولًا'],['asc','الأقدم أولًا']] }/>
        </div>
        {!list.error&&<Card className="gap-0 overflow-hidden py-0 shadow-none">
          <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
            <span className="text-sm font-medium">{data?`${total.toLocaleString('ar-SA')} حركة`:'—'}</span>
            <span aria-live="polite" className="text-xs text-muted-foreground">{updating?'جارٍ التحديث…':''}</span>
          </div>
          {list.isLoading?<div role="status" className="flex items-center justify-center gap-2 p-10 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin"/>جارٍ التحميل…</div>
            :!rows.length?<p className="p-10 text-center text-sm text-muted-foreground">لا توجد حركات</p>
            :<Table className="min-w-[1020px]">
              <TableHeader><TableRow className="bg-muted/35">
                <TableHead className="text-right">العامل</TableHead><TableHead className="text-right">المصدر</TableHead><TableHead className="text-right">الحركة</TableHead>
                <TableHead className="text-right">وقت الحركة الأصلي</TableHead><TableHead className="text-right">وقت الوصول</TableHead><TableHead className="text-right">النتيجة</TableHead><TableHead className="text-right">التفاصيل</TableHead>
              </TableRow></TableHeader>
              <TableBody>{rows.map(item=><TableRow key={item.id}>
                <TableCell className="min-w-[190px] whitespace-normal py-4">
                  <div className="font-medium">{item.worker?.name||item.sourceUserName||'مستخدم جهاز غير مرتبط'}</div>
                  <div className="mt-1 flex flex-wrap gap-x-2 text-xs text-muted-foreground">{item.worker?.code&&<bdi>{item.worker.code}</bdi>}{item.deviceUserId&&<span>رقم البصمة <bdi>{item.deviceUserId}</bdi></span>}</div>
                  {item.worker?.currentGroupName&&<p className="mt-1 text-xs text-muted-foreground">{item.worker.currentGroupName}</p>}
                </TableCell>
                <TableCell><SourceBadge source={item.source}/></TableCell>
                <TableCell>{movementText(item.eventType)}</TableCell>
                <TableCell><Moment value={item.eventTimeUtc}/></TableCell><TableCell><Moment value={item.receivedAtUtc}/></TableCell>
                <TableCell><StatusBadge item={item}/></TableCell>
                <TableCell><Button size="sm" variant="ghost" onClick={()=>setDetailId(item.id)} aria-label={`تفاصيل حركة ${item.worker?.name||item.deviceUserId||'المستخدم'} ${movementText(item.eventType)}`}>التفاصيل</Button></TableCell>
              </TableRow>)}</TableBody>
            </Table>}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>عدد الصفوف</span>
              <Select value={String(limit)} onValueChange={value=>{setLimit(Number(value) as 20|50|100);resetPage();}}><SelectTrigger aria-label="عدد الصفوف" className="h-8 w-[74px]"><SelectValue/></SelectTrigger><SelectContent>{[20,50,100].map(size=><SelectItem key={size} value={String(size)}>{size}</SelectItem>)}</SelectContent></Select>
            </div>
            <div className="flex items-center gap-3">
              <Button size="sm" variant="outline" disabled={page<=1||updating||invalidDates} onClick={()=>setPage(value=>value-1)}>السابق</Button>
              <span className="text-xs text-muted-foreground">{list.isLoading?'…':`${page} / ${Math.max(1,totalPages)}`}</span>
              <Button size="sm" variant="outline" disabled={page>=totalPages||updating||invalidDates} onClick={()=>setPage(value=>value+1)}>التالي</Button>
            </div>
          </div>
        </Card>}
      </TabsContent>

      <TabsContent value="summary" className="space-y-4">
        {!list.error&&<>
          <button type="button" onClick={()=>openRecords('all')} className="flex w-full items-center justify-between gap-4 rounded-xl border bg-card p-5 text-right transition-colors hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <span className="text-sm font-medium">إجمالي الحركات</span>
            <span className="text-3xl font-semibold tabular-nums">{data?.summary.all===undefined?'—':data.summary.all.toLocaleString('ar-SA')}</span>
          </button>
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            {cards.map(card=><button key={card.key} type="button" onClick={()=>openRecords(card.key)} className="space-y-4 rounded-xl border bg-card p-5 text-right transition-colors hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <div className="text-sm text-muted-foreground">{card.label}</div>
              <div className={`text-3xl font-semibold tabular-nums ${card.color}`}>{card.value===undefined?'—':card.value.toLocaleString('ar-SA')}</div>
            </button>)}
          </div>
          <div className="grid grid-cols-1 gap-2 rounded-xl border bg-card p-3 sm:grid-cols-2 xl:grid-cols-3">
            {(['unmapped','manual_review','rejected','review_only','before_activation'] as const).map(value=><Button key={value} type="button" variant="ghost" className="h-11 justify-start rounded-lg px-3" onClick={()=>openRecords(value)}>{statuses.find(([key])=>key===value)![1]}</Button>)}
          </div>
        </>}
      </TabsContent>
    </Tabs>

    <Dialog open={Boolean(detailId)} onOpenChange={open=>{if(!open)setDetailId(null);}}>
      <DialogContent dir="rtl" className="max-h-[90vh] overflow-y-auto sm:max-w-[720px]">
        <DialogHeader className="sr-only"><DialogTitle>تفاصيل الحركة الواردة</DialogTitle><DialogDescription>الحركة المحددة</DialogDescription></DialogHeader>
        {detail.isLoading?<p role="status" className="flex items-center gap-2 py-8 text-sm"><Loader2 className="h-4 w-4 animate-spin"/>جارٍ التحميل…</p>
          :detail.error?<p role="alert" className="text-sm text-destructive">{detail.error.message}</p>
          :detail.data?.item?<MovementDetails item={detail.data.item}/>:null}
      </DialogContent>
    </Dialog>
  </div>;
}
function MovementDetails({item}:{item:SourceReviewItem}) {
  return <div className="space-y-5">
    <div className="rounded-xl border bg-muted/20 p-4 pr-10"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-lg font-semibold">{item.worker?.name||item.sourceUserName||'مستخدم جهاز غير مرتبط'}</p><p className="mt-1 text-xs text-muted-foreground">{item.worker?.code&&<bdi>{item.worker.code}</bdi>}{item.worker?.currentGroupName&&<> · {item.worker.currentGroupName}</>}</p></div><StatusBadge item={item}/></div>
      <div className="mt-3 flex items-center gap-2"><SourceBadge source={item.source}/><span className="text-sm font-medium">{movementText(item.eventType)}</span></div></div>
    <section><div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      {[['وقت الحركة الأصلي',item.eventTimeUtc],['وقت الوصول إلى تولان',item.receivedAtUtc],['وقت معالجة النتيجة',item.processedAtUtc]].map(([label,value])=><div key={label} className="rounded-lg border p-3"><p className="mb-2 text-xs text-muted-foreground">{label}</p><Moment value={value}/></div>)}</div></section>
    <section className="rounded-xl border p-4"><p className="text-sm leading-7">{item.reason}</p>
      {item.referenceIssue&&<p className="mt-3 rounded-md bg-amber-50 p-3 text-sm text-amber-900">مرجع الحضور يحتاج مراجعة</p>}
      {item.approvedMovement&&<div className="mt-4 rounded-lg border border-emerald-100 bg-emerald-50/50 p-3"><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs text-emerald-900">الحضور المرتبط</p><SourceBadge source={item.approvedMovement.method??''}/></div>
        <div className="mt-3 flex flex-wrap items-start justify-between gap-3"><div><p className="mb-1 text-sm">{movementText(item.approvedMovement.eventType)}</p><Moment value={item.approvedMovement.eventTimeUtc}/></div>
          <div className="text-xs leading-6 text-muted-foreground"><p>رقم حركة الحضور: <bdi>{item.approvedMovement.id}</bdi></p><p>يوم العمل الإداري: <bdi>{item.approvedMovement.workDate}</bdi></p></div></div>
        </div>}
    </section>
    {item.source==='biometric'&&<section><dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
      {[['رقم المستخدم في الجهاز',item.deviceUserId],['اسم مستخدم الجهاز',item.sourceUserName],['الجهاز',item.deviceName]].map(([label,value])=><div key={label} className="rounded-lg border p-3"><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-2 break-words">{value||'غير متوفر'}</dd></div>)}</dl>
      {item.original.sourceUserName&&item.original.sourceUserName!==item.sourceUserName&&<p className="mt-2 text-xs text-muted-foreground">الاسم المحفوظ مع المحاولة: <bdi>{item.original.sourceUserName}</bdi></p>}
    </section>}
  </div>;
}

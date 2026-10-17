import { useEffect, useState } from 'react';
import type { inferRouterOutputs } from '@trpc/server';
import type { AppRouter } from '../../../server/routers';
import { useLanguage } from '@/contexts/LanguageContext';
import { trpc } from '@/lib/trpc';
import { transliterateName } from '@/utils/transliterate';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ArrowRightLeft, CheckCircle2, Loader2, MapPin, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { useSearch } from 'wouter';

type TransferRequest = inferRouterOutputs<AppRouter>['operationalTransfers']['list'][number];

interface OperationsTransfersTabProps {
  workDate: string;
  costCenterId: number;
}

export default function OperationsTransfersTab({ workDate, costCenterId }: OperationsTransfersTabProps) {
  const { t, language } = useLanguage();
  const search = useSearch();
  const urlView = new URLSearchParams(search).get('view');
  const labels = t.operationalTransfersPage;
  const displayName = (name: string | null | undefined) =>
    language === 'en' ? transliterateName(name || '') : name || '';
  const utils = trpc.useUtils();
  const [sourceGroupId, setSourceGroupId] = useState('');
  const [workerId, setWorkerId] = useState('');
  const [toGroupId, setToGroupId] = useState('');
  const [requestView, setRequestView] = useState<'incoming' | 'outgoing'>(
    () => urlView === 'outgoing' ? 'outgoing' : 'incoming'
  );
  const [rejectRequest, setRejectRequest] = useState<TransferRequest | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [completeRequest, setCompleteRequest] = useState<TransferRequest | null>(null);
  const [restaurantId, setRestaurantId] = useState('');
  const ready = !!workDate && costCenterId > 0;

  useEffect(() => {
    setRequestView(urlView === 'outgoing' ? 'outgoing' : 'incoming');
  }, [urlView]);

  const selectRequestView = (view: 'incoming' | 'outgoing') => {
    setRequestView(view);
    const url = new URL(window.location.href);
    url.searchParams.set('view', view);
    window.history.replaceState(window.history.state, '', url);
  };

  const optionsQuery = trpc.operationalTransfers.options.useQuery(
    { workDate, toCostCenterId: costCenterId },
    { enabled: ready }
  );
  const workersQuery = trpc.operationalTransfers.workers.useQuery(
    { workDate, toCostCenterId: costCenterId, sourceGroupId: Number(sourceGroupId) },
    { enabled: ready && !!sourceGroupId }
  );
  const requestsQuery = trpc.operationalTransfers.list.useQuery(
    { workDate, costCenterId },
    { enabled: ready }
  );

  useEffect(() => {
    setSourceGroupId('');
    setWorkerId('');
    setToGroupId('');
    setRejectRequest(null);
    setRejectionReason('');
    setCompleteRequest(null);
    setRestaurantId('');
  }, [workDate, costCenterId]);

  useEffect(() => {
    if (workerId && workersQuery.data && !workersQuery.data.some((worker) => worker.id === Number(workerId))) {
      setWorkerId('');
    }
  }, [workersQuery.data, workerId]);

  const refresh = async () => {
    await Promise.all([
      utils.operationalTransfers.invalidate(),
      utils.restaurants.operationalDayStatus.invalidate(),
      utils.restaurants.operationalRecords.invalidate(),
      utils.restaurants.getWorkersForAssignment.invalidate(),
      utils.restaurants.groupAssignmentProgress.invalidate(),
      utils.restaurants.openOperationalDays.invalidate(),
    ]);
  };

  const createMutation = trpc.operationalTransfers.create.useMutation({
    onSuccess: async () => {
      setWorkerId('');
      selectRequestView('outgoing');
      toast.success(labels.requestSent);
      await refresh();
    },
    onError: (error) => toast.error(error.message),
  });
  const approveMutation = trpc.operationalTransfers.approve.useMutation({
    onSuccess: async () => { toast.success(labels.requestApproved); await refresh(); },
    onError: (error) => toast.error(error.message),
  });
  const rejectMutation = trpc.operationalTransfers.reject.useMutation({
    onSuccess: async () => {
      setRejectRequest(null);
      setRejectionReason('');
      toast.success(labels.requestRejected);
      await refresh();
    },
    onError: (error) => toast.error(error.message),
  });
  const cancelMutation = trpc.operationalTransfers.cancel.useMutation({
    onSuccess: async () => { toast.success(labels.requestCancelled); await refresh(); },
    onError: (error) => toast.error(error.message),
  });
  const completeMutation = trpc.operationalTransfers.complete.useMutation({
    onSuccess: async () => {
      setCompleteRequest(null);
      setRestaurantId('');
      toast.success(labels.transferCompleted);
      await refresh();
    },
    onError: async (error) => {
      toast.error(error.message);
      setCompleteRequest(null);
      setRestaurantId('');
      await refresh();
    },
  });
  const busy = createMutation.isPending || approveMutation.isPending || rejectMutation.isPending ||
    cancelMutation.isPending || completeMutation.isPending;
  const requests = requestsQuery.data || [];
  const visibleRequests = requests.filter((request) => request.direction === requestView);
  const statusLabels: Record<TransferRequest['status'], string> = {
    pending: labels.pending,
    approved: labels.approved,
    completed: labels.completed,
    rejected: labels.rejected,
    cancelled: labels.cancelled,
  };
  const queryError = optionsQuery.error || requestsQuery.error;

  if (!ready) {
    return <Card><CardContent className="py-10 text-center text-muted-foreground">{labels.selectContext}</CardContent></Card>;
  }

  return (
    <div className="space-y-5">
      {queryError && (
        <div role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 space-y-2">
          <p className="text-sm">{queryError.message}</p>
          <Button variant="outline" size="sm" onClick={() => void refresh()}>
            <RefreshCw className="h-4 w-4 me-2" />{labels.retry}
          </Button>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><ArrowRightLeft className="h-5 w-5" />{labels.newRequest}</CardTitle>
          <p className="text-sm text-muted-foreground">{labels.fullDayHint}</p>
        </CardHeader>
        <CardContent className="space-y-4">
          {optionsQuery.isLoading ? (
            <p className="text-center py-6 text-muted-foreground">{t.staffingPage.loading}</p>
          ) : !optionsQuery.error && !optionsQuery.data?.sourceGroups.length ? (
            <p className="text-center py-6 text-muted-foreground">{labels.noSourceGroups}</p>
          ) : !optionsQuery.error && (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>{labels.sourceGroup}</Label>
                  <Select value={sourceGroupId} onValueChange={(value) => { setSourceGroupId(value); setWorkerId(''); }} disabled={busy}>
                    <SelectTrigger className="w-full"><SelectValue placeholder={labels.selectSourceGroup} /></SelectTrigger>
                    <SelectContent>
                      {optionsQuery.data?.sourceGroups.map((group) => (
                        <SelectItem key={group.id} value={String(group.id)}>
                          {displayName(group.name)} — {displayName(group.costCenterName)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>{labels.destinationGroup}</Label>
                  <Select value={toGroupId} onValueChange={setToGroupId} disabled={busy}>
                    <SelectTrigger className="w-full"><SelectValue placeholder={labels.selectDestinationGroup} /></SelectTrigger>
                    <SelectContent>
                      {optionsQuery.data?.destinationGroups.map((group) => (
                        <SelectItem key={group.id} value={String(group.id)}>{displayName(group.name)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {!optionsQuery.data?.destinationGroups.length && <p className="text-xs text-muted-foreground">{labels.noDestinationGroups}</p>}
                </div>
              </div>

              {sourceGroupId && (
                <div className="space-y-2">
                  <Label>{labels.chooseWorker}</Label>
                  {workersQuery.isLoading ? (
                    <p className="py-5 text-center text-muted-foreground">{t.staffingPage.loading}</p>
                  ) : workersQuery.error ? (
                    <div role="alert" className="space-y-2 text-sm text-destructive">
                      <p>{workersQuery.error.message}</p>
                      <Button size="sm" variant="outline" onClick={() => void workersQuery.refetch()}>{labels.retry}</Button>
                    </div>
                  ) : !workersQuery.data?.length ? (
                    <p className="rounded-lg border border-dashed p-5 text-center text-sm text-muted-foreground">{labels.noEligibleWorkers}</p>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-80 overflow-y-auto p-1">
                      {workersQuery.data.map((worker) => (
                        <Button key={worker.id} type="button" variant={workerId === String(worker.id) ? 'default' : 'outline'}
                          className="h-auto min-h-14 whitespace-normal text-start justify-start py-3" disabled={busy}
                          onClick={() => setWorkerId(String(worker.id))} aria-pressed={workerId === String(worker.id)}>
                          <span>{displayName(worker.fullName)} <span className="text-xs opacity-75">({worker.code})</span></span>
                        </Button>
                      ))}
                    </div>
                  )}
                </div>
              )}
              <Button disabled={!sourceGroupId || !workerId || !toGroupId || busy || !!workersQuery.error}
                onClick={() => createMutation.mutate({ workDate, workerId: Number(workerId), sourceGroupId: Number(sourceGroupId), toGroupId: Number(toGroupId), toCostCenterId: costCenterId })}>
                {createMutation.isPending && <Loader2 className="h-4 w-4 me-2 animate-spin" />}{labels.sendRequest}
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="space-y-3">
          <div className="flex flex-wrap justify-between items-center gap-2">
            <CardTitle className="text-base">{labels.requests}</CardTitle>
            <Button variant="outline" size="sm" onClick={() => void refresh()} disabled={busy || requestsQuery.isFetching}>
              <RefreshCw className={`h-4 w-4 me-2 ${requestsQuery.isFetching ? 'animate-spin' : ''}`} />{labels.refresh}
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            {(['incoming', 'outgoing'] as const).map((view) => (
              <Button key={view} type="button" size="sm" variant={requestView === view ? 'default' : 'outline'} onClick={() => selectRequestView(view)}>
                {view === 'incoming' ? labels.incoming : labels.outgoing} ({requests.filter((request) => request.direction === view).length})
              </Button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">{requestView === 'incoming' ? labels.incomingHint : labels.outgoingHint}</p>
        </CardHeader>
        <CardContent>
          {requestsQuery.isLoading ? (
            <p className="text-center py-8 text-muted-foreground">{t.staffingPage.loading}</p>
          ) : !requestsQuery.error && !visibleRequests.length ? (
            <p className="text-center py-8 text-muted-foreground">{labels.noRequests}</p>
          ) : (
            <div className="space-y-3">
              {visibleRequests.map((request) => (
                <div key={request.id} className="rounded-lg border p-4 space-y-3">
                  <div className="flex flex-wrap justify-between items-start gap-2">
                    <div className="font-semibold">{displayName(request.workerName)} <span className="font-normal text-xs text-muted-foreground">({request.workerCode})</span></div>
                    <Badge variant={request.status === 'completed' ? 'default' : request.status === 'rejected' ? 'destructive' : 'secondary'}>
                      {request.status === 'completed' && !!request.financeReady && <CheckCircle2 className="h-3.5 w-3.5 me-1" />}
                      {request.status === 'completed' && !request.financeReady ? labels.pendingFinance : statusLabels[request.status]}
                    </Badge>
                  </div>
                  <div className="text-sm space-y-1">
                    <p>{labels.from}: {displayName(request.sourceCostCenterName)} / {displayName(request.sourceGroupName)}</p>
                    <p>{labels.to}: {displayName(request.toCostCenterName)} / {displayName(request.toGroupName)}</p>
                    <p className="text-xs text-muted-foreground">{labels.requestedBy}: {displayName(request.requestedByName)}</p>
                    {request.reviewedByName && <p className="text-xs text-muted-foreground">{labels.reviewedBy}: {displayName(request.reviewedByName)}</p>}
                    {request.restaurantName && <p className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{displayName(request.restaurantName)}</p>}
                    {request.rejectionReason && <p className="rounded-md bg-destructive/5 p-2">{labels.rejectionReason}: {request.rejectionReason}</p>}
                  </div>
                  {request.status === 'completed' && requestView === 'incoming' && (
                    <Badge variant="outline">{labels.transferredTo}: {displayName(request.toCostCenterName)}</Badge>
                  )}
                  <div className="flex flex-wrap gap-2">
                    {request.canApprove && <Button size="sm" disabled={busy} onClick={() => approveMutation.mutate({ id: request.id })}>{labels.approve}</Button>}
                    {request.canReject && <Button size="sm" variant="destructive" disabled={busy} onClick={() => { setRejectRequest(request); setRejectionReason(''); }}>{labels.reject}</Button>}
                    {request.canComplete && <Button size="sm" disabled={busy} onClick={() => {
                      if (request.status === 'completed' && request.restaurantId) {
                        completeMutation.mutate({ id: request.id, restaurantId: request.restaurantId });
                      } else {
                        setCompleteRequest(request); setRestaurantId('');
                      }
                    }}>{request.status === 'completed' ? labels.retry : labels.chooseSiteAndComplete}</Button>}
                    {request.canCancel && <Button size="sm" variant="outline" disabled={busy} onClick={() => cancelMutation.mutate({ id: request.id })}>{labels.cancelRequest}</Button>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!rejectRequest} onOpenChange={(open) => { if (!open && !rejectMutation.isPending) { setRejectRequest(null); setRejectionReason(''); } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{labels.reject}</DialogTitle><DialogDescription>{displayName(rejectRequest?.workerName)}</DialogDescription></DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="transfer-rejection-reason">{labels.rejectionReason} *</Label>
            <Textarea id="transfer-rejection-reason" value={rejectionReason} onChange={(event) => setRejectionReason(event.target.value)} maxLength={500}
              placeholder={labels.rejectionReasonPlaceholder} disabled={rejectMutation.isPending} />
            <p className="text-xs text-muted-foreground">{labels.rejectionReasonRequired}</p>
          </div>
          <DialogFooter>
            <Button variant="outline" disabled={rejectMutation.isPending} onClick={() => setRejectRequest(null)}>{t.staffingPage.cancel}</Button>
            <Button variant="destructive" disabled={!rejectionReason.trim() || rejectMutation.isPending}
              onClick={() => { if (rejectRequest) rejectMutation.mutate({ id: rejectRequest.id, reason: rejectionReason.trim() }); }}>{labels.confirmRejection}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!completeRequest} onOpenChange={(open) => { if (!open && !completeMutation.isPending) { setCompleteRequest(null); setRestaurantId(''); } }}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto">
          <DialogHeader><DialogTitle>{labels.chooseSiteAndComplete}</DialogTitle><DialogDescription>{displayName(completeRequest?.workerName)} — {displayName(completeRequest?.toGroupName)}</DialogDescription></DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">{labels.completionHint}</p>
            {!optionsQuery.data?.sites.length ? <p className="text-center p-5 text-muted-foreground">{t.staffingPage.quickNoSites}</p> : (
              <div className="grid grid-cols-2 gap-2">
                {optionsQuery.data.sites.map((site) => (
                  <Button key={site.id} type="button" variant={restaurantId === String(site.id) ? 'default' : 'outline'}
                    className="h-auto min-h-12 whitespace-normal py-3" disabled={completeMutation.isPending}
                    onClick={() => setRestaurantId(String(site.id))} aria-pressed={restaurantId === String(site.id)}>{displayName(site.name)}</Button>
                ))}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" disabled={completeMutation.isPending} onClick={() => setCompleteRequest(null)}>{t.staffingPage.cancel}</Button>
            <Button disabled={!restaurantId || completeMutation.isPending}
              onClick={() => { if (completeRequest) completeMutation.mutate({ id: completeRequest.id, restaurantId: Number(restaurantId) }); }}>
              {completeMutation.isPending && <Loader2 className="h-4 w-4 me-2 animate-spin" />}{labels.completeTransfer}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

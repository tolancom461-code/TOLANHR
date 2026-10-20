import { useEffect, useMemo, useRef, useState } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { useLanguage } from '@/contexts/LanguageContext';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  ClipboardList,
  MapPin,
  CheckCircle2,
  X,
  ArrowRightLeft,
  LockKeyhole,
  Users,
  CalendarDays,
  RotateCcw,
  ShieldAlert,
  Clock,
  PhoneCall,
  AlertTriangle,
} from 'lucide-react';
import { toast } from 'sonner';
import { transliterateName } from '@/utils/transliterate';
import { useAuth } from '@/_core/hooks/useAuth';

type WorkerFilter = 'all' | 'assigned' | 'unassigned' | 'transferred';

type TransferDraft = {
  costCenterId: string;
  groupId: string;
  siteId: string;
};

export default function Operations() {
  const { t, language } = useLanguage();
  const { user } = useAuth();
  const displayName = (name: string) => (language === 'en' ? transliterateName(name) : name);
  const [costCenterId, setCostCenterId] = useState('');
  const [groupId, setGroupId] = useState('');
  const [workerFilter, setWorkerFilter] = useState<WorkerFilter>('all');
  const [transferDrafts, setTransferDrafts] = useState<Record<number, TransferDraft>>({});
  const [selectedWorkDate, setSelectedWorkDate] = useState('');
  const [reviewDialogOpen, setReviewDialogOpen] = useState(false);
  const [reopenDialogOpen, setReopenDialogOpen] = useState(false);
  const [reopenReason, setReopenReason] = useState('');
  const [groupCallTime, setGroupCallTime] = useState('');
  const [emergencyWorkerId, setEmergencyWorkerId] = useState('');
  const [emergencyCallTime, setEmergencyCallTime] = useState('');
  const [emergencyReason, setEmergencyReason] = useState('');
  const [gamesClosingTime, setGamesClosingTime] = useState('');
  const [restaurantsClosingTime, setRestaurantsClosingTime] = useState('');
  const [quickDialogOpen, setQuickDialogOpen] = useState(false);
  const [quickSelectedSiteId, setQuickSelectedSiteId] = useState('');
  const [quickProcessedWorkerIds, setQuickProcessedWorkerIds] = useState<number[]>([]);
  const [quickCompletedVisible, setQuickCompletedVisible] = useState(false);
  const quickCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const utils = trpc.useUtils();
  const { data: operationalDay } = trpc.restaurants.currentWorkDate.useQuery();
  const workDate = selectedWorkDate || operationalDay?.workDate || '';

  useEffect(() => {
    if (!selectedWorkDate && operationalDay?.workDate) {
      setSelectedWorkDate(operationalDay.workDate);
    }
  }, [operationalDay?.workDate, selectedWorkDate]);

  const selectedCostCenterId = costCenterId ? parseInt(costCenterId) : 0;
  const { data: dayStatus } = trpc.restaurants.operationalDayStatus.useQuery(
    { workDate, costCenterId: selectedCostCenterId },
    { enabled: !!workDate && !!selectedCostCenterId }
  );
  const { data: openOperationalDays } = trpc.restaurants.openOperationalDays.useQuery(
    { costCenterId: selectedCostCenterId },
    { enabled: !!selectedCostCenterId }
  );
  const { data: costCenters } = trpc.costCenters.list.useQuery();
  const scopedOperationsRoles = new Set(['supervisor_tolan', 'supervisor_malqa', 'restaurant_operations']);
  const isScopedOperationsUser = !!user?.role && scopedOperationsRoles.has(user.role);
  const { data: userCostCenters } = trpc.users.getUserCostCenters.useQuery(
    { userId: user?.id || 0 },
    { enabled: isScopedOperationsUser && !!user?.id }
  );
  const { data: allGroups } = trpc.groups.list.useQuery();
  const { data: costCenterGroups } = trpc.groups.listByCostCenter.useQuery(
    { costCenterId: costCenterId ? parseInt(costCenterId) : undefined },
    { enabled: !!costCenterId }
  );
  const { data: sitesList } = trpc.restaurants.list.useQuery({ includeInactive: false });
  const { data: operationalRecords } = trpc.restaurants.operationalRecords.useQuery(
    { workDate, costCenterId: selectedCostCenterId },
    { enabled: !!workDate && !!selectedCostCenterId }
  );
  const { data: operationalGroupWorkers } = trpc.restaurants.operationalGroupWorkers.useQuery(
    { groupId: groupId ? parseInt(groupId) : 0 },
    { enabled: !!groupId }
  );

  const { data: groupWorkers, isLoading: loadingWorkers } = trpc.restaurants.getWorkersForAssignment.useQuery(
    { groupId: groupId ? parseInt(groupId) : 0, workDate },
    { enabled: !!groupId && !!workDate }
  );


  const { data: groupAssignmentProgress, isLoading: loadingGroupProgress } =
    trpc.restaurants.groupAssignmentProgress.useQuery(
      { costCenterId: selectedCostCenterId, workDate },
      { enabled: isScopedOperationsUser && !!selectedCostCenterId && !!workDate }
    );

  const refreshOperationalDay = async () => {
    if (workDate && selectedCostCenterId) {
      await utils.restaurants.operationalDayStatus.invalidate({ workDate, costCenterId: selectedCostCenterId });
      await utils.restaurants.operationalRecords.invalidate({ workDate, costCenterId: selectedCostCenterId });
      if (groupId) {
        await utils.restaurants.getWorkersForAssignment.invalidate({ groupId: parseInt(groupId), workDate });
      }
      if (isScopedOperationsUser) {
        await utils.restaurants.groupAssignmentProgress.invalidate({
          costCenterId: selectedCostCenterId,
          workDate,
        });
      }
      await utils.restaurants.openOperationalDays.invalidate({ costCenterId: selectedCostCenterId });
    }
  };

  const assignMutation = trpc.restaurants.assignWorker.useMutation({
    onSuccess: () => {
      void refreshOperationalDay();
    },
    onError: (error) => toast.error(error.message),
  });

  const closeDayMutation = trpc.restaurants.closeOperationalDay.useMutation({
    onSuccess: async () => {
      toast.success(t.staffingPage.operationalDayClosedSuccess);
      setReviewDialogOpen(false);
      await refreshOperationalDay();
    },
    onError: (error) => toast.error(error.message),
  });

  const reopenDayMutation = trpc.restaurants.reopenOperationalDay.useMutation({
    onSuccess: async () => {
      toast.success(t.staffingPage.operationalDayReopenedSuccess);
      setReopenDialogOpen(false);
      setReopenReason('');
      await refreshOperationalDay();
    },
    onError: (error) => toast.error(error.message),
  });

  const recordGroupCallMutation = trpc.restaurants.recordGroupCall.useMutation({
    onSuccess: async () => {
      toast.success(t.staffingPage.groupCallSaved);
      setGroupCallTime('');
      await refreshOperationalDay();
    },
    onError: (error) => toast.error(error.message),
  });

  const recordEmergencyCallMutation = trpc.restaurants.recordEmergencyCall.useMutation({
    onSuccess: async () => {
      toast.success(t.staffingPage.emergencyCallSaved);
      setEmergencyWorkerId('');
      setEmergencyCallTime('');
      setEmergencyReason('');
      await refreshOperationalDay();
    },
    onError: (error) => toast.error(error.message),
  });

  const recordClosingTimeMutation = trpc.restaurants.recordClosingTime.useMutation({
    onSuccess: async () => {
      toast.success(t.staffingPage.closingTimeSaved);
      setGamesClosingTime('');
      setRestaurantsClosingTime('');
      await refreshOperationalDay();
    },
    onError: (error) => toast.error(error.message),
  });

  const visibleCostCenters = useMemo(() => {
    if (!isScopedOperationsUser) return costCenters || [];
    const allowedIds = new Set((userCostCenters || []).map((row: any) => Number(row.costCenterId)));
    return (costCenters || []).filter((cc: any) => allowedIds.has(Number(cc.id)));
  }, [costCenters, isScopedOperationsUser, userCostCenters]);

  const costCenterNameById = useMemo(
    () => new Map((costCenters || []).map((cc: any) => [cc.id, cc.name])),
    [costCenters]
  );

  const selectedCostCenter = useMemo(
    () => (costCenters || []).find((cc: any) => Number(cc.id) === selectedCostCenterId),
    [costCenters, selectedCostCenterId]
  );
  const selectedCostCenterCode = String(selectedCostCenter?.code || '').trim().toUpperCase();
  const selectedCostCenterName = String(selectedCostCenter?.name || '');
  const isTolanClosingCenter = selectedCostCenterCode === 'CC01' || selectedCostCenterName.includes('تولان');
  const isMalqaClosingCenter = selectedCostCenterCode === 'CC06' || selectedCostCenterName.includes('الملقا');

  useEffect(() => {
    if (!isScopedOperationsUser || costCenterId || visibleCostCenters.length !== 1) return;
    setCostCenterId(String(visibleCostCenters[0].id));
  }, [isScopedOperationsUser, costCenterId, visibleCostCenters]);

  const activeGroups = useMemo(
    () => (allGroups || []).filter((group: any) => !!group.isActive && !!group.costCenterId),
    [allGroups]
  );

  const sourceSites = useMemo(
    () =>
      [...(sitesList || [])]
        .filter((site: any) => Number(site.costCenterId) === Number(costCenterId))
        .sort((a: any, b: any) => String(a.name).localeCompare(String(b.name), language === 'ar' ? 'ar' : 'en')),
    [sitesList, costCenterId, language]
  );

  const renderSiteOptions = (sites: any[]) => {
    const grouped = new Map<string, any[]>();
    for (const site of sites) {
      const departmentName = site.operationalDepartmentName || '';
      const current = grouped.get(departmentName) || [];
      current.push(site);
      grouped.set(departmentName, current);
    }

    return Array.from(grouped.entries())
      .sort(([a], [b]) => a.localeCompare(b, language === 'ar' ? 'ar' : 'en'))
      .map(([departmentName, departmentSites]) => (
        <SelectGroup key={departmentName || 'unclassified'}>
          <SelectLabel>
            {departmentName ? displayName(departmentName) : t.restaurantsPage.unclassifiedDepartment}
          </SelectLabel>
          {departmentSites
            .sort((a: any, b: any) => String(a.name).localeCompare(String(b.name), language === 'ar' ? 'ar' : 'en'))
            .map((site: any) => (
              <SelectItem key={site.id} value={String(site.id)}>
                {displayName(site.name)}
              </SelectItem>
            ))}
        </SelectGroup>
      ));
  };

  const updateDecision = async (
    worker: any,
    patch: { restaurantId?: number | null; operationalGroupId?: number | null }
  ) => {
    if (!groupId || !workDate) return;
    await assignMutation.mutateAsync({
      workerId: worker.id,
      sourceGroupId: Number(groupId),
      restaurantId: patch.restaurantId !== undefined ? patch.restaurantId : worker.currentRestaurantId,
      operationalGroupId:
        patch.operationalGroupId !== undefined ? patch.operationalGroupId : worker.operationalGroupId,
      workDate,
    });
  };

  const saveTransfer = async (worker: any, draft: TransferDraft) => {
    if (!draft.costCenterId || !draft.groupId || !draft.siteId) {
      toast.error(t.staffingPage.completeTransferFields);
      return;
    }

    try {
      await updateDecision(worker, {
        restaurantId: Number(draft.siteId),
        operationalGroupId: Number(draft.groupId),
      });
      setTransferDrafts((current) => {
        const next = { ...current };
        delete next[worker.id];
        return next;
      });
      toast.success(t.staffingPage.transferSaved);
    } catch {
      // onError in the mutation displays the backend validation message.
    }
  };

  const cancelTransfer = async (worker: any) => {
    setTransferDrafts((current) => ({
      ...current,
      [worker.id]: { costCenterId: '', groupId: '', siteId: '' },
    }));

    if (!worker.operationalGroupId) return;

    try {
      // إزالة النقل تعيد العامل لمجموعته الأساسية. الموقع يُعاد اختياره من مركزه الأساسي.
      await updateDecision(worker, { restaurantId: null, operationalGroupId: null });
      toast.success(t.staffingPage.transferCancelled);
    } catch {
      // onError handles the message.
    }
  };

  const groupCallRecord = useMemo(
    () => (operationalRecords || []).find((row: any) => row.eventType === 'group_called' && Number(row.groupId) === Number(groupId)),
    [operationalRecords, groupId]
  );
  const emergencyCallRecords = useMemo(
    () => (operationalRecords || []).filter((row: any) => row.eventType === 'emergency_called' && Number(row.groupId) === Number(groupId)),
    [operationalRecords, groupId]
  );
  const gamesClosingRecord = useMemo(
    () => (operationalRecords || []).find((row: any) => row.eventType === 'games_closed'),
    [operationalRecords]
  );
  const restaurantsClosingRecord = useMemo(
    () => (operationalRecords || []).find((row: any) => row.eventType === 'restaurants_closed'),
    [operationalRecords]
  );

  const canRecordGroupData = ['supervisor_tolan', 'supervisor_malqa', 'restaurant_operations', 'super_admin'].includes(String(user?.role || ''));
  const canRecordGamesClosing = isTolanClosingCenter && (user?.role === 'supervisor_tolan' || user?.role === 'super_admin');
  const canRecordRestaurantsClosing = isMalqaClosingCenter && (user?.role === 'supervisor_malqa' || user?.role === 'super_admin');

  const formatFinalTime = (value?: string | null) => {
    if (!value) return '-';
    const match = String(value).match(/(?:T|\s)(\d{2}):(\d{2})/);
    if (!match) return String(value);
    const hour24 = Number(match[1]);
    const hour12 = hour24 % 12 || 12;
    return `${hour12}:${match[2]} ${hour24 < 12 ? 'ص' : 'م'}`;
  };

  const confirmFinalSave = () => window.confirm(t.staffingPage.finalRecordConfirm);

  const saveGroupCall = () => {
    if (!workDate || !selectedCostCenterId || !groupId || !groupCallTime) return;
    if (!confirmFinalSave()) return;
    recordGroupCallMutation.mutate({
      workDate,
      costCenterId: selectedCostCenterId,
      groupId: Number(groupId),
      time: groupCallTime,
    });
  };

  const saveEmergencyCall = () => {
    if (!workDate || !selectedCostCenterId || !groupId || !emergencyWorkerId || !emergencyCallTime || !emergencyReason.trim()) return;
    if (!confirmFinalSave()) return;
    recordEmergencyCallMutation.mutate({
      workDate,
      costCenterId: selectedCostCenterId,
      groupId: Number(groupId),
      workerId: Number(emergencyWorkerId),
      time: emergencyCallTime,
      reason: emergencyReason.trim(),
    });
  };

  const saveClosingTime = (type: 'games_closed' | 'restaurants_closed', time: string) => {
    if (!workDate || !selectedCostCenterId || !time) return;
    if (!confirmFinalSave()) return;
    recordClosingTimeMutation.mutate({ workDate, costCenterId: selectedCostCenterId, type, time });
  };

  const canEditAssignments = !!dayStatus?.capabilities?.canEditAssignments;

  const handleWorkDateChange = (value: string) => {
    setSelectedWorkDate(value);
    setWorkerFilter('all');
    setTransferDrafts({});
    setGroupCallTime('');
    setEmergencyWorkerId('');
    setEmergencyCallTime('');
    setEmergencyReason('');
    setGamesClosingTime('');
    setRestaurantsClosingTime('');
  };

  const requestCloseOperationalDay = () => {
    if (!workDate || !selectedCostCenterId || !dayStatus) return;

    if (dayStatus.unassignedCount > 0) {
      const preview = (dayStatus.unassignedWorkers || [])
        .slice(0, 5)
        .map((worker: any) => `${displayName(worker.workerName)} (${worker.workerCode})`)
        .join('، ');
      toast.error(
        `${t.staffingPage.cannotCloseUnassigned}: ${dayStatus.unassignedCount}${preview ? ` — ${preview}` : ''}`
      );
      return;
    }

    if (dayStatus.isReopened && (dayStatus.pendingChanges?.length || 0) > 0) {
      setReviewDialogOpen(true);
      return;
    }

    closeDayMutation.mutate({ workDate, costCenterId: selectedCostCenterId, acknowledgeChanges: true });
  };

  const submitReopen = () => {
    if (!workDate || !selectedCostCenterId) return;
    const reason = reopenReason.trim();
    if (!reason) {
      toast.error(t.staffingPage.reopenReasonRequired);
      return;
    }
    reopenDayMutation.mutate({ workDate, costCenterId: selectedCostCenterId, reason });
  };

  const getChangeLines = (change: any) => {
    const before = (change.beforeValues || {}) as Record<string, any>;
    const after = (change.afterValues || {}) as Record<string, any>;
    const lines: string[] = [];
    const pushIfChanged = (label: string, key: string) => {
      const beforeValue = before[key] || t.staffingPage.noAssignment;
      const afterValue = after[key] || t.staffingPage.noAssignment;
      if (String(beforeValue) !== String(afterValue)) {
        lines.push(`${label}: ${displayName(String(beforeValue))} → ${displayName(String(afterValue))}`);
      }
    };
    pushIfChanged(t.staffingPage.costCenter, 'effectiveCostCenterName');
    pushIfChanged(t.staffingPage.group, 'effectiveGroupName');
    pushIfChanged(t.staffingPage.workSite, 'restaurantName');
    return lines.length ? lines : [t.staffingPage.assignmentChanged];
  };

  const stats = useMemo(() => {
    const workers = groupWorkers || [];
    return {
      total: workers.length,
      assigned: workers.filter((w: any) => !!w.currentRestaurantId).length,
      unassigned: workers.filter((w: any) => !w.currentRestaurantId).length,
      transferred: workers.filter((w: any) => !!w.operationalGroupId).length,
    };
  }, [groupWorkers]);

  const filteredWorkers = useMemo(() => {
    const workers = groupWorkers || [];
    if (workerFilter === 'assigned') return workers.filter((w: any) => !!w.currentRestaurantId);
    if (workerFilter === 'unassigned') return workers.filter((w: any) => !w.currentRestaurantId);
    if (workerFilter === 'transferred') return workers.filter((w: any) => !!w.operationalGroupId);
    return workers;
  }, [groupWorkers, workerFilter]);

  const quickGroups = useMemo(
    () =>
      [...(costCenterGroups || [])]
        .filter((group: any) => !!group.isActive && !group.isOperationalAssignmentExempt)
        .sort((a: any, b: any) =>
          String(a.name).localeCompare(String(b.name), language === 'ar' ? 'ar' : 'en')
        ),
    [costCenterGroups, language]
  );

  const quickProgressByGroup = useMemo(
    () => new Map((groupAssignmentProgress || []).map((row: any) => [Number(row.groupId), row])),
    [groupAssignmentProgress]
  );

  const selectedQuickGroup = useMemo(
    () => quickGroups.find((group: any) => Number(group.id) === Number(groupId)),
    [quickGroups, groupId]
  );

  const quickProcessedWorkerIdSet = useMemo(
    () => new Set(quickProcessedWorkerIds),
    [quickProcessedWorkerIds]
  );

  const quickPendingWorkers = useMemo(
    () =>
      (groupWorkers || []).filter(
        (worker: any) => !worker.currentRestaurantId && !quickProcessedWorkerIdSet.has(Number(worker.id))
      ),
    [groupWorkers, quickProcessedWorkerIdSet]
  );

  const quickCurrentWorker = quickPendingWorkers[0] || null;
  const quickTotalWorkers = groupWorkers?.length || 0;
  const quickAssignedWorkers = Math.max(quickTotalWorkers - quickPendingWorkers.length, 0);

  useEffect(() => {
    return () => {
      if (quickCloseTimerRef.current) clearTimeout(quickCloseTimerRef.current);
    };
  }, []);

  const clearQuickCloseTimer = () => {
    if (!quickCloseTimerRef.current) return;
    clearTimeout(quickCloseTimerRef.current);
    quickCloseTimerRef.current = null;
  };

  const resetQuickDialogState = () => {
    clearQuickCloseTimer();
    setQuickSelectedSiteId('');
    setQuickProcessedWorkerIds([]);
    setQuickCompletedVisible(false);
  };

  const handleQuickDialogOpenChange = (open: boolean) => {
    setQuickDialogOpen(open);
    if (!open) resetQuickDialogState();
  };

  const openQuickGroup = (group: any) => {
    if (!workDate || !selectedCostCenterId) return;
    resetQuickDialogState();
    setGroupId(String(group.id));
    setWorkerFilter('all');
    setTransferDrafts({});
    setGroupCallTime('');
    setEmergencyWorkerId('');
    setEmergencyCallTime('');
    setEmergencyReason('');
    setQuickDialogOpen(true);
    void utils.restaurants.getWorkersForAssignment.invalidate({
      groupId: Number(group.id),
      workDate,
    });
  };

  const saveQuickAssignment = async () => {
    if (!quickCurrentWorker || !quickSelectedSiteId || !groupId || !workDate) {
      if (!quickSelectedSiteId) toast.error(t.staffingPage.quickSelectSiteRequired);
      return;
    }

    try {
      const workerId = Number(quickCurrentWorker.id);
      const remainingAfterSave = quickPendingWorkers.length - 1;

      await assignMutation.mutateAsync({
        workerId,
        sourceGroupId: Number(groupId),
        restaurantId: Number(quickSelectedSiteId),
        operationalGroupId: null,
        workDate,
      });

      setQuickProcessedWorkerIds((current) => [...current, workerId]);
      setQuickSelectedSiteId('');

      if (remainingAfterSave === 0) {
        setQuickCompletedVisible(true);
        clearQuickCloseTimer();
        quickCloseTimerRef.current = setTimeout(() => {
          setQuickDialogOpen(false);
          resetQuickDialogState();
        }, 2000);
      }
    } catch {
      // onError in the mutation displays the backend validation message.
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ClipboardList className="h-6 w-6" />
            {t.staffingPage.title}
          </h1>
          <p className="text-muted-foreground">{t.staffingPage.operationalSubtitle}</p>
        </div>

        {(groupId || selectedCostCenterId) && (
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
            {groupId && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Clock className="h-5 w-5" />
                    {t.staffingPage.groupCallTitle}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-xs text-muted-foreground">{t.staffingPage.groupCallHint}</p>
                  {groupCallRecord ? (
                    <div className="rounded-md border bg-muted/30 p-3 space-y-1">
                      <div className="font-semibold">{formatFinalTime(groupCallRecord.eventAt)}</div>
                      <div className="text-xs text-muted-foreground">
                        {t.staffingPage.finalRecordedBy}: {displayName(groupCallRecord.actorName || '-')}
                      </div>
                      <Badge variant="secondary">{t.staffingPage.finalRecord}</Badge>
                    </div>
                  ) : canRecordGroupData ? (
                    <div className="flex items-end gap-2">
                      <div className="flex-1 space-y-1.5">
                        <Label>{t.staffingPage.callTime}</Label>
                        <Input type="time" value={groupCallTime} onChange={(event) => setGroupCallTime(event.target.value)} />
                      </div>
                      <Button onClick={saveGroupCall} disabled={!groupCallTime || recordGroupCallMutation.isPending}>
                        {t.staffingPage.saveFinal}
                      </Button>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">-</p>
                  )}
                </CardContent>
              </Card>
            )}

            {groupId && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <PhoneCall className="h-5 w-5" />
                    {t.staffingPage.emergencyCallTitle}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-xs text-muted-foreground">{t.staffingPage.emergencyCallHint}</p>
                  {canRecordGroupData && (
                    <>
                      <div className="space-y-1.5">
                        <Label>{t.staffingPage.worker}</Label>
                        <Select value={emergencyWorkerId} onValueChange={setEmergencyWorkerId}>
                          <SelectTrigger><SelectValue placeholder={t.staffingPage.selectWorker} /></SelectTrigger>
                          <SelectContent>
                            {(operationalGroupWorkers || []).map((worker: any) => (
                              <SelectItem key={worker.id} value={String(worker.id)}>
                                {worker.code} — {displayName(worker.fullName)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <Label>{t.staffingPage.emergencyTime}</Label>
                        <Input type="time" value={emergencyCallTime} onChange={(event) => setEmergencyCallTime(event.target.value)} />
                      </div>
                      <div className="space-y-1.5">
                        <Label>{t.staffingPage.emergencyReason}</Label>
                        <Textarea
                          value={emergencyReason}
                          onChange={(event) => setEmergencyReason(event.target.value)}
                          placeholder={t.staffingPage.emergencyReasonPlaceholder}
                          maxLength={500}
                        />
                      </div>
                      <Button
                        className="w-full"
                        onClick={saveEmergencyCall}
                        disabled={!emergencyWorkerId || !emergencyCallTime || !emergencyReason.trim() || recordEmergencyCallMutation.isPending}
                      >
                        {t.staffingPage.saveFinal}
                      </Button>
                    </>
                  )}
                  {emergencyCallRecords.length > 0 && (
                    <div className="border-t pt-3 space-y-2">
                      <div className="text-sm font-medium">{t.staffingPage.existingEmergencyCalls}</div>
                      {emergencyCallRecords.map((record: any) => (
                        <div key={record.id} className="rounded-md border p-2 text-sm">
                          <div className="font-medium">{record.workerCode} — {displayName(record.workerName || '')}</div>
                          <div>{formatFinalTime(record.eventAt)} — {record.note}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {selectedCostCenterId > 0 && (isTolanClosingCenter || isMalqaClosingCenter) && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5" />
                    {isTolanClosingCenter ? t.staffingPage.parkClosingTitle : t.staffingPage.restaurantsClosingTitle}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-xs text-muted-foreground">{t.staffingPage.parkClosingHint}</p>
                  {isTolanClosingCenter && (canRecordGamesClosing || gamesClosingRecord) && (
                    <div className="space-y-2">
                      <Label>{t.staffingPage.gamesClosingTime}</Label>
                      {gamesClosingRecord ? (
                        <div className="rounded-md border bg-muted/30 p-3">
                          <div className="font-semibold">{formatFinalTime(gamesClosingRecord.eventAt)}</div>
                          <div className="text-xs text-muted-foreground">{t.staffingPage.finalRecordedBy}: {displayName(gamesClosingRecord.actorName || '-')}</div>
                        </div>
                      ) : (
                        <div className="flex gap-2">
                          <Input type="time" value={gamesClosingTime} onChange={(event) => setGamesClosingTime(event.target.value)} />
                          <Button onClick={() => saveClosingTime('games_closed', gamesClosingTime)} disabled={!gamesClosingTime || recordClosingTimeMutation.isPending}>
                            {t.staffingPage.saveFinal}
                          </Button>
                        </div>
                      )}
                    </div>
                  )}
                  {isMalqaClosingCenter && (canRecordRestaurantsClosing || restaurantsClosingRecord) && (
                    <div className="space-y-2">
                      <Label>{t.staffingPage.restaurantsClosingTime}</Label>
                      {restaurantsClosingRecord ? (
                        <div className="rounded-md border bg-muted/30 p-3">
                          <div className="font-semibold">{formatFinalTime(restaurantsClosingRecord.eventAt)}</div>
                          <div className="text-xs text-muted-foreground">{t.staffingPage.finalRecordedBy}: {displayName(restaurantsClosingRecord.actorName || '-')}</div>
                        </div>
                      ) : (
                        <div className="flex gap-2">
                          <Input type="time" value={restaurantsClosingTime} onChange={(event) => setRestaurantsClosingTime(event.target.value)} />
                          <Button onClick={() => saveClosingTime('restaurants_closed', restaurantsClosingTime)} disabled={!restaurantsClosingTime || recordClosingTimeMutation.isPending}>
                            {t.staffingPage.saveFinal}
                          </Button>
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {isScopedOperationsUser ? t.staffingPage.quickOperationalContextTitle : t.staffingPage.operationalDayAndGroup}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className={`grid grid-cols-1 md:grid-cols-2 ${isScopedOperationsUser ? 'xl:grid-cols-3' : 'xl:grid-cols-4'} gap-4`}>
              <div className="space-y-2">
                <Label>{t.staffingPage.operationalDay}</Label>
                <div className="relative">
                  <CalendarDays className="absolute start-3 top-3 h-4 w-4 text-muted-foreground pointer-events-none" />
                  <Input
                    type="date"
                    className="ps-9"
                    value={workDate}
                    min={operationalDay?.controlStartDate}
                    max={operationalDay?.workDate}
                    onChange={(event) => handleWorkDateChange(event.target.value)}
                  />
                </div>
                <p className="text-xs text-muted-foreground">{t.staffingPage.operationalDateHint}</p>
              </div>

              <div className="space-y-2">
                <Label>{t.staffingPage.openOperationalDays}</Label>
                <Select
                  value={(openOperationalDays || []).some((day: any) => day.workDate === workDate) ? workDate : ''}
                  onValueChange={handleWorkDateChange}
                  disabled={!costCenterId}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder={t.staffingPage.selectOpenOperationalDay} />
                  </SelectTrigger>
                  <SelectContent>
                    {(openOperationalDays || []).length ? (
                      openOperationalDays?.map((day: any) => (
                        <SelectItem key={day.workDate} value={day.workDate}>
                          {day.workDate}{day.isReopened ? ` — ${t.staffingPage.reopened}` : ''}
                        </SelectItem>
                      ))
                    ) : (
                      <SelectItem value="__none" disabled>{t.staffingPage.noOpenOperationalDays}</SelectItem>
                    )}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">{t.staffingPage.openDaysHint}</p>
              </div>

              <div className="space-y-2">
                <Label>{t.staffingPage.costCenter}</Label>
                <Select
                  value={costCenterId}
                  onValueChange={(value) => {
                    setCostCenterId(value);
                    setGroupId('');
                    setWorkerFilter('all');
                    setTransferDrafts({});
                    setGroupCallTime('');
                    setEmergencyWorkerId('');
                    setEmergencyCallTime('');
                    setEmergencyReason('');
                    setGamesClosingTime('');
                    setRestaurantsClosingTime('');
                  }}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder={t.staffingPage.selectCostCenter} />
                  </SelectTrigger>
                  <SelectContent>
                    {visibleCostCenters?.map((cc: any) => (
                      <SelectItem key={cc.id} value={String(cc.id)}>
                        {displayName(cc.name)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {!isScopedOperationsUser && (
                <div className="space-y-2">
                  <Label>{t.staffingPage.group}</Label>
                  <Select
                    value={groupId}
                    onValueChange={(value) => {
                      setGroupId(value);
                      setWorkerFilter('all');
                      setTransferDrafts({});
                      setGroupCallTime('');
                      setEmergencyWorkerId('');
                      setEmergencyCallTime('');
                      setEmergencyReason('');
                    }}
                    disabled={!costCenterId}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue
                        placeholder={costCenterId ? t.staffingPage.selectGroup : t.staffingPage.selectCostCenterFirst}
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {costCenterGroups
                        ?.filter((g: any) => !!g.isActive)
                        .map((g: any) => (
                          <SelectItem key={g.id} value={String(g.id)}>
                            {displayName(g.name)}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            {dayStatus && (
              <div className="rounded-lg border p-4 space-y-3 bg-muted/20">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="secondary">{displayName(dayStatus.costCenterName || '')}</Badge>
                    <Badge
                      variant={dayStatus.status === 'closed' ? 'default' : 'outline'}
                      className={dayStatus.status === 'closed' ? '' : dayStatus.isReopened ? 'border-amber-500 text-amber-700' : ''}
                    >
                      {dayStatus.status === 'closed'
                        ? t.staffingPage.closed
                        : dayStatus.isReopened
                          ? t.staffingPage.reopenedPendingReview
                          : t.staffingPage.open}
                    </Badge>
                    <Badge variant="secondary">
                      {t.staffingPage.dayDistribution}: {dayStatus.assignedCount}/{dayStatus.presentCount}
                    </Badge>
                    {dayStatus.unassignedCount > 0 && (
                      <Badge variant="destructive">
                        {t.staffingPage.unassigned}: {dayStatus.unassignedCount}
                      </Badge>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {dayStatus.capabilities?.canReopen && (
                      <Button
                        variant="outline"
                        onClick={() => setReopenDialogOpen(true)}
                        disabled={reopenDayMutation.isPending}
                      >
                        <RotateCcw className="h-4 w-4 me-2" />
                        {t.staffingPage.reopenOperationalDay}
                      </Button>
                    )}
                    {dayStatus.capabilities?.canClose && (
                      <Button
                        onClick={requestCloseOperationalDay}
                        disabled={closeDayMutation.isPending}
                      >
                        <LockKeyhole className="h-4 w-4 me-2" />
                        {t.staffingPage.closeOperationalDay}
                      </Button>
                    )}
                  </div>
                </div>

                {dayStatus.isReopened && (
                  <div className="text-sm rounded-md border border-amber-300 bg-amber-50/60 dark:bg-amber-950/20 p-3">
                    <div className="font-medium flex items-center gap-2">
                      <ShieldAlert className="h-4 w-4" />
                      {t.staffingPage.reopenedNotice}
                    </div>
                    {dayStatus.reopenReason && (
                      <div className="mt-1 text-muted-foreground">
                        {t.staffingPage.reopenReason}: {dayStatus.reopenReason}
                      </div>
                    )}
                    {(dayStatus.pendingChanges?.length || 0) > 0 && (
                      <div className="mt-1 text-muted-foreground">
                        {t.staffingPage.pendingAdminChanges}: {dayStatus.pendingChanges.length}
                      </div>
                    )}
                  </div>
                )}

                {dayStatus.hasPayrollBatch && (
                  <div className="text-sm rounded-md border border-destructive/40 bg-destructive/5 p-3">
                    <div className="font-medium">{t.staffingPage.payrollLocksOperationalDay}</div>
                    <div className="mt-1 text-muted-foreground">
                      {(dayStatus.payrollBatches || [])
                        .map((batch: any) => `${batch.batchCode} (${batch.status})`)
                        .join('، ')}
                    </div>
                  </div>
                )}

                {!canEditAssignments && dayStatus.status === 'open' && !dayStatus.hasPayrollBatch && (
                  <p className="text-xs text-muted-foreground">{t.staffingPage.dayViewOnlyHint}</p>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {isScopedOperationsUser && selectedCostCenterId > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Users className="h-5 w-5" />
                {t.staffingPage.quickSelectGroupTitle}
              </CardTitle>
              <p className="text-sm text-muted-foreground">{t.staffingPage.quickSelectGroupHint}</p>
            </CardHeader>
            <CardContent>
              {!quickGroups.length ? (
                <div className="py-8 text-center text-muted-foreground">{t.staffingPage.quickNoGroups}</div>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
                  {quickGroups.map((group: any) => {
                    const progress: any = quickProgressByGroup.get(Number(group.id));
                    const isSelected = Number(group.id) === Number(groupId);
                    const completed = !!progress?.completed;
                    const hasAttendance = Number(progress?.total || 0) > 0;
                    return (
                      <Button
                        key={group.id}
                        type="button"
                        variant="outline"
                        className={`h-auto min-h-24 p-4 flex flex-col items-stretch justify-between gap-3 text-start whitespace-normal ${
                          isSelected ? 'ring-2 ring-primary/40' : ''
                        }`}
                        onClick={() => openQuickGroup(group)}
                        disabled={!workDate}
                      >
                        <span className="font-semibold text-base leading-snug">{displayName(group.name)}</span>
                        <span className="flex items-center justify-between gap-2 text-xs text-muted-foreground w-full">
                          {loadingGroupProgress && !progress ? (
                            <span>{t.staffingPage.loading}</span>
                          ) : !hasAttendance ? (
                            <span>{t.staffingPage.quickNoAttendance}</span>
                          ) : completed ? (
                            <Badge variant="secondary" className="gap-1">
                              <CheckCircle2 className="h-3.5 w-3.5" />
                              {t.staffingPage.quickCompleted}
                            </Badge>
                          ) : (
                            <span>
                              {progress.assigned}/{progress.total} {t.staffingPage.quickAssignedShort}
                            </span>
                          )}
                        </span>
                      </Button>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {groupId && !isScopedOperationsUser && (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <Card>
                <CardContent className="p-4">
                  <div className="text-sm text-muted-foreground">{t.staffingPage.present}</div>
                  <div className="text-2xl font-bold mt-1">{stats.total}</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <div className="text-sm text-muted-foreground">{t.staffingPage.assigned}</div>
                  <div className="text-2xl font-bold mt-1">{stats.assigned}</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <div className="text-sm text-muted-foreground">{t.staffingPage.unassigned}</div>
                  <div className="text-2xl font-bold mt-1">{stats.unassigned}</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <div className="text-sm text-muted-foreground">{t.staffingPage.groupTransfer}</div>
                  <div className="text-2xl font-bold mt-1">{stats.transferred}</div>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader className="space-y-4">
                <CardTitle className="text-base flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  {t.staffingPage.presentWorkers} — {workDate}
                </CardTitle>
                <div className="flex flex-wrap gap-2">
                  {(
                    [
                      ['all', `${t.staffingPage.all} (${stats.total})`],
                      ['assigned', `${t.staffingPage.assigned} (${stats.assigned})`],
                      ['unassigned', `${t.staffingPage.unassigned} (${stats.unassigned})`],
                      ['transferred', `${t.staffingPage.groupTransfer} (${stats.transferred})`],
                    ] as Array<[WorkerFilter, string]>
                  ).map(([value, label]) => (
                    <Button
                      key={value}
                      size="sm"
                      variant={workerFilter === value ? 'default' : 'outline'}
                      onClick={() => setWorkerFilter(value)}
                    >
                      {label}
                    </Button>
                  ))}
                </div>
              </CardHeader>
              <CardContent>
                {loadingWorkers ? (
                  <div className="text-center py-8 text-muted-foreground">{t.staffingPage.loading}</div>
                ) : !groupWorkers?.length ? (
                  <div className="text-center py-8 text-muted-foreground">{t.staffingPage.noPresentWorkers}</div>
                ) : !filteredWorkers.length ? (
                  <div className="text-center py-8 text-muted-foreground">{t.staffingPage.noFilterMatches}</div>
                ) : (
                  <div className="space-y-3">
                    {filteredWorkers.map((worker: any) => {
                      const existingOperationalGroup = worker.operationalGroupId
                        ? activeGroups.find((g: any) => g.id === worker.operationalGroupId)
                        : undefined;
                      const persistedTransferCenterId = existingOperationalGroup?.costCenterId
                        ? String(existingOperationalGroup.costCenterId)
                        : worker.operationalGroupId && worker.siteCostCenterId
                          ? String(worker.siteCostCenterId)
                          : '';
                      const persistedDraft: TransferDraft = worker.operationalGroupId
                        ? {
                            costCenterId: persistedTransferCenterId,
                            groupId: String(worker.operationalGroupId),
                            siteId: worker.currentRestaurantId ? String(worker.currentRestaurantId) : '',
                          }
                        : { costCenterId: '', groupId: '', siteId: '' };
                      const transferDraft = transferDrafts[worker.id] ?? persistedDraft;
                      const isTransferMode = !!transferDraft.costCenterId;
                      const targetGroups = activeGroups.filter(
                        (g: any) =>
                          String(g.costCenterId) === transferDraft.costCenterId && g.id !== Number(groupId)
                      );
                      const targetSites = [...(sitesList || [])]
                        .filter((site: any) => String(site.costCenterId || '') === transferDraft.costCenterId)
                        .sort((a: any, b: any) =>
                          String(a.name).localeCompare(String(b.name), language === 'ar' ? 'ar' : 'en')
                        );
                      const currentSiteIsInSourceCenter =
                        !!worker.currentRestaurantId && String(worker.siteCostCenterId || '') === costCenterId;
                      const targetCenterName = transferDraft.costCenterId
                        ? costCenterNameById.get(Number(transferDraft.costCenterId))
                        : null;

                      return (
                        <div key={worker.id} className="p-4 rounded-lg border bg-muted/20 space-y-4">
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <div className="flex items-center gap-2 min-w-[220px]">
                              {worker.currentRestaurantId ? (
                                <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
                              ) : (
                                <X className="h-4 w-4 text-muted-foreground shrink-0" />
                              )}
                              <span className="font-medium">{displayName(worker.fullName)}</span>
                              <span className="text-xs text-muted-foreground">({worker.code})</span>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              {worker.operationalGroupId && (
                                <Badge className="gap-1">
                                  <ArrowRightLeft className="h-3 w-3" />
                                  {t.staffingPage.groupTransfer}
                                </Badge>
                              )}
                              {targetCenterName && (
                                <Badge variant="outline">
                                  {t.staffingPage.transferToCenter}: {displayName(String(targetCenterName))}
                                </Badge>
                              )}
                            </div>
                          </div>

                          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                            <div className="space-y-1.5">
                              <Label className="text-xs flex items-center gap-1">
                                <MapPin className="h-3.5 w-3.5" /> {t.staffingPage.workSite}
                              </Label>
                              <Select
                                value={
                                  !isTransferMode && currentSiteIsInSourceCenter
                                    ? String(worker.currentRestaurantId)
                                    : 'none'
                                }
                                disabled={assignMutation.isPending || isTransferMode || !canEditAssignments}
                                onValueChange={async (value) => {
                                  try {
                                    await updateDecision(worker, {
                                      restaurantId: value === 'none' ? null : Number(value),
                                      operationalGroupId: null,
                                    });
                                    setTransferDrafts((current) => ({
                                      ...current,
                                      [worker.id]: { costCenterId: '', groupId: '', siteId: '' },
                                    }));
                                  } catch {
                                    // onError handles the message.
                                  }
                                }}
                              >
                                <SelectTrigger className="w-full">
                                  <SelectValue placeholder={t.staffingPage.selectWorkSite} />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="none">{t.staffingPage.noSiteAssignment}</SelectItem>
                                  {renderSiteOptions(sourceSites)}
                                </SelectContent>
                              </Select>
                              <p className="text-xs text-muted-foreground">{t.staffingPage.baseSiteHint}</p>
                            </div>

                            <div className="space-y-1.5">
                              <Label className="text-xs flex items-center gap-1">
                                <ArrowRightLeft className="h-3.5 w-3.5" /> {t.staffingPage.transferCostCenter}
                              </Label>
                              <Select
                                value={transferDraft.costCenterId || 'none'}
                                disabled={assignMutation.isPending || !canEditAssignments}
                                onValueChange={(value) => {
                                  if (value === 'none') {
                                    void cancelTransfer(worker);
                                    return;
                                  }
                                  setTransferDrafts((current) => ({
                                    ...current,
                                    [worker.id]: { costCenterId: value, groupId: '', siteId: '' },
                                  }));
                                }}
                              >
                                <SelectTrigger className="w-full">
                                  <SelectValue placeholder={t.staffingPage.selectTransferCostCenter} />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="none">{t.staffingPage.noTransfer}</SelectItem>
                                  {costCenters?.map((cc: any) => (
                                    <SelectItem key={cc.id} value={String(cc.id)}>
                                      {displayName(cc.name)}
                                      {String(cc.id) === costCenterId ? ` — ${t.staffingPage.sameCostCenter}` : ''}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <p className="text-xs text-muted-foreground">{t.staffingPage.transferCenterHint}</p>
                            </div>
                          </div>

                          {isTransferMode && (
                            <div className="rounded-md border bg-background p-3 space-y-3">
                              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                                <div className="space-y-1.5">
                                  <Label className="text-xs">{t.staffingPage.transferGroup}</Label>
                                  <Select
                                    value={transferDraft.groupId || ''}
                                    disabled={assignMutation.isPending || !canEditAssignments}
                                    onValueChange={(value) =>
                                      setTransferDrafts((current) => ({
                                        ...current,
                                        [worker.id]: { ...transferDraft, groupId: value },
                                      }))
                                    }
                                  >
                                    <SelectTrigger className="w-full">
                                      <SelectValue placeholder={t.staffingPage.selectTransferGroup} />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {targetGroups.map((group: any) => (
                                        <SelectItem key={group.id} value={String(group.id)}>
                                          {displayName(group.name)}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>

                                <div className="space-y-1.5">
                                  <Label className="text-xs">{t.staffingPage.transferWorkSite}</Label>
                                  <Select
                                    value={transferDraft.siteId || ''}
                                    disabled={assignMutation.isPending || !canEditAssignments}
                                    onValueChange={(value) =>
                                      setTransferDrafts((current) => ({
                                        ...current,
                                        [worker.id]: { ...transferDraft, siteId: value },
                                      }))
                                    }
                                  >
                                    <SelectTrigger className="w-full">
                                      <SelectValue placeholder={t.staffingPage.selectTransferSite} />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {renderSiteOptions(targetSites)}
                                    </SelectContent>
                                  </Select>
                                </div>
                              </div>

                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <p className="text-xs text-muted-foreground">{t.staffingPage.transferFieldsHint}</p>
                                <Button
                                  size="sm"
                                  disabled={
                                    assignMutation.isPending || !canEditAssignments || !transferDraft.groupId || !transferDraft.siteId
                                  }
                                  onClick={() => void saveTransfer(worker, transferDraft)}
                                >
                                  {t.staffingPage.saveTransfer}
                                </Button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}

        <Dialog open={quickDialogOpen} onOpenChange={handleQuickDialogOpenChange}>
          <DialogContent className="max-h-[calc(100dvh-1rem)] grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden p-0 sm:max-h-[90vh] sm:max-w-lg">
            <DialogHeader className="shrink-0 px-5 pt-5 pb-3 border-b">
              <DialogTitle className="text-lg">
                {selectedQuickGroup ? displayName(selectedQuickGroup.name) : t.staffingPage.quickSelectGroupTitle}
              </DialogTitle>
              <DialogDescription>
                {workDate}
              </DialogDescription>
            </DialogHeader>

            <div className="min-h-0 overflow-y-auto overscroll-contain px-5 py-4">
              {loadingWorkers ? (
                <div className="py-10 text-center text-muted-foreground">{t.staffingPage.loading}</div>
              ) : quickCompletedVisible ? (
                <div className="py-10 text-center space-y-4">
                  <CheckCircle2 className="h-14 w-14 mx-auto text-green-600" />
                  <div className="space-y-1">
                    <div className="text-xl font-bold">{t.staffingPage.quickGroupCompleted}</div>
                    <p className="text-sm text-muted-foreground">{t.staffingPage.quickGroupCompletedTwoSeconds}</p>
                  </div>
                </div>
              ) : quickTotalWorkers === 0 ? (
                <div className="py-10 text-center space-y-4">
                  <Users className="h-12 w-12 mx-auto text-muted-foreground" />
                  <p className="text-muted-foreground">{t.staffingPage.noPresentWorkers}</p>
                  <Button variant="outline" onClick={() => handleQuickDialogOpenChange(false)}>
                    {t.staffingPage.quickClose}
                  </Button>
                </div>
              ) : !quickCurrentWorker ? (
                <div className="py-10 text-center space-y-4">
                  <CheckCircle2 className="h-14 w-14 mx-auto text-green-600" />
                  <div className="space-y-1">
                    <div className="text-xl font-bold">{t.staffingPage.quickGroupCompleted}</div>
                    <p className="text-sm text-muted-foreground">
                      {quickTotalWorkers}/{quickTotalWorkers} {t.staffingPage.quickAssignedShort}
                    </p>
                  </div>
                  <Button variant="outline" onClick={() => handleQuickDialogOpenChange(false)}>
                    {t.staffingPage.quickClose}
                  </Button>
                </div>
              ) : (
                <div className="space-y-5">
                  <div className="text-center space-y-2">
                    <div className="text-xs text-muted-foreground">
                      {t.staffingPage.quickWorkerStep} {quickAssignedWorkers + 1} {t.staffingPage.quickOf} {quickTotalWorkers}
                    </div>
                    <div className="text-2xl font-bold leading-tight">{displayName(quickCurrentWorker.fullName)}</div>
                  </div>

                  <div className="space-y-3">
                    <Label className="text-base font-semibold">{t.staffingPage.quickChooseSite}</Label>
                    {!sourceSites.length ? (
                      <div className="rounded-lg border border-dashed p-5 text-center text-sm text-muted-foreground">
                        {t.staffingPage.quickNoSites}
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 gap-2">
                        {sourceSites.map((site: any) => {
                          const selected = quickSelectedSiteId === String(site.id);
                          return (
                            <Button
                              key={site.id}
                              type="button"
                              variant={selected ? 'default' : 'outline'}
                              className="min-h-12 h-auto px-3 py-3 whitespace-normal leading-snug"
                              disabled={assignMutation.isPending || !canEditAssignments}
                              onClick={() => setQuickSelectedSiteId(String(site.id))}
                            >
                              {displayName(site.name)}
                            </Button>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {!canEditAssignments && (
                    <p className="text-xs text-center text-muted-foreground">{t.staffingPage.dayViewOnlyHint}</p>
                  )}
                </div>
              )}
            </div>

            {!loadingWorkers && !quickCompletedVisible && quickCurrentWorker && (
              <DialogFooter className="shrink-0 px-5 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] border-t bg-background">
                <Button
                  className="w-full min-h-12 text-base"
                  onClick={() => void saveQuickAssignment()}
                  disabled={!quickSelectedSiteId || assignMutation.isPending || !canEditAssignments}
                >
                  {assignMutation.isPending ? t.staffingPage.loading : t.staffingPage.quickSaveNext}
                </Button>
              </DialogFooter>
            )}
          </DialogContent>
        </Dialog>

        <Dialog open={reviewDialogOpen} onOpenChange={setReviewDialogOpen}>
          <DialogContent className="sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>{t.staffingPage.reviewAdminChangesTitle}</DialogTitle>
              <DialogDescription>{t.staffingPage.reviewAdminChangesDescription}</DialogDescription>
            </DialogHeader>
            <div className="max-h-[60vh] overflow-y-auto space-y-3 pe-1">
              {(dayStatus?.pendingChanges || []).map((change: any) => (
                <div key={change.id} className="rounded-md border p-3 space-y-1.5">
                  <div className="font-medium">
                    {displayName(change.workerName || t.staffingPage.unknownWorker)}
                    {change.workerCode ? ` (${change.workerCode})` : ''}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {t.staffingPage.modifiedBy}: {displayName(change.actorName || '-')}
                    {change.createdAt ? ` — ${String(change.createdAt)}` : ''}
                  </div>
                  <div className="text-sm space-y-1">
                    {getChangeLines(change).map((line, index) => (
                      <div key={`${change.id}-${index}`}>{line}</div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button variant="outline" onClick={() => setReviewDialogOpen(false)}>
                {t.staffingPage.cancel}
              </Button>
              <Button
                onClick={() => selectedCostCenterId && closeDayMutation.mutate({ workDate, costCenterId: selectedCostCenterId, acknowledgeChanges: true })}
                disabled={closeDayMutation.isPending}
              >
                <LockKeyhole className="h-4 w-4 me-2" />
                {t.staffingPage.reviewAndCloseOperationalDay}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={reopenDialogOpen} onOpenChange={setReopenDialogOpen}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>{t.staffingPage.reopenOperationalDay}</DialogTitle>
              <DialogDescription>{t.staffingPage.reopenOperationalDayDescription}</DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <Label>{t.staffingPage.reopenReason}</Label>
              <Input
                value={reopenReason}
                onChange={(event) => setReopenReason(event.target.value)}
                placeholder={t.staffingPage.reopenReasonPlaceholder}
                maxLength={500}
              />
            </div>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button variant="outline" onClick={() => setReopenDialogOpen(false)}>
                {t.staffingPage.cancel}
              </Button>
              <Button onClick={submitReopen} disabled={reopenDayMutation.isPending}>
                <RotateCcw className="h-4 w-4 me-2" />
                {t.staffingPage.confirmReopen}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}

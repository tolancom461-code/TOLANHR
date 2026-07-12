import { useState } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { useLanguage } from '@/contexts/LanguageContext';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ClipboardList, UtensilsCrossed, CheckCircle2, X } from 'lucide-react';
import { toast } from 'sonner';

export default function Operations() {
  const { t } = useLanguage();
  const today = new Date().toLocaleDateString('en-CA');
  const [workDate, setWorkDate] = useState(today);
  const [costCenterId, setCostCenterId] = useState('');
  const [groupId, setGroupId] = useState('');

  const utils = trpc.useUtils();

  const { data: costCenters } = trpc.costCenters.list.useQuery();
  const { data: costCenterGroups } = trpc.groups.listByCostCenter.useQuery(
    { costCenterId: costCenterId ? parseInt(costCenterId) : undefined },
    { enabled: !!costCenterId }
  );
  const { data: restaurantsList } = trpc.restaurants.list.useQuery({ includeInactive: false });

  const { data: groupWorkers, isLoading: loadingWorkers } = trpc.restaurants.getWorkersForAssignment.useQuery(
    { groupId: groupId ? parseInt(groupId) : 0, workDate },
    { enabled: !!groupId && !!workDate }
  );

  const assignMutation = trpc.restaurants.assignWorker.useMutation({
    onSuccess: () => {
      utils.restaurants.getWorkersForAssignment.invalidate({ groupId: parseInt(groupId), workDate });
    },
    onError: (error) => toast.error(`خطأ: ${error.message}`),
  });

  const removeMutation = trpc.restaurants.removeAssignment.useMutation({
    onSuccess: () => {
      utils.restaurants.getWorkersForAssignment.invalidate({ groupId: parseInt(groupId), workDate });
    },
    onError: (error) => toast.error(`خطأ: ${error.message}`),
  });

  const handleAssign = (workerId: number, restaurantId: string) => {
    if (!restaurantId) {
      removeMutation.mutate({ workerId, workDate });
      return;
    }
    assignMutation.mutate({ workerId, restaurantId: parseInt(restaurantId), workDate });
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ClipboardList className="h-6 w-6" />
            {t.staffingPage.title}
          </h1>
          <p className="text-muted-foreground">
            {t.staffingPage.subtitle}
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t.staffingPage.dateAndGroupCard}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>{t.staffingPage.date}</Label>
                <input
                  type="date"
                  className="border rounded px-3 py-2 text-sm w-full bg-background"
                  value={workDate}
                  onChange={(e) => setWorkDate(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label>{t.staffingPage.costCenter}</Label>
                <Select
                  value={costCenterId}
                  onValueChange={(value) => {
                    setCostCenterId(value);
                    setGroupId('');
                  }}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder={t.staffingPage.selectCostCenter} />
                  </SelectTrigger>
                  <SelectContent>
                    {costCenters?.map((cc: any) => (
                      <SelectItem key={cc.id} value={String(cc.id)}>
                        {cc.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>{t.staffingPage.group}</Label>
                <Select value={groupId} onValueChange={setGroupId} disabled={!costCenterId}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder={costCenterId ? t.staffingPage.selectGroup : t.staffingPage.selectCostCenterFirst} />
                  </SelectTrigger>
                  <SelectContent>
                    {costCenterGroups?.map((g: any) => (
                      <SelectItem key={g.id} value={String(g.id)}>
                        {g.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {groupId && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <UtensilsCrossed className="h-5 w-5" />
                {t.staffingPage.groupWorkersCard} — {workDate}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loadingWorkers ? (
                <div className="text-center py-8 text-muted-foreground">{t.staffingPage.loading}</div>
              ) : !groupWorkers?.length ? (
                <div className="text-center py-8 text-muted-foreground">{t.staffingPage.noPresentWorkers}</div>
              ) : (
                <div className="space-y-2">
                  {groupWorkers.map((worker: any) => (
                    <div
                      key={worker.id}
                      className="flex items-center justify-between gap-3 p-3 rounded-lg border bg-muted/30"
                    >
                      <div className="flex items-center gap-2 min-w-[200px]">
                        {worker.currentRestaurantId ? (
                          <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
                        ) : (
                          <X className="h-4 w-4 text-muted-foreground shrink-0" />
                        )}
                        <span className="font-medium">{worker.fullName}</span>
                        <span className="text-xs text-muted-foreground">({worker.code})</span>
                      </div>
                      <Select
                        value={worker.currentRestaurantId ? String(worker.currentRestaurantId) : 'none'}
                        onValueChange={(value) => handleAssign(worker.id, value === 'none' ? '' : value)}
                      >
                        <SelectTrigger className="w-[220px]">
                          <SelectValue placeholder={t.staffingPage.selectRestaurant} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">{t.staffingPage.noAssignment}</SelectItem>
                          {restaurantsList?.map((r: any) => (
                            <SelectItem key={r.id} value={String(r.id)}>
                              {r.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}

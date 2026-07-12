import { useState } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { useLanguage } from '@/contexts/LanguageContext';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import {
  UtensilsCrossed,
  Plus,
  Pencil,
  Trash2,
  RefreshCw,
  Search,
  Power,
} from 'lucide-react';
import { toast } from 'sonner';

export default function RestaurantsManagement() {
  const { t } = useLanguage();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [selectedRestaurant, setSelectedRestaurant] = useState<any>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [name, setName] = useState('');

  const { data: restaurantsList, refetch } = trpc.restaurants.list.useQuery({ includeInactive: true });

  const createMutation = trpc.restaurants.create.useMutation({
    onSuccess: () => {
      toast.success(t.restaurantsPage.createSuccess);
      refetch();
      setShowCreateDialog(false);
      setName('');
    },
    onError: (error) => toast.error(error.message || t.restaurantsPage.genericError),
  });

  const updateMutation = trpc.restaurants.update.useMutation({
    onSuccess: () => {
      toast.success(t.restaurantsPage.updateSuccess);
      refetch();
      setShowEditDialog(false);
      setSelectedRestaurant(null);
      setName('');
    },
    onError: (error) => toast.error(error.message || t.restaurantsPage.genericError),
  });

  const deleteMutation = trpc.restaurants.delete.useMutation({
    onSuccess: (data) => {
      toast.success(data.softDeleted ? t.restaurantsPage.deactivateSuccess : t.restaurantsPage.deleteSuccess);
      refetch();
    },
    onError: (error) => toast.error(error.message || t.restaurantsPage.genericError),
  });

  const handleCreate = () => {
    if (!name.trim()) {
      toast.error(t.restaurantsPage.nameRequired);
      return;
    }
    createMutation.mutate({ name });
  };

  const handleEdit = (restaurant: any) => {
    setSelectedRestaurant(restaurant);
    setName(restaurant.name);
    setShowEditDialog(true);
  };

  const handleUpdate = () => {
    if (!selectedRestaurant || !name.trim()) {
      toast.error(t.restaurantsPage.nameRequired);
      return;
    }
    updateMutation.mutate({ id: selectedRestaurant.id, name });
  };

  const handleToggleActive = (restaurant: any) => {
    updateMutation.mutate({ id: restaurant.id, isActive: !restaurant.isActive });
  };

  const handleDelete = (id: number, name: string) => {
    if (confirm(`${t.restaurantsPage.confirmDelete} "${name}"؟`)) {
      deleteMutation.mutate({ id });
    }
  };

  const filteredRestaurants = restaurantsList?.filter((r: any) =>
    r.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <UtensilsCrossed className="h-6 w-6" />
              {t.restaurantsPage.title}
            </h1>
            <p className="text-muted-foreground">
              {t.restaurantsPage.subtitle}
            </p>
          </div>
          <Button onClick={() => setShowCreateDialog(true)}>
            <Plus className="h-4 w-4 ml-2" />
            {t.restaurantsPage.addRestaurant}
          </Button>
        </div>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Search className="h-5 w-5 text-muted-foreground" />
              <Input
                placeholder={t.restaurantsPage.searchPlaceholder}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="max-w-md"
              />
              <Button variant="outline" size="icon" onClick={() => refetch()}>
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t.restaurantsPage.listTitle}</CardTitle>
            <CardDescription>{filteredRestaurants?.length || 0} {t.restaurantsPage.restaurantCount}</CardDescription>
          </CardHeader>
          <CardContent>
            {!filteredRestaurants?.length ? (
              <div className="text-center py-8">
                <UtensilsCrossed className="h-12 w-12 mx-auto text-muted-foreground opacity-50" />
                <p className="mt-2 text-muted-foreground">{t.restaurantsPage.emptyState}</p>
                <Button variant="outline" className="mt-4" onClick={() => setShowCreateDialog(true)}>
                  <Plus className="h-4 w-4 ml-2" />
                  {t.restaurantsPage.addFirstRestaurant}
                </Button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-right">{t.restaurantsPage.nameColumn}</TableHead>
                      <TableHead className="text-right">{t.restaurantsPage.statusColumn}</TableHead>
                      <TableHead className="text-right">{t.restaurantsPage.actionsColumn}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredRestaurants.map((r: any) => (
                      <TableRow key={r.id}>
                        <TableCell className="font-medium">{r.name}</TableCell>
                        <TableCell>
                          {r.isActive ? (
                            <Badge className="bg-green-100 text-green-800">{t.restaurantsPage.active}</Badge>
                          ) : (
                            <Badge className="bg-gray-100 text-gray-800">{t.restaurantsPage.inactive}</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Button variant="outline" size="sm" onClick={() => handleEdit(r)}>
                              <Pencil className="h-4 w-4 ml-1" />
                              {t.restaurantsPage.edit}
                            </Button>
                            <Button variant="outline" size="sm" onClick={() => handleToggleActive(r)}>
                              <Power className="h-4 w-4 ml-1" />
                              {r.isActive ? t.restaurantsPage.deactivate : t.restaurantsPage.activate}
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleDelete(r.id, r.name)}
                              className="text-destructive hover:text-destructive"
                            >
                              <Trash2 className="h-4 w-4 ml-1" />
                              {t.restaurantsPage.delete}
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t.restaurantsPage.addDialogTitle}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>{t.restaurantsPage.nameLabel}</Label>
              <Input placeholder={t.restaurantsPage.namePlaceholder} value={name} onChange={(e) => setName(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
              {t.restaurantsPage.cancel}
            </Button>
            <Button onClick={handleCreate} disabled={createMutation.isPending}>
              {createMutation.isPending ? (
                <RefreshCw className="h-4 w-4 animate-spin ml-2" />
              ) : (
                <Plus className="h-4 w-4 ml-2" />
              )}
              {t.restaurantsPage.add}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t.restaurantsPage.editDialogTitle}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>{t.restaurantsPage.nameLabel}</Label>
              <Input placeholder={t.restaurantsPage.namePlaceholder} value={name} onChange={(e) => setName(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditDialog(false)}>
              {t.restaurantsPage.cancel}
            </Button>
            <Button onClick={handleUpdate} disabled={updateMutation.isPending}>
              {updateMutation.isPending ? (
                <RefreshCw className="h-4 w-4 animate-spin ml-2" />
              ) : (
                <Pencil className="h-4 w-4 ml-2" />
              )}
              {t.restaurantsPage.update}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}

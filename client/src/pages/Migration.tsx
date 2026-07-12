import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, CheckCircle, XCircle } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

export default function Migration() {
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);

  const migrationMutation = trpc.migration.addFlexibleScheduleColumns.useMutation({
    onSuccess: (data) => {
      setResult(data);
      toast.success(data.message);
    },
    onError: (error: any) => {
      setResult({ success: false, message: error.message });
      toast.error(error.message);
    },
  });

  return (
    <div className="container mx-auto p-6">
      <Card>
        <CardHeader>
          <CardTitle>Database Migration</CardTitle>
          <CardDescription>
            Add flexible schedule columns to groups table
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button
            onClick={() => migrationMutation.mutate()}
            disabled={migrationMutation.isPending}
          >
            {migrationMutation.isPending && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            Run Migration
          </Button>

          {result && (
            <Alert variant={result.success ? "default" : "destructive"}>
              {result.success ? (
                <CheckCircle className="h-4 w-4" />
              ) : (
                <XCircle className="h-4 w-4" />
              )}
              <AlertDescription>{result.message}</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

import React from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { httpBatchLink } from '@trpc/client';
import superjson from 'superjson';
import { Toaster } from 'sonner';
import { trpc } from '../../client/src/lib/trpc';
import WorkerBiometricLinkPicker from '../../client/src/components/WorkerBiometricLinkPicker';

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
const client = trpc.createClient({ links: [httpBatchLink({ url: '/api/trpc', transformer: superjson })] });
createRoot(document.getElementById('root')!).render(<trpc.Provider client={client} queryClient={queryClient}><QueryClientProvider client={queryClient}>
  <main dir="rtl" className="min-h-screen bg-background p-5 text-foreground"><div className="mx-auto max-w-3xl space-y-5">
    <header className="rounded-lg border bg-muted/20 p-5"><p className="text-sm text-muted-foreground">معاينة محلية ببيانات اصطناعية</p><h1 className="mt-2 text-2xl font-bold">تعديل العامل</h1><p>عامل تجريبي — DEMO-W1</p></header>
    <WorkerBiometricLinkPicker workerId={1} workerName="عامل تجريبي" value={{ personCode: 'LEGACY-DEMO', displayName: 'ربط سابق' }} currentPersonCode="LEGACY-DEMO" onChange={() => {}} />
  </div></main><Toaster richColors />
</QueryClientProvider></trpc.Provider>);

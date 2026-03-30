'use client';

import { useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertCircle } from 'lucide-react';

interface ErrorBoundaryWrapperProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export function ErrorBoundaryWrapper({ error, reset }: ErrorBoundaryWrapperProps) {
  useEffect(() => {
    console.error('Iron Log Error Boundary:', error);
  }, [error]);

  return (
    <div className="page-enter space-y-4">
      <Card className="border-red-200 bg-red-50/30">
        <CardContent className="flex gap-4 p-6">
          <AlertCircle className="h-6 w-6 text-red-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <h2 className="text-lg font-semibold text-red-900">Oops! Errore nel caricamento</h2>
            <p className="mt-2 text-sm text-red-800 leading-relaxed">
              {error.message || 'Si è verificato un errore imprevisto. Prova a ricaricare la pagina.'}
            </p>
            <div className="mt-4 flex gap-2">
              <Button onClick={reset} className="bg-red-600 hover:bg-red-700 text-white">Riprova</Button>
              <Button variant="outline" onClick={() => window.location.href = '/'}>Torna alla home</Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

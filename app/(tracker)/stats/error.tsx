'use client';

import { ErrorBoundaryWrapper } from '@/components/error-boundary-wrapper';

export default function StatsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <ErrorBoundaryWrapper error={error} reset={reset} />;
}

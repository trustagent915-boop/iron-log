import { Card, CardContent, CardHeader } from "@/components/ui/card";

export function LoadingPanel({ message = "Caricamento..." }: { message?: string }) {
  return (
    <Card className="animate-fade-in overflow-hidden">
      <CardHeader><div className="h-4 w-32 rounded-full bg-muted/80" /></CardHeader>
      <CardContent><p className="text-sm text-muted-foreground">{message}</p></CardContent>
    </Card>
  );
}

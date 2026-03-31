import { Card, CardContent, CardHeader } from "@/components/ui/card";

export function LoadingPanel({ message = "Caricamento workspace Iron Log..." }: { message?: string }) {
  return (
    <Card className="animate-fade-in overflow-hidden">
      <CardHeader className="space-y-3">
        <div className="h-4 w-32 rounded-full bg-muted/80" />
        <div className="h-10 w-2/3 rounded-full bg-muted/70" />
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="h-4 w-full rounded-full bg-muted/70" />
        <div className="h-4 w-5/6 rounded-full bg-muted/60" />
        <p className="pt-2 text-sm text-muted-foreground">{message}</p>
      </CardContent>
    </Card>
  );
}

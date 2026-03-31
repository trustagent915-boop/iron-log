import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl items-center px-4">
      <Card className="w-full">
        <CardHeader>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">404</p>
          <CardTitle className="text-3xl">Pagina non trovata</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-muted-foreground">
          <p>Il percorso che hai aperto non esiste o non è più disponibile.</p>
          <Button asChild>
            <Link href="/">Torna alla dashboard</Link>
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}

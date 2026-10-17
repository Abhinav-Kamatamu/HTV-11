import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 p-8 text-center">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Undertow</h1>
        <p className="mt-2 text-muted-foreground">
          Choose how to view the synthetic demo data.
        </p>
      </div>
      <div className="flex gap-3">
        <Button size="lg" render={<Link href="/queue">Clinician</Link>} />
        <Button
          variant="outline"
          size="lg"
          render={<Link href="/home">Patient</Link>}
        />
      </div>
    </main>
  );
}

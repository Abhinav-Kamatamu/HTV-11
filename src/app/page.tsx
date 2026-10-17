import Link from "next/link";
import { ArrowRight, HeartPulse, Stethoscope } from "lucide-react";

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center gap-8 px-5 py-10 sm:py-16">
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2 text-primary">
          <HeartPulse className="size-6" />
          <span className="text-xl font-semibold tracking-tight">Ripple</span>
        </div>
        <h1 className="text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">
          Each result looked normal. The trend didn&apos;t.
        </h1>
        <p className="text-base leading-relaxed text-muted-foreground sm:text-lg">
          Ripple helps care teams spot slow-building health risks early, and keeps patients
          in the loop once a clinician has reviewed what it found.
        </p>
      </div>

      <div className="flex flex-col gap-3">
        <p className="text-sm font-medium text-muted-foreground">Who is looking today?</p>
        <Link
          href="/queue"
          className="group flex items-center gap-4 rounded-2xl border border-border bg-card p-5 shadow-sm transition-colors hover:border-primary/40 hover:bg-accent/40"
        >
          <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Stethoscope className="size-6" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-lg font-semibold">I&apos;m a clinician</span>
            <span className="block text-sm text-muted-foreground">See which patients to look at first, and why.</span>
          </span>
          <ArrowRight className="size-5 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
        </Link>
        <Link
          href="/home"
          className="group flex items-center gap-4 rounded-2xl border border-border bg-card p-5 shadow-sm transition-colors hover:border-primary/40 hover:bg-accent/40"
        >
          <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-secondary text-secondary-foreground">
            <HeartPulse className="size-6" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-lg font-semibold">I&apos;m a patient</span>
            <span className="block text-sm text-muted-foreground">Log how you feel and hear from your care team.</span>
          </span>
          <ArrowRight className="size-5 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
        </Link>
      </div>

      <p className="text-xs text-muted-foreground">
        Demo only. Every person shown here is synthetic, and nothing on this site is medical advice.
      </p>
    </main>
  );
}

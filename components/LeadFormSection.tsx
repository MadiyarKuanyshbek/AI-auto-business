import LeadForm from "./LeadForm";
import Reveal from "./Reveal";

export default function LeadFormSection() {
  return (
    <section id="lead-form" className="py-20">
      <div className="mx-auto max-w-lg px-6">
        <Reveal>
          <h2 className="text-center font-display text-3xl font-bold tracking-tight sm:text-4xl">
            Оставьте заявку на демо
          </h2>
          <p className="mt-4 text-center text-muted">
            Расскажем, как это будет работать именно в вашем бизнесе — без
            обязательств.
          </p>
        </Reveal>
        <Reveal delay={100} className="mt-8">
          <LeadForm />
        </Reveal>
      </div>
    </section>
  );
}

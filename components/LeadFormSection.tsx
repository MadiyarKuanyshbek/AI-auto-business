import LeadForm from "./LeadForm";

export default function LeadFormSection() {
  return (
    <section id="lead-form" className="py-20">
      <div className="mx-auto max-w-lg px-6">
        <h2 className="text-center font-display text-3xl font-bold tracking-tight sm:text-4xl">
          Оставьте заявку на демо
        </h2>
        <p className="mt-4 text-center text-muted">
          Расскажем, как это будет работать именно в вашем бизнесе — без
          обязательств.
        </p>
        <div className="mt-8">
          <LeadForm />
        </div>
      </div>
    </section>
  );
}

const problems = [
  {
    title: "Пропущенные звонки",
    description:
      "Пока администратор занят с клиентом, новые заявки уходят к конкурентам — просто потому что никто не взял трубку.",
  },
  {
    title: "No-show клиентов",
    description:
      "Клиент забыл про запись — время мастера и слот в расписании потеряны без возможности продать его кому-то ещё.",
  },
  {
    title: "Время администратора",
    description:
      "Часы уходят на однотипные ответы: «сколько стоит», «когда свободно», «как записаться» — вместо работы с реальными клиентами.",
  },
];

export default function ProblemSection() {
  return (
    <section className="bg-background-alt py-20">
      <div className="mx-auto max-w-6xl px-6">
        <h2 className="text-center font-display text-3xl font-bold tracking-tight sm:text-4xl">
          Знакомые проблемы?
        </h2>
        <div className="mt-12 grid gap-6 sm:grid-cols-3">
          {problems.map((p) => (
            <div key={p.title} className="rounded-2xl border border-border bg-surface p-6">
              <h3 className="text-lg font-semibold">{p.title}</h3>
              <p className="mt-2 text-sm text-muted">
                {p.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

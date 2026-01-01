import { Container } from "@/components/ui/container";
import { AppCard } from "@/components/app-ui/app-card";

type Person = {
  seed: string;
  name: string;
  role: string;
};

const people: Person[] = [
  { seed: "Tim", name: "Tim", role: "Ex-Banx Founder" },
  { seed: "Mike", name: "Mike", role: "Partner at NPV" },
  { seed: "Nate", name: "Nate", role: "Ex-Samsung R&D" },
  { seed: "Matt", name: "Matt", role: "Ex-Derive / Kwenta" }
];

export function Team() {
  return (
    <section id="team" className="px-4 py-24">
      <Container className="px-0 sm:px-6">
        <h2 className="mb-12 text-center text-4xl font-semibold tracking-tight text-white md:text-5xl">
          THE BUILDERS
        </h2>

        <div className="grid grid-cols-2 gap-6 md:grid-cols-4">
          {people.map((p) => (
            <AppCard key={p.seed} className="group border-white/10 bg-white/5 p-4 text-center">
              <div className="relative mb-4 aspect-square w-full overflow-hidden rounded-xl border border-white/10 bg-black/20">
                <img
                  src={`https://api.dicebear.com/7.x/pixel-art/svg?seed=${encodeURIComponent(
                    p.seed
                  )}`}
                  alt={p.name}
                  className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-110"
                />
              </div>
              <h4 className="text-base font-semibold text-white">{p.name}</h4>
              <p className="mt-2 border-t border-white/10 pt-2 text-xs font-semibold text-white/55">
                {p.role}
              </p>
            </AppCard>
          ))}
        </div>
      </Container>
    </section>
  );
}



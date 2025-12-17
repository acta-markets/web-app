import { Card } from "@/components/ui/card";
import { Container } from "@/components/ui/container";

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
        <h2 className="mb-12 inline-block -rotate-2 border-4 border-black bg-yuzu-main px-4 text-center text-5xl font-black shadow-neo">
          THE BUILDERS
        </h2>

        <div className="grid grid-cols-2 gap-6 md:grid-cols-4">
          {people.map((p) => (
            <Card key={p.seed} className="group bg-white p-4 text-center">
              <div className="relative mb-4 aspect-square w-full overflow-hidden border-2 border-black bg-gray-200">
                <img
                  src={`https://api.dicebear.com/7.x/pixel-art/svg?seed=${encodeURIComponent(
                    p.seed
                  )}`}
                  alt={p.name}
                  className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-110"
                />
              </div>
              <h4 className="text-xl font-black uppercase">{p.name}</h4>
              <p className="mt-2 border-t-2 border-black pt-2 text-sm font-bold text-gray-500">
                {p.role}
              </p>
            </Card>
          ))}
        </div>
      </Container>
    </section>
  );
}



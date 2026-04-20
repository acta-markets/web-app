import { redirect } from "next/navigation";

export default function HomePage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const rawRef = searchParams?.ref;
  const ref = Array.isArray(rawRef) ? rawRef[0] : rawRef;
  const target = ref ? `/earn?ref=${encodeURIComponent(ref)}` : "/earn";
  redirect(target);
}




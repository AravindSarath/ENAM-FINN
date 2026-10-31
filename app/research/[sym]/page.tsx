import Dossier from "@/components/Dossier";

export default async function DossierPage(props: PageProps<"/research/[sym]">) {
  const { sym } = await props.params;
  const { from } = await props.searchParams;
  const clean = decodeURIComponent(sym).toUpperCase().replace(/[^A-Z0-9&-]/g, "").slice(0, 20);
  return <Dossier key={clean} sym={clean} from={typeof from === "string" ? from.slice(0, 160) : undefined} />;
}

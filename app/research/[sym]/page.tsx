import Dossier from "@/components/Dossier";
import { buildDossierView } from "@/lib/data/dossier";
import { loadFilingFacts, loadFundamentals, loadUniverse } from "@/lib/data/load";
import { pctChange } from "@/lib/data/derive";

export default async function DossierPage(props: PageProps<"/research/[sym]">) {
  const { sym } = await props.params;
  const { from } = await props.searchParams;
  const clean = decodeURIComponent(sym).toUpperCase().replace(/[^A-Z0-9&-]/g, "").slice(0, 20);

  const u = loadUniverse().find((x) => x.symbol === clean);
  const fund = u ? loadFundamentals(clean) : null;
  const view = u && fund ? buildDossierView(u, fund) : null;

  const facts = u ? loadFilingFacts(clean) : null;
  const reportedRevYoY = facts ? pctChange(facts.revenueFromOperations[0], facts.revenueFromOperations[2]) : null;

  return <Dossier key={clean} reportedRevYoY={reportedRevYoY} sym={clean} from={typeof from === "string" ? from.slice(0, 160) : undefined} view={view} />;
}

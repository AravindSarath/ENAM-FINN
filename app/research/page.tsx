import ResearchHome from "@/components/ResearchHome";
import { loadUniverse } from "@/lib/data/load";

export default function ResearchPage() {
  const u = loadUniverse();
  const pick = (g: "portfolio" | "research") => u.filter((x) => x.group === g).map((x) => ({ sym: x.symbol, name: x.name }));
  return <ResearchHome index={{ portfolio: pick("portfolio"), research: pick("research") }} />;
}

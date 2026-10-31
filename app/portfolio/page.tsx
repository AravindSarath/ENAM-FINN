import Portfolio from "@/components/Portfolio";
import { loadBrief } from "@/lib/data/view";

export default function PortfolioPage() {
  return <Portfolio data={loadBrief()} />;
}

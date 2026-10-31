import Brief from "@/components/Brief";
import { loadBrief } from "@/lib/data/view";

export default function Home() {
  return <Brief data={loadBrief()} />;
}

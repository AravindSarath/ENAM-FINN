import Alerts from "@/components/Alerts";
import { loadBrief } from "@/lib/data/view";

export default function AlertsPage() {
  return <Alerts data={loadBrief()} />;
}

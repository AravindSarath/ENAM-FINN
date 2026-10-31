/**
 * SAMPLE CONTENT. Only what has no verified real equivalent yet lives here; everything else on screen comes
 * from the committed snapshots in data/. Items below are flagged `sample: true` and render with a "Sample" tag.
 */
import type { FeedItem } from "./types";

export const SAMPLE_ITEMS: FeedItem[] = [
  {
    id: "sample-mgmt-kpit",
    sym: "KPITTECH",
    cat: "management_change",
    title: "Chief Financial Officer steps down; successor appointed",
    hoursAgo: 9,
    tier: "act",
    why: "Management change · CFO is a top-tier role. Illustrative card: the bio enrichment needs the LLM stage",
    soWhat: "Shows how a management change will read, with the incoming person's background.",
    kind: "mgmt",
    sample: true,
    mgmt: {
      role: "Chief Financial Officer",
      outgoing: "R. Iyer",
      incoming: "S. Banerjee",
      bio: [
        "Finance leader with two decades across IT services and engineering R&D.",
        "Most recently CFO of a mid-cap technology services company.",
        "Chartered accountant; previously led investor relations and M&A integration.",
      ],
    },
  },
];

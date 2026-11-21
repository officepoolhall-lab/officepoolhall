import type { Metadata } from "next";
import { getGolfContext, golfFormat, missedPickRule } from "@/lib/golf";
import { isSingleTournament, majorsSettings } from "@/lib/golfMajors";
import { saveGolfSettings, saveMajorsSettings } from "../actions";
import { MajorsSettings, OneAndDoneSettings, type MajorsFormSettings } from "./GolfSettingsForms";

export const metadata: Metadata = { title: "Pool settings" };

/** A golf pool's name, entry fee and rules: One-and-Done, or a Majors / single-tournament pool. */
export default async function GolfSettingsPage({ params }: PageProps<"/p/[slug]/golf/admin/settings">) {
  const { slug } = await params;
  const ctx = await getGolfContext(slug);
  const name = ctx.pool.name;
  const fee = Number(ctx.pool.entry_fee);
  if (golfFormat(ctx.pool) === "majors") {
    const s = majorsSettings(ctx.pool.settings);
    const form: MajorsFormSettings = {
      contest: s.contest,
      omit: s.omit,
      standings: s.standings,
      tiers: { count: s.tiers.count, counting: s.tiers.counting, sizes: s.tiers.sizes, picks: s.tiers.picks, scoring: s.tiers.scoring, source: s.tiers.source, rankWeight: s.tiers.rankWeight },
      salary: { budget: s.salary.budget, roster: s.salary.roster, rankWeight: s.salary.rankWeight, source: s.salary.source },
    };
    return <MajorsSettings action={saveMajorsSettings.bind(null, slug)} name={name} fee={fee} s={form} single={isSingleTournament(ctx.pool.settings)} />;
  }
  return <OneAndDoneSettings action={saveGolfSettings.bind(null, slug)} name={name} fee={fee} missed={missedPickRule(ctx.pool) === "lowest" ? "lowest" : "zero"} />;
}

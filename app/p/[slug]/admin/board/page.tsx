import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionButton } from "@/components/ActionButton";
import { ActionForm, SubmitButton } from "@/components/ActionForm";
import { SettingRow, SettingsSection, settingInput } from "@/components/SettingsUI";
import { poolFormat } from "@/lib/formats";
import { requireCommissioner } from "@/lib/pool";
import { QUARTERS } from "@/lib/squares";
import { getSquares } from "@/lib/squaresData";
import { drawSquares, saveSquaresBoard } from "../../formats/actions";

export const metadata: Metadata = { title: "Board" };

/**
 * A Squares pool's board, for the commissioner: the two teams and the game, drawing the
 * numbers, the quarter scores (when ESPN's aren't used), and taking squares for a player.
 */
export default async function SquaresBoardAdminPage({ params }: PageProps<"/p/[slug]/admin/board">) {
  const { slug } = await params;
  const ctx = await requireCommissioner(slug);
  if (poolFormat(ctx.pool.settings) !== "squares") notFound();
  const { board, claims, members, scores } = await getSquares(ctx);
  const taken = claims.size;
  const num = `${settingInput} w-20 text-center tabular-nums`;

  return (
    <div className="space-y-4">
      <SettingsSection
        title="The numbers"
        description={
          board.drawn
            ? "The numbers are drawn and the board is locked: nobody can take or give back a square."
            : `${taken} of 100 squares are taken. Draw the numbers when the board is ready; that locks it.`
        }
      >
        <div className="flex flex-wrap items-center gap-3 py-3">
          {board.drawn ? (
            <>
              <span className="text-sm text-muted tabular-nums">
                {board.homeName}: {board.colDigits?.join(" ")} · {board.awayName}: {board.rowDigits?.join(" ")}
              </span>
              <ActionButton action={drawSquares.bind(null, slug, true)} kind="danger" pendingLabel="Clearing…">
                Clear the numbers and reopen the board
              </ActionButton>
            </>
          ) : (
            <ActionButton action={drawSquares.bind(null, slug, false)} kind="accent" pendingLabel="Drawing…">
              Draw the numbers
            </ActionButton>
          )}
        </div>
        {!board.drawn && taken < 100 && (
          <p className="pb-3 text-xs text-muted">{100 - taken} squares are still open. You can draw anyway; an open square that wins pays nobody.</p>
        )}
      </SettingsSection>

      <ActionForm action={saveSquaresBoard.bind(null, slug)} className="space-y-4">
        <SettingsSection title="The game" description="The teams on the board. Use the conference names until the matchup is set.">
          <SettingRow label="Across the top (home team)">
            <input name="home_name" aria-label="Home team" required maxLength={30} defaultValue={board.homeName} className={`${settingInput} w-full sm:w-56`} />
          </SettingRow>
          <SettingRow label="Down the side (away team)">
            <input name="away_name" aria-label="Away team" required maxLength={30} defaultValue={board.awayName} className={`${settingInput} w-full sm:w-56`} />
          </SettingRow>
          <SettingRow label="ESPN game id" hint="Optional. The number in the game's ESPN link (…/gameId/401772988). With it, quarter scores and winners fill in by themselves.">
            <input name="game_espn_id" aria-label="ESPN game id" inputMode="numeric" defaultValue={board.gameEspnId ?? ""} className={`${settingInput} w-40 tabular-nums`} />
          </SettingRow>
        </SettingsSection>

        <SettingsSection title="Scores" description="Leave these blank to use ESPN's scores. Type a score to set it yourself (the score at the end of that quarter, not the points in it).">
          {QUARTERS.map((q, i) => (
            <SettingRow key={q} label={q} hint={scores[i] && !board.manual[i] ? `ESPN: ${board.awayName} ${scores[i]!.away}, ${board.homeName} ${scores[i]!.home}` : undefined}>
              <div className="flex items-center gap-2 text-sm text-muted">
                <span className="max-w-20 truncate">{board.awayName}</span>
                <input name={`away_${i + 1}`} type="number" min={0} aria-label={`${q}: ${board.awayName}`} defaultValue={board.manual[i]?.away ?? ""} className={num} />
                <span className="max-w-20 truncate">{board.homeName}</span>
                <input name={`home_${i + 1}`} type="number" min={0} aria-label={`${q}: ${board.homeName}`} defaultValue={board.manual[i]?.home ?? ""} className={num} />
              </div>
            </SettingRow>
          ))}
        </SettingsSection>
        <SubmitButton kind="accent">Save the board</SubmitButton>
      </ActionForm>

      <SettingsSection title="Take squares for a player" description="Opens the board acting as that player (until the numbers are drawn).">
        <ul className="divide-y divide-line">
          {members.map((m) => (
            <li key={m.userId} className="flex items-center gap-3 py-2.5 text-sm">
              <span className="min-w-0 flex-1 truncate font-medium">{m.name}</span>
              <span className="tabular-nums text-muted">{[...claims.values()].filter((u) => u === m.userId).length} squares</span>
              <Link href={`/p/${slug}?for=${m.userId}`} className="rounded-full px-3 py-1.5 font-semibold text-accent hover:bg-hover">
                Pick squares
              </Link>
            </li>
          ))}
        </ul>
      </SettingsSection>
    </div>
  );
}

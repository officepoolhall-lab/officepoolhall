import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionButton } from "@/components/ActionButton";
import { ActionForm, SubmitButton } from "@/components/ActionForm";
import { SettingRow, SettingsSection, settingInput } from "@/components/SettingsUI";
import { poolFormat } from "@/lib/formats";
import { getThisWeeksGames } from "@/lib/nflPlayoffs";
import { requireCommissioner } from "@/lib/pool";
import { QUARTERS } from "@/lib/squares";
import { getSquares } from "@/lib/squaresData";
import { drawSquares, saveSquaresBoard, typeSquaresNumbers } from "../../formats/actions";

export const metadata: Metadata = { title: "Board" };

/**
 * A Squares pool's board, for the commissioner: filling it, setting the numbers, the game it
 * follows (the Super Bowl, found by itself) and the quarter scores when ESPN's aren't used.
 */
export default async function SquaresBoardAdminPage({ params }: PageProps<"/p/[slug]/admin/board">) {
  const { slug } = await params;
  const ctx = await requireCommissioner(slug);
  if (poolFormat(ctx.pool.settings) !== "squares") notFound();
  const [{ settings, board, squares, scores }, games] = await Promise.all([getSquares(ctx), getThisWeeksGames()]);
  const taken = squares.size;
  const num = `${settingInput} w-20 text-center tabular-nums`;
  const digitInput = "h-10 w-full rounded-lg bg-bg text-center text-[15px] font-semibold tabular-nums outline-none ring-1 ring-line focus:ring-2 focus:ring-accent";
  // The chosen game stays in the list even after its week has passed.
  const options = board.chosenGameId && !games.some((g) => g.id === board.chosenGameId) ? [{ id: board.chosenGameId, label: `${board.awayName} at ${board.homeName}`, date: null }, ...games] : games;

  return (
    <div className="space-y-4">
      <SettingsSection
        title="1. Fill the board"
        description={
          settings.entry === "players"
            ? "Players put their own names on squares. Share the invite link from the Roster tab. You can add, rename or clear any square yourself."
            : "You write the names: open the board, type a name, and tap each square it goes on."
        }
      >
        <div className="flex flex-wrap items-center gap-3 py-3">
          <Link href={`/p/${slug}`} className="inline-flex h-11 items-center rounded-full bg-accent px-5 text-[15px] font-semibold text-white hover:opacity-90 dark:text-black">
            Open the board
          </Link>
          <span className="text-sm text-muted tabular-nums">{taken} of 100 squares filled</span>
          <Link href={`/p/${slug}/admin/settings`} className="text-sm font-semibold text-accent hover:underline">Change who fills it</Link>
        </div>
      </SettingsSection>

      <SettingsSection
        title="2. Set the numbers"
        description={
          board.drawn
            ? "The numbers are set and the board is locked: no square can be filled or cleared."
            : settings.numbers === "random"
              ? "When the board is ready, draw the numbers at random. That locks the board."
              : settings.numbers === "ordered"
                ? "This pool's numbers run 0 to 9 in order. Setting them locks the board."
                : "Type in the numbers for the top and side. Setting them locks the board."
        }
      >
        {board.drawn ? (
          <div className="flex flex-wrap items-center gap-3 py-3">
            <span className="text-sm text-muted tabular-nums">
              Top ({board.homeName}): {board.colDigits?.join(" ")} · Side ({board.awayName}): {board.rowDigits?.join(" ")}
            </span>
            <ActionButton action={drawSquares.bind(null, slug, true)} kind="danger" pendingLabel="Clearing…">
              Clear the numbers and reopen the board
            </ActionButton>
          </div>
        ) : settings.numbers === "manual" ? (
          <ActionForm action={typeSquaresNumbers.bind(null, slug)} className="space-y-3 py-3">
            {(
              [
                ["col", `Across the top (${board.homeName}), left to right`],
                ["row", `Down the side (${board.awayName}), top to bottom`],
              ] as const
            ).map(([side, label]) => (
              <fieldset key={side}>
                <legend className="mb-1 text-sm font-medium">{label}</legend>
                <div className="grid max-w-md grid-cols-10 gap-1">
                  {Array.from({ length: 10 }, (_, i) => (
                    <input key={i} name={`${side}_${i}`} inputMode="numeric" maxLength={1} required aria-label={`${label}: position ${i + 1}`} className={digitInput} />
                  ))}
                </div>
              </fieldset>
            ))}
            <SubmitButton kind="accent" pending="Setting…">Set these numbers</SubmitButton>
          </ActionForm>
        ) : (
          <div className="py-3">
            <ActionButton action={drawSquares.bind(null, slug, false)} kind="accent" pendingLabel="Setting…">
              {settings.numbers === "random" ? "Draw the numbers" : "Set the numbers 0 to 9"}
            </ActionButton>
          </div>
        )}
        {!board.drawn && taken < 100 && <p className="pb-3 text-xs text-muted">{100 - taken} squares are still open. You can set the numbers anyway; an open square that wins pays nobody.</p>}
        {!board.drawn && (
          <p className="pb-3 text-xs text-muted">
            Random draw, in order or typed in is a pool setting. <Link href={`/p/${slug}/admin/settings`} className="font-semibold text-accent hover:underline">Change it on Settings</Link>
          </p>
        )}
      </SettingsSection>

      <ActionForm action={saveSquaresBoard.bind(null, slug)} className="space-y-4">
        <SettingsSection title="The game" description="Nothing to set for the Super Bowl: the site finds it, shows the two teams once they're known, and fills in each quarter's score and winner.">
          <SettingRow label="Game" hint={board.gameEspnId ? (board.namesFromEspn ? `Following ${board.awayName} at ${board.homeName}.` : "Following the Super Bowl; the teams show once they're set.") : "The Super Bowl isn't on the schedule yet; it'll be picked up when it is."}>
            <select name="game" aria-label="Game" defaultValue={board.chosenGameId ?? ""} className={`${settingInput} w-full sm:w-72`}>
              <option value="">The Super Bowl (found automatically)</option>
              {options.map((g) => (
                <option key={g.id} value={g.id}>{g.label}</option>
              ))}
            </select>
          </SettingRow>
          {!board.namesFromEspn && (
            <>
              <SettingRow label="Top of the board, until the teams are known">
                <input name="home_name" aria-label="Name across the top" maxLength={30} defaultValue={board.homeName} className={`${settingInput} w-full sm:w-56`} />
              </SettingRow>
              <SettingRow label="Side of the board, until the teams are known">
                <input name="away_name" aria-label="Name down the side" maxLength={30} defaultValue={board.awayName} className={`${settingInput} w-full sm:w-56`} />
              </SettingRow>
            </>
          )}
        </SettingsSection>
        {/* Kept out of the cards so the names still save when their fields aren't shown. */}
        {board.namesFromEspn && (
          <>
            <input type="hidden" name="home_name" value="NFC" />
            <input type="hidden" name="away_name" value="AFC" />
          </>
        )}

        <SettingsSection title="Scores" description="These fill in from ESPN during the game. Type a score only to set it yourself (the score at the end of that quarter, not the points in it).">
          {QUARTERS.map((q, i) => (
            <SettingRow key={q} label={q} hint={scores[i] && !board.manual[i] ? `From ESPN: ${board.awayName} ${scores[i]!.away}, ${board.homeName} ${scores[i]!.home}` : undefined}>
              <div className="flex items-center gap-2 text-sm text-muted">
                <span className="max-w-20 truncate">{board.awayName}</span>
                <input name={`away_${i + 1}`} type="number" min={0} aria-label={`${q}: ${board.awayName}`} defaultValue={board.manual[i]?.away ?? ""} className={num} />
                <span className="max-w-20 truncate">{board.homeName}</span>
                <input name={`home_${i + 1}`} type="number" min={0} aria-label={`${q}: ${board.homeName}`} defaultValue={board.manual[i]?.home ?? ""} className={num} />
              </div>
            </SettingRow>
          ))}
        </SettingsSection>
        <SubmitButton kind="accent">Save</SubmitButton>
      </ActionForm>
    </div>
  );
}

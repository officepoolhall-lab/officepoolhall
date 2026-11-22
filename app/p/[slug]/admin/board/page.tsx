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
import { CopyButton } from "@/components/CopyButton";
import { drawSquares, fillSquaresRandom, saveSquaresBoard, typeSquaresNumbers } from "../../formats/actions";

export const metadata: Metadata = { title: "Board" };

/**
 * A Squares pool's board, for the commissioner: filling it, setting the numbers, the game it
 * follows (the Super Bowl, found by itself) and the quarter scores when ESPN's aren't used.
 */
export default async function SquaresBoardAdminPage({ params }: PageProps<"/p/[slug]/admin/board">) {
  const { slug } = await params;
  const ctx = await requireCommissioner(slug);
  if (poolFormat(ctx.pool.settings) !== "squares") notFound();
  const source = { supabase: ctx.supabase, pool: ctx.pool, userId: ctx.user.id };
  const games = await getThisWeeksGames();
  let data = await getSquares(source);
  // The board's row (and with it the share link) is made the first time the commissioner opens this page.
  if (!data.board.shareToken) {
    await (ctx.supabase as unknown as { from: (t: string) => any }).from("squares_boards").upsert({ pool_id: ctx.pool.id }, { onConflict: "pool_id", ignoreDuplicates: true }); // eslint-disable-line @typescript-eslint/no-explicit-any
    data = await getSquares(source);
  }
  const { settings, board, squares, scores } = data;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const shareLink = board.shareToken ? `${appUrl}/board/${board.shareToken}` : null;
  // Numbers in order are only for a board filled at random.
  const orderedBlocked = settings.numbers === "ordered" && !board.randomFilled;
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
        {/* Names and how many squares each, placed on the board by chance. */}
        {!board.drawn && settings.entry !== "players" && (
          <details className="py-3" open={settings.numbers === "ordered"}>
            <summary className="cursor-pointer text-[15px] font-semibold text-accent">Or fill the board at random from a list</summary>
            <ActionForm action={fillSquaresRandom.bind(null, slug)} className="mt-3 space-y-2">
              <p className="text-sm text-muted">
                One name per line with its number of squares, like <span className="font-mono text-xs text-ink">Dad, 5</span>. Each name&apos;s squares land on the board by chance.
                {taken > 0 ? " This replaces the names on the board now." : ""}
              </p>
              <textarea
                name="lines" rows={8} required aria-label="Names and squares"
                className="w-full max-w-md rounded-[10px] bg-bg p-3 font-mono text-sm outline-none ring-1 ring-line focus:ring-2 focus:ring-accent"
                placeholder={"Dad, 5\nMom, 5\nUncle Bob, 10\nJordan M., 2"}
              />
              <div>
                <SubmitButton kind="primary" pending="Placing…">Place these names at random</SubmitButton>
              </div>
            </ActionForm>
          </details>
        )}
      </SettingsSection>

      <SettingsSection title="Share the board" description="Anyone with this link can look at the board, the winners and the pot. No account, and nothing they can change.">
        <div className="flex flex-wrap items-center gap-2 py-3">
          {shareLink ? (
            <>
              <code className="min-w-0 flex-1 truncate rounded-[10px] bg-bg px-3 py-2.5 font-sans text-sm text-muted ring-1 ring-line">{shareLink}</code>
              <CopyButton text={shareLink} />
            </>
          ) : (
            <p className="text-sm text-muted">The link shows here once the board is set up (after the database update).</p>
          )}
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
                ? orderedBlocked
                  ? "This pool's numbers run 0 to 9 in order, which is only for a board filled at random. Fill the board at random from a list (step 1), or switch the pool to a random draw on Settings."
                  : "The names were placed at random, so the numbers run 0 to 9 in order. Setting them locks the board."
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
        ) : orderedBlocked ? null : (
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

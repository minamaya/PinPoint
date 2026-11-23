import type React from "react";
import Image from "next/image";
import Link from "next/link";
import { CircleAlert, Info, Trophy } from "lucide-react";
import type {
  MachineArtwork,
  MachineForLayout,
  MachinePinTips,
} from "~/app/(app)/m/[initials]/_data";
import { PinTipCard } from "~/app/(app)/m/[initials]/pin-tip-card";
import { AskPinBrainButton } from "~/components/machines/AskPinBrainButton";
import { buttonVariants } from "~/components/ui/button";
import { formatCalendarDay, formatCompactAge } from "~/lib/dates";
import type { IscoredScore } from "~/lib/iscored/types";
import {
  getIssueSeverityLabel,
  getIssueSeverityStyles,
} from "~/lib/issues/status";

interface MachineScanHubProps {
  machine: {
    initials: string;
    name: string;
    manufacturer: string | null;
    year: number | null;
    owner: { name: string } | null;
    invitedOwner: { name: string } | null;
    iscoredGameId: string | null;
    issues: HubIssue[];
    artwork: MachineArtwork | null;
  };
  scores: IscoredScore[];
  scoreHref: string | null;
  gameHref: string | null;
  /** Null when the machine has no tips: no tip card (spec pintips 3.6). */
  pinTips: MachinePinTips | null;
  fromApron: boolean;
}

type HubIssue = Pick<
  MachineForLayout["issues"][number],
  "id" | "severity" | "title" | "createdAt"
>;

const cardClass = "rounded-xl border border-outline-variant bg-card px-4 py-3";
const labelClass =
  "text-[11px] font-bold uppercase tracking-wider text-muted-foreground";

// iScored dates are the venue's wall-clock time with no zone, so print their
// day as written rather than converting it.
function displayScoreDate(date: string): string {
  return formatCalendarDay(date) ?? date;
}

/**
 * Shape of a standard OPDB backglass image, used when Pinball Map reported no
 * dimensions for this one.
 */
const FALLBACK_ARTWORK_RATIO = 444 / 640;

/**
 * Rendered height of the Top scores card: 2px border, 24px padding, 24px
 * header, and either 4px + 40px per score row or a one-line message (the
 * global paragraph style's 16px top margin, 24px padding, 28px line). Rows
 * are fixed at 40px and truncate, so this is exact unless the message wraps
 * on a very narrow phone — then less than 60px of the next card shows.
 */
function scoresCardHeight(rows: number): number {
  return rows === 0 ? 118 : 54 + 40 * rows;
}
/** The identity block (spec §3.1). Not a link: Game details opens the Info tab (§4.5). */
function Identity({
  name,
  metadata,
  onArtwork,
}: {
  name: string;
  metadata: string;
  onArtwork: boolean;
}): React.JSX.Element {
  return (
    <div className="flex min-h-16 flex-col justify-center text-foreground">
      <h1 className="truncate text-[26px] leading-tight font-extrabold tracking-tight sm:text-3xl">
        {name}
      </h1>
      <p
        className={`truncate text-xs sm:text-sm ${onArtwork ? "text-foreground/85" : "text-muted-foreground"}`}
      >
        {metadata}
      </p>
    </div>
  );
}

/**
 * The artwork band (spec §3.6–§3.7, §5.4). Its height is whatever leaves the
 * top 60px of the Top scores card visible above the tab bar on first load,
 * with both button rows between them (§3.7): the free height, minus the Top
 * scores card (`--scores-h`) and 204px (two 12px gaps, the 68px and 44px
 * button rows with 8px between them, and the 60px peek), and on `md` the 16px top padding the band does not bleed into.
 * Capped at the image's own height at full width, and never below 180px —
 * the page scrolls instead. When the band is shorter than the image, the
 * image shrinks to fit (`object-contain`) and a blurred copy fills the sides.
 * Below `md` it bleeds 16px past the hub column on each side — viewport-wide
 * on phones, at most 390 + 32 = 422px — so the height cap uses that width;
 * from `md` it is the hub's rounded 390px column.
 */
function ArtworkBand({
  artwork,
  scoresHeight,
  children,
}: {
  artwork: MachineArtwork;
  scoresHeight: number;
  children: React.ReactNode;
}): React.JSX.Element {
  const ratio =
    artwork.width != null && artwork.height != null
      ? artwork.height / artwork.width
      : FALLBACK_ARTWORK_RATIO;
  const style: React.CSSProperties &
    Record<"--art-ratio" | "--scores-h", number | string> = {
    "--art-ratio": ratio,
    "--scores-h": `${String(scoresHeight)}px`,
  };
  return (
    <figure
      data-testid="hub-artwork-band"
      style={style}
      className="relative m-0 -mx-4 -mt-4 h-[clamp(180px,calc(100dvh-112px-env(safe-area-inset-bottom)-var(--scores-h)-204px),calc(min(100vw,422px)*var(--art-ratio)))] shrink-0 overflow-hidden bg-card md:mx-0 md:mt-0 md:h-[clamp(180px,calc(100dvh-64px-16px-var(--scores-h)-204px),calc(390px*var(--art-ratio)))] md:rounded-xl"
    >
      <Image
        src={artwork.url}
        alt=""
        aria-hidden="true"
        fill
        sizes="390px"
        unoptimized
        className="object-cover blur-2xl brightness-50"
      />
      <Image
        src={artwork.url}
        alt=""
        fill
        sizes="(min-width: 768px) 390px, 100vw"
        unoptimized
        priority
        className="object-contain"
      />
      <div
        aria-hidden="true"
        className="absolute inset-x-0 bottom-0 h-24 bg-linear-to-b from-transparent to-background/95"
      />
      <div className="absolute inset-x-4 bottom-1">{children}</div>
      <figcaption className="absolute top-0 right-0 rounded-bl bg-background/90 px-1.5 py-0.5 text-[10px] tracking-wide text-foreground">
        Image: <a href={artwork.url}>OPDB</a>
      </figcaption>
    </figure>
  );
}

function IssueRow({ issue }: { issue: HubIssue }): React.JSX.Element {
  return (
    <li className="flex min-h-10 items-center gap-2 border-t border-border/60 text-sm">
      <span
        className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${getIssueSeverityStyles(issue.severity)}`}
      >
        {getIssueSeverityLabel(issue.severity)}
      </span>
      <span className="min-w-0 flex-1 truncate">{issue.title}</span>
      <span className="shrink-0 text-xs text-muted-foreground">
        {formatCompactAge(issue.createdAt)}
      </span>
    </li>
  );
}

export function MachineScanHub({
  machine,
  scores,
  scoreHref,
  gameHref,
  pinTips,
  fromApron,
}: MachineScanHubProps): React.JSX.Element {
  const infoHref = `/m/${machine.initials}`;
  const issuesHref = `/m/${machine.initials}/i`;
  const reportHref = `/report?machine=${encodeURIComponent(machine.initials)}${fromApron ? "&source=apron" : ""}`;
  const ownerName = machine.owner?.name ?? machine.invitedOwner?.name;
  const metadata = [
    machine.manufacturer,
    machine.year,
    ownerName ? `Owned by ${ownerName}` : "Owner not listed",
  ].filter(Boolean);
  const openIssues = machine.issues;
  const scoreRows = machine.iscoredGameId ? Math.min(scores.length, 3) : 0;

  return (
    <div className="mx-auto flex w-full max-w-[390px] flex-col gap-3 pt-4">
      {machine.artwork != null ? (
        <ArtworkBand
          artwork={machine.artwork}
          scoresHeight={scoresCardHeight(scoreRows)}
        >
          <Identity
            name={machine.name}
            metadata={metadata.join(" · ")}
            onArtwork
          />
        </ArtworkBand>
      ) : (
        <Identity
          name={machine.name}
          metadata={metadata.join(" · ")}
          onArtwork={false}
        />
      )}

      {/* Action buttons (spec §3.4), in the page flow: nothing on the hub is
          pinned (§5.5, design bible §3). */}
      <nav aria-label="Machine actions" className="flex flex-col gap-2">
        <div className="flex gap-2.5">
          {scoreHref ? (
            <a
              href={scoreHref}
              target="_blank"
              rel="noopener noreferrer"
              className="flex h-[68px] min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-xl bg-primary text-center text-base font-bold text-primary-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              <Trophy className="size-6" aria-hidden="true" />
              Post a score
            </a>
          ) : null}
          <Link
            href={reportHref}
            className="flex h-[68px] min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-xl bg-warning text-center text-base font-bold text-primary-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <CircleAlert className="size-6" aria-hidden="true" />
            Report a problem
          </Link>
        </div>
        <div className="flex gap-2.5">
          <Link
            href={infoHref}
            className={`${buttonVariants({ variant: "outline" })} h-11 min-w-0 flex-1`}
          >
            <Info aria-hidden="true" />
            Game details
          </Link>
          <AskPinBrainButton className="h-11 min-w-0 flex-1" />
        </div>
      </nav>

      <section className={cardClass} aria-labelledby="hub-scores-heading">
        <div className="flex min-h-6 items-center justify-between gap-2">
          <h2 id="hub-scores-heading" className={labelClass}>
            Top scores
          </h2>
          {gameHref ? (
            <a
              href={gameHref}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-7 items-center gap-1 text-xs font-semibold text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              aria-label="View all on iScored (opens in a new tab)"
            >
              View all on
              <Image
                src="/iscored-logo.svg"
                alt="iScored"
                width={55}
                height={22}
                className="h-[18px] w-auto"
                unoptimized
              />
            </a>
          ) : (
            <Image
              src="/iscored-logo.svg"
              alt="iScored"
              width={55}
              height={22}
              className="h-[18px] w-auto"
              unoptimized
            />
          )}
        </div>
        {!machine.iscoredGameId ? (
          <p className="py-3 text-sm text-muted-foreground">
            No iScored game is linked to this machine.
          </p>
        ) : scores.length === 0 ? (
          <p className="py-3 text-sm text-muted-foreground">
            No scores recorded yet
          </p>
        ) : (
          <ol className="mt-1">
            {scores.slice(0, 3).map((score) => (
              <li
                key={score.id}
                className="flex min-h-10 items-center gap-3 text-sm"
              >
                <span
                  className={`flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-bold tabular-nums ${score.rank === 1 ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"}`}
                >
                  {score.rank}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">
                    {score.playerName}
                  </span>
                  {score.date ? (
                    <span className="block text-[11px] leading-3 text-muted-foreground">
                      {displayScoreDate(score.date)}
                    </span>
                  ) : null}
                </span>
                <span className="shrink-0 font-mono text-sm font-bold tabular-nums">
                  {score.score.toLocaleString("en-US")}
                </span>
              </li>
            ))}
          </ol>
        )}
      </section>

      {pinTips ? (
        <PinTipCard
          tips={pinTips.tips}
          initialIndex={pinTips.initialIndex}
          href={pinTips.href}
          variant="hub"
        />
      ) : null}

      <section className={cardClass} aria-labelledby="hub-issues-heading">
        <div className="flex min-h-7 items-center justify-between gap-2">
          <h2 id="hub-issues-heading" className={labelClass}>
            Open issues · {openIssues.length}
          </h2>
          {openIssues.length > 0 ? (
            <Link
              href={issuesHref}
              className="text-xs font-semibold text-primary"
            >
              See all
            </Link>
          ) : null}
        </div>
        {openIssues.length === 0 ? (
          <p className="py-2 text-sm text-muted-foreground">No open issues</p>
        ) : (
          <ol>
            {openIssues.slice(0, 3).map((issue) => (
              <IssueRow key={issue.id} issue={issue} />
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}

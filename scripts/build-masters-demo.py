#!/usr/bin/env python3
"""DEMO ONLY: build lib/demo/masters-2026-r3.json from the real 2026 Masters scorecards.

Input: masters-2026.json saved by the capture script (ESPN leaderboard + hole-by-hole
scorecards). Output: the demo pool's Masters frozen in the middle of round 3.

The moment: 60 minutes after the last round-3 tee time, so the leaders are a few holes in.
Each golfer who made the cut has played as many round-3 holes as about 15 minutes a hole
allows from their real tee time (every hole score is their real one). Places are worked out
from the scores to that point. Times are stored as minutes from the moment; the site moves
them so the moment is always "now".

Usage: python3 scripts/build-masters-demo.py masters-2026.json lib/demo/masters-2026-r3.json
"""
import json
import sys
from datetime import datetime, timedelta

MIN_PER_HOLE = 15
AFTER_LAST_TEE_MIN = 60


def ts(s):
    return datetime.fromisoformat(s.replace("Z", "+00:00")) if s else None


def fmt_par(d):
    return "E" if d == 0 else (f"+{d}" if d > 0 else str(d))


def main(src, dst):
    raw = json.load(open(src))
    pars = raw["pars"]
    if len(pars) != 18:
        sys.exit(f"expected 18 hole pars, got {len(pars)}")

    golfers = []
    for g in raw["golfers"]:
        rounds = {r["round"]: r for r in g["rounds"]}
        holes = []
        for n in (1, 2, 3):
            strokes = [None] * 18
            for h in rounds.get(n, {}).get("holes", []):
                if h.get("hole") and h.get("strokes"):
                    strokes[h["hole"] - 1] = h["strokes"]
            holes.append(strokes)
        golfers.append({"g": g, "rounds": rounds, "holes": holes})

    made_cut = [x for x in golfers if not x["g"]["cut"] and x["rounds"].get(3, {}).get("teeTime")]
    if not made_cut:
        sys.exit("no round-3 tee times found")
    moment = max(ts(x["rounds"][3]["teeTime"]) for x in made_cut)
    moment = moment + timedelta(minutes=AFTER_LAST_TEE_MIN)

    def offset(t):
        return None if not t else round((ts(t) - moment).total_seconds() / 60)

    out = []
    for x in golfers:
        g, rounds, holes = x["g"], x["rounds"], x["holes"]
        r1 = sum(s for s in holes[0] if s) if all(holes[0]) else g["r"][0]
        r2 = sum(s for s in holes[1] if s) if all(holes[1]) else g["r"][1]
        two = [(s - p) for rnd in holes[:2] for s, p in zip(rnd, pars) if s]
        to_par_36 = sum(two)
        played_36 = all(holes[0]) and all(holes[1])
        tee3 = rounds.get(3, {}).get("teeTime")
        start = rounds.get(3, {}).get("startTee") or 1
        if g["cut"] or not tee3 or not played_36:
            out.append({
                "id": g["id"], "name": g["name"], "lastName": g["lastName"], "country": g["country"],
                "out": "MC" if g["cut"] or played_36 else "WD", "toPar": fmt_par(to_par_36) if two else None,
                "thru": None, "status": "post", "teeOffsetMin": None, "rounds": [r1, r2, None, None],
                "total": (r1 or 0) + (r2 or 0) if r1 and r2 else None, "holes": holes[:2],
                "roundTeeOffsetMin": [offset(rounds.get(n, {}).get("teeTime")) for n in (1, 2)],
                "_score": None,
            })
            continue
        elapsed = (moment - ts(tee3)).total_seconds() / 60
        n = max(0, min(18, int(elapsed // MIN_PER_HOLE)))
        order = list(range(start - 1, 18)) + list(range(0, start - 1))
        played = set(order[:n])
        r3 = [s if i in played else None for i, s in enumerate(holes[2])]
        to_par = to_par_36 + sum(s - pars[i] for i, s in enumerate(r3) if s)
        out.append({
            "id": g["id"], "name": g["name"], "lastName": g["lastName"], "country": g["country"],
            "out": None, "toPar": fmt_par(to_par), "thru": "F" if n == 18 else (str(n) if n else None),
            "status": "post" if n == 18 else ("in" if n else "pre"), "teeOffsetMin": offset(tee3),
            "rounds": [r1, r2, sum(s for s in r3 if s) if n == 18 else None, None],
            "total": r1 + r2 + (sum(s for s in r3 if s) if n == 18 else 0), "holes": [holes[0], holes[1], r3],
            "roundTeeOffsetMin": [offset(rounds.get(k, {}).get("teeTime")) for k in (1, 2, 3)],
            "_score": to_par,
        })

    # Places: competition ranking by score to par among those still in; "T" for ties.
    live = sorted((o for o in out if o["_score"] is not None), key=lambda o: (o["_score"], o["lastName"]))
    for o in live:
        same = [p for p in live if p["_score"] == o["_score"]]
        place = 1 + sum(1 for p in live if p["_score"] < o["_score"])
        o["pos"] = f"T{place}" if len(same) > 1 else str(place)
    rest = sorted((o for o in out if o["_score"] is None), key=lambda o: o["lastName"])
    for o in rest:
        o["pos"] = "-"
    ordered = live + rest
    for i, o in enumerate(ordered):
        o["order"] = i + 1
        del o["_score"]

    json.dump({"eventName": raw["event"]["name"], "pars": pars, "golfers": ordered}, open(dst, "w"), separators=(",", ":"))
    on = sum(1 for o in live if o["status"] == "in")
    done = sum(1 for o in live if o["status"] == "post")
    print(f"{len(ordered)} golfers: {len(live)} made the cut ({done} finished round 3, {on} on the course, {len(live) - on - done} not started), {len(rest)} out")
    print("leaders:", ", ".join(f"{o['pos']} {o['name']} {o['toPar']} thru {o['thru']}" for o in live[:5]))


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])

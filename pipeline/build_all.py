"""Run build_khg.py over a list of KHG and write a size and status summary.

    python build_all.py --all                       # every folder in _khg
    python build_all.py --khg 16.02.01 61.02-08.01  # a list
    python build_all.py --all --steps vector,tables --force

A failure in one KHG is logged and the next one runs. Summary: <out>/khg_build_summary.csv.
"""
import argparse
import csv
import json
import subprocess
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from build_khg import KHG_ROOT, OUT_DEFAULT  # noqa: E402


def all_codes():
    return [p.name.split("_", 1)[0] for p in sorted(KHG_ROOT.iterdir()) if p.is_dir() and p.name[0].isdigit()]


def main():
    ap = argparse.ArgumentParser()
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument("--all", action="store_true")
    g.add_argument("--khg", nargs="+")
    ap.add_argument("--steps", default="vector,points,tables,raster,neraca")
    ap.add_argument("--out", default=str(OUT_DEFAULT))
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--holder-names", action="store_true")
    a = ap.parse_args()
    codes = all_codes() if a.all else a.khg
    out = Path(a.out)
    (out / "logs").mkdir(parents=True, exist_ok=True)
    rows = []
    for code in codes:
        t0 = time.time()
        cmd = [sys.executable, "-I", str(HERE / "build_khg.py"), "--khg", code, "--steps", a.steps, "--out", str(out)]
        cmd += ["--force"] * a.force + ["--holder-names"] * a.holder_names
        with open(out / "logs" / f"{code}.log", "w", encoding="utf-8") as log:
            rc = subprocess.run(cmd, stdout=log, stderr=subprocess.STDOUT).returncode
        mf = out / "khg" / code / "manifest.json"
        row = {"khg": code, "status": "done" if rc == 0 else f"failed ({rc})", "minutes": round((time.time() - t0) / 60, 1)}
        if mf.exists():
            m = json.loads(mf.read_text(encoding="utf-8"))
            row.update(dems=" ".join(m["dems"]), mb_vector=round(sum(e["mb"] for e in m["vector"]), 1),
                       mb_raster=round(sum(e["mb"] for e in m["raster"]), 1), mb_tables=round(sum(e["mb"] for e in m["tables"] + m["points"]), 1),
                       groundwater_runs=len(m.get("groundwater", [])), missing=len(m["missing"]))
        rows.append(row)
        print(row, flush=True)
    cat = []
    for code in all_codes():
        mf = out / "khg" / code / "manifest.json"
        if mf.exists():
            m = json.loads(mf.read_text(encoding="utf-8"))
            cat.append({k: m.get(k) for k in ("code", "khg_id", "name", "province", "bounds", "dems")} |
                       {"groundwater": sorted({g["dem"] for g in m.get("groundwater", [])}), "built": m.get("built")})
    (out / "catalog.json").write_text(json.dumps(cat, ensure_ascii=False, indent=1), encoding="utf-8")
    keys = sorted({k for r in rows for k in r}, key=lambda k: ["khg", "status", "minutes", "dems", "mb_vector", "mb_raster", "mb_tables", "groundwater_runs", "missing"].index(k))
    with open(out / "khg_build_summary.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=keys)
        w.writeheader()
        w.writerows(rows)


if __name__ == "__main__":
    main()

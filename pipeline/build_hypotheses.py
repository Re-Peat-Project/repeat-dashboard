"""Publish the output of `repeat-hypotheses` to the app: app/public/data/hypotheses/ (hypotheses.json, provenance.json and the CSV of each question).

    python build_hypotheses.py

Reads <REPEAT_WORK>/national_profile/hypotheses/. Rerun after `repeat-hypotheses`; the page /investigation reads these files only."""
import os
import shutil
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
WORK = HERE.parents[1]
SRC = Path(os.environ.get("REPEAT_WORK", WORK / "re-peat" / "reports")) / "national_profile" / "hypotheses"
OUT = HERE.parent / "app" / "public" / "data" / "hypotheses"


def main():
    if not (SRC / "hypotheses.json").exists():
        sys.exit(f"{SRC}: run repeat-hypotheses first")
    if OUT.exists():
        shutil.rmtree(OUT)
    OUT.mkdir(parents=True)
    names = ["hypotheses.json", "provenance.json", *[f.name for f in SRC.glob("q*.csv")]]
    for n in names:
        shutil.copy2(SRC / n, OUT / n)
    print(f"hypotheses: {len(names)} files -> {OUT}")


if __name__ == "__main__":
    main()

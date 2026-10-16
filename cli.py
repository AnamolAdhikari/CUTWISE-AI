"""CUTWISE command-line interface, useful for scripting and smoke tests."""
import argparse
import json
from pathlib import Path
from engine import Segment, analyze, export


def main() -> None:
    parser = argparse.ArgumentParser(description="CUTWISE local automatic first-cut editor")
    parser.add_argument("source", type=Path)
    parser.add_argument("--output", type=Path, help="Export edited MP4 to this path")
    parser.add_argument("--analysis", type=Path, help="Save editing decisions as JSON")
    parser.add_argument("--threshold-db", type=int, default=-35)
    parser.add_argument("--minimum-silence", type=float, default=.65)
    args = parser.parse_args()
    result = analyze(args.source, args.threshold_db, args.minimum_silence)
    print(json.dumps(result, indent=2))
    if args.analysis:
        args.analysis.write_text(json.dumps(result, indent=2))
    if args.output:
        export(args.source, args.output, [Segment(**s) for s in result["keeps"]])
        print(f"Exported: {args.output}")


if __name__ == "__main__":
    main()

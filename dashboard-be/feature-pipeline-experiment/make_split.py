"""
features.csv -> split.json (train 70% / val 15% / test 15%)

계획서 3.3, 3.4 원칙:
- 세션 단위 분할, 한 세션은 하나의 split 에만 속한다
- persona_id x difficulty x split_source 중 가능한 가장 강한 stratified 기준을 쓴다

split seed 는 실험 seed 와 분리된 고정값이다. 3대 컴퓨터가 같은 split 을 써야
결과를 비교할 수 있으므로 split.json 은 커밋해서 공유한다.
"""

import argparse
import json
import os

import pandas as pd
from sklearn.model_selection import train_test_split

SPLIT_SEED = 20260803
STRATIFICATION_CANDIDATES = [
    ["persona_id", "difficulty", "split_source"],
    ["persona_id", "difficulty"],
    ["persona_id"],
]


def build_strata(frame, columns):
    return frame[columns].astype(str).agg("|".join, axis=1)


def make_candidate_split(frame, columns, split_seed=SPLIT_SEED):
    strata = build_strata(frame, columns)
    train_idx, holdout_idx = train_test_split(
        frame.index, test_size=0.30, random_state=split_seed, stratify=strata
    )
    val_idx, test_idx = train_test_split(
        holdout_idx, test_size=0.50, random_state=split_seed, stratify=strata.loc[holdout_idx]
    )
    return train_idx, val_idx, test_idx


def make_stratified_split(frame, split_seed=SPLIT_SEED):
    failures = []
    for columns in STRATIFICATION_CANDIDATES:
        try:
            train_idx, val_idx, test_idx = make_candidate_split(frame, columns, split_seed)
        except ValueError as exc:
            failures.append(f"{'+'.join(columns)}: {exc}")
            continue
        return columns, train_idx, val_idx, test_idx
    raise SystemExit("[split] FAILED: no viable stratification. " + " | ".join(failures))


def validate_split(split, frame):
    all_ids = split["train"] + split["val"] + split["test"]
    if len(all_ids) != len(set(all_ids)):
        raise SystemExit("[split] FAILED: session appears in more than one split")
    if set(all_ids) != set(frame["session_id"].tolist()):
        raise SystemExit(f"[split] FAILED: split ids do not cover {len(frame)} sessions")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--features", default="artifacts/features.csv")
    parser.add_argument("--out", default="artifacts/split.json")
    parser.add_argument("--seed", type=int, default=SPLIT_SEED)
    args = parser.parse_args()

    here = os.path.dirname(__file__)
    frame = pd.read_csv(os.path.abspath(os.path.join(here, args.features)))

    stratified_by, train_idx, val_idx, test_idx = make_stratified_split(frame, args.seed)

    split = {
        "split_seed": args.seed,
        "stratified_by": stratified_by,
        "train": sorted(frame.loc[train_idx, "session_id"].tolist()),
        "val": sorted(frame.loc[val_idx, "session_id"].tolist()),
        "test": sorted(frame.loc[test_idx, "session_id"].tolist()),
    }

    validate_split(split, frame)

    out_path = os.path.abspath(os.path.join(here, args.out))
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as handle:
        json.dump(split, handle, indent=1)

    print(f"[split] train {len(split['train'])} / val {len(split['val'])} / test {len(split['test'])}")
    print(f"[split] stratified_by: {' + '.join(stratified_by)}")
    print(f"[split] wrote {out_path}")

    name_by_id = {}
    for name in ("train", "val", "test"):
        for sid in split[name]:
            name_by_id[sid] = name
    frame["split"] = frame["session_id"].map(name_by_id)
    print("[split] persona distribution per split (%):")
    dist = pd.crosstab(frame["persona_id"], frame["split"], normalize="columns") * 100
    print(dist.round(1).to_string())


if __name__ == "__main__":
    main()

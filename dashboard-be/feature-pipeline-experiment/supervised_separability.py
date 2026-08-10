"""
Supervised persona separability sanity check.

This does not replace clustering. It checks whether the current behavior
features contain enough information to predict the ground-truth persona when
labels are intentionally provided to a supervised model.
"""

import argparse
import os

import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, classification_report, confusion_matrix, f1_score

from experiment_contract import FEATURE_SUBSETS, preprocess


MODELS = {
    "logistic_regression": lambda seed: LogisticRegression(max_iter=1000, random_state=seed),
    "random_forest": lambda seed: RandomForestClassifier(n_estimators=300, random_state=seed, n_jobs=-1),
}


def filter_frame(frame, include_difficulty, exclude_difficulty, include_source, exclude_source):
    filtered = frame.copy()
    if include_difficulty:
        allowed = {item.strip() for item in include_difficulty.split(",") if item.strip()}
        filtered = filtered[filtered["difficulty"].isin(allowed)]
    if exclude_difficulty:
        blocked = {item.strip() for item in exclude_difficulty.split(",") if item.strip()}
        filtered = filtered[~filtered["difficulty"].isin(blocked)]
    if include_source:
        allowed = {item.strip() for item in include_source.split(",") if item.strip()}
        filtered = filtered[filtered["split_source"].isin(allowed)]
    if exclude_source:
        blocked = {item.strip() for item in exclude_source.split(",") if item.strip()}
        filtered = filtered[~filtered["split_source"].isin(blocked)]
    return filtered.reset_index(drop=True)


def load_split_frames(features_path: str, split_path: str, args):
    frame = pd.read_csv(features_path)
    frame = filter_frame(frame, args.include_difficulty, args.exclude_difficulty, args.include_source, args.exclude_source)
    split = pd.read_json(split_path, typ="series")
    train = frame[frame["session_id"].isin(split["train"])].reset_index(drop=True)
    test = frame[frame["session_id"].isin(split["test"])].reset_index(drop=True)
    return train, test


def write_confusion_matrix(path: str, y_true, y_pred, labels) -> None:
    matrix = confusion_matrix(y_true, y_pred, labels=labels)
    pd.DataFrame(matrix, index=labels, columns=labels).to_csv(path)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--features", default="artifacts/features.csv")
    parser.add_argument("--split", default="artifacts/split.json")
    parser.add_argument("--subsets", default="F0")
    parser.add_argument("--models", default="logistic_regression,random_forest")
    parser.add_argument("--seed", type=int, default=2026)
    parser.add_argument("--out", default="artifacts/supervised-results.csv")
    parser.add_argument("--include-difficulty", default="")
    parser.add_argument("--exclude-difficulty", default="")
    parser.add_argument("--include-source", default="")
    parser.add_argument("--exclude-source", default="")
    args = parser.parse_args()

    here = os.path.dirname(__file__)
    features_path = os.path.abspath(os.path.join(here, args.features))
    split_path = os.path.abspath(os.path.join(here, args.split))
    out_path = os.path.abspath(os.path.join(here, args.out))
    os.makedirs(os.path.dirname(out_path), exist_ok=True)

    train_df, test_df = load_split_frames(features_path, split_path, args)
    if min(len(train_df), len(test_df)) == 0:
        raise SystemExit("[supervised] FAILED: filter left train or test empty")
    labels = sorted(train_df["persona_id"].unique())
    selected_subsets = [item.strip() for item in args.subsets.split(",") if item.strip()]
    selected_models = [item.strip() for item in args.models.split(",") if item.strip()]

    rows = []
    for subset in selected_subsets:
        columns = FEATURE_SUBSETS[subset]
        train_x, (test_x,) = preprocess(train_df, [test_df], columns)
        train_y = train_df["persona_id"].to_numpy()
        test_y = test_df["persona_id"].to_numpy()

        for model_name in selected_models:
            model = MODELS[model_name](args.seed)
            model.fit(train_x, train_y)
            pred = model.predict(test_x)
            rows.append({
                "feature_subset": subset,
                "model": model_name,
                "seed": args.seed,
                "n_features": len(columns),
                "accuracy": accuracy_score(test_y, pred),
                "macro_f1": f1_score(test_y, pred, average="macro", zero_division=0),
            })
            stem = f"supervised-confusion-{subset.lower()}-{model_name}"
            write_confusion_matrix(os.path.join(os.path.dirname(out_path), f"{stem}.csv"), test_y, pred, labels)
            report = classification_report(test_y, pred, labels=labels, zero_division=0)
            with open(os.path.join(os.path.dirname(out_path), f"{stem}-report.txt"), "w", encoding="utf-8") as handle:
                handle.write(report)

    pd.DataFrame(rows).to_csv(out_path, index=False)
    print(f"[supervised] wrote {len(rows)} rows -> {out_path}")


if __name__ == "__main__":
    main()

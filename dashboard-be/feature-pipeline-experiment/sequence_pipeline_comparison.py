"""Compare A1/A2/A3 pipelines on the fixed sequence-transition representation."""

import argparse
import os
import time

import numpy as np
import pandas as pd
from sklearn.cluster import KMeans
from sklearn.metrics import silhouette_score

from experiment_contract import evaluate
from robust_k_selection import load_sequence_space
from run_experiments import _train_vae, pipeline_a2, safe_transform


UMAP_NEIGHBORS = (15, 50)
UMAP_COMPONENTS = (2, 5)
VAE_LATENT_DIMS = (2, 4, 8)


def a1_kmeans(train_x, val_x, test_x, seed):
    model = KMeans(n_clusters=5, n_init=20, max_iter=300, random_state=seed).fit(train_x)
    return model.predict(test_x), test_x, {"selected_k": 5, "val_silhouette": silhouette_score(val_x, model.predict(val_x))}


def a2_umap_kmeans(train_x, val_x, test_x, seed):
    import umap

    best = None
    for n_components in UMAP_COMPONENTS:
        for n_neighbors in UMAP_NEIGHBORS:
            reducer = umap.UMAP(
                n_components=n_components,
                n_neighbors=n_neighbors,
                min_dist=0.0,
                metric="euclidean",
                random_state=seed,
            ).fit(train_x)
            val_z, _ = safe_transform(reducer, train_x, val_x)
            model = KMeans(n_clusters=5, n_init=20, max_iter=300, random_state=seed).fit(reducer.embedding_)
            score = silhouette_score(val_z, model.predict(val_z))
            if best is None or score > best[0]:
                best = score, n_components, n_neighbors, reducer, model

    score, n_components, n_neighbors, reducer, model = best
    test_z, fallback_ratio = safe_transform(reducer, train_x, test_x)
    return model.predict(test_z), test_z, {
        "selected_k": 5,
        "selected_n_components": n_components,
        "selected_n_neighbors": n_neighbors,
        "val_silhouette": score,
        "umap_fallback_ratio": fallback_ratio,
    }


def a3_vae_kmeans(train_x, val_x, test_x, seed):
    best = None
    for latent_dim in VAE_LATENT_DIMS:
        encode = _train_vae(train_x, latent_dim, seed)
        train_z, val_z = encode(train_x), encode(val_x)
        model = KMeans(n_clusters=5, n_init=20, max_iter=300, random_state=seed).fit(train_z)
        score = silhouette_score(val_z, model.predict(val_z))
        if best is None or score > best[0]:
            best = score, latent_dim, encode, model

    score, latent_dim, encode, model = best
    test_z = encode(test_x)
    return model.predict(test_z), test_z, {
        "selected_k": 5,
        "selected_latent_dim": latent_dim,
        "val_silhouette": score,
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dataset", default="../benchmark/output/merged-7500")
    parser.add_argument("--features", default="artifacts/features.csv")
    parser.add_argument("--split", default="artifacts/split.json")
    parser.add_argument("--transition-features", type=int, default=20)
    parser.add_argument("--seeds", default="7,42,2026")
    parser.add_argument("--out-dir", default="artifacts/sequence-pipeline-comparison")
    args = parser.parse_args()

    train_x, val_x, test_x, y_test, columns = load_sequence_space(args)
    pipelines = {
        "A1_kmeans_k5": a1_kmeans,
        "A2_umap_kmeans_k5": a2_umap_kmeans,
        "A3_vae_kmeans_k5": a3_vae_kmeans,
        "A2_umap_hdbscan_natural": pipeline_a2,
    }
    seeds = [int(value) for value in args.seeds.split(",") if value.strip()]
    rows = []
    for name, pipeline in pipelines.items():
        for seed in seeds:
            started = time.time()
            labels, space, info = pipeline(train_x, val_x, test_x, seed)
            metrics = evaluate(y_test, np.asarray(labels), space)
            rows.append({
                "pipeline": name,
                "seed": seed,
                "n_features": len(columns),
                "runtime_sec": round(time.time() - started, 2),
                **info,
                **metrics,
            })
            print(f"[sequence-pipeline] {name} seed={seed} clusters={metrics['n_clusters']} "
                  f"ARI={metrics['ari']:.3f} F1={metrics['macro_f1']:.3f} "
                  f"Acc={metrics['hungarian_accuracy']:.3f}")

    raw = pd.DataFrame(rows)
    summary = raw.groupby("pipeline", as_index=False).mean(numeric_only=True)
    out_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), args.out_dir))
    os.makedirs(out_dir, exist_ok=True)
    raw.to_csv(os.path.join(out_dir, "per-seed-results.csv"), index=False)
    summary.to_csv(os.path.join(out_dir, "summary.csv"), index=False)
    print("[sequence-pipeline] summary")
    print(summary[["pipeline", "n_clusters", "noise_ratio", "ari", "macro_f1", "hungarian_accuracy", "majority_accuracy"]].to_string(index=False))
    print(f"[sequence-pipeline] wrote -> {out_dir}")


if __name__ == "__main__":
    main()

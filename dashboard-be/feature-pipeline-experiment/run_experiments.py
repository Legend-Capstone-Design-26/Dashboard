"""
feature subset x pipeline x seed 실험 러너.

계획서 7장의 A1/A2/A3 를 동일 전처리(6장) 위에서 실행한다.

라벨 사용 원칙 (계획서 3.2):
- 표현 학습, 군집화, 하이퍼파라미터 선택 어디에도 정답 라벨을 쓰지 않는다.
- 하이퍼파라미터는 val split 에서 내부 지표(Silhouette)로만 고른다. 군집 수 K 도 마찬가지다.
- 정답 라벨은 evaluate() 안에서 test split 성능을 계산할 때만 등장한다.
"""

import argparse
import json
import os
import time

import numpy as np
import pandas as pd
from sklearn.cluster import KMeans
from sklearn.metrics import silhouette_score
from sklearn.neighbors import NearestNeighbors

from experiment_contract import (
    FEATURE_SUBSETS,
    RESULT_COLUMNS,
    evaluate,
    macro_f1_hungarian,
    preprocess,
    result_row,
)

# ─── 하이퍼파라미터 탐색 공간 ─────────────────────────────────────────────────
# 어떤 값도 persona 수(5)에서 유도하지 않았다. K 는 2~10 을 전부 후보로 둔다.

K_GRID = list(range(2, 11))
UMAP_NEIGHBORS_GRID = [15, 50]
HDBSCAN_MIN_CLUSTER_GRID = [50, 100, 250, 500]
HDBSCAN_MIN_SAMPLES_GRID = [5, 25]
VAE_LATENT_GRID = [2, 4, 8]

# 라벨 없이 적용하는 실용적 제약. 군집이 1개거나 지나치게 잘게 쪼개진 해,
# 또는 절반 이상을 노이즈로 버리는 해는 세그먼트로 쓸 수 없으므로 후보에서 제외한다.
MAX_CLUSTERS = 20
MAX_NOISE_RATIO = 0.5


# ─── val 선택 기준 (라벨 미사용) ──────────────────────────────────────────────

def val_score(space, labels):
    """val split 의 Silhouette. 제약을 어기면 후보에서 탈락시킨다."""
    keep = labels != -1
    n_clusters = len(set(labels[keep]))
    noise_ratio = float((~keep).mean())
    if n_clusters < 2 or n_clusters > MAX_CLUSTERS or noise_ratio > MAX_NOISE_RATIO:
        return float("-inf")
    if keep.sum() <= n_clusters:
        return float("-inf")
    return float(silhouette_score(space[keep], labels[keep]))


def safe_transform(reducer, train_x, target_x):
    """UMAP transform 은 중복 벡터가 많은 subset 에서 NaN 을 낸다.
    해당 행은 preprocessed 공간에서 가장 가까운 train 점의 embedding 을 물려받는다."""
    embedding = reducer.transform(target_x)
    broken = np.isnan(embedding).any(axis=1)
    if broken.any():
        _, indices = NearestNeighbors(n_neighbors=1).fit(train_x).kneighbors(target_x[broken])
        embedding[broken] = reducer.embedding_[indices[:, 0]]
    return embedding, float(broken.mean())


# ─── 파이프라인 (계획서 7장) ──────────────────────────────────────────────────

def pipeline_a1(train_x, val_x, test_x, seed):
    """전처리된 feature 공간 + K-Means. K 는 val Silhouette 으로 고른다."""
    best = None
    for n_clusters in K_GRID:
        model = KMeans(n_clusters=n_clusters, random_state=seed, n_init=10).fit(train_x)
        score = val_score(val_x, model.predict(val_x))
        if best is None or score > best[0]:
            best = (score, n_clusters, model)

    score, n_clusters, model = best
    return model.predict(test_x), test_x, {"selected_k": n_clusters, "val_silhouette": score}


def pipeline_a2(train_x, val_x, test_x, seed):
    """UMAP embedding + HDBSCAN. UMAP n_neighbors 와 HDBSCAN 파라미터를 val 로 고른다."""
    import hdbscan
    import umap

    n_components = min(5, train_x.shape[1])
    best = None
    for n_neighbors in UMAP_NEIGHBORS_GRID:
        reducer = umap.UMAP(
            n_components=n_components, n_neighbors=n_neighbors, min_dist=0.0,
            metric="euclidean", random_state=seed,
        ).fit(train_x)
        val_embedding, _ = safe_transform(reducer, train_x, val_x)

        for min_cluster_size in HDBSCAN_MIN_CLUSTER_GRID:
            for min_samples in HDBSCAN_MIN_SAMPLES_GRID:
                clusterer = hdbscan.HDBSCAN(
                    min_cluster_size=min_cluster_size, min_samples=min_samples,
                    prediction_data=True,
                ).fit(reducer.embedding_)
                labels, _ = hdbscan.approximate_predict(clusterer, val_embedding)
                score = val_score(val_embedding, labels)
                if best is None or score > best[0]:
                    best = (score, n_neighbors, min_cluster_size, min_samples, reducer, clusterer)

    score, n_neighbors, min_cluster_size, min_samples, reducer, clusterer = best
    test_embedding, fallback_ratio = safe_transform(reducer, train_x, test_x)
    labels, _ = hdbscan.approximate_predict(clusterer, test_embedding)
    info = {
        "selected_n_neighbors": n_neighbors,
        "selected_min_cluster_size": min_cluster_size,
        "selected_min_samples": min_samples,
        "val_silhouette": score,
        "umap_fallback_ratio": fallback_ratio,
    }
    return labels, test_embedding, info


def _train_vae(train_x, latent_dim, seed):
    import torch
    import torch.nn as nn

    torch.manual_seed(seed)
    input_dim = train_x.shape[1]

    class VAE(nn.Module):
        def __init__(self):
            super().__init__()
            self.encoder = nn.Sequential(nn.Linear(input_dim, 64), nn.ReLU(), nn.Linear(64, 32), nn.ReLU())
            self.mu = nn.Linear(32, latent_dim)
            self.logvar = nn.Linear(32, latent_dim)
            self.decoder = nn.Sequential(
                nn.Linear(latent_dim, 32), nn.ReLU(), nn.Linear(32, 64), nn.ReLU(), nn.Linear(64, input_dim)
            )

        def encode(self, x):
            hidden = self.encoder(x)
            return self.mu(hidden), self.logvar(hidden)

        def forward(self, x):
            mu, logvar = self.encode(x)
            z = mu + torch.randn_like(mu) * torch.exp(0.5 * logvar)
            return self.decoder(z), mu, logvar

    model = VAE()
    optimizer = torch.optim.Adam(model.parameters(), lr=1e-3)
    tensor = torch.tensor(train_x, dtype=torch.float32)
    loader = torch.utils.data.DataLoader(
        torch.utils.data.TensorDataset(tensor), batch_size=256, shuffle=True,
        generator=torch.Generator().manual_seed(seed),
    )

    model.train()
    for _ in range(50):
        for (batch,) in loader:
            recon, mu, logvar = model(batch)
            recon_loss = nn.functional.mse_loss(recon, batch, reduction="sum") / batch.shape[0]
            kld = -0.5 * torch.sum(1 + logvar - mu.pow(2) - logvar.exp()) / batch.shape[0]
            loss = recon_loss + kld
            optimizer.zero_grad()
            loss.backward()
            optimizer.step()

    model.eval()

    def encode(matrix):
        with torch.no_grad():
            return model.encode(torch.tensor(matrix, dtype=torch.float32))[0].numpy()

    return encode


def pipeline_a3(train_x, val_x, test_x, seed):
    """VAE latent + K-Means. latent 차원과 K 를 val Silhouette 으로 함께 고른다."""
    input_dim = train_x.shape[1]
    best = None
    for latent_dim in VAE_LATENT_GRID:
        if latent_dim > input_dim:
            continue
        encode = _train_vae(train_x, latent_dim, seed)
        train_z, val_z = encode(train_x), encode(val_x)
        for n_clusters in K_GRID:
            model = KMeans(n_clusters=n_clusters, random_state=seed, n_init=10).fit(train_z)
            score = val_score(val_z, model.predict(val_z))
            if best is None or score > best[0]:
                best = (score, latent_dim, n_clusters, model, encode)

    score, latent_dim, n_clusters, model, encode = best
    test_z = encode(test_x)
    info = {"selected_latent_dim": latent_dim, "selected_k": n_clusters, "val_silhouette": score}
    return model.predict(test_z), test_z, info


PIPELINES = {"A1": pipeline_a1, "A2": pipeline_a2, "A3": pipeline_a3}


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


# ─── 실행 ─────────────────────────────────────────────────────────────────────

def main():
    global K_GRID

    parser = argparse.ArgumentParser()
    parser.add_argument("--subsets", default="F4,F6,F7", help="쉼표 구분. Computer 2 기본값")
    parser.add_argument("--pipelines", default="A1,A2,A3")
    parser.add_argument("--seeds", default="42,43,44")
    parser.add_argument("--k-grid", default=",".join(str(item) for item in K_GRID), help="쉼표 구분 K 후보. Forced K=5는 --k-grid 5")
    parser.add_argument("--features", default="artifacts/features.csv")
    parser.add_argument("--split", default="artifacts/split.json")
    parser.add_argument("--out", default="artifacts/results.csv")
    parser.add_argument("--include-difficulty", default="")
    parser.add_argument("--exclude-difficulty", default="")
    parser.add_argument("--include-source", default="")
    parser.add_argument("--exclude-source", default="")
    args = parser.parse_args()

    K_GRID = [int(item) for item in args.k_grid.split(",") if item.strip()]

    here = os.path.dirname(__file__)
    frame = pd.read_csv(os.path.abspath(os.path.join(here, args.features)))
    frame = filter_frame(frame, args.include_difficulty, args.exclude_difficulty, args.include_source, args.exclude_source)
    with open(os.path.abspath(os.path.join(here, args.split)), "r", encoding="utf-8") as handle:
        split = json.load(handle)

    train_df = frame[frame["session_id"].isin(split["train"])].reset_index(drop=True)
    val_df = frame[frame["session_id"].isin(split["val"])].reset_index(drop=True)
    test_df = frame[frame["session_id"].isin(split["test"])].reset_index(drop=True)
    y_true = pd.Categorical(test_df["persona_id"]).codes

    if min(len(train_df), len(val_df), len(test_df)) == 0:
        raise SystemExit("[run] FAILED: filter left at least one split empty")

    subsets = args.subsets.split(",")
    pipelines = args.pipelines.split(",")
    seeds = [int(s) for s in args.seeds.split(",")]
    total = len(subsets) * len(pipelines) * len(seeds)

    print(f"[run] train {len(train_df)} / val {len(val_df)} / test {len(test_df)} sessions")
    if args.include_difficulty or args.exclude_difficulty or args.include_source or args.exclude_source:
        print(
            "[run] filters: "
            f"include_difficulty={args.include_difficulty or '-'} "
            f"exclude_difficulty={args.exclude_difficulty or '-'} "
            f"include_source={args.include_source or '-'} "
            f"exclude_source={args.exclude_source or '-'}"
        )
    print(f"[run] K grid {K_GRID[0]}..{K_GRID[-1]}, val 선택 기준 = Silhouette (라벨 미사용)")
    print(f"[run] {total} runs: {subsets} x {pipelines} x {seeds}\n")

    records = []
    index = 0
    for subset in subsets:
        columns = FEATURE_SUBSETS[subset]
        train_x, (val_x, test_x) = preprocess(train_df, [val_df, test_df], columns)
        distinct = len(np.unique(train_x, axis=0))
        print(f"[run] {subset}: {len(columns)} features, {distinct} distinct train vectors")
        for pipeline in pipelines:
            for seed in seeds:
                index += 1
                started = time.time()
                labels, space, info = PIPELINES[pipeline](train_x, val_x, test_x, seed)
                metrics = evaluate(y_true, np.asarray(labels), space)
                elapsed = time.time() - started
                records.append(
                    result_row(subset, pipeline, seed, len(columns), distinct, elapsed, metrics, info)
                )
                print(f"[{index:>2}/{total}] {subset:<4} {pipeline} seed={seed}  "
                      f"ARI={metrics['ari']:.3f}  NMI={metrics['nmi']:.3f}  "
                      f"F1={metrics['macro_f1']:.3f}  k={metrics['n_clusters']}  "
                      f"noise={metrics['noise_ratio']:.1%}  ({elapsed:.0f}s)")

    out_path = os.path.abspath(os.path.join(here, args.out))
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    pd.DataFrame(records, columns=RESULT_COLUMNS).to_csv(out_path, index=False)
    print(f"\n[run] wrote {len(records)} runs -> {out_path}")


if __name__ == "__main__":
    main()

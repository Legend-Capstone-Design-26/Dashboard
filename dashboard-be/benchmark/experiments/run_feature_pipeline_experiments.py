import argparse
import importlib
import json
from pathlib import Path
from typing import Any

import numpy as np
from scipy.optimize import linear_sum_assignment
from sklearn.cluster import KMeans
from sklearn.metrics import (
    accuracy_score,
    adjusted_mutual_info_score,
    adjusted_rand_score,
    calinski_harabasz_score,
    confusion_matrix,
    davies_bouldin_score,
    f1_score,
    normalized_mutual_info_score,
    silhouette_score,
)


def load_json(path: Path) -> Any:
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def save_json(path: Path, payload: Any) -> None:
    with path.open("w", encoding="utf-8") as handle:
        json.dump(payload, handle, ensure_ascii=False, indent=2)


def hungarian_mapping(y_true: np.ndarray, y_pred: np.ndarray) -> dict[int, int]:
    labels_true = np.unique(y_true)
    labels_pred = np.unique(y_pred)
    matrix = np.zeros((len(labels_true), len(labels_pred)), dtype=np.int64)
    for row, actual in enumerate(labels_true):
        for col, predicted in enumerate(labels_pred):
            matrix[row, col] = int(np.sum((y_true == actual) & (y_pred == predicted)))
    if matrix.size == 0 or not labels_pred.size:
        return {}
    cost = matrix.max(initial=0) - matrix
    row_ind, col_ind = linear_sum_assignment(cost)
    return {int(labels_pred[col]): int(labels_true[row]) for row, col in zip(row_ind, col_ind)}


def hungarian_macro_f1(y_true: np.ndarray, y_pred: np.ndarray) -> float:
    mapping = hungarian_mapping(y_true, y_pred)
    mapped = np.array([mapping.get(label, -1) for label in y_pred])
    valid_mask = mapped >= 0
    if not np.any(valid_mask):
        return 0.0
    return float(f1_score(y_true[valid_mask], mapped[valid_mask], average="macro"))


def hungarian_accuracy(y_true: np.ndarray, y_pred: np.ndarray) -> float:
    mapping = hungarian_mapping(y_true, y_pred)
    mapped = np.array([mapping.get(label, -1) for label in y_pred])
    valid_mask = mapped >= 0
    if not np.any(valid_mask):
        return 0.0
    return float(accuracy_score(y_true[valid_mask], mapped[valid_mask]))


def safe_internal_metrics(X: np.ndarray, labels: np.ndarray) -> dict[str, float | None]:
    unique = np.unique(labels)
    if unique.shape[0] < 2 or unique.shape[0] >= X.shape[0]:
        return {
            "silhouette": None,
            "davies_bouldin": None,
            "calinski_harabasz": None,
        }
    return {
        "silhouette": float(silhouette_score(X, labels)),
        "davies_bouldin": float(davies_bouldin_score(X, labels)),
        "calinski_harabasz": float(calinski_harabasz_score(X, labels)),
    }


def validation_silhouette(X_eval: np.ndarray, labels: np.ndarray) -> float:
    unique = np.unique(labels)
    if unique.shape[0] < 2 or unique.shape[0] >= X_eval.shape[0]:
        return float("-inf")
    return float(silhouette_score(X_eval, labels))


def kmeans_candidates(cfg: dict[str, Any]) -> list[int]:
    if "k_grid" in cfg:
        return [int(value) for value in cfg["k_grid"]]
    return [int(cfg["n_clusters"])]


def fit_kmeans_with_validation(X_train, X_val, seed, cfg):
    best = None
    for n_clusters in kmeans_candidates(cfg):
        model = KMeans(
            n_clusters=n_clusters,
            n_init=cfg["n_init"],
            max_iter=cfg["max_iter"],
            random_state=seed,
        )
        model.fit(X_train)
        score = validation_silhouette(X_val, model.predict(X_val))
        if best is None or score > best[0]:
            best = (score, n_clusters, model)
    if best is None:
        raise ValueError("No valid K-Means candidate was available")
    return best


def run_a1(X_train, X_val, X_test, seed, cfg):
    score, n_clusters, model = fit_kmeans_with_validation(X_train, X_val, seed, cfg)
    test_labels = model.predict(X_test)
    return X_test, test_labels, {"selected_k": n_clusters, "val_silhouette": score}


def run_fixed_a1(X_train, X_test, seed, cfg):
    model = KMeans(
        n_clusters=cfg["n_clusters"],
        n_init=cfg["n_init"],
        max_iter=cfg["max_iter"],
        random_state=seed,
    )
    model.fit(X_train)
    test_labels = model.predict(X_test)
    return X_test, test_labels, {"selected_k": cfg["n_clusters"], "val_silhouette": None}


def run_a2(X_train, X_test, seed, cfg_umap, cfg_hdbscan):
    umap = importlib.import_module("umap")
    hdbscan = importlib.import_module("hdbscan")
    prediction = importlib.import_module("hdbscan.prediction")

    reducer = umap.UMAP(
        n_components=cfg_umap["n_components"],
        n_neighbors=cfg_umap["n_neighbors"],
        min_dist=cfg_umap["min_dist"],
        metric=cfg_umap["metric"],
        random_state=seed,
    )
    train_emb = reducer.fit_transform(X_train)
    test_emb = reducer.transform(X_test)
    train_emb = np.nan_to_num(np.asarray(train_emb, dtype=np.float32), nan=0.0, posinf=0.0, neginf=0.0)
    test_emb = np.nan_to_num(np.asarray(test_emb, dtype=np.float32), nan=0.0, posinf=0.0, neginf=0.0)

    clusterer = hdbscan.HDBSCAN(
        min_cluster_size=cfg_hdbscan["min_cluster_size"],
        min_samples=cfg_hdbscan["min_samples"],
        prediction_data=cfg_hdbscan["prediction_data"],
    )
    clusterer.fit(train_emb)
    test_labels, _ = prediction.approximate_predict(clusterer, test_emb)
    return test_emb, test_labels, {}


def run_a3(X_train, X_val, X_test, seed, cfg_vae, cfg_kmeans):
    import torch
    from torch import nn
    from torch.utils.data import DataLoader, TensorDataset

    torch.manual_seed(seed)

    input_dim = X_train.shape[1]
    hidden_dim = cfg_vae["hidden_dim"]
    latent_dim = cfg_vae["latent_dim"]

    class VAE(nn.Module):
        def __init__(self):
            super().__init__()
            self.encoder = nn.Sequential(
                nn.Linear(input_dim, hidden_dim),
                nn.ReLU(),
            )
            self.mu = nn.Linear(hidden_dim, latent_dim)
            self.logvar = nn.Linear(hidden_dim, latent_dim)
            self.decoder = nn.Sequential(
                nn.Linear(latent_dim, hidden_dim),
                nn.ReLU(),
                nn.Linear(hidden_dim, input_dim),
            )

        def encode(self, x):
            hidden = self.encoder(x)
            return self.mu(hidden), self.logvar(hidden)

        def reparameterize(self, mu, logvar):
            std = torch.exp(0.5 * logvar)
            eps = torch.randn_like(std)
            return mu + eps * std

        def forward(self, x):
            mu, logvar = self.encode(x)
            z = self.reparameterize(mu, logvar)
            recon = self.decoder(z)
            return recon, mu, logvar

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    model = VAE().to(device)
    optimizer = torch.optim.Adam(model.parameters(), lr=cfg_vae["learning_rate"])
    dataset = TensorDataset(torch.tensor(X_train, dtype=torch.float32))
    loader = DataLoader(dataset, batch_size=cfg_vae["batch_size"], shuffle=True)

    def loss_fn(x, recon, mu, logvar):
        recon_loss = ((x - recon) ** 2).mean()
        kl = -0.5 * torch.mean(1 + logvar - mu.pow(2) - logvar.exp())
        return recon_loss + cfg_vae["beta"] * kl

    model.train()
    for _ in range(cfg_vae["epochs"]):
        for (batch_x,) in loader:
            batch_x = batch_x.to(device)
            recon, mu, logvar = model(batch_x)
            loss = loss_fn(batch_x, recon, mu, logvar)
            optimizer.zero_grad()
            loss.backward()
            optimizer.step()

    def encode_array(array):
        model.eval()
        with torch.no_grad():
            tensor = torch.tensor(array, dtype=torch.float32).to(device)
            mu, _ = model.encode(tensor)
            return mu.cpu().numpy()

    train_latent = encode_array(X_train)
    val_latent = encode_array(X_val)
    test_latent = encode_array(X_test)
    score, n_clusters, model = fit_kmeans_with_validation(train_latent, val_latent, seed, cfg_kmeans)
    predicted = model.predict(test_latent)
    return test_latent, predicted, {"selected_k": n_clusters, "val_silhouette": score}


def evaluate_pipeline(X_eval: np.ndarray, pred_labels: np.ndarray, y_true: np.ndarray) -> dict[str, float | None]:
    metrics: dict[str, float | None] = {
        "ari": float(adjusted_rand_score(y_true, pred_labels)),
        "nmi": float(normalized_mutual_info_score(y_true, pred_labels)),
        "ami": float(adjusted_mutual_info_score(y_true, pred_labels)),
        "macro_f1": float(hungarian_macro_f1(y_true, pred_labels)),
        "hungarian_accuracy": float(hungarian_accuracy(y_true, pred_labels)),
        "n_clusters": int(len(np.unique(pred_labels))),
    }
    internal = safe_internal_metrics(X_eval, pred_labels)
    for key, value in internal.items():
        metrics[key] = value
    return metrics


def run_condition(subset_id, config, seed):
    base = Path(config["input_dir"])
    dataset = np.load(base / f"{subset_id.lower()}_dataset.npz")
    X_train = dataset["X_train"]
    X_val = dataset["X_val"]
    X_test = dataset["X_test"]
    y_test = dataset["y_test"]

    results = []
    for pipeline_id in config["pipelines"]:
        if pipeline_id == "A1":
            X_eval, pred, extra = run_a1(X_train, X_val, X_test, seed, config["kmeans"])
        elif pipeline_id == "A2":
            X_eval, pred, extra = run_a2(X_train, X_test, seed, config["umap"], config["hdbscan"])
        elif pipeline_id == "A3":
            X_eval, pred, extra = run_a3(X_train, X_val, X_test, seed, config["vae"], config["kmeans"])
        else:
            raise ValueError(f"Unsupported pipeline: {pipeline_id}")

        metrics = evaluate_pipeline(np.asarray(X_eval), np.asarray(pred), np.asarray(y_test))
        results.append({
            "subset": subset_id,
            "pipeline": pipeline_id,
            "seed": seed,
            **extra,
            **metrics,
        })
    return results


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", required=True)
    args = parser.parse_args()

    config_path = Path(args.config)
    config = load_json(config_path)
    output_dir = Path(config["output_dir"])
    output_dir.mkdir(parents=True, exist_ok=True)

    all_results = []
    for subset_id in config["subsets"]:
        for seed in config["seeds"]:
            all_results.extend(run_condition(subset_id, config, seed))

    save_json(output_dir / "raw-results.json", {"results": all_results})
    print(f"Prepared runner and result writer for {len(all_results)} runs")


if __name__ == "__main__":
    main()

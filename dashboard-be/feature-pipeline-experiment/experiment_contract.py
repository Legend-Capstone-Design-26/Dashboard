import numpy as np
from scipy.optimize import linear_sum_assignment
from sklearn.metrics import (
    accuracy_score,
    adjusted_mutual_info_score,
    adjusted_rand_score,
    calinski_harabasz_score,
    davies_bouldin_score,
    f1_score,
    normalized_mutual_info_score,
    silhouette_score,
)
from sklearn.preprocessing import StandardScaler

G1_INTENSITY = ["session_duration_ms", "event_count", "page_view_count", "click_count"]
G2_PATH = ["depth", "unique_page_ratio", "revisit_rate", "backtrack_count", "loop_rate"]
G3_EXPLORE = ["search_count", "filter_count", "product_detail_count", "review_view_count"]
G4_FUNNEL = ["cart_add_count", "cart_remove_count", "checkout_entered",
             "payment_attempt_count", "purchase_completed"]
G5_FRICTION = ["error_count"]

FEATURE_SUBSETS = {
    "F0": G1_INTENSITY + G2_PATH + G3_EXPLORE + G4_FUNNEL + G5_FRICTION,
    "F2": G2_PATH,
    "F3": G3_EXPLORE,
    "F4": G4_FUNNEL,
    "F6": G2_PATH + G3_EXPLORE,
    "F7": G3_EXPLORE + G4_FUNNEL,
    "F11": G2_PATH + G3_EXPLORE + G4_FUNNEL,
    "F13": G1_INTENSITY + G2_PATH + G3_EXPLORE + G5_FRICTION,
    "F15": G1_INTENSITY + G3_EXPLORE + G4_FUNNEL + G5_FRICTION,
}

RATIO_FEATURES = {"unique_page_ratio", "revisit_rate", "loop_rate"}
BINARY_FEATURES = {"checkout_entered", "purchase_completed"}

RESULT_COLUMNS = [
    "feature_subset",
    "pipeline",
    "seed",
    "n_features",
    "distinct_train_vectors",
    "runtime_sec",
    "n_clusters",
    "noise_ratio",
    "ari",
    "nmi",
    "ami",
    "macro_f1",
    "hungarian_accuracy",
    "majority_accuracy",
    "silhouette",
    "davies_bouldin",
    "calinski_harabasz",
    "selected_k",
    "val_silhouette",
    "selected_n_neighbors",
    "selected_min_cluster_size",
    "selected_min_samples",
    "umap_fallback_ratio",
    "selected_latent_dim",
]

PIPELINE_INFO_DEFAULTS = {
    "selected_k": np.nan,
    "val_silhouette": np.nan,
    "selected_n_neighbors": np.nan,
    "selected_min_cluster_size": np.nan,
    "selected_min_samples": np.nan,
    "umap_fallback_ratio": 0.0,
    "selected_latent_dim": np.nan,
}


def preprocess(train_df, other_dfs, columns):
    def transform(frame):
        out = frame[columns].astype(float).copy()
        for col in columns:
            if col in BINARY_FEATURES or col in RATIO_FEATURES:
                continue
            out[col] = np.log1p(out[col])
        return out.values

    train_x = transform(train_df)
    scale_mask = np.array([col not in BINARY_FEATURES for col in columns])
    scaler = StandardScaler().fit(train_x[:, scale_mask])
    train_x[:, scale_mask] = scaler.transform(train_x[:, scale_mask])

    others = []
    for frame in other_dfs:
        matrix = transform(frame)
        matrix[:, scale_mask] = scaler.transform(matrix[:, scale_mask])
        others.append(matrix)
    return train_x, others


def hungarian_mapping(y_true, y_pred):
    true_labels = np.unique(y_true)
    pred_labels = np.unique(y_pred[y_pred != -1])
    if len(pred_labels) == 0:
        return {}
    matrix = np.zeros((len(pred_labels), len(true_labels)))
    for i, predicted in enumerate(pred_labels):
        for j, actual in enumerate(true_labels):
            matrix[i, j] = np.sum((y_pred == predicted) & (y_true == actual))
    rows, cols = linear_sum_assignment(-matrix)
    return {pred_labels[r]: true_labels[c] for r, c in zip(rows, cols)}


def macro_f1_hungarian(y_true, y_pred):
    true_labels = np.unique(y_true)
    mapping = hungarian_mapping(y_true, y_pred)
    if not mapping:
        return 0.0
    mapped = np.array([mapping.get(p, -999) for p in y_pred])
    return f1_score(y_true, mapped, average="macro", labels=true_labels, zero_division=0)


def accuracy_hungarian(y_true, y_pred):
    pred_labels = np.unique(y_pred[y_pred != -1])
    if len(pred_labels) == 0:
        return 0.0
    mapping = hungarian_mapping(y_true, y_pred)
    mapped = np.array([mapping.get(p, -999) for p in y_pred])
    valid = mapped != -999
    if not valid.any():
        return 0.0
    return accuracy_score(y_true[valid], mapped[valid])


def majority_vote_accuracy(y_true, y_pred):
    valid = y_pred != -1
    if not valid.any():
        return 0.0
    mapping = {}
    for predicted in np.unique(y_pred[valid]):
        labels, counts = np.unique(y_true[(y_pred == predicted) & valid], return_counts=True)
        mapping[predicted] = labels[int(np.argmax(counts))]
    mapped = np.array([mapping.get(predicted, "__noise__") for predicted in y_pred])
    return accuracy_score(y_true[valid], mapped[valid])


def evaluate(y_true, y_pred, space):
    noise_mask = y_pred == -1
    n_clusters = len(set(y_pred[~noise_mask]))

    metrics = {
        "n_clusters": n_clusters,
        "noise_ratio": float(noise_mask.mean()),
        "ari": adjusted_rand_score(y_true, y_pred),
        "nmi": normalized_mutual_info_score(y_true, y_pred),
        "ami": adjusted_mutual_info_score(y_true, y_pred),
        "macro_f1": macro_f1_hungarian(y_true, y_pred),
        "hungarian_accuracy": accuracy_hungarian(y_true, y_pred),
        "majority_accuracy": majority_vote_accuracy(y_true, y_pred),
    }

    clean_space, clean_pred = space[~noise_mask], y_pred[~noise_mask]
    if n_clusters >= 2 and len(clean_pred) > n_clusters:
        metrics["silhouette"] = silhouette_score(clean_space, clean_pred)
        metrics["davies_bouldin"] = davies_bouldin_score(clean_space, clean_pred)
        metrics["calinski_harabasz"] = calinski_harabasz_score(clean_space, clean_pred)
    else:
        metrics["silhouette"] = float("nan")
        metrics["davies_bouldin"] = float("nan")
        metrics["calinski_harabasz"] = float("nan")
    return metrics


def result_row(feature_subset, pipeline, seed, n_features, distinct_vectors, runtime_sec, metrics, info):
    row = {
        "feature_subset": feature_subset,
        "pipeline": pipeline,
        "seed": seed,
        "n_features": n_features,
        "distinct_train_vectors": distinct_vectors,
        "runtime_sec": round(runtime_sec, 2),
        **metrics,
        **PIPELINE_INFO_DEFAULTS,
        **info,
    }
    return {column: row[column] for column in RESULT_COLUMNS}

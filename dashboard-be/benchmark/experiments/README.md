# F0/F2/F3 실험 실행 안내

이 디렉터리는 feature subset 묶음별로 아래 3개 파이프라인을 비교하기 위한 실행 자산을 포함한다.

- `A1`: 전처리된 feature + K-Means
- `A2`: 전처리된 feature -> UMAP -> HDBSCAN
- `A3`: 전처리된 feature -> VAE latent -> K-Means

## 포함 파일

- `requirements.txt`
- `f0_f2_f3_experiment_config.json`
- `f4_f6_f7_experiment_config.json`
- `f11_f13_f15_experiment_config.json`
- `prepare_runner_inputs.py`
- `run_feature_pipeline_experiments.py`

## 전체 흐름

1. benchmark feature table 준비
2. 전처리 파라미터를 train split에서 학습
3. 정규화된 train/val/test 입력 저장
4. `A1`, `A2`, `A3` 파이프라인 실행
5. test split 기준 성능 지표 산출

## 입력 데이터

기본 입력 경로:

- `benchmark/output/merged-7500/feature-study`

이 경로에는 아래 파일이 있어야 한다.

- `f0-features.json`
- `f2-features.json`
- `f3-features.json`
- `split-summary.json`

## 1단계: runner 입력 준비

이 단계는 raw feature table을 읽어서 train/val/test 기준으로 정규화된 입력을 저장한다.

컴퓨터 1:

```bash
python benchmark/experiments/prepare_runner_inputs.py \
  --input-dir benchmark/output/merged-7500/feature-study \
  --output-dir benchmark/output/merged-7500/runner-inputs/f0-f2-f3 \
  --subsets F0,F2,F3
```

컴퓨터 2:

```bash
python benchmark/experiments/prepare_runner_inputs.py \
  --input-dir benchmark/output/merged-7500/feature-study \
  --output-dir benchmark/output/merged-7500/runner-inputs/f4-f6-f7 \
  --subsets F4,F6,F7
```

컴퓨터 3:

```bash
python benchmark/experiments/prepare_runner_inputs.py \
  --input-dir benchmark/output/merged-7500/feature-study \
  --output-dir benchmark/output/merged-7500/runner-inputs/f11-f13-f15 \
  --subsets F11,F13,F15
```

출력:

- `f0_dataset.npz`
- `f0_metadata.json`
- `f2_dataset.npz`
- `f2_metadata.json`
- `f3_dataset.npz`
- `f3_metadata.json`
- `preparation-summary.json`

## 2단계: 실험 실행

실제 실험은 아래처럼 실행한다.

컴퓨터 1:

```bash
python benchmark/experiments/run_feature_pipeline_experiments.py \
  --config benchmark/experiments/f0_f2_f3_experiment_config.json
```

컴퓨터 2:

```bash
python benchmark/experiments/run_feature_pipeline_experiments.py \
  --config benchmark/experiments/f4_f6_f7_experiment_config.json
```

컴퓨터 3:

```bash
python benchmark/experiments/run_feature_pipeline_experiments.py \
  --config benchmark/experiments/f11_f13_f15_experiment_config.json
```

기본 설정:

- 컴퓨터별 subset 3개
- pipelines: `A1`, `A2`, `A3`
- seeds: `1, 2, 3`

## 실행 전 원칙

정답 라벨은 절대로 학습 입력으로 사용하지 않는다.

- train/val/test 분할은 이미 feature-study 단계에서 생성됨
- 전처리 파라미터는 train split에만 fit
- val/test에는 transform만 적용
- `persona_id`는 평가 단계에서만 사용

## 주의

- `A2`와 `A3`는 추가 패키지가 필요하다.
- 특히 `hdbscan`, `umap-learn`, `torch`가 설치되어 있어야 한다.
- 이 문서와 코드는 실행 직전 상태를 목표로 하며, 환경 설치와 실제 run은 별도로 수행한다.

/**
 * Redis 캐시 초기화 스크립트
 *
 * dashboard-be가 사용하는 것과 동일한 REDIS_URL 설정을 그대로 사용한다.
 * 기본 동작은 "cluster:*" 패턴 키만 SCAN으로 찾아 삭제하는 것이지만,
 * --flushall 플래그를 주면 이 Redis 인스턴스 전체를 FLUSHDB로 초기화한다.
 * (이 ElastiCache 인스턴스를 dashboard-be 전용으로만 쓰는 경우에만 사용할 것 — 되돌릴 수 없음)
 *
 * keyPrefix가 적용된 ioredis 클라이언트로 SCAN한 뒤 그대로 DEL하면 prefix가 이중으로
 * 붙을 수 있어, 이 스크립트는 prefix 없는 raw 클라이언트를 쓰고 패턴 문자열에
 * REDIS_KEY_PREFIX를 직접 포함시킨다.
 *
 * 실행:
 *   node scripts/flush-clustering-cache.js                    # cluster:* dry-run
 *   node scripts/flush-clustering-cache.js --yes               # cluster:* 실제 삭제
 *   node scripts/flush-clustering-cache.js ab-sample --yes      # ab-sample의 cluster:*만 삭제
 *   node scripts/flush-clustering-cache.js --flushall           # 인스턴스 전체 초기화 dry-run(경고만 출력)
 *   node scripts/flush-clustering-cache.js --flushall --yes     # 인스턴스 전체 FLUSHDB 실행
 */

"use strict";

const Redis = require("ioredis");
const { getInfraConfig } = require("../services/runtime/infra-config");

async function scanKeys(client, pattern) {
  const found = [];
  let cursor = "0";
  do {
    const [nextCursor, keys] = await client.scan(cursor, "MATCH", pattern, "COUNT", 200);
    cursor = nextCursor;
    found.push(...keys);
  } while (cursor !== "0");
  return found;
}

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes("--yes");
  const flushAll = args.includes("--flushall");
  const siteId = args.find((a) => !a.startsWith("--"));

  const infra = getInfraConfig();
  if (!infra.redis.enabled) {
    console.warn("[flush-clustering-cache] ENABLE_REDIS_SESSION_STORE=false — 현재 .env 기준으로는 Redis가 비활성화되어 있습니다. 계속 진행합니다.");
  }

  const client = new Redis(infra.redis.url, { lazyConnect: true, maxRetriesPerRequest: 1 });
  await client.connect();

  if (flushAll) {
    const dbsize = await client.dbsize();
    console.log(`[flush-clustering-cache] 대상 Redis(${infra.redis.url})의 현재 키 개수: ${dbsize}`);
    if (!apply) {
      console.log("[flush-clustering-cache] dry-run 입니다. 이 인스턴스 전체(FLUSHDB)를 실제로 초기화하려면 --flushall --yes 로 다시 실행하세요.");
      console.log("[flush-clustering-cache] 주의: 이 Redis를 다른 용도로도 쓰고 있다면 그 데이터도 함께 삭제됩니다.");
      await client.quit();
      return;
    }
    await client.flushdb();
    console.log(`[flush-clustering-cache] FLUSHDB 완료. ${dbsize}개 키가 삭제되었습니다.`);
    await client.quit();
    return;
  }

  const prefix = infra.redis.keyPrefix ? `${infra.redis.keyPrefix}:` : "";
  const pattern = siteId ? `${prefix}cluster:*:${siteId}` : `${prefix}cluster:*`;

  const keys = await scanKeys(client, pattern);

  if (keys.length === 0) {
    console.log(`[flush-clustering-cache] 패턴 "${pattern}"에 해당하는 키가 없습니다.`);
    await client.quit();
    return;
  }

  console.log(`[flush-clustering-cache] 패턴 "${pattern}" 대상 키 ${keys.length}개:`);
  keys.forEach((k) => console.log(`  - ${k}`));

  if (!apply) {
    console.log("\n[flush-clustering-cache] dry-run 입니다. 실제로 삭제하려면 --yes 플래그를 추가해 다시 실행하세요.");
    await client.quit();
    return;
  }

  await client.del(...keys);
  console.log(`\n[flush-clustering-cache] ${keys.length}개 키를 삭제했습니다.`);
  await client.quit();
}

main().catch((err) => {
  console.error("[flush-clustering-cache] 오류:", err);
  process.exit(1);
});

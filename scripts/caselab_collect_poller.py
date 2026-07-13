#!/usr/bin/env python3
"""caselab 수집 요청 폴러 — admin '지금 수집 요청' 큐를 소진한다.

흐름: claim(가장 오래된 pending) → 각 봇 프로필의 enabled ingest 크론 잡을 그대로 재실행
      (봇이 스스로 /api/seeds/ingest로 적재) → complete.

핵심: 9시 고정 크론 대신, admin 버튼이 클라우드 큐에 요청을 남기고 이 폴러가 랩톱 켜진
      아무 때나(예: 10분 간격 launchd/cron) 큐를 비운다. 요청은 클라우드 DB에 영속하므로
      랩톱이 꺼져 있어도 다음에 켜질 때 처리된다.

로스터는 하드코딩하지 않고 자동 발견: ~/.hermes/profiles/*/cron/jobs.json 중
enabled=True이고 프롬프트에 ingest 지시가 있는 잡을 모두 재실행한다(현재 4개 레인:
AI브리핑·서비스·블로그·유튜브). 각 잡의 프롬프트에 이미 적재 지시가 들어 있어 봇이 자체 적재한다.
"""
from __future__ import annotations

import concurrent.futures
import glob
import json
import os
import shutil
import subprocess
import sys
import urllib.request
from pathlib import Path

HERMES = Path.home() / ".hermes"


def hermes_bin() -> str:
    # launchd/cron은 PATH가 최소라 절대경로로 해석.
    return (
        os.environ.get("HERMES_BIN")
        or shutil.which("hermes")
        or str(Path.home() / ".local" / "bin" / "hermes")
    )


ENV_FILE = HERMES / ".env"
LOCK_FILE = HERMES / "cron" / ".caselab_collect_poller.lock"
BASE = os.environ.get("CASELAB_ADMIN_URL", "https://caselab-admin.vercel.app")
PER_JOB_TIMEOUT = 1800  # 봇 1개 수집 최대 30분

TOKEN = ""


def load_token() -> str:
    for line in ENV_FILE.read_text().splitlines():
        if line.startswith("HERMES_INGEST_TOKEN="):
            return line.split("=", 1)[1].strip()
    sys.stderr.write("HERMES_INGEST_TOKEN이 ~/.hermes/.env에 없음\n")
    sys.exit(1)


def api(path: str, data: dict | None = None):
    req = urllib.request.Request(BASE + path, method="POST" if data is not None else "GET")
    req.add_header("Authorization", "Bearer " + TOKEN)
    if data is not None:
        req.add_header("Content-Type", "application/json")
        req.data = json.dumps(data).encode()
    with urllib.request.urlopen(req, timeout=30) as r:
        raw = r.read()
        return json.loads(raw) if raw else None


def discover_jobs() -> list[tuple[str, str, str]]:
    """(profile, job_name, prompt) 목록 — enabled이고 ingest 지시가 있는 잡."""
    found: list[tuple[str, str, str]] = []
    for f in glob.glob(str(HERMES / "profiles" / "*" / "cron" / "jobs.json")):
        profile = f.split("/profiles/")[1].split("/")[0]
        try:
            d = json.loads(Path(f).read_text())
        except Exception:
            continue
        jobs = d if isinstance(d, list) else d.get("jobs", list(d.values()) if isinstance(d, dict) else [])
        for j in jobs:
            prompt = str(j.get("prompt", ""))
            ingest = ("seeds/ingest" in prompt) or ("caselab-admin" in prompt) or ("/api/seeds" in prompt)
            if j.get("enabled") and ingest and prompt:
                found.append((profile, j.get("name", "?"), prompt))
    return found


def run_bot(profile: str, prompt: str) -> bool:
    """봇 프로필로 프롬프트 1회 실행(자체 적재). 성공 시 True."""
    cmd = [hermes_bin(), "--profile", profile, "chat", "-Q", "-q", prompt]
    try:
        res = subprocess.run(cmd, capture_output=True, text=True, timeout=PER_JOB_TIMEOUT)
    except subprocess.TimeoutExpired:
        sys.stderr.write(f"[{profile}] timeout\n")
        return False
    if res.returncode != 0:
        sys.stderr.write(f"[{profile}] rc={res.returncode}: {(res.stderr or res.stdout or '')[:200]}\n")
        return False
    return True


def acquire_lock() -> bool:
    LOCK_FILE.parent.mkdir(parents=True, exist_ok=True)
    try:
        fd = os.open(str(LOCK_FILE), os.O_CREAT | os.O_EXCL | os.O_WRONLY)
        os.write(fd, str(os.getpid()).encode())
        os.close(fd)
        return True
    except FileExistsError:
        return False


def release_lock() -> None:
    try:
        LOCK_FILE.unlink()
    except FileNotFoundError:
        pass


def main() -> int:
    global TOKEN
    TOKEN = load_token()

    if not acquire_lock():
        return 0  # 이미 다른 폴러가 수집 중
    try:
        claim = api("/api/collect-requests/claim", data={})
        req = (claim or {}).get("request")
        if not req:
            return 0  # 대기 요청 없음
        rid = req["id"]

        jobs = discover_jobs()
        if not jobs:
            api(f"/api/collect-requests/{rid}/complete", data={"ok": False, "error": "적재 대상 봇 잡 없음"})
            return 1

        # 프로필 단위 병렬 실행 — 서로 다른 프로필은 동시에, 같은 프로필 내 잡은 순차.
        # (같은 프로필 봇을 동시에 돌리면 profile/state.db SQLite 락 충돌 → 순차 필수)
        # 총 소요는 순차 합(~40분)이 아니라 가장 느린 프로필 1개(≈15분)로 수렴.
        by_profile: dict[str, list[tuple[str, str]]] = {}
        for profile, name, prompt in jobs:
            by_profile.setdefault(profile, []).append((name, prompt))

        def run_profile(profile: str, lane_jobs: list[tuple[str, str]]) -> tuple[int, list[str]]:
            ok, errs = 0, []
            for name, prompt in lane_jobs:
                if run_bot(profile, prompt):
                    ok += 1
                else:
                    errs.append(f"{profile}/{name}")
            return ok, errs

        ok_count = 0
        errors: list[str] = []
        with concurrent.futures.ThreadPoolExecutor(max_workers=len(by_profile)) as ex:
            futs = [ex.submit(run_profile, p, js) for p, js in by_profile.items()]
            for f in concurrent.futures.as_completed(futs):
                ok, errs = f.result()
                ok_count += ok
                errors.extend(errs)

        if ok_count > 0:
            # 씨앗 수는 봇이 자체 적재라 정확히 모름 → result_count 생략(스튜디오가 새로고침으로 반영).
            api(f"/api/collect-requests/{rid}/complete", data={"ok": True})
        else:
            api(f"/api/collect-requests/{rid}/complete",
                data={"ok": False, "error": "모든 레인 실패: " + ", ".join(errors)})
        return 0
    finally:
        release_lock()


if __name__ == "__main__":
    raise SystemExit(main())

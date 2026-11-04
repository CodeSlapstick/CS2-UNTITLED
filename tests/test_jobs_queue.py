"""Exercise the actual RQ queue/worker APIs against an isolated Redis emulator."""
import fakeredis
import pytest
from rq import SimpleWorker
from rq.timeouts import TimerDeathPenalty

from backend.jobs import demo_processing as jobs


class PortableWorker(SimpleWorker):
    # SIGALRM is unavailable on Windows; Linux production uses RQ's fork worker.
    death_penalty_class = TimerDeathPenalty


@pytest.mark.parametrize("fail", [False, True])
def test_enqueue_worker_and_status(monkeypatch, fail):
    connection = fakeredis.FakeRedis()
    monkeypatch.setattr(jobs, "QUEUE_BACKEND", "rq")
    monkeypatch.setattr(jobs, "_redis", lambda: connection)

    def process(match_id):
        if fail:
            raise jobs.JobError("invalid demo")
        return {"match_id": match_id, "rounds": 6}

    monkeypatch.setattr(jobs, "parse_demo", process)
    job_id = jobs.enqueue_parse(42)
    assert jobs.job_state(job_id) == "queued"
    queue = jobs._queue()
    worker = PortableWorker([queue], connection=connection)
    worker.work(burst=True, with_scheduler=False)
    assert jobs.job_state(job_id) == ("failed" if fail else "finished")
    if not fail:
        assert queue.fetch_job(job_id).return_value() == {"match_id": 42, "rounds": 6}

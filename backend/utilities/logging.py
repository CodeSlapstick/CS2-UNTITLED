"""Console-safe logging used during application startup and requests."""


def log(message: str) -> None:
    try:
        print(message, flush=True)
    except UnicodeEncodeError:
        print(message.encode("ascii", "replace").decode("ascii"), flush=True)

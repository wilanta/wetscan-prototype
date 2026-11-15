# Trusted stdlib-only G01 probe. The loader supplies reviewed CONTROL; no repository imports.
import errno, hashlib, json, os, socket, sys, time
mode = CONTROL["mode"]
if mode == "hold":
    time.sleep(CONTROL["holdMs"] / 1000)
elif mode == "output":
    sys.stdout.write("X" * 1048576)
    sys.stdout.flush()
    sys.exit(0)
elif mode == "memory":
    blocks = []
    while True:
        blocks.append(bytearray(16 * 1024 * 1024))
def denied(path):
    try:
        with open(path, "wb") as f:
            f.write(b"G01")
    except OSError as e:
        return e.errno in (errno.EROFS, errno.EACCES, errno.EPERM)
    return False
files = []
total = 0
for parent, dirs, names in os.walk("/source", followlinks=False):
    if any(os.path.islink(os.path.join(parent, d)) for d in dirs):
        sys.exit(3)
    for name in sorted(names):
        path = os.path.join(parent, name)
        if os.path.islink(path) or not os.path.isfile(path):
            sys.exit(3)
        with open(path, "rb") as f:
            data = f.read(65537)
        total += len(data)
        if len(data) > 65536 or total > 20000000 or len(files) >= 1000:
            sys.exit(3)
        files.append([os.path.relpath(path, "/source").replace(os.sep, "/"), hashlib.sha256(data).hexdigest(), len(data)])
files.sort()
manifest = hashlib.sha256(json.dumps(files, separators=(",", ":"), ensure_ascii=False).encode()).hexdigest()
checks = {"non_root": os.getuid() == 65532, "read_only_root": denied("/g01-write"), "read_only_source": denied("/source/g01-write"), "source_readable": bool(files), "no_socket": not os.path.exists("/var/run/docker.sock"), "no_host_secrets": not any(k.startswith(("AUTH_", "GITHUB_", "PG")) or k == "DATABASE_URL" for k in os.environ)}
if mode == "controls":
    try:
        with socket.create_connection(("198.51.100.1", 443), .5):
            checks["no_network"] = False
    except OSError:
        checks["no_network"] = True
    def read(p):
        with open(p) as f:
            return f.read().strip()
    quota, period = read("/sys/fs/cgroup/cpu.max").split()
    checks.update(cpu=quota != "max" and int(quota) <= int(period), memory=read("/sys/fs/cgroup/memory.max") == "268435456", pids=read("/sys/fs/cgroup/pids.max") == "64")
print(json.dumps({"version": 1, "files": len(files), "bytes": total, "manifest": manifest, "checks": checks}, sort_keys=True))
sys.exit(0 if all(checks.values()) else 2)

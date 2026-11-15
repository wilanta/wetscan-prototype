# Trusted G01 control fixture. Never import or execute a repository script.
import errno, json, os, socket, sys, time
mode = sys.argv[1]
if mode == "sleep":
    time.sleep(30)
elif mode == "output":
    sys.stdout.write("X" * 1048576)
    sys.stdout.flush()
elif mode == "memory":
    blocks = []
    while True:
        blocks.append(bytearray(16 * 1024 * 1024))
elif mode == "controls":
    def denied(path):
        try:
            with open(path, "w") as f:
                f.write("G01")
        except OSError as e:
            return e.errno in (errno.EROFS, errno.EACCES, errno.EPERM)
        return False
    def unreadable(path):
        try:
            with open(path, "rb") as f:
                f.read(1)
        except OSError as e:
            return e.errno in (errno.ENOENT, errno.EACCES, errno.EPERM)
        return False
    def read(path):
        with open(path) as f:
            return f.read().strip()
    with open("/source/fixture.txt") as f:
        readable = f.read() == "guard-g01-synthetic-only\n"
    with open("/tmp/guard-g01-scratch", "w") as f:
        f.write("ephemeral")
    os.unlink("/tmp/guard-g01-scratch")
    network_denied = False
    try:
        with socket.create_connection(("198.51.100.1",443),0.5):
            pass
    except OSError:
        network_denied = True
    quota, period = read("/sys/fs/cgroup/cpu.max").split()
    checks = {
        "non_root": os.getuid() == 65532,
        "read_only_root": denied("/guard-g01-root-write"),
        "read_only_source": denied("/source/guard-g01-write"),
        "source_readable": readable,
        "forbidden_filesystem": unreadable("/etc/shadow") and unreadable("/host/.env"),
        "no_host_secrets": not any(k in os.environ for k in ["GITHUB_APP_PRIVATE_KEY","GITHUB_CLIENT_SECRET","AUTH_SECRET","AUTH_SESSION_SECRET","PGPASSWORD","DATABASE_URL"]),
        "no_socket": not os.path.exists("/var/run/docker.sock") and not os.path.exists("/run/docker.sock"),
        "no_network": network_denied,
        "cpu": quota != "max" and int(quota) <= int(period),
        "memory": read("/sys/fs/cgroup/memory.max") == "268435456",
        "pids": read("/sys/fs/cgroup/pids.max") == "64",
        "scratch": True
    }
    print(json.dumps(checks,sort_keys=True))
    sys.exit(0 if all(checks.values()) else 2)
else:
    sys.exit(3)

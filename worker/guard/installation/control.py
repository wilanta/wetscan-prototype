"""Controlled G02 image qualification only. Never receives owner code."""
import os,sys,json,socket,subprocess,time,errno,hashlib
from pathlib import Path
mode=sys.argv[1] if len(sys.argv)>1 else "controls"
if mode=="sleep":time.sleep(120)
elif mode=="output":
    while True:sys.stdout.write("x"*65536);sys.stdout.flush()
elif mode=="oom":
    chunks=[]
    while True:chunks.append(bytearray(16*1024*1024))
elif mode=="controls":
    def denied(path):
        try:Path(path).write_text("controlled qualification only");return False
        except OSError:return True
    status=Path("/proc/self/status").read_text()
    network_denied=False
    try:
        s=socket.create_connection(("192.0.2.1",9),timeout=1);s.close()
    except OSError:network_denied=True
    pids=[];pids_enforced=False
    try:
        for _ in range(70):pids.append(subprocess.Popen(["/bin/sleep","60"]))
    except OSError as e:pids_enforced=e.errno==errno.EAGAIN
    finally:
        for p in pids:p.terminate()
        for p in pids:p.wait()
    noexec=False
    f=Path("/tmp/guard-owned-noexec");f.write_text("#!/bin/sh\nexit 0\n");f.chmod(0o700)
    try:subprocess.run([str(f)],check=True)
    except PermissionError:noexec=True
    finally:f.unlink(missing_ok=True)
    controls={"non_root":os.getuid()==65532 and os.getgid()==65532,"read_only_root":denied("/guard-write-probe"),"read_only_source":denied("/source/guard-write-probe"),"source_readable":Path("/source/probe-control.txt").read_text()=="CONTROLLED_G02_INSTALLATION_ONLY","no_socket":not Path("/var/run/docker.sock").exists(),"no_network":network_denied,"no_privileges":"CapEff:\t0000000000000000" in status and "NoNewPrivs:\t1" in status,"seccomp":"Seccomp:\t2" in status,"pids":pids_enforced,"tmp_noexec":noexec,"no_secret_env":not any(k.startswith(("AUTH_","GITHUB_","GUARD_DB_","PG")) or k=="DATABASE_URL" for k in os.environ)}
    print(json.dumps({"classification":"CONTROLLED_G02_CONTAINER_ONLY","controls":controls,"pidsStarted":len(pids)}))
    if not all(controls.values()):raise SystemExit(2)
else:raise SystemExit("unknown controlled mode")

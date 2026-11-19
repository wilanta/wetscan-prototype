#!/usr/local/bin/python3
"""Trusted image entrypoint; source is never imported or executed."""
import os,sys,subprocess,json,tempfile
from pathlib import Path
engine=Path(sys.argv[0]).name
args=sys.argv[1:]
if args[:1]==["--guard-control"]:
    os.execv("/usr/local/bin/python3",["python3","/opt/guard/control.py",*args[1:]])
binary="/opt/guard/bin/"+engine
if args==["--help"]:
    os.execv(binary,[binary,"--help"])
if args==["--version"]:
    os.execv(binary,[binary,"version" if engine=="gitleaks" else "--version"])
if engine=="gitleaks":
    if args != ["dir","/source"]: raise SystemExit("Unsupported server-owned gitleaks arguments")
    fd,path=tempfile.mkstemp(prefix="guard-gitleaks-",suffix=".json",dir="/tmp");os.close(fd)
    try:
        result=subprocess.run([binary,"dir","/source","--config","/opt/guard/config/gitleaks.toml","--redact=100","--no-banner","--report-format","json","--report-path",path,"--exit-code","0"],stdout=sys.stderr)
        if result.returncode: raise SystemExit(result.returncode)
        data=Path(path).read_bytes()
        if len(data)>2000000:raise SystemExit("Output limit")
        json.loads(data)
        sys.stdout.buffer.write(data)
    finally: Path(path).unlink(missing_ok=True)
else:
    if engine=="osv-scanner": os.environ["GOMEMLIMIT"]="1536MiB"
    os.execv(binary,[binary,*args])

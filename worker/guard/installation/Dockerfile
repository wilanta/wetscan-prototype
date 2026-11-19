ARG BASE_IMAGE
FROM ${BASE_IMAGE}
COPY bin/ /opt/guard/bin/
COPY rules/ /opt/guard/rules/
COPY config/ /opt/guard/config/
COPY osv-cache/ /opt/guard/osv-cache/
COPY official-release-manifest.json rules-manifest.json osv-db-manifest.json /opt/guard/
COPY entry.py control.py /opt/guard/
RUN python3 -c "from pathlib import Path; [(p.write_bytes(p.read_bytes().replace(bytes([13,10]),bytes([10])))) for p in [Path('/opt/guard/entry.py'),Path('/opt/guard/control.py')]]"
RUN chmod 0555 /opt/guard/bin/* /opt/guard/entry.py && \
    for engine in opengrep osv-scanner gitleaks trivy; do ln -s /opt/guard/entry.py /usr/local/bin/$engine; done
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 HOME=/tmp XDG_CACHE_HOME=/tmp \
    OSV_SCANNER_LOCAL_DB_CACHE_DIRECTORY=/opt/guard/osv-cache \
    GOMEMLIMIT=180MiB SEMGREP_SEND_METRICS=off OPENGREP_SEND_METRICS=off
USER 65532:65532
WORKDIR /tmp
ENTRYPOINT ["/usr/local/bin/opengrep"]

#!/bin/sh
# Used by Docker HEALTHCHECK — must match the process listen port (PORT).
set -eu
port="${PORT:-3000}"
exec curl -fsS "http://127.0.0.1:${port}/" >/dev/null

#!/usr/bin/env bash
# Container curl matrix for the nginx image.
# Build and run the image (the nginx config is baked in, no bind mounts):
#   DOCKER_BUILDKIT=1 docker build --build-context nkdocker=docker -t nk-web:test web
#   docker run -d --rm --name nk-web-test -p 127.0.0.1:18260:80 nk-web:test
# Usage: BASE=http://127.0.0.1:18260 bash web/scripts/container-matrix.sh [--quick]
#   --quick (or MATRIX_QUICK=1): only the rows that gate nginx behaviour before production:
#   security headers, Cache-Control, and the hostile-path redirect rows. deploy.sh runs this mode.
# Exits non-zero if any row fails, and immediately if the server is not reachable. Needs only curl.
BASE="${BASE:?set BASE, for example BASE=http://127.0.0.1:18260}"
QUICK="${MATRIX_QUICK:-0}"
[ "${1:-}" = "--quick" ] && QUICK=1
FAILS=0
pass() { echo "PASS $1"; }
fail() { echo "FAIL $1 :: $2"; FAILS=$((FAILS + 1)); }
CURL=(curl -s --max-time 10 --connect-timeout 3)
code() { "${CURL[@]}" -o /dev/null --path-as-is -w '%{http_code}' "$@"; }
hdrs() { "${CURL[@]}" -o /dev/null -D - --path-as-is "$@" | tr -d '\r'; }
sec_count() { grep -ciE '^(x-frame-options|x-content-type-options|referrer-policy):' ; }
expect_code() { # name want url [curl args]
  local name="$1" want="$2" url="$3"; shift 3
  local got; got="$(code "$@" "$BASE$url")"
  [ "$got" = "$want" ] && pass "$name ($url $got)" || fail "$name" "$url want $want got ${got:-none}"
}

# 0: the server answers at all. A dead base URL must not produce a single PASS row.
ROOT="$(code "$BASE/")"
case "$ROOT" in
  2??|3??) pass "server reachable ($BASE/ $ROOT)" ;;
  *) fail "server reachable" "$BASE/ answered '${ROOT:-nothing}'"; echo "matrix: FAIL ($FAILS) server not reachable, no other row run"; exit 1 ;;
esac

# The hashed css asset anchors the cache and header rows. No css means the home page is broken.
CSS="$(curl -s --max-time 10 --connect-timeout 3 "$BASE/" | grep -o '/_astro/[^"]*\.css' | head -n 1)"
[ -n "$CSS" ] && pass "home references css $CSS" || fail "css asset" "home page references no /_astro/ css"

if [ "$QUICK" != "1" ]; then
  # pages and slash redirects
  expect_code "home" 200 /
  expect_code "recoveries page" 200 /services/recoveries/
  for u in /find-us/ /services/caravan-service/ /services/repairs/ /services/solar-electrical/ /services/lift-kits/; do expect_code "page $u" 200 "$u"; done
  H="$(hdrs "$BASE/services/recoveries?x=1&y=2")"
  echo "$H" | head -n 1 | grep -q ' 301 ' && echo "$H" | grep -qi '^location: /services/recoveries/?x=1&y=2$' \
    && pass "slashless 301 keeps query" || fail "slashless 301 keeps query" "$(echo "$H" | grep -iE '^HTTP|^location' | tr '\n' ' ')"
  expect_code "bare directory is 404 page" 404 /services/
  B="$(curl -s --max-time 10 "$BASE/nope/")"
  echo "$B" | grep -q '<h1' && pass "404 page body has h1" || fail "404 page body" "no h1"

  # sitemap, robots: each body must be non-empty before the two are compared
  SM="$(curl -s --max-time 10 "$BASE/sitemap.xml")"
  SMI="$(curl -s --max-time 10 "$BASE/sitemap-index.xml")"
  echo "$SM" | grep -q '<sitemapindex' && pass "sitemap.xml is the index" || fail "sitemap.xml" "not an index"
  if [ -z "$SM" ] || [ -z "$SMI" ]; then
    fail "sitemap alias" "empty body (sitemap.xml ${#SM} bytes, sitemap-index.xml ${#SMI} bytes)"
  else
    [ "$SM" = "$SMI" ] && pass "sitemap.xml == sitemap-index.xml" || fail "sitemap alias" "differs"
  fi
  hdrs "$BASE/robots.txt" | grep -qi '^content-type: text/plain' && pass "robots.txt text/plain" || fail "robots.txt" "content-type"
  H="$(hdrs "$BASE/sitemap-main.xml")"
  echo "$H" | head -n 1 | grep -q ' 301 ' && echo "$H" | grep -qi '^location: /sitemap-0.xml$' \
    && pass "sitemap-main.xml 301 -> /sitemap-0.xml" || fail "sitemap-main.xml" "$(echo "$H" | grep -iE '^HTTP|^location' | tr '\n' ' ')"
  expect_code "sitemap-0.xml" 200 /sitemap-0.xml
  grep -q 'https://noordkaravane.co.za/shop/sitemap.xml' <<<"$SMI" && pass "sitemap index lists the shop sitemap" || fail "sitemap index" "no /shop/sitemap.xml entry"

  # favicons
  for u in /favicon.ico /favicon-96.png /favicon-192.png /apple-touch-icon.png; do expect_code "favicon $u" 200 "$u"; done
  expect_code "missing favicon is 404" 404 /favicon-999.png

  # www host
  H="$(hdrs -H 'Host: www.noordkaravane.co.za' "$BASE/services/recoveries/")"
  echo "$H" | grep -qi '^location: https://noordkaravane.co.za/services/recoveries/$' && pass "www -> apex 301 keeps path" || fail "www redirect" "$(echo "$H" | grep -i '^location')"
  expect_code "www root 301" 301 / -H 'Host: www.noordkaravane.co.za'

  # no shop here, gzip
  expect_code "/shop/ not served" 404 /shop/
  hdrs -H 'Accept-Encoding: gzip' "$BASE/" | grep -qi '^content-encoding: gzip' && pass "gzip on html" || fail "gzip" "none"
fi

# Cache-Control and security headers (quick and full).
if [ -n "$CSS" ]; then
  expect_code "css asset 200" 200 "$CSS"
  hdrs "$BASE$CSS" | grep -qi '^cache-control: public, max-age=31536000, immutable' && pass "css immutable" || fail "css cache" "not immutable"
  [ "$(hdrs "$BASE$CSS" | sec_count)" = "3" ] && pass "css has 3 security headers" || fail "css security headers" "not 3"
fi
# HTML must not be cached long (hashed css is deleted on redeploy) and keeps the security headers.
for u in / /services/recoveries/ /nope-missing/; do
  H="$(hdrs "$BASE$u")"
  echo "$H" | grep -qi '^cache-control: no-cache' && pass "html no-cache $u" || fail "html no-cache $u" "$(echo "$H" | grep -i '^cache-control')"
  [ "$(echo "$H" | sec_count)" = "3" ] && pass "html 3 security headers $u" || fail "html security headers $u" "count $(echo "$H" | sec_count)"
done
[ "$(hdrs "$BASE/services/recoveries" | sec_count)" = "3" ] && pass "301 has 3 security headers" || fail "301 security headers" "not 3"
for u in /robots.txt /sitemap.xml /favicon.ico /assets/images/logo.png; do
  [ "$(hdrs "$BASE$u" | sec_count)" = "3" ] && pass "3 security headers $u" || fail "security headers $u" "not 3"
done

# Open-redirect regressions. A decoded backslash must never be reflected in Location, and every hostile
# path must answer with an explicit status in {301, 404}: an empty status (dead server) is a failure.
for u in '/%5Cevil' '/%5C3232235777' '/%2F%5Cevil' '/%5C%5B2001:db8::1%5D' '/%5Cevil/x' '//evil.example' '/%09/evil'; do
  H="$(hdrs "$BASE$u")"
  STATUS="$(echo "$H" | head -n 1 | cut -d' ' -f2)"
  LOC="$(echo "$H" | grep -i '^location:' | head -n 1)"
  if [ "$STATUS" != "301" ] && [ "$STATUS" != "404" ]; then
    fail "hostile path $u" "status '${STATUS:-none}' not in {301, 404}"
  elif echo "$LOC" | grep -qE '^[Ll]ocation: (/\\|//|[a-z]+:)'; then
    fail "hostile path $u" "Location=$LOC"
  else
    pass "hostile path $u no unsafe Location (status $STATUS)"
  fi
done
for u in '/%5Cevil' '/%5C3232235777' '/%2F%5Cevil' '/%5C%5B2001:db8::1%5D'; do
  expect_code "hostile path is 404 $u" 404 "$u"
done

if [ "$FAILS" -ne 0 ]; then echo "matrix: FAIL ($FAILS)"; exit 1; fi
echo "matrix: ok"

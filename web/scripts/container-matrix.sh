#!/usr/bin/env bash
# Container curl matrix for the nginx image. Usage: BASE=http://127.0.0.1:18260 bash web/scripts/container-matrix.sh
# Exits non-zero if any row fails. Needs only curl.
BASE="${BASE:?set BASE, for example BASE=http://127.0.0.1:18260}"
FAILS=0
pass() { echo "PASS $1"; }
fail() { echo "FAIL $1 :: $2"; FAILS=$((FAILS + 1)); }
code() { curl -s -o /dev/null --path-as-is -w '%{http_code}' "$@"; }
hdrs() { curl -s -o /dev/null -D - --path-as-is "$@" | tr -d '\r'; }
sec_count() { grep -ciE '^(x-frame-options|x-content-type-options|referrer-policy):' ; }
expect_code() { # name want url [curl args]
  local name="$1" want="$2" url="$3"; shift 3
  local got; got="$(code "$@" "$BASE$url")"
  [ "$got" = "$want" ] && pass "$name ($url $got)" || fail "$name" "$url want $want got $got"
}

# 1-3: pages and slash redirects
expect_code "home" 200 /
expect_code "recoveries page" 200 /services/recoveries/
H="$(hdrs "$BASE/services/recoveries?x=1&y=2")"
echo "$H" | head -n 1 | grep -q ' 301 ' && echo "$H" | grep -qi '^location: /services/recoveries/?x=1&y=2$' \
  && pass "slashless 301 keeps query" || fail "slashless 301 keeps query" "$(echo "$H" | grep -iE '^HTTP|^location' | tr '\n' ' ')"
expect_code "bare directory is 404 page" 404 /services/
B="$(curl -s "$BASE/nope/")"
echo "$B" | grep -q '<h1' && pass "404 page body has h1" || fail "404 page body" "no h1"

# 5-7: sitemap, robots
curl -s "$BASE/sitemap.xml" | grep -q '<sitemapindex' && pass "sitemap.xml is the index" || fail "sitemap.xml" "not an index"
[ "$(curl -s "$BASE/sitemap.xml")" = "$(curl -s "$BASE/sitemap-index.xml")" ] && pass "sitemap.xml == sitemap-index.xml" || fail "sitemap alias" "differs"
hdrs "$BASE/robots.txt" | grep -qi '^content-type: text/plain' && pass "robots.txt text/plain" || fail "robots.txt" "content-type"
hdrs "$BASE/sitemap-main.xml" | grep -qi '^location: /sitemap-0.xml' && pass "sitemap-main.xml 301" || fail "sitemap-main.xml" "no 301 to /sitemap-0.xml"

# 8-9: favicons
for u in /favicon.ico /favicon-96.png /favicon-192.png /apple-touch-icon.png; do expect_code "favicon $u" 200 "$u"; done
expect_code "missing favicon is 404" 404 /favicon-999.png

# 10: www host
H="$(hdrs -H 'Host: www.noordkaravane.co.za' "$BASE/services/recoveries/")"
echo "$H" | grep -qi '^location: https://noordkaravane.co.za/services/recoveries/$' && pass "www -> apex 301 keeps path" || fail "www redirect" "$(echo "$H" | grep -i '^location')"
expect_code "www root 301" 301 / -H 'Host: www.noordkaravane.co.za'

# 11-12: hashed asset and cache
CSS="$(curl -s "$BASE/" | grep -o '/_astro/[^"]*\.css' | head -n 1)"
[ -n "$CSS" ] && pass "home references css $CSS" || fail "css asset" "none referenced"
expect_code "css asset 200" 200 "$CSS"
hdrs "$BASE$CSS" | grep -qi '^cache-control: public, max-age=31536000, immutable' && pass "css immutable" || fail "css cache" "not immutable"
[ "$(hdrs "$BASE$CSS" | sec_count)" = "3" ] && pass "css has 3 security headers" || fail "css security headers" "not 3"

# E: HTML must not be cached long (hashed css is deleted on redeploy) and keeps the security headers
for u in / /services/recoveries/ /nope-missing/; do
  H="$(hdrs "$BASE$u")"
  echo "$H" | grep -qi '^cache-control: no-cache' && pass "html no-cache $u" || fail "html no-cache $u" "$(echo "$H" | grep -i '^cache-control')"
  [ "$(echo "$H" | sec_count)" = "3" ] && pass "html 3 security headers $u" || fail "html security headers $u" "count $(echo "$H" | sec_count)"
done
[ "$(hdrs "$BASE/services/recoveries" | sec_count)" = "3" ] && pass "301 has 3 security headers" || fail "301 security headers" "not 3"
for u in /robots.txt /sitemap.xml /favicon.ico /assets/images/logo.png; do
  [ "$(hdrs "$BASE$u" | sec_count)" = "3" ] && pass "3 security headers $u" || fail "security headers $u" "not 3"
done

# 13: no shop here
expect_code "/shop/ not served" 404 /shop/
# 14: gzip
hdrs -H 'Accept-Encoding: gzip' "$BASE/" | grep -qi '^content-encoding: gzip' && pass "gzip on html" || fail "gzip" "none"

# A: open-redirect regressions. A decoded backslash must never be reflected in Location.
for u in '/%5Cevil' '/%5C3232235777' '/%2F%5Cevil' '/%5C%5B2001:db8::1%5D' '/%5Cevil/x' '//evil.example' '/%09/evil'; do
  H="$(hdrs "$BASE$u")"
  LOC="$(echo "$H" | grep -i '^location:' | head -n 1)"
  if echo "$LOC" | grep -qE '^[Ll]ocation: (/\\|//|[a-z]+:)'; then
    fail "hostile path $u" "Location=$LOC"
  else
    pass "hostile path $u no unsafe Location (status $(echo "$H" | head -n 1 | cut -d' ' -f2))"
  fi
done
for u in '/%5Cevil' '/%5C3232235777' '/%2F%5Cevil' '/%5C%5B2001:db8::1%5D'; do
  expect_code "hostile path is 404 $u" 404 "$u"
done

if [ "$FAILS" -ne 0 ]; then echo "matrix: FAIL ($FAILS)"; exit 1; fi
echo "matrix: ok"

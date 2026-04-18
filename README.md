# Noord Karavane

Static landing page for **Noord Karavane**, a specialist caravan workshop in Pretoria North.
Live at [noordkaravane.co.za](https://noordkaravane.co.za).

## Stack

- Single-file static site (`site/index.html`) — Syne + Archivo + JetBrains Mono, no build step
- Served by `nginx:alpine` in Docker, behind Traefik on DockPi (`192.168.0.120:8260`)
- Cloudflare in front for DNS + edge cache + TLS

## Repo layout

```
.
├── site/                       # public web root mounted into nginx
│   ├── index.html
│   └── assets/images/          # logos, lift-kit photo, og-image
├── docker/
│   └── nginx.conf              # nginx server config
├── docker-compose.yml          # nginx service definition
├── traefik-noordkaravane.yml   # Traefik dynamic route (lives on DockPi)
└── social-media-posts/         # standalone HTML templates for socials
```

## Local preview

```bash
docker compose up -d
# open http://localhost:8260
```

Edit `site/index.html` and refresh. nginx hot-reads from the bind-mount, so no rebuild needed.

## Deploying to DockPi

The DockPi container runs from a clone of this repo at
`/home/voogiepi/docker/noordkaravane`. To ship a change:

```bash
git push origin main
ssh -i ~/.ssh/id_voogiepi voogiepi@192.168.0.120 \
  'cd /home/voogiepi/docker/noordkaravane && git pull && \
   DOCKER_API_VERSION=1.41 docker exec noordkaravane nginx -s reload'
```

Or use the helper script on DockPi:

```bash
ssh -i ~/.ssh/id_voogiepi voogiepi@192.168.0.120 \
  '/home/voogiepi/docker/noordkaravane/deploy.sh'
```

## Editing notes

- All images go in `site/assets/images/` — chmod **644** before commit (nginx
  inside the container can't read mode-600 files)
- Keep the two `application/ld+json` blocks intact — they drive Google rich
  results for `LocalBusiness` and the FAQ
- Avoid em-dashes in copy; use periods, commas, or colons
- WhatsApp prefill links use `https://wa.me/27833349357?text=<encoded>`

## Domain & DNS

- `noordkaravane.co.za` and `www.noordkaravane.co.za` → Cloudflare → DockPi
- Traefik route defined in
  `/home/voogiepi/docker/traefik/config/dynamic/noordkaravane.yml` on DockPi
  (also tracked here as `traefik-noordkaravane.yml` for reference)
- TLS via Let's Encrypt through Traefik

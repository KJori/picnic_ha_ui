# Picnic web as a Dockge stack

[MRVDH/picnic-web](https://github.com/MRVDH/picnic-web) is a web interface for
Picnic. `compose.yaml` builds it on your own machine from the upstream source
and runs it on the `pangolin` network; nothing else is needed.

To update: `docker compose build --no-cache && docker compose up -d` in the
stack's folder.

picnic-web can check out and pay with the signed-in Picnic account, so keep it
behind a login such as Pangolin's.

Picnic Desk (the Home Assistant app in this repository) is built on the same
Picnic code, so you only need this stack if you also want picnic-web itself.

"""Picnic Desk web server.

Serves the single-page UI and a small JSON API. Built to sit behind Home
Assistant ingress: every URL the page uses is relative, and when INGRESS_ONLY=1
only the Supervisor's ingress gateway may connect, so Home Assistant's own
login protects it.

Environment:
  PORT           port to listen on (default 8099)
  DATA_DIR       where the session token and lists are kept (default /data)
  COUNTRY_CODE   NL, DE or FR; overrides the add-on option
  INGRESS_ONLY   "1" to accept connections from 172.30.32.2 only
  PICNIC_DEMO    "1" for demo mode without a Picnic account
"""

from __future__ import annotations

import json
import logging
import os
from pathlib import Path

from flask import Flask, Response, abort, jsonify, request, send_from_directory

from desk import IMAGE_REF, Desk, DeskError, NotLoggedIn

INGRESS_GATEWAY = "172.30.32.2"
STATIC = Path(__file__).parent / "static"

log = logging.getLogger("picnic_desk")


def _options() -> dict:
    """Add-on options as written by the Supervisor, if any."""
    try:
        return json.loads(Path("/data/options.json").read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}


def create_app() -> Flask:
    demo = os.environ.get("PICNIC_DEMO") == "1"
    country = os.environ.get("COUNTRY_CODE") or _options().get("country_code") or "NL"
    data_dir = os.environ.get("DATA_DIR", "/data")
    if demo:
        from demo import DemoPicnicAPI

        desk = Desk(data_dir, country, api_class=DemoPicnicAPI)
    else:
        desk = Desk(data_dir, country)

    app = Flask(__name__, static_folder=None)
    ingress_only = os.environ.get("INGRESS_ONLY") == "1"

    @app.before_request
    def only_ingress():
        if ingress_only and request.remote_addr != INGRESS_GATEWAY:
            abort(403)

    @app.errorhandler(NotLoggedIn)
    def not_logged_in(_):
        return jsonify(error="Sign in to Picnic to continue.", signed_out=True), 401

    @app.errorhandler(DeskError)
    def desk_error(err):
        return jsonify(error=str(err)), 400

    @app.errorhandler(Exception)
    def unexpected(err):
        if hasattr(err, "code") and hasattr(err, "get_response"):  # HTTPException
            return err
        log.exception("Picnic request failed")
        return jsonify(error=f"Picnic did not answer as expected ({type(err).__name__}: {err})."), 502

    def body() -> dict:
        data = request.get_json(silent=True)
        return data if isinstance(data, dict) else {}

    # ------------------------------------------------------------------ page

    @app.get("/")
    def index():
        response = send_from_directory(STATIC, "index.html")
        response.headers["Cache-Control"] = "no-cache"
        return response

    @app.get("/static/<path:name>")
    def static_file(name):
        response = send_from_directory(STATIC, name)
        response.headers["Cache-Control"] = "no-cache"
        return response

    # --------------------------------------------------------------- session

    @app.get("/api/state")
    def state():
        return jsonify(desk.state() | {"demo": demo})

    @app.post("/api/login")
    def login():
        data = body()
        return jsonify(desk.login(str(data.get("email", "")).strip(), str(data.get("password", ""))))

    @app.post("/api/code/send")
    def send_code():
        return jsonify(desk.send_code(body().get("channel", "SMS")))

    @app.post("/api/code/verify")
    def verify_code():
        return jsonify(desk.verify_code(body().get("code", "")))

    @app.post("/api/logout")
    def logout():
        return jsonify(desk.logout())

    # ---------------------------------------------------------------- basket

    @app.get("/api/search")
    def search():
        return jsonify(products=desk.search(request.args.get("q", "")))

    @app.get("/api/cart")
    def cart():
        return jsonify(desk.cart())

    @app.post("/api/cart/change")
    def change():
        data = body()
        delta = data.get("delta")
        if isinstance(delta, bool) or not isinstance(delta, int):
            raise DeskError("Nothing to change.")
        return jsonify(desk.change(str(data.get("id", "")), delta))

    @app.post("/api/cart/clear")
    def clear():
        return jsonify(desk.clear())

    # ----------------------------------------------------------------- lists

    @app.get("/api/history")
    def history():
        return jsonify(desk.history(refresh=request.args.get("refresh") == "1"))

    @app.get("/api/saved")
    def saved():
        return jsonify(products=desk.saved())

    @app.post("/api/saved/toggle")
    def toggle_saved():
        return jsonify(products=desk.toggle_saved(body()))

    @app.get("/api/shortcuts")
    def shortcuts():
        return jsonify(shortcuts=desk.shortcuts())

    @app.post("/api/shortcuts")
    def set_shortcuts():
        return jsonify(shortcuts=desk.set_shortcuts(body().get("shortcuts")))

    # --------------------------------------------------------------- recipes

    def portions_arg(value):
        if value in (None, ""):
            return None
        try:
            return int(value)
        except (TypeError, ValueError):
            raise DeskError("Choose between 1 and 24 portions.") from None

    @app.get("/api/recipes")
    def recipe_list():
        return jsonify(
            desk.recipes(request.args.get("category") or None, refresh=request.args.get("refresh") == "1")
        )

    @app.get("/api/recipes/<recipe_id>")
    def recipe_detail(recipe_id):
        return jsonify(desk.recipe(recipe_id, portions_arg(request.args.get("portions"))))

    @app.post("/api/recipes/<recipe_id>/add")
    def recipe_add(recipe_id):
        data = body()
        portions = data.get("portions")
        if portions is not None and (isinstance(portions, bool) or not isinstance(portions, int)):
            raise DeskError("Choose between 1 and 24 portions.")
        return jsonify(desk.recipe_add(recipe_id, portions, data.get("selected")))

    @app.get("/api/selfcheck")
    def selfcheck():
        return jsonify(desk.selfcheck())

    @app.get("/api/raw-page/<page_id>")
    def raw_page(page_id):
        """Download a page exactly as Picnic sent it, to diagnose a reading problem."""
        page = desk.raw_page(
            page_id, request.args.get("recipe") or None, portions_arg(request.args.get("portions"))
        )
        response = Response(json.dumps(page, ensure_ascii=False, indent=1), mimetype="application/json")
        response.headers["Content-Disposition"] = f'attachment; filename="picnic-{page_id}.json"'
        return response

    # ---------------------------------------------------------------- images

    @app.get("/api/image/<path:image_id>")
    def image(image_id):
        if not IMAGE_REF.match(image_id):
            abort(404)
        data = desk.image(image_id)
        if not data:
            abort(404)
        if data[:4] == b"\x89PNG":
            kind = "image/png"
        elif data[:3] == b"\xff\xd8\xff":
            kind = "image/jpeg"
        elif data[:4] == b"RIFF":
            kind = "image/webp"
        elif data.lstrip()[:4] == b"<svg":
            kind = "image/svg+xml"
        else:
            abort(404)
        response = Response(data, mimetype=kind)
        response.headers["Cache-Control"] = "private, max-age=2592000, immutable"
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Content-Security-Policy"] = "default-src 'none'; style-src 'unsafe-inline'"
        return response

    return app


def main():
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    port = int(os.environ.get("PORT", "8099"))
    app = create_app()
    try:
        from waitress import serve
    except ImportError:  # local development without waitress
        log.warning("waitress is not installed; using Flask's development server")
        app.run(host="0.0.0.0", port=port, threaded=True)
        return
    log.info("Picnic Desk listening on port %s", port)
    serve(app, host="0.0.0.0", port=port, threads=8)


if __name__ == "__main__":
    main()

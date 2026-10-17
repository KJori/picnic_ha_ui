import { createRequire as __createRequire } from "node:module"; const require = __createRequire(import.meta.url);
var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
  get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
}) : x)(function(x) {
  if (typeof require !== "undefined") return require.apply(this, arguments);
  throw Error('Dynamic require of "' + x + '" is not supported');
});
var __commonJS = (cb, mod) => function __require2() {
  try {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  } catch (e) {
    throw mod = 0, e;
  }
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// node_modules/picnic-api/lib/errors/checkout-error.js
var require_checkout_error = __commonJS({
  "node_modules/picnic-api/lib/errors/checkout-error.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.CheckoutIssueError = void 0;
    exports.parseCheckoutIssueError = parseCheckoutIssueError;
    exports.isCheckoutIssueError = isCheckoutIssueError2;
    var AGE_VERIFICATION_TYPE = "LEGACY_ALCOHOL_AGE_VERIFICATION_REQUIRED";
    var CheckoutIssueError = class extends Error {
      constructor(details) {
        super(details.issueMessage || details.title || details.code);
        this.name = "CheckoutIssueError";
        this.code = details.code;
        this.title = details.title;
        this.issueMessage = details.issueMessage;
        this.resolveKey = details.resolveKey;
        this.blocking = details.blocking;
        this.issueType = details.issueType;
      }
      isAgeVerificationIssue() {
        return this.issueType === AGE_VERIFICATION_TYPE;
      }
    };
    exports.CheckoutIssueError = CheckoutIssueError;
    function parseCheckoutIssueError(body) {
      if (!body || typeof body !== "object")
        return null;
      const raw = body;
      const code = raw.code ?? raw.error?.code;
      if (code !== "CART_HAS_ISSUES")
        return null;
      const details = raw.details ?? raw.error?.details;
      if (!details || typeof details !== "object") {
        return new CheckoutIssueError({
          code: "CART_HAS_ISSUES",
          title: raw.message ?? raw.error?.message ?? "Cart has issues",
          issueMessage: raw.message ?? raw.error?.message ?? "Cart has issues",
          resolveKey: "",
          blocking: true,
          issueType: "UNKNOWN"
        });
      }
      return new CheckoutIssueError({
        code: "CART_HAS_ISSUES",
        title: details.localized_title || "Cart has issues",
        issueMessage: details.localized_message || raw.message || raw.error?.message || "Cart has issues",
        resolveKey: details.resolve_key || "",
        blocking: details.blocking ?? true,
        issueType: details.type || "UNKNOWN"
      });
    }
    function isCheckoutIssueError2(error2) {
      return error2 instanceof CheckoutIssueError;
    }
  }
});

// node_modules/picnic-api/lib/http-client.js
var require_http_client = __commonJS({
  "node_modules/picnic-api/lib/http-client.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var checkout_error_1 = require_checkout_error();
    var HttpClient = class {
      constructor(options) {
        this.countryCode = options?.countryCode || "NL";
        this.apiVersion = options?.apiVersion || "15";
        this.authKey = options?.authKey || null;
        this.url = options?.url || `https://storefront-prod.${this.countryCode.toLowerCase()}.picnicinternational.com/api/${this.apiVersion}`;
        this.deviceId = options?.deviceId || "3C417201548B2E3B";
        this.agent = options?.agent || "30100;1.246.1-15599;";
      }
      get baseHeaders() {
        return {
          "User-Agent": "okhttp/4.9.0",
          "Content-Type": "application/json; charset=UTF-8",
          "Accept-Language": this.countryCode === "DE" ? "de" : this.countryCode === "FR" ? "fr" : "nl",
          ...this.authKey && { "x-picnic-auth": this.authKey }
        };
      }
      get picnicHeaders() {
        return {
          "x-picnic-agent": this.agent,
          "x-picnic-did": this.deviceId
        };
      }
      /**
       * Can be used to send custom requests that are not covered by the domain services.
       *
       * Objects passed as `data` are sent as JSON. A `Blob`, `ArrayBuffer` or typed array
       * (e.g. `Uint8Array`) is sent as-is, with `Content-Type` set to `contentType`.
       * @param {string} method The HTTP method to use: GET, POST, PUT or DELETE.
       * @param {string} path The path, optionally including query params. Example: `/cart/set_delivery_slot` or `/my_store?depth=0`.
       * @param {TRequestData|null} [data=null] The request body, typically for POST or PUT requests.
       * @param {boolean} [includePicnicHeaders=false] Whether to include x-picnic-agent and x-picnic-did headers.
       * @param {boolean} [isImageRequest=false] When true, returns an ArrayBuffer instead of JSON.
       *
       * Responses served as a React Server Components payload (`text/x-component`) are
       * returned as the raw text instead of being parsed as JSON.
       * @param {string} [contentType="application/octet-stream"] The MIME type of a raw (non-JSON) `data` body, e.g. `image/jpeg`.
       */
      async sendRequest(method, path, data = null, includePicnicHeaders = false, isImageRequest = false, contentType) {
        const isRawBody = data instanceof Blob || data instanceof ArrayBuffer || ArrayBuffer.isView(data);
        const headers = new Headers({
          ...this.baseHeaders,
          ...includePicnicHeaders && this.picnicHeaders,
          ...isRawBody && { "Content-Type": contentType ?? "application/octet-stream" }
        });
        const body = data === null ? null : isRawBody ? data : JSON.stringify(data);
        const requestUrl = /^https?:\/\//.test(path) ? path : `${this.url}${path}`;
        const response = await fetch(requestUrl, {
          method,
          headers,
          body
        });
        if (!response.ok) {
          const responseBody = await response.text();
          try {
            const errorData = JSON.parse(responseBody);
            const checkoutIssue = (0, checkout_error_1.parseCheckoutIssueError)(errorData);
            if (checkoutIssue)
              throw checkoutIssue;
            const parsed = errorData;
            throw new Error(`${parsed.error?.message || response.statusText}`);
          } catch (e) {
            if (e instanceof Error && !(e instanceof SyntaxError))
              throw e;
            throw new Error(`${response.status} ${response.statusText}${responseBody ? ` - ${responseBody}` : ""}`);
          }
        }
        if (isImageRequest) {
          return response.arrayBuffer();
        }
        if (response.headers?.get("content-type")?.includes("text/x-component")) {
          return response.text();
        }
        if (response.body !== null) {
          return response.json();
        }
        return void 0;
      }
    };
    exports.default = HttpClient;
  }
});

// node_modules/picnic-api/lib/errors/page-format-error.js
var require_page_format_error = __commonJS({
  "node_modules/picnic-api/lib/errors/page-format-error.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.UnexpectedPageFormatError = void 0;
    exports.isUnexpectedPageFormatError = isUnexpectedPageFormatError2;
    var UnexpectedPageFormatError = class extends Error {
      constructor(pageId, receivedFormat) {
        const method = receivedFormat === "rsc" ? "app.getRscPage" : "app.getPage";
        super(`Page "${pageId}" was served as ${receivedFormat === "rsc" ? "an RSC payload" : "a Fusion page"}; use ${method} to fetch it.`);
        this.name = "UnexpectedPageFormatError";
        this.pageId = pageId;
        this.receivedFormat = receivedFormat;
      }
    };
    exports.UnexpectedPageFormatError = UnexpectedPageFormatError;
    function isUnexpectedPageFormatError2(error2) {
      return error2 instanceof UnexpectedPageFormatError;
    }
  }
});

// node_modules/picnic-api/lib/domains/app/rsc.js
var require_rsc = __commonJS({
  "node_modules/picnic-api/lib/domains/app/rsc.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.parseRscPayload = parseRscPayload;
    var ROW_PATTERN = /^([0-9a-f]+):(I?)(.*)$/;
    function parseRscPayload(payload) {
      const page = { rows: {}, modules: {} };
      for (const line of payload.split("\n")) {
        const match = ROW_PATTERN.exec(line);
        if (!match)
          continue;
        const [, id, importMarker, value] = match;
        try {
          const parsed = JSON.parse(value);
          if (importMarker) {
            page.modules[id] = parsed;
          } else {
            page.rows[id] = parsed;
          }
        } catch {
        }
      }
      return page;
    }
  }
});

// node_modules/picnic-api/lib/domains/app/service.js
var require_service = __commonJS({
  "node_modules/picnic-api/lib/domains/app/service.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.AppService = void 0;
    var page_format_error_1 = require_page_format_error();
    var rsc_1 = require_rsc();
    var AppService = class {
      constructor(http) {
        this.http = http;
      }
      /**
       * Returns the bootstrap data; tab bar configuration, third-party SDK configs, and feature flags.
       */
      getBootstrapData() {
        return this.http.sendRequest("GET", `/bootstrap`);
      }
      /**
       * Returns a Fusion page by its page ID. The response shape is shared across all page routes.
       *
       * Some pages are served as a React Server Components payload instead, depending on the
       * page and the `agent` version; for those this throws an `UnexpectedPageFormatError` and
       * `getRscPage` should be used. Known RSC pages: `category-tree-root`, `profile-root` and
       * `promo-group-deep-dive?promo_group_id=<id>`.
       *
       * Known page IDs (no params required):
       * - `home_page_root`
       * - `purchases-page-root`
       * - `meals-page-root`
       * - `slot-selector-root`
       * - `parcels-overview-page-root`
       * - `empty-search-page-root`
       *
       * Pages that require query parameters (append after `?`):
       * - `search-page-results?search_term=<term>`
       * - `product-details-page-root?id=<selling_unit_id>`
       * - `L1-category-page-root?category_id=<id>`
       * - `L2-category-page-root?category_id=<id>`
       * - `delivery-receipt-page?delivery_id=<id>`
       * - `parcel-tracking-page-root?parcel_id=<id>`
       */
      async getPage(pageId) {
        const page = await this.http.sendRequest("GET", `/pages/${pageId}`, null, true);
        if (typeof page === "string")
          throw new page_format_error_1.UnexpectedPageFormatError(pageId, "rsc");
        return page;
      }
      /**
       * Returns a page served as a React Server Components (RSC) payload, split into its rows.
       * The page data is in the props of the React elements (`["$", type, key, props]`) in `rows`.
       *
       * Throws an `UnexpectedPageFormatError` when the page is served as a Fusion page instead;
       * use `getPage` for those. Known RSC pages: `category-tree-root` (search tab shortcuts and
       * categories), `profile-root` and `promo-group-deep-dive?promo_group_id=<id>`.
       * @param {string} pageId The page ID, optionally with query params, e.g. `category-tree-root`.
       */
      async getRscPage(pageId) {
        const page = await this.http.sendRequest("GET", `/pages/${pageId}`, null, true);
        if (typeof page !== "string")
          throw new page_format_error_1.UnexpectedPageFormatError(pageId, "fusion");
        return (0, rsc_1.parseRscPayload)(page);
      }
      /**
       * Resolves a Picnic deeplink URL to its target resource.
       * The app uses this to handle universal links and custom scheme URIs
       * (e.g. URLs like `https://picnic.app/nl/deeplink/...`).
       * @param {string} url The deeplink URL to resolve.
       */
      resolveDeeplink(url) {
        return this.http.sendRequest("POST", `/deeplink/resolve`, { url }, true);
      }
    };
    exports.AppService = AppService;
  }
});

// node_modules/picnic-api/lib/domains/auth/service.js
var require_service2 = __commonJS({
  "node_modules/picnic-api/lib/domains/auth/service.js"(exports) {
    "use strict";
    var __importDefault = exports && exports.__importDefault || function(mod) {
      return mod && mod.__esModule ? mod : { "default": mod };
    };
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.AuthService = void 0;
    var crypto_1 = __importDefault(__require("crypto"));
    var AuthService = class {
      constructor(http) {
        this.http = http;
      }
      /**
       * Logs the user into Picnic to be able to send requests.
       * @param {string} username The username of the Picnic account.
       * @param {string} password The password of the Picnic account.
       */
      async login(username, password) {
        const secret = crypto_1.default.createHash("md5").update(password, "utf8").digest("hex");
        const response = await fetch(`${this.http.url}/user/login`, {
          method: "POST",
          headers: this.http.baseHeaders,
          body: JSON.stringify({ key: username, secret, client_id: 30100 })
        });
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(`Login failed: ${errorData.error?.message || response.statusText}`);
        }
        const data = await response.json();
        const authKey = response.headers.get("x-picnic-auth");
        if (!authKey) {
          throw new Error("Login failed: No auth key received.");
        }
        this.http.authKey = authKey;
        return {
          authKey,
          second_factor_authentication_required: data.second_factor_authentication_required,
          show_second_factor_authentication_intro: data.show_second_factor_authentication_intro,
          user_id: data.user_id
        };
      }
      /**
       * Generates a 2FA code for the user to verify.
       * @param {string} channel The channel to send the code to. 'SMS' is the only known format at the moment.
       */
      generate2FACode(channel) {
        return this.http.sendRequest("POST", `/user/2fa/generate`, { channel }, true);
      }
      /**
       * Verifies the 2FA code and captures the updated auth key from the response.
       * The Picnic API returns a new auth key in the `x-picnic-auth` header after
       * successful 2FA verification (HTTP 204, empty body).
       * @param {string} code The 2FA code to verify.
       */
      async verify2FACode(code) {
        const headers = new Headers({
          ...this.http.baseHeaders,
          ...this.http.picnicHeaders
        });
        const response = await fetch(`${this.http.url}/user/2fa/verify`, {
          method: "POST",
          headers,
          body: JSON.stringify({ otp: code })
        });
        if (!response.ok) {
          const body = await response.text();
          try {
            const errorData = JSON.parse(body);
            throw new Error(`2FA verification failed: ${errorData.error?.message || response.statusText}`);
          } catch (e) {
            if (e instanceof Error && !(e instanceof SyntaxError))
              throw e;
            throw new Error(`2FA verification failed: ${response.status} ${response.statusText}`);
          }
        }
        const authKey = response.headers.get("x-picnic-auth");
        if (!authKey) {
          throw new Error("2FA verification failed: No auth key received.");
        }
        this.http.authKey = authKey;
        return { authKey };
      }
      /**
       * Logs the current user out, invalidating the auth key.
       */
      logout() {
        return this.http.sendRequest("POST", `/user/logout`);
      }
      /**
       * Generates a phone verification code sent to the user's phone number.
       * @param {string} phoneNumber The phone number to send the verification code to.
       */
      generatePhoneVerificationCode(phoneNumber) {
        return this.http.sendRequest("POST", `/user/phone_verification/generate`, { phone_number: phoneNumber });
      }
      /**
       * Verifies a phone number using the code sent to the user.
       * @param {string} phoneNumber The phone number being verified.
       * @param {string} code The verification code received by the user.
       */
      verifyPhoneNumber(phoneNumber, code) {
        return this.http.sendRequest("POST", `/user/phone_verification/verify`, { otp: code, phone_number: phoneNumber });
      }
    };
    exports.AuthService = AuthService;
  }
});

// node_modules/picnic-api/lib/domains/user/service.js
var require_service3 = __commonJS({
  "node_modules/picnic-api/lib/domains/user/service.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.UserService = void 0;
    var UserService = class {
      constructor(http) {
        this.http = http;
      }
      /**
       * Gets the details of the current logged in user.
       */
      getUserDetails() {
        return this.http.sendRequest("GET", `/user`);
      }
      /**
       * Gets information about the user such as toggled features.
       */
      getUserInfo() {
        return this.http.sendRequest("GET", `/user-info`);
      }
      /**
       * Gets information to display on the profile section.
       * This also includes MGM (member-get-member) referral details via `user.mgm`.
       */
      getProfileMenu() {
        return this.http.sendRequest("GET", `/profile-menu?fetch_mgm=true`, null, true);
      }
      // TODO: Test route and add types
      /**
       * Submits a suggestion or feedback from the user.
       * @param {string} suggestion The suggestion text to submit.
       */
      submitSuggestion(suggestion) {
        return this.http.sendRequest("POST", `/user/suggestion`, { suggestion });
      }
      // TODO: Test route and add types
      /**
       * Registers a push notification device token for the current user.
       * @param {string} pushToken The device push notification token.
       * @param {string} platform The platform identifier (e.g. 'firebase').
       */
      registerPushToken(pushToken, platform) {
        return this.http.sendRequest("POST", `/user/device/register_push`, { push_token: pushToken, platform });
      }
      /**
       * Checks whether a newer version of the app is available. The endpoint requires
       * a body describing the client; the device and version fields are derived from
       * the client's configured `deviceId` and `agent` string.
       */
      checkForUpdates() {
        const [clientId, versionBuild = ""] = this.http.agent.split(";");
        const [version = "", buildNumber = ""] = versionBuild.split("-");
        const body = {
          device_id: this.http.deviceId,
          device_name: "notAvailable",
          client_id: clientId,
          version,
          device_os: this.http.agent,
          build_number: buildNumber
        };
        return this.http.sendRequest("POST", `/update_check`, body, true);
      }
    };
    exports.UserService = UserService;
  }
});

// node_modules/jsonpath-plus/dist/index-node-cjs.cjs
var require_index_node_cjs = __commonJS({
  "node_modules/jsonpath-plus/dist/index-node-cjs.cjs"(exports) {
    "use strict";
    var vm = __require("vm");
    var Hooks = class {
      /**
       * @callback HookCallback
       * @this {*|Jsep} this
       * @param {Jsep} env
       * @returns: void
       */
      /**
       * Adds the given callback to the list of callbacks for the given hook.
       *
       * The callback will be invoked when the hook it is registered for is run.
       *
       * One callback function can be registered to multiple hooks and the same hook multiple times.
       *
       * @param {string|object} name The name of the hook, or an object of callbacks keyed by name
       * @param {HookCallback|boolean} callback The callback function which is given environment variables.
       * @param {?boolean} [first=false] Will add the hook to the top of the list (defaults to the bottom)
       * @public
       */
      add(name, callback, first) {
        if (typeof arguments[0] != "string") {
          for (let name2 in arguments[0]) {
            this.add(name2, arguments[0][name2], arguments[1]);
          }
        } else {
          (Array.isArray(name) ? name : [name]).forEach(function(name2) {
            this[name2] = this[name2] || [];
            if (callback) {
              this[name2][first ? "unshift" : "push"](callback);
            }
          }, this);
        }
      }
      /**
       * Runs a hook invoking all registered callbacks with the given environment variables.
       *
       * Callbacks will be invoked synchronously and in the order in which they were registered.
       *
       * @param {string} name The name of the hook.
       * @param {Object<string, any>} env The environment variables of the hook passed to all callbacks registered.
       * @public
       */
      run(name, env) {
        this[name] = this[name] || [];
        this[name].forEach(function(callback) {
          callback.call(env && env.context ? env.context : env, env);
        });
      }
    };
    var Plugins = class {
      constructor(jsep2) {
        this.jsep = jsep2;
        this.registered = {};
      }
      /**
       * @callback PluginSetup
       * @this {Jsep} jsep
       * @returns: void
       */
      /**
       * Adds the given plugin(s) to the registry
       *
       * @param {object} plugins
       * @param {string} plugins.name The name of the plugin
       * @param {PluginSetup} plugins.init The init function
       * @public
       */
      register(...plugins) {
        plugins.forEach((plugin2) => {
          if (typeof plugin2 !== "object" || !plugin2.name || !plugin2.init) {
            throw new Error("Invalid JSEP plugin format");
          }
          if (this.registered[plugin2.name]) {
            return;
          }
          plugin2.init(this.jsep);
          this.registered[plugin2.name] = plugin2;
        });
      }
    };
    var Jsep = class _Jsep {
      /**
       * @returns {string}
       */
      static get version() {
        return "1.4.0";
      }
      /**
       * @returns {string}
       */
      static toString() {
        return "JavaScript Expression Parser (JSEP) v" + _Jsep.version;
      }
      // ==================== CONFIG ================================
      /**
       * @method addUnaryOp
       * @param {string} op_name The name of the unary op to add
       * @returns {Jsep}
       */
      static addUnaryOp(op_name) {
        _Jsep.max_unop_len = Math.max(op_name.length, _Jsep.max_unop_len);
        _Jsep.unary_ops[op_name] = 1;
        return _Jsep;
      }
      /**
       * @method jsep.addBinaryOp
       * @param {string} op_name The name of the binary op to add
       * @param {number} precedence The precedence of the binary op (can be a float). Higher number = higher precedence
       * @param {boolean} [isRightAssociative=false] whether operator is right-associative
       * @returns {Jsep}
       */
      static addBinaryOp(op_name, precedence, isRightAssociative) {
        _Jsep.max_binop_len = Math.max(op_name.length, _Jsep.max_binop_len);
        _Jsep.binary_ops[op_name] = precedence;
        if (isRightAssociative) {
          _Jsep.right_associative.add(op_name);
        } else {
          _Jsep.right_associative.delete(op_name);
        }
        return _Jsep;
      }
      /**
       * @method addIdentifierChar
       * @param {string} char The additional character to treat as a valid part of an identifier
       * @returns {Jsep}
       */
      static addIdentifierChar(char) {
        _Jsep.additional_identifier_chars.add(char);
        return _Jsep;
      }
      /**
       * @method addLiteral
       * @param {string} literal_name The name of the literal to add
       * @param {*} literal_value The value of the literal
       * @returns {Jsep}
       */
      static addLiteral(literal_name, literal_value) {
        _Jsep.literals[literal_name] = literal_value;
        return _Jsep;
      }
      /**
       * @method removeUnaryOp
       * @param {string} op_name The name of the unary op to remove
       * @returns {Jsep}
       */
      static removeUnaryOp(op_name) {
        delete _Jsep.unary_ops[op_name];
        if (op_name.length === _Jsep.max_unop_len) {
          _Jsep.max_unop_len = _Jsep.getMaxKeyLen(_Jsep.unary_ops);
        }
        return _Jsep;
      }
      /**
       * @method removeAllUnaryOps
       * @returns {Jsep}
       */
      static removeAllUnaryOps() {
        _Jsep.unary_ops = {};
        _Jsep.max_unop_len = 0;
        return _Jsep;
      }
      /**
       * @method removeIdentifierChar
       * @param {string} char The additional character to stop treating as a valid part of an identifier
       * @returns {Jsep}
       */
      static removeIdentifierChar(char) {
        _Jsep.additional_identifier_chars.delete(char);
        return _Jsep;
      }
      /**
       * @method removeBinaryOp
       * @param {string} op_name The name of the binary op to remove
       * @returns {Jsep}
       */
      static removeBinaryOp(op_name) {
        delete _Jsep.binary_ops[op_name];
        if (op_name.length === _Jsep.max_binop_len) {
          _Jsep.max_binop_len = _Jsep.getMaxKeyLen(_Jsep.binary_ops);
        }
        _Jsep.right_associative.delete(op_name);
        return _Jsep;
      }
      /**
       * @method removeAllBinaryOps
       * @returns {Jsep}
       */
      static removeAllBinaryOps() {
        _Jsep.binary_ops = {};
        _Jsep.max_binop_len = 0;
        return _Jsep;
      }
      /**
       * @method removeLiteral
       * @param {string} literal_name The name of the literal to remove
       * @returns {Jsep}
       */
      static removeLiteral(literal_name) {
        delete _Jsep.literals[literal_name];
        return _Jsep;
      }
      /**
       * @method removeAllLiterals
       * @returns {Jsep}
       */
      static removeAllLiterals() {
        _Jsep.literals = {};
        return _Jsep;
      }
      // ==================== END CONFIG ============================
      /**
       * @returns {string}
       */
      get char() {
        return this.expr.charAt(this.index);
      }
      /**
       * @returns {number}
       */
      get code() {
        return this.expr.charCodeAt(this.index);
      }
      /**
       * @param {string} expr a string with the passed in express
       * @returns Jsep
       */
      constructor(expr) {
        this.expr = expr;
        this.index = 0;
      }
      /**
       * static top-level parser
       * @returns {jsep.Expression}
       */
      static parse(expr) {
        return new _Jsep(expr).parse();
      }
      /**
       * Get the longest key length of any object
       * @param {object} obj
       * @returns {number}
       */
      static getMaxKeyLen(obj) {
        return Math.max(0, ...Object.keys(obj).map((k) => k.length));
      }
      /**
       * `ch` is a character code in the next three functions
       * @param {number} ch
       * @returns {boolean}
       */
      static isDecimalDigit(ch) {
        return ch >= 48 && ch <= 57;
      }
      /**
       * Returns the precedence of a binary operator or `0` if it isn't a binary operator. Can be float.
       * @param {string} op_val
       * @returns {number}
       */
      static binaryPrecedence(op_val) {
        return _Jsep.binary_ops[op_val] || 0;
      }
      /**
       * Looks for start of identifier
       * @param {number} ch
       * @returns {boolean}
       */
      static isIdentifierStart(ch) {
        return ch >= 65 && ch <= 90 || // A...Z
        ch >= 97 && ch <= 122 || // a...z
        ch >= 128 && !_Jsep.binary_ops[String.fromCharCode(ch)] || // any non-ASCII that is not an operator
        _Jsep.additional_identifier_chars.has(String.fromCharCode(ch));
      }
      /**
       * @param {number} ch
       * @returns {boolean}
       */
      static isIdentifierPart(ch) {
        return _Jsep.isIdentifierStart(ch) || _Jsep.isDecimalDigit(ch);
      }
      /**
       * throw error at index of the expression
       * @param {string} message
       * @throws
       */
      throwError(message) {
        const error2 = new Error(message + " at character " + this.index);
        error2.index = this.index;
        error2.description = message;
        throw error2;
      }
      /**
       * Run a given hook
       * @param {string} name
       * @param {jsep.Expression|false} [node]
       * @returns {?jsep.Expression}
       */
      runHook(name, node) {
        if (_Jsep.hooks[name]) {
          const env = {
            context: this,
            node
          };
          _Jsep.hooks.run(name, env);
          return env.node;
        }
        return node;
      }
      /**
       * Runs a given hook until one returns a node
       * @param {string} name
       * @returns {?jsep.Expression}
       */
      searchHook(name) {
        if (_Jsep.hooks[name]) {
          const env = {
            context: this
          };
          _Jsep.hooks[name].find(function(callback) {
            callback.call(env.context, env);
            return env.node;
          });
          return env.node;
        }
      }
      /**
       * Push `index` up to the next non-space character
       */
      gobbleSpaces() {
        let ch = this.code;
        while (ch === _Jsep.SPACE_CODE || ch === _Jsep.TAB_CODE || ch === _Jsep.LF_CODE || ch === _Jsep.CR_CODE) {
          ch = this.expr.charCodeAt(++this.index);
        }
        this.runHook("gobble-spaces");
      }
      /**
       * Top-level method to parse all expressions and returns compound or single node
       * @returns {jsep.Expression}
       */
      parse() {
        this.runHook("before-all");
        const nodes = this.gobbleExpressions();
        const node = nodes.length === 1 ? nodes[0] : {
          type: _Jsep.COMPOUND,
          body: nodes
        };
        return this.runHook("after-all", node);
      }
      /**
       * top-level parser (but can be reused within as well)
       * @param {number} [untilICode]
       * @returns {jsep.Expression[]}
       */
      gobbleExpressions(untilICode) {
        let nodes = [], ch_i, node;
        while (this.index < this.expr.length) {
          ch_i = this.code;
          if (ch_i === _Jsep.SEMCOL_CODE || ch_i === _Jsep.COMMA_CODE) {
            this.index++;
          } else {
            if (node = this.gobbleExpression()) {
              nodes.push(node);
            } else if (this.index < this.expr.length) {
              if (ch_i === untilICode) {
                break;
              }
              this.throwError('Unexpected "' + this.char + '"');
            }
          }
        }
        return nodes;
      }
      /**
       * The main parsing function.
       * @returns {?jsep.Expression}
       */
      gobbleExpression() {
        const node = this.searchHook("gobble-expression") || this.gobbleBinaryExpression();
        this.gobbleSpaces();
        return this.runHook("after-expression", node);
      }
      /**
       * Search for the operation portion of the string (e.g. `+`, `===`)
       * Start by taking the longest possible binary operations (3 characters: `===`, `!==`, `>>>`)
       * and move down from 3 to 2 to 1 character until a matching binary operation is found
       * then, return that binary operation
       * @returns {string|boolean}
       */
      gobbleBinaryOp() {
        this.gobbleSpaces();
        let to_check = this.expr.substr(this.index, _Jsep.max_binop_len);
        let tc_len = to_check.length;
        while (tc_len > 0) {
          if (_Jsep.binary_ops.hasOwnProperty(to_check) && (!_Jsep.isIdentifierStart(this.code) || this.index + to_check.length < this.expr.length && !_Jsep.isIdentifierPart(this.expr.charCodeAt(this.index + to_check.length)))) {
            this.index += tc_len;
            return to_check;
          }
          to_check = to_check.substr(0, --tc_len);
        }
        return false;
      }
      /**
       * This function is responsible for gobbling an individual expression,
       * e.g. `1`, `1+2`, `a+(b*2)-Math.sqrt(2)`
       * @returns {?jsep.BinaryExpression}
       */
      gobbleBinaryExpression() {
        let node, biop, prec, stack, biop_info, left, right, i, cur_biop;
        left = this.gobbleToken();
        if (!left) {
          return left;
        }
        biop = this.gobbleBinaryOp();
        if (!biop) {
          return left;
        }
        biop_info = {
          value: biop,
          prec: _Jsep.binaryPrecedence(biop),
          right_a: _Jsep.right_associative.has(biop)
        };
        right = this.gobbleToken();
        if (!right) {
          this.throwError("Expected expression after " + biop);
        }
        stack = [left, biop_info, right];
        while (biop = this.gobbleBinaryOp()) {
          prec = _Jsep.binaryPrecedence(biop);
          if (prec === 0) {
            this.index -= biop.length;
            break;
          }
          biop_info = {
            value: biop,
            prec,
            right_a: _Jsep.right_associative.has(biop)
          };
          cur_biop = biop;
          const comparePrev = (prev) => biop_info.right_a && prev.right_a ? prec > prev.prec : prec <= prev.prec;
          while (stack.length > 2 && comparePrev(stack[stack.length - 2])) {
            right = stack.pop();
            biop = stack.pop().value;
            left = stack.pop();
            node = {
              type: _Jsep.BINARY_EXP,
              operator: biop,
              left,
              right
            };
            stack.push(node);
          }
          node = this.gobbleToken();
          if (!node) {
            this.throwError("Expected expression after " + cur_biop);
          }
          stack.push(biop_info, node);
        }
        i = stack.length - 1;
        node = stack[i];
        while (i > 1) {
          node = {
            type: _Jsep.BINARY_EXP,
            operator: stack[i - 1].value,
            left: stack[i - 2],
            right: node
          };
          i -= 2;
        }
        return node;
      }
      /**
       * An individual part of a binary expression:
       * e.g. `foo.bar(baz)`, `1`, `"abc"`, `(a % 2)` (because it's in parenthesis)
       * @returns {boolean|jsep.Expression}
       */
      gobbleToken() {
        let ch, to_check, tc_len, node;
        this.gobbleSpaces();
        node = this.searchHook("gobble-token");
        if (node) {
          return this.runHook("after-token", node);
        }
        ch = this.code;
        if (_Jsep.isDecimalDigit(ch) || ch === _Jsep.PERIOD_CODE) {
          return this.gobbleNumericLiteral();
        }
        if (ch === _Jsep.SQUOTE_CODE || ch === _Jsep.DQUOTE_CODE) {
          node = this.gobbleStringLiteral();
        } else if (ch === _Jsep.OBRACK_CODE) {
          node = this.gobbleArray();
        } else {
          to_check = this.expr.substr(this.index, _Jsep.max_unop_len);
          tc_len = to_check.length;
          while (tc_len > 0) {
            if (_Jsep.unary_ops.hasOwnProperty(to_check) && (!_Jsep.isIdentifierStart(this.code) || this.index + to_check.length < this.expr.length && !_Jsep.isIdentifierPart(this.expr.charCodeAt(this.index + to_check.length)))) {
              this.index += tc_len;
              const argument = this.gobbleToken();
              if (!argument) {
                this.throwError("missing unaryOp argument");
              }
              return this.runHook("after-token", {
                type: _Jsep.UNARY_EXP,
                operator: to_check,
                argument,
                prefix: true
              });
            }
            to_check = to_check.substr(0, --tc_len);
          }
          if (_Jsep.isIdentifierStart(ch)) {
            node = this.gobbleIdentifier();
            if (_Jsep.literals.hasOwnProperty(node.name)) {
              node = {
                type: _Jsep.LITERAL,
                value: _Jsep.literals[node.name],
                raw: node.name
              };
            } else if (node.name === _Jsep.this_str) {
              node = {
                type: _Jsep.THIS_EXP
              };
            }
          } else if (ch === _Jsep.OPAREN_CODE) {
            node = this.gobbleGroup();
          }
        }
        if (!node) {
          return this.runHook("after-token", false);
        }
        node = this.gobbleTokenProperty(node);
        return this.runHook("after-token", node);
      }
      /**
       * Gobble properties of of identifiers/strings/arrays/groups.
       * e.g. `foo`, `bar.baz`, `foo['bar'].baz`
       * It also gobbles function calls:
       * e.g. `Math.acos(obj.angle)`
       * @param {jsep.Expression} node
       * @returns {jsep.Expression}
       */
      gobbleTokenProperty(node) {
        this.gobbleSpaces();
        let ch = this.code;
        while (ch === _Jsep.PERIOD_CODE || ch === _Jsep.OBRACK_CODE || ch === _Jsep.OPAREN_CODE || ch === _Jsep.QUMARK_CODE) {
          let optional;
          if (ch === _Jsep.QUMARK_CODE) {
            if (this.expr.charCodeAt(this.index + 1) !== _Jsep.PERIOD_CODE) {
              break;
            }
            optional = true;
            this.index += 2;
            this.gobbleSpaces();
            ch = this.code;
          }
          this.index++;
          if (ch === _Jsep.OBRACK_CODE) {
            node = {
              type: _Jsep.MEMBER_EXP,
              computed: true,
              object: node,
              property: this.gobbleExpression()
            };
            if (!node.property) {
              this.throwError('Unexpected "' + this.char + '"');
            }
            this.gobbleSpaces();
            ch = this.code;
            if (ch !== _Jsep.CBRACK_CODE) {
              this.throwError("Unclosed [");
            }
            this.index++;
          } else if (ch === _Jsep.OPAREN_CODE) {
            node = {
              type: _Jsep.CALL_EXP,
              "arguments": this.gobbleArguments(_Jsep.CPAREN_CODE),
              callee: node
            };
          } else if (ch === _Jsep.PERIOD_CODE || optional) {
            if (optional) {
              this.index--;
            }
            this.gobbleSpaces();
            node = {
              type: _Jsep.MEMBER_EXP,
              computed: false,
              object: node,
              property: this.gobbleIdentifier()
            };
          }
          if (optional) {
            node.optional = true;
          }
          this.gobbleSpaces();
          ch = this.code;
        }
        return node;
      }
      /**
       * Parse simple numeric literals: `12`, `3.4`, `.5`. Do this by using a string to
       * keep track of everything in the numeric literal and then calling `parseFloat` on that string
       * @returns {jsep.Literal}
       */
      gobbleNumericLiteral() {
        let number = "", ch, chCode;
        while (_Jsep.isDecimalDigit(this.code)) {
          number += this.expr.charAt(this.index++);
        }
        if (this.code === _Jsep.PERIOD_CODE) {
          number += this.expr.charAt(this.index++);
          while (_Jsep.isDecimalDigit(this.code)) {
            number += this.expr.charAt(this.index++);
          }
        }
        ch = this.char;
        if (ch === "e" || ch === "E") {
          number += this.expr.charAt(this.index++);
          ch = this.char;
          if (ch === "+" || ch === "-") {
            number += this.expr.charAt(this.index++);
          }
          while (_Jsep.isDecimalDigit(this.code)) {
            number += this.expr.charAt(this.index++);
          }
          if (!_Jsep.isDecimalDigit(this.expr.charCodeAt(this.index - 1))) {
            this.throwError("Expected exponent (" + number + this.char + ")");
          }
        }
        chCode = this.code;
        if (_Jsep.isIdentifierStart(chCode)) {
          this.throwError("Variable names cannot start with a number (" + number + this.char + ")");
        } else if (chCode === _Jsep.PERIOD_CODE || number.length === 1 && number.charCodeAt(0) === _Jsep.PERIOD_CODE) {
          this.throwError("Unexpected period");
        }
        return {
          type: _Jsep.LITERAL,
          value: parseFloat(number),
          raw: number
        };
      }
      /**
       * Parses a string literal, staring with single or double quotes with basic support for escape codes
       * e.g. `"hello world"`, `'this is\nJSEP'`
       * @returns {jsep.Literal}
       */
      gobbleStringLiteral() {
        let str = "";
        const startIndex = this.index;
        const quote = this.expr.charAt(this.index++);
        let closed = false;
        while (this.index < this.expr.length) {
          let ch = this.expr.charAt(this.index++);
          if (ch === quote) {
            closed = true;
            break;
          } else if (ch === "\\") {
            ch = this.expr.charAt(this.index++);
            switch (ch) {
              case "n":
                str += "\n";
                break;
              case "r":
                str += "\r";
                break;
              case "t":
                str += "	";
                break;
              case "b":
                str += "\b";
                break;
              case "f":
                str += "\f";
                break;
              case "v":
                str += "\v";
                break;
              default:
                str += ch;
            }
          } else {
            str += ch;
          }
        }
        if (!closed) {
          this.throwError('Unclosed quote after "' + str + '"');
        }
        return {
          type: _Jsep.LITERAL,
          value: str,
          raw: this.expr.substring(startIndex, this.index)
        };
      }
      /**
       * Gobbles only identifiers
       * e.g.: `foo`, `_value`, `$x1`
       * Also, this function checks if that identifier is a literal:
       * (e.g. `true`, `false`, `null`) or `this`
       * @returns {jsep.Identifier}
       */
      gobbleIdentifier() {
        let ch = this.code, start = this.index;
        if (_Jsep.isIdentifierStart(ch)) {
          this.index++;
        } else {
          this.throwError("Unexpected " + this.char);
        }
        while (this.index < this.expr.length) {
          ch = this.code;
          if (_Jsep.isIdentifierPart(ch)) {
            this.index++;
          } else {
            break;
          }
        }
        return {
          type: _Jsep.IDENTIFIER,
          name: this.expr.slice(start, this.index)
        };
      }
      /**
       * Gobbles a list of arguments within the context of a function call
       * or array literal. This function also assumes that the opening character
       * `(` or `[` has already been gobbled, and gobbles expressions and commas
       * until the terminator character `)` or `]` is encountered.
       * e.g. `foo(bar, baz)`, `my_func()`, or `[bar, baz]`
       * @param {number} termination
       * @returns {jsep.Expression[]}
       */
      gobbleArguments(termination) {
        const args = [];
        let closed = false;
        let separator_count = 0;
        while (this.index < this.expr.length) {
          this.gobbleSpaces();
          let ch_i = this.code;
          if (ch_i === termination) {
            closed = true;
            this.index++;
            if (termination === _Jsep.CPAREN_CODE && separator_count && separator_count >= args.length) {
              this.throwError("Unexpected token " + String.fromCharCode(termination));
            }
            break;
          } else if (ch_i === _Jsep.COMMA_CODE) {
            this.index++;
            separator_count++;
            if (separator_count !== args.length) {
              if (termination === _Jsep.CPAREN_CODE) {
                this.throwError("Unexpected token ,");
              } else if (termination === _Jsep.CBRACK_CODE) {
                for (let arg = args.length; arg < separator_count; arg++) {
                  args.push(null);
                }
              }
            }
          } else if (args.length !== separator_count && separator_count !== 0) {
            this.throwError("Expected comma");
          } else {
            const node = this.gobbleExpression();
            if (!node || node.type === _Jsep.COMPOUND) {
              this.throwError("Expected comma");
            }
            args.push(node);
          }
        }
        if (!closed) {
          this.throwError("Expected " + String.fromCharCode(termination));
        }
        return args;
      }
      /**
       * Responsible for parsing a group of things within parentheses `()`
       * that have no identifier in front (so not a function call)
       * This function assumes that it needs to gobble the opening parenthesis
       * and then tries to gobble everything within that parenthesis, assuming
       * that the next thing it should see is the close parenthesis. If not,
       * then the expression probably doesn't have a `)`
       * @returns {boolean|jsep.Expression}
       */
      gobbleGroup() {
        this.index++;
        let nodes = this.gobbleExpressions(_Jsep.CPAREN_CODE);
        if (this.code === _Jsep.CPAREN_CODE) {
          this.index++;
          if (nodes.length === 1) {
            return nodes[0];
          } else if (!nodes.length) {
            return false;
          } else {
            return {
              type: _Jsep.SEQUENCE_EXP,
              expressions: nodes
            };
          }
        } else {
          this.throwError("Unclosed (");
        }
      }
      /**
       * Responsible for parsing Array literals `[1, 2, 3]`
       * This function assumes that it needs to gobble the opening bracket
       * and then tries to gobble the expressions as arguments.
       * @returns {jsep.ArrayExpression}
       */
      gobbleArray() {
        this.index++;
        return {
          type: _Jsep.ARRAY_EXP,
          elements: this.gobbleArguments(_Jsep.CBRACK_CODE)
        };
      }
    };
    var hooks = new Hooks();
    Object.assign(Jsep, {
      hooks,
      plugins: new Plugins(Jsep),
      // Node Types
      // ----------
      // This is the full set of types that any JSEP node can be.
      // Store them here to save space when minified
      COMPOUND: "Compound",
      SEQUENCE_EXP: "SequenceExpression",
      IDENTIFIER: "Identifier",
      MEMBER_EXP: "MemberExpression",
      LITERAL: "Literal",
      THIS_EXP: "ThisExpression",
      CALL_EXP: "CallExpression",
      UNARY_EXP: "UnaryExpression",
      BINARY_EXP: "BinaryExpression",
      ARRAY_EXP: "ArrayExpression",
      TAB_CODE: 9,
      LF_CODE: 10,
      CR_CODE: 13,
      SPACE_CODE: 32,
      PERIOD_CODE: 46,
      // '.'
      COMMA_CODE: 44,
      // ','
      SQUOTE_CODE: 39,
      // single quote
      DQUOTE_CODE: 34,
      // double quotes
      OPAREN_CODE: 40,
      // (
      CPAREN_CODE: 41,
      // )
      OBRACK_CODE: 91,
      // [
      CBRACK_CODE: 93,
      // ]
      QUMARK_CODE: 63,
      // ?
      SEMCOL_CODE: 59,
      // ;
      COLON_CODE: 58,
      // :
      // Operations
      // ----------
      // Use a quickly-accessible map to store all of the unary operators
      // Values are set to `1` (it really doesn't matter)
      unary_ops: {
        "-": 1,
        "!": 1,
        "~": 1,
        "+": 1
      },
      // Also use a map for the binary operations but set their values to their
      // binary precedence for quick reference (higher number = higher precedence)
      // see [Order of operations](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Operator_Precedence)
      binary_ops: {
        "||": 1,
        "??": 1,
        "&&": 2,
        "|": 3,
        "^": 4,
        "&": 5,
        "==": 6,
        "!=": 6,
        "===": 6,
        "!==": 6,
        "<": 7,
        ">": 7,
        "<=": 7,
        ">=": 7,
        "<<": 8,
        ">>": 8,
        ">>>": 8,
        "+": 9,
        "-": 9,
        "*": 10,
        "/": 10,
        "%": 10,
        "**": 11
      },
      // sets specific binary_ops as right-associative
      right_associative: /* @__PURE__ */ new Set(["**"]),
      // Additional valid identifier chars, apart from a-z, A-Z and 0-9 (except on the starting char)
      additional_identifier_chars: /* @__PURE__ */ new Set(["$", "_"]),
      // Literals
      // ----------
      // Store the values to return for the various literals we may encounter
      literals: {
        "true": true,
        "false": false,
        "null": null
      },
      // Except for `this`, which is special. This could be changed to something like `'self'` as well
      this_str: "this"
    });
    Jsep.max_unop_len = Jsep.getMaxKeyLen(Jsep.unary_ops);
    Jsep.max_binop_len = Jsep.getMaxKeyLen(Jsep.binary_ops);
    var jsep = (expr) => new Jsep(expr).parse();
    var stdClassProps = Object.getOwnPropertyNames(class Test {
    });
    Object.getOwnPropertyNames(Jsep).filter((prop) => !stdClassProps.includes(prop) && jsep[prop] === void 0).forEach((m) => {
      jsep[m] = Jsep[m];
    });
    jsep.Jsep = Jsep;
    var CONDITIONAL_EXP = "ConditionalExpression";
    var ternary = {
      name: "ternary",
      init(jsep2) {
        jsep2.hooks.add("after-expression", function gobbleTernary(env) {
          if (env.node && this.code === jsep2.QUMARK_CODE) {
            this.index++;
            const test = env.node;
            const consequent = this.gobbleExpression();
            if (!consequent) {
              this.throwError("Expected expression");
            }
            this.gobbleSpaces();
            if (this.code === jsep2.COLON_CODE) {
              this.index++;
              const alternate = this.gobbleExpression();
              if (!alternate) {
                this.throwError("Expected expression");
              }
              env.node = {
                type: CONDITIONAL_EXP,
                test,
                consequent,
                alternate
              };
              if (test.operator && jsep2.binary_ops[test.operator] <= 0.9) {
                let newTest = test;
                while (newTest.right.operator && jsep2.binary_ops[newTest.right.operator] <= 0.9) {
                  newTest = newTest.right;
                }
                env.node.test = newTest.right;
                newTest.right = env.node;
                env.node = test;
              }
            } else {
              this.throwError("Expected :");
            }
          }
        });
      }
    };
    jsep.plugins.register(ternary);
    var FSLASH_CODE = 47;
    var BSLASH_CODE = 92;
    var index = {
      name: "regex",
      init(jsep2) {
        jsep2.hooks.add("gobble-token", function gobbleRegexLiteral(env) {
          if (this.code === FSLASH_CODE) {
            const patternIndex = ++this.index;
            let inCharSet = false;
            while (this.index < this.expr.length) {
              if (this.code === FSLASH_CODE && !inCharSet) {
                const pattern = this.expr.slice(patternIndex, this.index);
                let flags = "";
                while (++this.index < this.expr.length) {
                  const code = this.code;
                  if (code >= 97 && code <= 122 || code >= 65 && code <= 90 || code >= 48 && code <= 57) {
                    flags += this.char;
                  } else {
                    break;
                  }
                }
                let value;
                try {
                  value = new RegExp(pattern, flags);
                } catch (e) {
                  this.throwError(e.message);
                }
                env.node = {
                  type: jsep2.LITERAL,
                  value,
                  raw: this.expr.slice(patternIndex - 1, this.index)
                };
                env.node = this.gobbleTokenProperty(env.node);
                return env.node;
              }
              if (this.code === jsep2.OBRACK_CODE) {
                inCharSet = true;
              } else if (inCharSet && this.code === jsep2.CBRACK_CODE) {
                inCharSet = false;
              }
              this.index += this.code === BSLASH_CODE ? 2 : 1;
            }
            this.throwError("Unclosed Regex");
          }
        });
      }
    };
    var PLUS_CODE = 43;
    var MINUS_CODE = 45;
    var plugin = {
      name: "assignment",
      assignmentOperators: /* @__PURE__ */ new Set(["=", "*=", "**=", "/=", "%=", "+=", "-=", "<<=", ">>=", ">>>=", "&=", "^=", "|=", "||=", "&&=", "??="]),
      updateOperators: [PLUS_CODE, MINUS_CODE],
      assignmentPrecedence: 0.9,
      init(jsep2) {
        const updateNodeTypes = [jsep2.IDENTIFIER, jsep2.MEMBER_EXP];
        plugin.assignmentOperators.forEach((op) => jsep2.addBinaryOp(op, plugin.assignmentPrecedence, true));
        jsep2.hooks.add("gobble-token", function gobbleUpdatePrefix(env) {
          const code = this.code;
          if (plugin.updateOperators.some((c) => c === code && c === this.expr.charCodeAt(this.index + 1))) {
            this.index += 2;
            env.node = {
              type: "UpdateExpression",
              operator: code === PLUS_CODE ? "++" : "--",
              argument: this.gobbleTokenProperty(this.gobbleIdentifier()),
              prefix: true
            };
            if (!env.node.argument || !updateNodeTypes.includes(env.node.argument.type)) {
              this.throwError(`Unexpected ${env.node.operator}`);
            }
          }
        });
        jsep2.hooks.add("after-token", function gobbleUpdatePostfix(env) {
          if (env.node) {
            const code = this.code;
            if (plugin.updateOperators.some((c) => c === code && c === this.expr.charCodeAt(this.index + 1))) {
              if (!updateNodeTypes.includes(env.node.type)) {
                this.throwError(`Unexpected ${env.node.operator}`);
              }
              this.index += 2;
              env.node = {
                type: "UpdateExpression",
                operator: code === PLUS_CODE ? "++" : "--",
                argument: env.node,
                prefix: false
              };
            }
          }
        });
        jsep2.hooks.add("after-expression", function gobbleAssignment(env) {
          if (env.node) {
            updateBinariesToAssignments(env.node);
          }
        });
        function updateBinariesToAssignments(node) {
          if (plugin.assignmentOperators.has(node.operator)) {
            node.type = "AssignmentExpression";
            updateBinariesToAssignments(node.left);
            updateBinariesToAssignments(node.right);
          } else if (!node.operator) {
            Object.values(node).forEach((val) => {
              if (val && typeof val === "object") {
                updateBinariesToAssignments(val);
              }
            });
          }
        }
      }
    };
    jsep.plugins.register(index, plugin);
    jsep.addUnaryOp("typeof");
    jsep.addUnaryOp("void");
    jsep.addLiteral("null", null);
    jsep.addLiteral("undefined", void 0);
    var BLOCKED_PROTO_PROPERTIES = /* @__PURE__ */ new Set(["constructor", "__proto__", "__defineGetter__", "__defineSetter__", "__lookupGetter__", "__lookupSetter__"]);
    var SafeEval = {
      /**
       * @param {jsep.Expression} ast
       * @param {Record<string, any>} subs
       */
      evalAst(ast, subs) {
        switch (ast.type) {
          case "BinaryExpression":
          case "LogicalExpression":
            return SafeEval.evalBinaryExpression(ast, subs);
          case "Compound":
            return SafeEval.evalCompound(ast, subs);
          case "ConditionalExpression":
            return SafeEval.evalConditionalExpression(ast, subs);
          case "Identifier":
            return SafeEval.evalIdentifier(ast, subs);
          case "Literal":
            return SafeEval.evalLiteral(ast, subs);
          case "MemberExpression":
            return SafeEval.evalMemberExpression(ast, subs);
          case "UnaryExpression":
            return SafeEval.evalUnaryExpression(ast, subs);
          case "ArrayExpression":
            return SafeEval.evalArrayExpression(ast, subs);
          case "CallExpression":
            return SafeEval.evalCallExpression(ast, subs);
          case "AssignmentExpression":
            return SafeEval.evalAssignmentExpression(ast, subs);
          default:
            throw SyntaxError("Unexpected expression", ast);
        }
      },
      evalBinaryExpression(ast, subs) {
        const result = {
          "||": (a, b) => a || b(),
          "&&": (a, b) => a && b(),
          "|": (a, b) => a | b(),
          "^": (a, b) => a ^ b(),
          "&": (a, b) => a & b(),
          // eslint-disable-next-line eqeqeq -- API
          "==": (a, b) => a == b(),
          // eslint-disable-next-line eqeqeq -- API
          "!=": (a, b) => a != b(),
          "===": (a, b) => a === b(),
          "!==": (a, b) => a !== b(),
          "<": (a, b) => a < b(),
          ">": (a, b) => a > b(),
          "<=": (a, b) => a <= b(),
          ">=": (a, b) => a >= b(),
          "<<": (a, b) => a << b(),
          ">>": (a, b) => a >> b(),
          ">>>": (a, b) => a >>> b(),
          "+": (a, b) => a + b(),
          "-": (a, b) => a - b(),
          "*": (a, b) => a * b(),
          "/": (a, b) => a / b(),
          "%": (a, b) => a % b()
        }[ast.operator](SafeEval.evalAst(ast.left, subs), () => SafeEval.evalAst(ast.right, subs));
        return result;
      },
      evalCompound(ast, subs) {
        let last;
        for (let i = 0; i < ast.body.length; i++) {
          if (ast.body[i].type === "Identifier" && ["var", "let", "const"].includes(ast.body[i].name) && ast.body[i + 1] && ast.body[i + 1].type === "AssignmentExpression") {
            i += 1;
          }
          const expr = ast.body[i];
          last = SafeEval.evalAst(expr, subs);
        }
        return last;
      },
      evalConditionalExpression(ast, subs) {
        if (SafeEval.evalAst(ast.test, subs)) {
          return SafeEval.evalAst(ast.consequent, subs);
        }
        return SafeEval.evalAst(ast.alternate, subs);
      },
      evalIdentifier(ast, subs) {
        if (Object.hasOwn(subs, ast.name)) {
          return subs[ast.name];
        }
        throw ReferenceError(`${ast.name} is not defined`);
      },
      evalLiteral(ast) {
        return ast.value;
      },
      evalMemberExpression(ast, subs) {
        const prop = String(
          // NOTE: `String(value)` throws error when
          // value has overwritten the toString method to return non-string
          // i.e. `value = {toString: () => []}`
          ast.computed ? SafeEval.evalAst(ast.property) : ast.property.name
          // `object.property` property is Identifier
        );
        const obj = SafeEval.evalAst(ast.object, subs);
        if (obj === void 0 || obj === null) {
          throw TypeError(`Cannot read properties of ${obj} (reading '${prop}')`);
        }
        if (!Object.hasOwn(obj, prop) && BLOCKED_PROTO_PROPERTIES.has(prop)) {
          throw TypeError(`Cannot read properties of ${obj} (reading '${prop}')`);
        }
        const result = obj[prop];
        if (typeof result === "function") {
          return result.bind(obj);
        }
        return result;
      },
      evalUnaryExpression(ast, subs) {
        const result = {
          "-": (a) => -SafeEval.evalAst(a, subs),
          "!": (a) => !SafeEval.evalAst(a, subs),
          "~": (a) => ~SafeEval.evalAst(a, subs),
          // eslint-disable-next-line no-implicit-coercion -- API
          "+": (a) => +SafeEval.evalAst(a, subs),
          typeof: (a) => typeof SafeEval.evalAst(a, subs),
          // eslint-disable-next-line no-void, sonarjs/void-use -- feature
          void: (a) => void SafeEval.evalAst(a, subs)
        }[ast.operator](ast.argument);
        return result;
      },
      evalArrayExpression(ast, subs) {
        return ast.elements.map((el) => SafeEval.evalAst(el, subs));
      },
      evalCallExpression(ast, subs) {
        const args = ast.arguments.map((arg) => SafeEval.evalAst(arg, subs));
        const func = SafeEval.evalAst(ast.callee, subs);
        if (func === Function) {
          throw new Error("Function constructor is disabled");
        }
        return func(...args);
      },
      evalAssignmentExpression(ast, subs) {
        if (ast.left.type !== "Identifier") {
          throw SyntaxError("Invalid left-hand side in assignment");
        }
        const id = ast.left.name;
        const value = SafeEval.evalAst(ast.right, subs);
        subs[id] = value;
        return subs[id];
      }
    };
    var SafeScript = class {
      /**
       * @param {string} expr Expression to evaluate
       */
      constructor(expr) {
        this.code = expr;
        this.ast = jsep(this.code);
      }
      /**
       * @param {object} context Object whose items will be added
       *   to evaluation
       * @returns {EvaluatedResult} Result of evaluated code
       */
      runInNewContext(context) {
        const keyMap = Object.assign(/* @__PURE__ */ Object.create(null), context);
        return SafeEval.evalAst(this.ast, keyMap);
      }
    };
    function push(arr, item) {
      arr = arr.slice();
      arr.push(item);
      return arr;
    }
    function unshift(item, arr) {
      arr = arr.slice();
      arr.unshift(item);
      return arr;
    }
    var NewError = class extends Error {
      /**
       * @param {AnyResult} value The evaluated scalar value
       */
      constructor(value) {
        super('JSONPath should not be called with "new" (it prevents return of (unwrapped) scalar values)');
        this.avoidNew = true;
        this.value = value;
        this.name = "NewError";
      }
    };
    function JSONPath(opts, expr, obj, callback, otherTypeCallback) {
      if (!(this instanceof JSONPath)) {
        try {
          return new JSONPath(opts, expr, obj, callback, otherTypeCallback);
        } catch (e) {
          if (!e.avoidNew) {
            throw e;
          }
          return e.value;
        }
      }
      if (typeof opts === "string") {
        otherTypeCallback = callback;
        callback = obj;
        obj = expr;
        expr = opts;
        opts = null;
      }
      const optObj = opts && typeof opts === "object";
      opts = opts || {};
      this.json = opts.json || obj;
      this.path = opts.path || expr;
      this.resultType = opts.resultType || "value";
      this.flatten = opts.flatten || false;
      this.wrap = Object.hasOwn(opts, "wrap") ? opts.wrap : true;
      this.sandbox = opts.sandbox || {};
      this.eval = opts.eval === void 0 ? "safe" : opts.eval;
      this.ignoreEvalErrors = typeof opts.ignoreEvalErrors === "undefined" ? false : opts.ignoreEvalErrors;
      this.parent = opts.parent || null;
      this.parentProperty = opts.parentProperty || null;
      this.callback = opts.callback || callback || null;
      this.otherTypeCallback = opts.otherTypeCallback || otherTypeCallback || function() {
        throw new TypeError("You must supply an otherTypeCallback callback option with the @other() operator.");
      };
      if (opts.autostart !== false) {
        const args = {
          path: optObj ? opts.path : expr
        };
        if (!optObj) {
          args.json = obj;
        } else if ("json" in opts) {
          args.json = opts.json;
        }
        const ret = this.evaluate(args);
        if (!ret || typeof ret !== "object") {
          throw new NewError(ret);
        }
        return ret;
      }
    }
    JSONPath.prototype.evaluate = function(expr, json2, callback, otherTypeCallback) {
      let currParent = this.parent, currParentProperty = this.parentProperty;
      let {
        flatten,
        wrap
      } = this;
      this.currResultType = this.resultType;
      this.currEval = this.eval;
      this.currSandbox = this.sandbox;
      callback = callback || this.callback;
      this.currOtherTypeCallback = otherTypeCallback || this.otherTypeCallback;
      json2 = json2 || this.json;
      expr = expr || this.path;
      if (expr && typeof expr === "object" && !Array.isArray(expr)) {
        if (!expr.path && expr.path !== "") {
          throw new TypeError('You must supply a "path" property when providing an object argument to JSONPath.evaluate().');
        }
        if (!Object.hasOwn(expr, "json")) {
          throw new TypeError('You must supply a "json" property when providing an object argument to JSONPath.evaluate().');
        }
        ({
          json: json2
        } = expr);
        flatten = Object.hasOwn(expr, "flatten") ? expr.flatten : flatten;
        this.currResultType = Object.hasOwn(expr, "resultType") ? expr.resultType : this.currResultType;
        this.currSandbox = Object.hasOwn(expr, "sandbox") ? expr.sandbox : this.currSandbox;
        wrap = Object.hasOwn(expr, "wrap") ? expr.wrap : wrap;
        this.currEval = Object.hasOwn(expr, "eval") ? expr.eval : this.currEval;
        callback = Object.hasOwn(expr, "callback") ? expr.callback : callback;
        this.currOtherTypeCallback = Object.hasOwn(expr, "otherTypeCallback") ? expr.otherTypeCallback : this.currOtherTypeCallback;
        currParent = Object.hasOwn(expr, "parent") ? expr.parent : currParent;
        currParentProperty = Object.hasOwn(expr, "parentProperty") ? expr.parentProperty : currParentProperty;
        expr = expr.path;
      }
      currParent = currParent || null;
      currParentProperty = currParentProperty || null;
      if (Array.isArray(expr)) {
        expr = JSONPath.toPathString(expr);
      }
      if (!expr && expr !== "" || !json2) {
        return void 0;
      }
      const exprList = JSONPath.toPathArray(expr);
      if (exprList[0] === "$" && exprList.length > 1) {
        exprList.shift();
      }
      this._hasParentSelector = null;
      const result = this._trace(exprList, json2, ["$"], currParent, currParentProperty, callback).filter(function(ea) {
        return ea && !ea.isParentSelector;
      });
      if (!result.length) {
        return wrap ? [] : void 0;
      }
      if (!wrap && result.length === 1 && !result[0].hasArrExpr) {
        return this._getPreferredOutput(result[0]);
      }
      return result.reduce((rslt, ea) => {
        const valOrPath = this._getPreferredOutput(ea);
        if (flatten && Array.isArray(valOrPath)) {
          rslt = rslt.concat(valOrPath);
        } else {
          rslt.push(valOrPath);
        }
        return rslt;
      }, []);
    };
    JSONPath.prototype._getPreferredOutput = function(ea) {
      const resultType = this.currResultType;
      switch (resultType) {
        case "all": {
          const path = Array.isArray(ea.path) ? ea.path : JSONPath.toPathArray(ea.path);
          ea.pointer = JSONPath.toPointer(path);
          ea.path = typeof ea.path === "string" ? ea.path : JSONPath.toPathString(ea.path);
          return ea;
        }
        case "value":
        case "parent":
        case "parentProperty":
          return ea[resultType];
        case "path":
          return JSONPath.toPathString(ea[resultType]);
        case "pointer":
          return JSONPath.toPointer(ea.path);
        default:
          throw new TypeError("Unknown result type");
      }
    };
    JSONPath.prototype._handleCallback = function(fullRetObj, callback, type) {
      if (callback) {
        const preferredOutput = this._getPreferredOutput(fullRetObj);
        fullRetObj.path = typeof fullRetObj.path === "string" ? fullRetObj.path : JSONPath.toPathString(fullRetObj.path);
        callback(preferredOutput, type, fullRetObj);
      }
    };
    JSONPath.prototype._trace = function(expr, val, path, parent, parentPropName, callback, hasArrExpr, literalPriority) {
      let retObj;
      if (!expr.length) {
        retObj = {
          path,
          value: val,
          parent,
          parentProperty: parentPropName,
          hasArrExpr
        };
        this._handleCallback(retObj, callback, "value");
        return retObj;
      }
      const loc = expr[0], x = expr.slice(1);
      const ret = [];
      function addRet(elems) {
        if (Array.isArray(elems)) {
          elems.forEach((t) => {
            ret.push(t);
          });
        } else {
          ret.push(elems);
        }
      }
      if ((typeof loc !== "string" || literalPriority) && val && Object.hasOwn(val, loc)) {
        addRet(this._trace(x, val[loc], push(path, loc), val, loc, callback, hasArrExpr));
      } else if (loc === "*") {
        this._walk(val, (m) => {
          addRet(this._trace(x, val[m], push(path, m), val, m, callback, true, true));
        });
      } else if (loc === "..") {
        addRet(this._trace(x, val, path, parent, parentPropName, callback, hasArrExpr));
        this._walk(val, (m) => {
          if (typeof val[m] === "object") {
            addRet(this._trace(expr.slice(), val[m], push(path, m), val, m, callback, true));
          }
        });
      } else if (loc === "^") {
        this._hasParentSelector = true;
        return {
          path: path.slice(0, -1),
          expr: x,
          isParentSelector: true
        };
      } else if (loc === "~") {
        retObj = {
          path: push(path, loc),
          value: parentPropName,
          parent,
          parentProperty: null
        };
        this._handleCallback(retObj, callback, "property");
        return retObj;
      } else if (loc === "$") {
        addRet(this._trace(x, val, path, null, null, callback, hasArrExpr));
      } else if (/^(-?\d*):(-?\d*):?(\d*)$/u.test(loc)) {
        addRet(this._slice(loc, x, val, path, parent, parentPropName, callback));
      } else if (loc.indexOf("?(") === 0) {
        if (this.currEval === false) {
          throw new Error("Eval [?(expr)] prevented in JSONPath expression.");
        }
        const safeLoc = loc.replace(/^\?\((.*?)\)$/u, "$1");
        const nested = /@.?([^?]*)[['](\??\(.*?\))(?!.\)\])[\]']/gu.exec(safeLoc);
        if (nested) {
          this._walk(val, (m) => {
            const npath = [nested[2]];
            const nvalue = nested[1] ? val[m][nested[1]] : val[m];
            const filterResults = this._trace(npath, nvalue, path, parent, parentPropName, callback, true);
            if (filterResults.length > 0) {
              addRet(this._trace(x, val[m], push(path, m), val, m, callback, true));
            }
          });
        } else {
          this._walk(val, (m) => {
            if (this._eval(safeLoc, val[m], m, path, parent, parentPropName)) {
              addRet(this._trace(x, val[m], push(path, m), val, m, callback, true));
            }
          });
        }
      } else if (loc[0] === "(") {
        if (this.currEval === false) {
          throw new Error("Eval [(expr)] prevented in JSONPath expression.");
        }
        addRet(this._trace(unshift(this._eval(loc, val, path.at(-1), path.slice(0, -1), parent, parentPropName), x), val, path, parent, parentPropName, callback, hasArrExpr));
      } else if (loc[0] === "@") {
        let addType = false;
        const valueType = loc.slice(1, -2);
        switch (valueType) {
          case "scalar":
            if (!val || !["object", "function"].includes(typeof val)) {
              addType = true;
            }
            break;
          case "boolean":
          case "string":
          case "undefined":
          case "function":
            if (typeof val === valueType) {
              addType = true;
            }
            break;
          case "integer":
            if (Number.isFinite(val) && !(val % 1)) {
              addType = true;
            }
            break;
          case "number":
            if (Number.isFinite(val)) {
              addType = true;
            }
            break;
          case "nonFinite":
            if (typeof val === "number" && !Number.isFinite(val)) {
              addType = true;
            }
            break;
          case "object":
            if (val && typeof val === valueType) {
              addType = true;
            }
            break;
          case "array":
            if (Array.isArray(val)) {
              addType = true;
            }
            break;
          case "other":
            addType = this.currOtherTypeCallback(val, path, parent, parentPropName);
            break;
          case "null":
            if (val === null) {
              addType = true;
            }
            break;
          /* c8 ignore next 2 */
          default:
            throw new TypeError("Unknown value type " + valueType);
        }
        if (addType) {
          retObj = {
            path,
            value: val,
            parent,
            parentProperty: parentPropName
          };
          this._handleCallback(retObj, callback, "value");
          return retObj;
        }
      } else if (loc[0] === "`" && val && Object.hasOwn(val, loc.slice(1))) {
        const locProp = loc.slice(1);
        addRet(this._trace(x, val[locProp], push(path, locProp), val, locProp, callback, hasArrExpr, true));
      } else if (loc.includes(",")) {
        const parts = loc.split(",");
        for (const part of parts) {
          addRet(this._trace(unshift(part, x), val, path, parent, parentPropName, callback, true));
        }
      } else if (!literalPriority && val && Object.hasOwn(val, loc)) {
        addRet(this._trace(x, val[loc], push(path, loc), val, loc, callback, hasArrExpr, true));
      }
      if (this._hasParentSelector) {
        for (let t = 0; t < ret.length; t++) {
          const rett = ret[t];
          if (rett && rett.isParentSelector) {
            const tmp = this._trace(rett.expr, val, rett.path, parent, parentPropName, callback, hasArrExpr);
            if (Array.isArray(tmp)) {
              ret[t] = tmp[0];
              const tl = tmp.length;
              for (let tt = 1; tt < tl; tt++) {
                t++;
                ret.splice(t, 0, tmp[tt]);
              }
            } else {
              ret[t] = tmp;
            }
          }
        }
      }
      return ret;
    };
    JSONPath.prototype._walk = function(val, f) {
      if (Array.isArray(val)) {
        const n = val.length;
        for (let i = 0; i < n; i++) {
          f(i);
        }
      } else if (val && typeof val === "object") {
        Object.keys(val).forEach((m) => {
          f(m);
        });
      }
    };
    JSONPath.prototype._slice = function(loc, expr, val, path, parent, parentPropName, callback) {
      if (!Array.isArray(val)) {
        return void 0;
      }
      const len = val.length, parts = loc.split(":"), step = parts[2] && Number.parseInt(parts[2]) || 1;
      let start = parts[0] && Number.parseInt(parts[0]) || 0, end = parts[1] && Number.parseInt(parts[1]) || len;
      start = start < 0 ? Math.max(0, start + len) : Math.min(len, start);
      end = end < 0 ? Math.max(0, end + len) : Math.min(len, end);
      const ret = [];
      for (let i = start; i < end; i += step) {
        const tmp = this._trace(unshift(i, expr), val, path, parent, parentPropName, callback, true);
        tmp.forEach((t) => {
          ret.push(t);
        });
      }
      return ret;
    };
    JSONPath.prototype._eval = function(code, _v, _vname, path, parent, parentPropName) {
      this.currSandbox._$_parentProperty = parentPropName;
      this.currSandbox._$_parent = parent;
      this.currSandbox._$_property = _vname;
      this.currSandbox._$_root = this.json;
      this.currSandbox._$_v = _v;
      const containsPath = code.includes("@path");
      if (containsPath) {
        this.currSandbox._$_path = JSONPath.toPathString(path.concat([_vname]));
      }
      const scriptCacheKey = this.currEval + "Script:" + code;
      if (!JSONPath.cache[scriptCacheKey]) {
        let script = code.replaceAll("@parentProperty", "_$_parentProperty").replaceAll("@parent", "_$_parent").replaceAll("@property", "_$_property").replaceAll("@root", "_$_root").replaceAll(/@([.\s)[])/gu, "_$_v$1");
        if (containsPath) {
          script = script.replaceAll("@path", "_$_path");
        }
        if (this.currEval === "safe" || this.currEval === true || this.currEval === void 0) {
          JSONPath.cache[scriptCacheKey] = new this.safeVm.Script(script);
        } else if (this.currEval === "native") {
          JSONPath.cache[scriptCacheKey] = new this.vm.Script(script);
        } else if (typeof this.currEval === "function" && this.currEval.prototype && Object.hasOwn(this.currEval.prototype, "runInNewContext")) {
          const CurrEval = this.currEval;
          JSONPath.cache[scriptCacheKey] = new CurrEval(script);
        } else if (typeof this.currEval === "function") {
          JSONPath.cache[scriptCacheKey] = {
            runInNewContext: (context) => this.currEval(script, context)
          };
        } else {
          throw new TypeError(`Unknown "eval" property "${this.currEval}"`);
        }
      }
      try {
        return JSONPath.cache[scriptCacheKey].runInNewContext(this.currSandbox);
      } catch (e) {
        if (this.ignoreEvalErrors) {
          return false;
        }
        throw new Error("jsonPath: " + e.message + ": " + code);
      }
    };
    JSONPath.cache = {};
    JSONPath.toPathString = function(pathArr) {
      const x = pathArr, n = x.length;
      let p = "$";
      for (let i = 1; i < n; i++) {
        if (!/^(~|\^|@.*?\(\))$/u.test(x[i])) {
          p += /^[0-9*]+$/u.test(x[i]) ? "[" + x[i] + "]" : "['" + x[i] + "']";
        }
      }
      return p;
    };
    JSONPath.toPointer = function(pointer) {
      const x = pointer, n = x.length;
      let p = "";
      for (let i = 1; i < n; i++) {
        if (!/^(~|\^|@.*?\(\))$/u.test(x[i])) {
          p += "/" + x[i].toString().replaceAll("~", "~0").replaceAll("/", "~1");
        }
      }
      return p;
    };
    JSONPath.toPathArray = function(expr) {
      const {
        cache: cache3
      } = JSONPath;
      if (cache3[expr]) {
        return cache3[expr].concat();
      }
      const subx = [];
      const normalized = expr.replaceAll(/@(?:null|boolean|number|string|integer|undefined|nonFinite|scalar|array|object|function|other)\(\)/gu, ";$&;").replaceAll(/[['](\??\(.*?\))[\]'](?!.\])/gu, function($0, $1) {
        return "[#" + (subx.push($1) - 1) + "]";
      }).replaceAll(/\[['"]([^'\]]*)['"]\]/gu, function($0, prop) {
        return "['" + prop.replaceAll(".", "%@%").replaceAll("~", "%%@@%%") + "']";
      }).replaceAll("~", ";~;").replaceAll(/['"]?\.['"]?(?![^[]*\])|\[['"]?/gu, ";").replaceAll("%@%", ".").replaceAll("%%@@%%", "~").replaceAll(/(?:;)?(\^+)(?:;)?/gu, function($0, ups) {
        return ";" + ups.split("").join(";") + ";";
      }).replaceAll(/;;;|;;/gu, ";..;").replaceAll(/;$|'?\]|'$/gu, "");
      const exprList = normalized.split(";").map(function(exp) {
        const match = exp.match(/#(\d+)/u);
        return !match || !match[1] ? exp : subx[match[1]];
      });
      cache3[expr] = exprList;
      return cache3[expr].concat();
    };
    JSONPath.prototype.safeVm = {
      Script: SafeScript
    };
    JSONPath.prototype.vm = vm;
    exports.JSONPath = JSONPath;
  }
});

// node_modules/picnic-api/lib/domains/catalog/helpers.js
var require_helpers = __commonJS({
  "node_modules/picnic-api/lib/domains/catalog/helpers.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.extractMarkdowns = exports.findById = exports.stripMarkdownFormatting = exports.stripColorMarkup = void 0;
    exports.extractProductDetails = extractProductDetails;
    var jsonpath_plus_1 = require_index_node_cjs();
    var stripColorMarkup = (text3) => text3.replace(/#\([A-Za-z0-9#_]+\)/g, "").trim();
    exports.stripColorMarkup = stripColorMarkup;
    var stripMarkdownFormatting = (text3) => text3.replace(/\*\*/g, "").replace(/__/g, "");
    exports.stripMarkdownFormatting = stripMarkdownFormatting;
    var findById = (node, id) => {
      if (!node)
        return null;
      if (node.id === id)
        return node;
      for (const key of ["child", "children"]) {
        if (Array.isArray(node[key])) {
          for (const child of node[key]) {
            const result = (0, exports.findById)(child, id);
            if (result)
              return result;
          }
        } else if (node[key] && typeof node[key] === "object") {
          const result = (0, exports.findById)(node[key], id);
          if (result)
            return result;
        }
      }
      return null;
    };
    exports.findById = findById;
    var extractMarkdowns = (node) => {
      if (!node)
        return [];
      return (0, jsonpath_plus_1.JSONPath)({ path: "$..markdown", json: node }).filter((m) => typeof m === "string");
    };
    exports.extractMarkdowns = extractMarkdowns;
    function extractProductDetails(productId, page) {
      const mainContainer = (0, exports.findById)(page.layout.body, "product-details-page-root-main-container");
      const children = (0, jsonpath_plus_1.JSONPath)({ path: "$.pml.component.children", json: mainContainer })[0] ?? [];
      const nameNode = children.find((child) => child.textType === "HEADER1");
      const brandNode = children.find((child) => child.textAttributes?.weight === "REGULAR");
      const stackNode = children.find((child) => child.type === "STACK");
      const [unitQuantityNode, unitPriceNode] = stackNode?.children?.filter((child) => child.type === "RICH_TEXT") ?? [];
      const nodeMarkdown = (node) => typeof node?.markdown === "string" ? (0, exports.stripColorMarkup)(node.markdown) : null;
      const name = nodeMarkdown(nameNode) ?? "";
      const brand = nodeMarkdown(brandNode);
      const unitQuantity = nodeMarkdown(unitQuantityNode) ?? "";
      const unitPrice = nodeMarkdown(unitPriceNode);
      const allSellingUnits = (0, jsonpath_plus_1.JSONPath)({ path: "$..sellingUnit", json: page });
      const mainUnit = allSellingUnits.find((u) => u.id === productId && u.max_count !== void 0) ?? {};
      let displayPrice = mainUnit.display_price ?? 0;
      let priceRanges = mainUnit.price_ranges ?? null;
      if (!priceRanges) {
        priceRanges = extractPriceRangesFromExpressions(page) ?? null;
      }
      if (!displayPrice) {
        const bundleNode = (0, exports.findById)(page.layout.body, productId);
        if (bundleNode) {
          displayPrice = (0, jsonpath_plus_1.JSONPath)({ path: "$..price", json: bundleNode })[0] ?? 0;
        }
      }
      if (!displayPrice && mainContainer) {
        const priceComponents = (0, jsonpath_plus_1.JSONPath)({ path: "$..price", json: mainContainer }).filter((p) => typeof p === "number");
        displayPrice = priceComponents[0] ?? 0;
      }
      const maxCount = mainUnit.max_count ?? 0;
      const gallery = (0, exports.findById)(page.layout.body, "product-page-image-gallery-main-image-container");
      const imageIds = gallery ? [...new Set((0, jsonpath_plus_1.JSONPath)({ path: "$..source.id", json: gallery }))] : mainUnit.image_id ? [mainUnit.image_id] : [];
      const descBlock = (0, exports.findById)(page.layout.body, "description");
      const descMarkdowns = (0, exports.extractMarkdowns)(descBlock);
      const description = descMarkdowns.length > 0 ? descMarkdowns.join("\n") : null;
      const highlightsBlock = (0, exports.findById)(page.layout.body, "product-page-highlights");
      const highlights = (0, exports.extractMarkdowns)(highlightsBlock).map((h) => (0, exports.stripMarkdownFormatting)((0, exports.stripColorMarkup)(h)));
      const allergiesBlock = (0, exports.findById)(page.layout.body, "product-page-allergies");
      const allergenTexts = (0, exports.extractMarkdowns)(allergiesBlock).map(exports.stripColorMarkup);
      const allergens = allergenTexts.filter((t) => !/^bevat(\s+mogelijk)?$/i.test(t.trim()));
      const accordionBlock = (0, exports.findById)(page.layout.body, "accordion-list");
      const infoSections = [];
      if (accordionBlock) {
        const items = (0, jsonpath_plus_1.JSONPath)({ path: "$..items", json: accordionBlock })[0];
        if (Array.isArray(items)) {
          for (const item of items) {
            const headerTexts = (0, exports.extractMarkdowns)(item.header).map(exports.stripMarkdownFormatting).map(exports.stripColorMarkup);
            const bodyTexts = (0, exports.extractMarkdowns)(item.body).map(exports.stripColorMarkup);
            infoSections.push({
              title: headerTexts[0] ?? "",
              content: bodyTexts.join("\n")
            });
          }
        }
      }
      let promotion = null;
      const promoData = (0, jsonpath_plus_1.JSONPath)({ path: "$..promotion_id", json: page });
      const promoLabels = (0, jsonpath_plus_1.JSONPath)({ path: "$..promotion_label", json: page });
      if (promoData.length > 0 && promoLabels.length > 0) {
        promotion = {
          id: promoData[0],
          label: promoLabels[0]
        };
      }
      const bundles = [];
      const bundleContainer = findBundleContainer(page.layout.body);
      if (bundleContainer) {
        const bundleItemNodes = [];
        const walkBundleItems = (node) => {
          if (!node)
            return;
          if (typeof node === "object" && !Array.isArray(node)) {
            if (node.type === "STATE_BOUNDARY" && typeof node.id === "string" && node.id.startsWith("s")) {
              bundleItemNodes.push(node);
            }
            for (const v of Object.values(node))
              walkBundleItems(v);
          } else if (Array.isArray(node)) {
            for (const item of node)
              walkBundleItems(item);
          }
        };
        walkBundleItems(bundleContainer);
        for (let i = 0; i < bundleItemNodes.length; i++) {
          const bNode = bundleItemNodes[i];
          const sellingUnits = (0, jsonpath_plus_1.JSONPath)({ path: "$..sellingUnit", json: bNode });
          const prices = (0, jsonpath_plus_1.JSONPath)({ path: "$..price", json: bNode }).filter((p) => typeof p === "number");
          const su = sellingUnits[0];
          if (su) {
            bundles.push({
              id: su.id,
              quantity: i + 1,
              pricePerUnit: prices[0] ?? 0,
              imageId: su.image_id ?? "",
              maxCount: su.max_count ?? 0
            });
          }
        }
      }
      const altContainer = (0, exports.findById)(page.layout.body, "alternatives-container");
      const altSellingUnits = altContainer ? (0, jsonpath_plus_1.JSONPath)({ path: "$..sellingUnit", json: altContainer }) : [];
      const similarProducts = altSellingUnits.filter((u) => u.display_price !== void 0).map((u) => ({
        id: u.id,
        name: u.name,
        imageId: u.image_id,
        displayPrice: u.display_price,
        unitQuantity: u.unit_quantity,
        maxCount: u.max_count,
        ...u.deposit !== void 0 ? { deposit: u.deposit } : {},
        ...u.price_ranges ? { priceRanges: u.price_ranges } : {}
      }));
      return {
        id: productId,
        name,
        brand,
        unitQuantity,
        unitPrice,
        displayPrice,
        maxCount,
        imageIds,
        description,
        highlights,
        allergens,
        infoSections,
        promotion,
        bundles,
        priceRanges,
        similarProducts
      };
    }
    function findBundleContainer(body) {
      const walk = (n) => {
        if (!n)
          return null;
        if (typeof n === "object" && !Array.isArray(n)) {
          if (typeof n.id === "string" && n.id.startsWith("product-page-bundles-"))
            return n;
          for (const v of Object.values(n)) {
            const result = walk(v);
            if (result)
              return result;
          }
        } else if (Array.isArray(n)) {
          for (const item of n) {
            const result = walk(item);
            if (result)
              return result;
          }
        }
        return null;
      };
      return walk(body);
    }
    function extractPriceRangesFromExpressions(page) {
      const allV1Arrays = (0, jsonpath_plus_1.JSONPath)({ path: "$..__ep1.v1", json: page });
      for (const arr of allV1Arrays) {
        if (Array.isArray(arr) && arr.length > 0 && arr[0].price !== void 0 && arr[0].from_quantity !== void 0) {
          return arr;
        }
      }
      const allV1Ep2 = (0, jsonpath_plus_1.JSONPath)({ path: "$..__ep2.v1", json: page });
      for (const arr of allV1Ep2) {
        if (Array.isArray(arr) && arr.length > 0 && arr[0].price !== void 0 && arr[0].from_quantity !== void 0) {
          return arr;
        }
      }
      return null;
    }
  }
});

// node_modules/picnic-api/lib/domains/catalog/service.js
var require_service4 = __commonJS({
  "node_modules/picnic-api/lib/domains/catalog/service.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.CatalogService = void 0;
    var jsonpath_plus_1 = require_index_node_cjs();
    var helpers_1 = require_helpers();
    var CatalogService = class {
      constructor(http) {
        this.http = http;
      }
      /**
       * Searches for Picnic products matching the query.
       * @param {string} query The keywords to search for.
       */
      async search(query) {
        const rawResults = await this.http.sendRequest("GET", `/pages/search-page-results?search_term=${encodeURIComponent(query)}`, null, true);
        return (0, jsonpath_plus_1.JSONPath)({ path: "$..sellingUnit", json: rawResults });
      }
      /**
       * Returns suggestions for Picnic products matching the query.
       * @param {string} query The keywords for suggestions.
       */
      getSuggestions(query) {
        return this.http.sendRequest("GET", `/suggest?search_term=${encodeURIComponent(query)}`);
      }
      /**
       * Returns the full product details page. The response is not typed as the content is dynamic.
       * @param {string} productId The product ID to fetch the page for.
       */
      getProductDetailsPage(productId) {
        return this.http.sendRequest("GET", `/pages/product-details-page-root?id=${productId}&show_category_action=true&show_remove_from_purchases_page_action=true`, null, true);
      }
      /**
       * Returns structured product details extracted from the product details page.
       * This is a convenience wrapper around {@link getProductDetailsPage} that parses
       * the Fusion page response into a clean {@link ProductDetails} data model.
       *
       * **⚠️ Experimental:** This method parses dynamic Fusion/PML page structures and
       * may break if Picnic changes their page layout. Use {@link getProductDetailsPage}
       * for a stable alternative.
       *
       * @param {string} productId The product ID to fetch details for.
       */
      async getProductDetails(productId) {
        const page = await this.getProductDetailsPage(productId);
        return (0, helpers_1.extractProductDetails)(productId, page);
      }
      /**
       * Retrieves a product image from the server as an ArrayBuffer.
       * @param {string} imageId The image id to retrieve.
       * @param {ImageSize} size The size of the image to return.
       */
      getImage(imageId, size) {
        const alternateRoute = this.http.url.split("/api/")[0];
        return this.http.sendRequest("GET", `${alternateRoute}/static/images/${imageId}/${size}.png`, null, false, true);
      }
      /**
       * Retrieves a product image from the server as a Data URI.
       * @param {string} imageId The image id to retrieve.
       * @param {ImageSize} size The size of the image to return.
       */
      async getImageAsDataUri(imageId, size) {
        const arrayBuffer = await this.getImage(imageId, size);
        return "data:image/png;base64," + Buffer.from(arrayBuffer, "binary").toString("base64");
      }
    };
    exports.CatalogService = CatalogService;
  }
});

// node_modules/picnic-api/lib/domains/cart/helpers.js
var require_helpers2 = __commonJS({
  "node_modules/picnic-api/lib/domains/cart/helpers.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.extractDeliverySlots = extractDeliverySlots;
    var windowDuration = (slot2) => new Date(slot2.windowEnd).getTime() - new Date(slot2.windowStart).getTime();
    function toSlotSummary(slot2) {
      return {
        slotId: slot2.slot_id,
        windowStart: slot2.window_start,
        windowEnd: slot2.window_end,
        cutOffTime: slot2.cut_off_time,
        isAvailable: slot2.is_available,
        isSelected: slot2.selected,
        isGreenChoice: false,
        minimumOrderValue: slot2.minimum_order_value ?? null
      };
    }
    function findGreenChoiceSlotIds(slots2) {
      const byWindowStart = /* @__PURE__ */ new Map();
      for (const slot2 of slots2) {
        byWindowStart.set(slot2.windowStart, [...byWindowStart.get(slot2.windowStart) ?? [], slot2]);
      }
      const greenSlotIds = /* @__PURE__ */ new Set();
      for (const group of byWindowStart.values()) {
        if (group.length !== 2)
          continue;
        const [a, b] = group;
        if (windowDuration(a) > windowDuration(b))
          greenSlotIds.add(a.slotId);
        else if (windowDuration(b) > windowDuration(a))
          greenSlotIds.add(b.slotId);
      }
      return greenSlotIds;
    }
    function toSelectedSlotSummary(selected, slots2) {
      if (!selected)
        return null;
      const slot2 = slots2.find((s) => s.slotId === selected.slot_id);
      return {
        slotId: selected.slot_id,
        state: selected.state,
        windowStart: slot2?.windowStart ?? null,
        windowEnd: slot2?.windowEnd ?? null,
        isExplicitSelection: selected.state !== "IMPLICIT"
      };
    }
    function extractDeliverySlots(result) {
      const slots2 = result.delivery_slots.map(toSlotSummary);
      const greenSlotIds = findGreenChoiceSlotIds(slots2);
      for (const slot2 of slots2)
        slot2.isGreenChoice = greenSlotIds.has(slot2.slotId);
      return { slots: slots2, selectedSlot: toSelectedSlotSummary(result.selected_slot, slots2) };
    }
  }
});

// node_modules/picnic-api/lib/domains/cart/footer-helpers.js
var require_footer_helpers = __commonJS({
  "node_modules/picnic-api/lib/domains/cart/footer-helpers.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.extractCartFooter = extractCartFooter;
    var LOYALTY_ID = "loyalty-point-nudge-content";
    var RECOMMENDATIONS_HEADER_ID = "horizontal-selling-unit-tiles-sub-header";
    var RECOMMENDATIONS_TILES_ID = "horizontal-selling-unit-tiles";
    var TILE_ID_PREFIX = "item-";
    var RECOMMENDATIONS_PAGE_ID = "basket-recommendations-root";
    function extractCartFooter(rawPage) {
      return {
        loyaltyPoints: extractLoyaltyPoints(rawPage),
        recommendations: extractRecommendations(rawPage)
      };
    }
    function extractLoyaltyPoints(rawPage) {
      const [label, value] = collectTexts(findNodeById2(rawPage, LOYALTY_ID));
      return label && value ? { label, value } : null;
    }
    function extractRecommendations(rawPage) {
      const header = findNodeById2(rawPage, RECOMMENDATIONS_HEADER_ID);
      const tilesNode = findNodeById2(rawPage, RECOMMENDATIONS_TILES_ID);
      if (!tilesNode)
        return null;
      const tiles = [];
      for (const child of asArray2(tilesNode.children)) {
        const tile = extractTile(child);
        if (tile)
          tiles.push(tile);
      }
      if (tiles.length === 0)
        return null;
      const title = collectTexts(header)[0]?.text ?? "";
      return { title, pageId: RECOMMENDATIONS_PAGE_ID, tiles };
    }
    function extractTile(node) {
      if (!isPmlNode(node) || typeof node.id !== "string" || !node.id.startsWith(TILE_ID_PREFIX)) {
        return null;
      }
      const image = findFirst(node, (candidate) => candidate.type === "IMAGE");
      const imageId = isPmlNode(image?.source) ? image.source.id : void 0;
      if (typeof imageId !== "string" || imageId === "")
        return null;
      const container = findFirst(node, (candidate) => typeof candidate.backgroundColor === "string");
      const backgroundColor = container?.backgroundColor;
      return {
        productId: node.id.slice(TILE_ID_PREFIX.length),
        imageId,
        backgroundColor: typeof backgroundColor === "string" ? backgroundColor : null,
        hasPromo: findFirst(node, (candidate) => candidate.type === "ICON" && candidate.iconKey === "percentage") !== null
      };
    }
    function findNodeById2(node, id) {
      if (Array.isArray(node)) {
        for (const item of node) {
          const found = findNodeById2(item, id);
          if (found)
            return found;
        }
        return null;
      }
      if (!isPmlNode(node))
        return null;
      if (node.id === id)
        return node;
      for (const value of Object.values(node)) {
        const found = findNodeById2(value, id);
        if (found)
          return found;
      }
      return null;
    }
    function findFirst(node, predicate) {
      if (Array.isArray(node)) {
        for (const item of node) {
          const found = findFirst(item, predicate);
          if (found)
            return found;
        }
        return null;
      }
      if (!isPmlNode(node))
        return null;
      if (predicate(node))
        return node;
      for (const value of Object.values(node)) {
        const found = findFirst(value, predicate);
        if (found)
          return found;
      }
      return null;
    }
    function collectTexts(node, out = []) {
      if (Array.isArray(node)) {
        for (const item of node)
          collectTexts(item, out);
        return out;
      }
      if (!isPmlNode(node))
        return out;
      if (node.type === "RICH_TEXT" && typeof node.markdown === "string") {
        const text3 = cleanMarkdown2(node.markdown);
        const color = isPmlNode(node.textAttributes) ? node.textAttributes.color : void 0;
        if (text3)
          out.push({ text: text3, color: typeof color === "string" ? color : null });
        return out;
      }
      for (const value of Object.values(node))
        collectTexts(value, out);
      return out;
    }
    function cleanMarkdown2(markdown) {
      return markdown.replace(/#\([^)]+\)/g, "").trim().replace(/\*\*/g, "").replace(/__/g, "").trim();
    }
    function isPmlNode(value) {
      return typeof value === "object" && value !== null && !Array.isArray(value);
    }
    function asArray2(value) {
      return Array.isArray(value) ? value : [];
    }
  }
});

// node_modules/picnic-api/lib/domains/cart/service.js
var require_service5 = __commonJS({
  "node_modules/picnic-api/lib/domains/cart/service.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.CartService = void 0;
    var helpers_1 = require_helpers2();
    var footer_helpers_1 = require_footer_helpers();
    var page_format_error_1 = require_page_format_error();
    var BASKET_FOOTER_PAGE_ID = "basket-footer-section-root";
    var CartService = class {
      constructor(http) {
        this.http = http;
      }
      /**
       * Returns the basket footer: the loyalty points line and the "Niets vergeten?" recommendation tiles.
       * The rest of the basket comes from {@link getCart}.
       * Throws {@link UnexpectedPageFormatError} when Picnic serves the page as an RSC payload.
       */
      async getBasketFooter() {
        const page = await this.http.sendRequest("GET", `/pages/${BASKET_FOOTER_PAGE_ID}`, null, true);
        if (typeof page === "string")
          throw new page_format_error_1.UnexpectedPageFormatError(BASKET_FOOTER_PAGE_ID, "rsc");
        return (0, footer_helpers_1.extractCartFooter)(page);
      }
      /**
       * Returns the cart of the current user.
       */
      getCart() {
        return this.http.sendRequest("GET", `/cart`, null, true);
      }
      /**
       * Adds a product to the shopping cart.
       * @param {string} productId The id of the product to add.
       * @param {number} [count=1] The amount of this product to add.
       * @param {SellingUnitContext[]} [sellingUnitContexts] Optional contexts to track the origin of the mutation (e.g. recipe, meal plan).
       */
      addProductToCart(productId, count = 1, sellingUnitContexts) {
        return this.http.sendRequest("POST", `/cart/add_product`, {
          product_id: productId,
          count,
          ...sellingUnitContexts && { selling_unit_contexts: sellingUnitContexts }
        }, true);
      }
      /**
       * Adds multiple products to the shopping cart in a single request.
       * @param {AddProductsItem[]} products An array of products with their ids and quantities.
       */
      addProductsToCart(products) {
        const body = {};
        for (const { productId, quantity } of products) {
          body[productId] = quantity;
        }
        return this.http.sendRequest("POST", `/cart/products/add`, body, true);
      }
      /**
       * Removes a product from the shopping cart.
       * @param {string} productId The id of the product to remove.
       * @param {number} [count=1] The amount of this product to remove.
       * @param {SellingUnitContext[]} [sellingUnitContexts] Optional contexts to track the origin of the mutation (e.g. recipe, meal plan).
       */
      removeProductFromCart(productId, count = 1, sellingUnitContexts) {
        return this.http.sendRequest("POST", `/cart/remove_product`, {
          product_id: productId,
          count,
          ...sellingUnitContexts && { selling_unit_contexts: sellingUnitContexts }
        }, true);
      }
      /**
       * Clears all items from the shopping cart.
       */
      clearCart() {
        return this.http.sendRequest("POST", `/cart/clear`, null, true);
      }
      /**
       * Returns all available delivery slots.
       */
      getDeliverySlots() {
        return this.http.sendRequest("GET", `/cart/delivery_slots`);
      }
      /**
       * Returns all delivery slots with camelCase fields and a green-choice flag, and the selected slot with its window.
       * This is a convenience wrapper around {@link getDeliverySlots}.
       */
      async getDeliverySlotOverview() {
        return (0, helpers_1.extractDeliverySlots)(await this.getDeliverySlots());
      }
      /**
       * Selects a delivery slot.
       * @param {string} slotId The id of the delivery slot to select.
       */
      setDeliverySlot(slotId) {
        return this.http.sendRequest("POST", `/cart/set_delivery_slot`, { slot_id: slotId }, true);
      }
      /**
       * Returns the status of an order (not delivery) by its id.
       * @param {string} orderId
       */
      getOrderStatus(orderId) {
        return this.http.sendRequest("GET", `/cart/checkout/order/${orderId}/status`);
      }
      /**
       * Removes an entire group of products from the cart at once.
       * @param {string} groupId The id of the group to remove.
       */
      removeGroupFromCart(groupId) {
        return this.http.sendRequest("POST", `/cart/remove_group`, { group_id: groupId }, true);
      }
      /**
       * Returns the minimum order value for the currently selected delivery slot.
       * Requires a delivery slot to be selected; otherwise the API returns a 500 error.
       */
      getMinimumOrderValue() {
        return this.http.sendRequest("GET", `/user-slot-minimum-order-value/minimum`, null, true);
      }
      /**
       * Confirms and places an order identified by its order id.
       * @param {string} orderId The id of the order to confirm.
       */
      confirmOrder(orderId) {
        return this.http.sendRequest("POST", `/cart/checkout/order/${orderId}/confirm`);
      }
      /**
       * Starts the checkout flow for the current cart.
       * Requires cart.mts to match the current cart modification timestamp.
       * May throw CheckoutIssueError when the cart has blocking issues (e.g. alcohol age check).
       */
      startCheckout(input) {
        return this.http.sendRequest("POST", `/cart/checkout/start`, {
          mts: input.mts,
          oos_article_ids: input.oos_article_ids ?? null,
          ...input.resolve_key ? { resolve_key: input.resolve_key } : {}
        }, true);
      }
      /**
       * Initiates payment for a checkout order and returns a bank redirect URL.
       */
      initiatePayment(orderId, appReturnUrl) {
        const body = {
          order_id: orderId,
          app_return_url: appReturnUrl
        };
        return this.http.sendRequest("POST", `/cart/checkout/initiate_payment`, body, true);
      }
      /**
       * Polls checkout payment status while a transaction is in progress.
       */
      getCheckoutStatus(transactionId) {
        return this.http.sendRequest("GET", `/cart/checkout/${transactionId}/status`);
      }
      /**
       * Cancels an in-progress checkout transaction.
       */
      cancelCheckout(transactionId) {
        const body = { transaction_id: transactionId };
        return this.http.sendRequest("POST", `/cart/checkout/cancel`, body, true);
      }
    };
    exports.CartService = CartService;
  }
});

// node_modules/picnic-api/lib/domains/delivery/helpers.js
var require_helpers3 = __commonJS({
  "node_modules/picnic-api/lib/domains/delivery/helpers.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.extractDeliverySummaries = extractDeliverySummaries;
    var isRawObject = (val) => typeof val === "object" && val !== null && !Array.isArray(val);
    var asText = (val) => typeof val === "string" ? val : "";
    var asAmount = (val) => typeof val === "number" && Number.isFinite(val) ? val : 0;
    var asObject = (val) => isRawObject(val) ? val : null;
    function extractDeliveryWindow(raw) {
      const slot2 = asObject(raw["slot"]);
      const deliveryTime = asObject(raw["delivery_time"]);
      const eta2 = asObject(raw["eta2"]);
      const windowStart = asText(slot2?.["window_start"]) || asText(deliveryTime?.["start"]) || asText(eta2?.["start"]) || null;
      const windowEnd = asText(slot2?.["window_end"]) || asText(deliveryTime?.["end"]) || asText(eta2?.["end"]) || null;
      return { windowStart, windowEnd };
    }
    function extractDeliverySummary(raw) {
      if (!isRawObject(raw))
        return null;
      const id = asText(raw["delivery_id"]) || asText(raw["id"]);
      if (!id)
        return null;
      const { windowStart, windowEnd } = extractDeliveryWindow(raw);
      const orders = (Array.isArray(raw["orders"]) ? raw["orders"] : []).filter(isRawObject);
      let totalPrice = 0;
      let itemCount = asAmount(raw["total_count"]) || asAmount(raw["sellable_item_count"]);
      for (const order of orders) {
        totalPrice += asAmount(order["total_price"]) || asAmount(order["checkout_total_price"]);
        itemCount += asAmount(order["total_count"]) || asAmount(order["sellable_item_count"]);
      }
      return {
        id,
        status: asText(raw["status"]) || "COMPLETED",
        creationTime: asText(raw["creation_time"]),
        windowStart,
        windowEnd,
        orderCount: orders.length,
        totalPrice,
        itemCount
      };
    }
    function extractDeliverySummaries(raw) {
      const summaries = (Array.isArray(raw) ? raw : []).map(extractDeliverySummary).filter((summary) => summary !== null);
      const sortKey = (summary) => summary.windowStart ?? summary.creationTime;
      return summaries.sort((a, b) => sortKey(b).localeCompare(sortKey(a)));
    }
  }
});

// node_modules/picnic-api/lib/domains/delivery/service.js
var require_service6 = __commonJS({
  "node_modules/picnic-api/lib/domains/delivery/service.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.DeliveryService = void 0;
    var helpers_1 = require_helpers3();
    var DeliveryService = class {
      constructor(http) {
        this.http = http;
      }
      /**
       * Returns all past and current deliveries, as returned by the API.
       * @deprecated use getDeliverySummaries, which returns typed, summed entries.
       * @param {DeliveryStatus[]} [filter=[]] An array of delivery statuses to filter on.
       */
      getDeliveries(filter = []) {
        return this.http.sendRequest("POST", `/deliveries/summary`, filter);
      }
      /**
       * Returns all past and current deliveries as summaries, newest first.
       * Totals are summed over each delivery's orders.
       * @param {DeliveryStatus[]} [filter=[]] An array of delivery statuses to filter on.
       */
      async getDeliverySummaries(filter = []) {
        const raw = await this.http.sendRequest("POST", `/deliveries/summary`, filter);
        return (0, helpers_1.extractDeliverySummaries)(raw);
      }
      /**
       * Returns the details of a specific delivery.
       * @param {string} deliveryId The id of the delivery to look up.
       */
      getDelivery(deliveryId) {
        return this.http.sendRequest("GET", `/deliveries/${deliveryId}`);
      }
      /**
       * Returns the position data of a specific delivery.
       * @param {string} deliveryId The id of the delivery to look up.
       */
      getDeliveryPosition(deliveryId) {
        return this.http.sendRequest("GET", `/deliveries/${deliveryId}/position`, null, true);
      }
      /**
       * Returns the driver and route information of a delivery.
       * @param {string} deliveryId The id of the delivery to look up.
       */
      getDeliveryScenario(deliveryId) {
        return this.http.sendRequest("GET", `/deliveries/${deliveryId}/scenario`, null, true);
      }
      /**
       * Cancels an order by delivery id.
       * @param {string} deliveryId
       */
      cancelDelivery(deliveryId) {
        return this.http.sendRequest("POST", `/order/delivery/${deliveryId}/cancel`);
      }
      /**
       * Sets a rating for a delivery from 0 to 10. Returns 400 if the delivery already has a rating.
       * @param {string} deliveryId
       * @param {number} rating
       */
      setDeliveryRating(deliveryId, rating) {
        return this.http.sendRequest("POST", `/deliveries/${deliveryId}/rating`, { rating });
      }
      /**
       * (Re)sends the invoice email for a delivery.
       * @param {string} deliveryId
       */
      sendDeliveryInvoiceEmail(deliveryId) {
        return this.http.sendRequest("POST", `/deliveries/${deliveryId}/resend_invoice_email`);
      }
    };
    exports.DeliveryService = DeliveryService;
  }
});

// node_modules/picnic-api/lib/domains/payment/service.js
var require_service7 = __commonJS({
  "node_modules/picnic-api/lib/domains/payment/service.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.PaymentService = void 0;
    var PaymentService = class {
      constructor(http) {
        this.http = http;
      }
      /**
       * Returns payment profile information.
       */
      getPaymentProfile() {
        return this.http.sendRequest("GET", `/payment-profile`, null, true);
      }
      /**
       * Returns a page of wallet transactions.
       * @param {number} pageNumber The page number to retrieve (1-based; minimum 1).
       */
      getWalletTransactions(pageNumber) {
        return this.http.sendRequest("POST", `/wallet/transactions`, { page_number: pageNumber });
      }
      /**
       * Returns the details of a specific wallet transaction.
       * @param {string} walletTransactionId The id of the transaction.
       */
      getWalletTransactionDetails(walletTransactionId) {
        return this.http.sendRequest("GET", `/wallet/transactions/${walletTransactionId}`);
      }
    };
    exports.PaymentService = PaymentService;
  }
});

// node_modules/picnic-api/lib/domains/consent/service.js
var require_service8 = __commonJS({
  "node_modules/picnic-api/lib/domains/consent/service.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.ConsentService = void 0;
    var ConsentService = class {
      constructor(http) {
        this.http = http;
      }
      /**
       * Returns the list of consent settings.
       * @param {boolean} [general=false] If true, returns only the 'general' consent settings.
       */
      getConsentSettings(general = false) {
        return this.http.sendRequest("GET", `/consents${general ? "/general" : ""}/settings-page`);
      }
      /**
       * Sets one or multiple consent options.
       * @param {SetConsentSettingsInput} consentSettingsInput An object containing consent declarations.
       */
      setConsentSettings(consentSettingsInput) {
        return this.http.sendRequest("PUT", `/consents`, consentSettingsInput);
      }
      /**
       * Returns the list of consent requests, filtered by topic keys and strategy.
       * @param {ConsentTopic[]} consentTopics List of consent topic keys to filter by.
       * @param {ConsentTopicsStrategy} strategy Strategy to apply when fetching consents ("WIDE" or "NARROW").
       */
      getConsents(consentTopics, strategy) {
        const params = new URLSearchParams();
        consentTopics.forEach((t) => params.append("consent_topics", t));
        params.set("strategy", strategy);
        return this.http.sendRequest("GET", `/consents?${params.toString()}`);
      }
      /**
       * Returns the general consent request.
       */
      getGeneralConsents() {
        return this.http.sendRequest("GET", `/consents/general`);
      }
      /**
       * Updates the general consent declarations.
       * @param {SetGeneralConsentsInput} declarations The consent declarations to apply.
       */
      setGeneralConsents(declarations) {
        return this.http.sendRequest("PUT", `/consents/general`, declarations);
      }
    };
    exports.ConsentService = ConsentService;
  }
});

// node_modules/picnic-api/lib/domains/customer-service/service.js
var require_service9 = __commonJS({
  "node_modules/picnic-api/lib/domains/customer-service/service.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.CustomerServiceService = void 0;
    var CustomerServiceService = class {
      constructor(http) {
        this.http = http;
      }
      /**
       * Returns customer service contact details and opening times.
       */
      getContactInfo() {
        return this.http.sendRequest("GET", `/cs-contact-info`, null, true);
      }
      /**
       * Returns popup messages in the app (e.g. post-delivery satisfaction prompts,
       * message bar notifications, order-confirmation cards).
       * @param {MessageDisplayPosition[]} [displayPositions] Optional filter by display position(s).
       */
      getMessages(displayPositions) {
        const query = displayPositions?.length ? `?${displayPositions.map((p) => `display_position=${encodeURIComponent(p)}`).join("&")}` : "";
        return this.http.sendRequest("GET", `/messages${query}`, null, true);
      }
      /**
       * Returns the user's configured delivery reminders.
       * Note: Reminders don't seem to be working yet.
       */
      getReminders() {
        return this.http.sendRequest("GET", `/reminders`, null, true);
      }
      /**
       * Sets (replaces) the user's delivery reminders.
       * Note: Reminders don't seem to be working yet.
       * @param {Reminder[]} reminders The new list of reminders to save.
       */
      setReminders(reminders) {
        return this.http.sendRequest("PUT", `/reminders`, reminders, true);
      }
      /**
       * Returns parcels (externally shipped packages tracked via a carrier).
       */
      getParcels() {
        return this.http.sendRequest("GET", `/parcels`, null, true);
      }
      /**
       * Returns CS contact info without requiring authentication.
       * Uses the public API endpoint (/public-api/...) with a picnic-country header.
       * @param {string} countryCode The country code to pass as the picnic-country header (e.g. 'NL').
       */
      async getUnauthenticatedContactInfo(countryCode) {
        const publicUrl = this.http.url.replace("/api/", "/public-api/");
        const response = await fetch(`${publicUrl}/cs-contact-info`, {
          headers: { "picnic-country": countryCode }
        });
        return response.json();
      }
    };
    exports.CustomerServiceService = CustomerServiceService;
  }
});

// node_modules/picnic-api/lib/domains/content/service.js
var require_service10 = __commonJS({
  "node_modules/picnic-api/lib/domains/content/service.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.ContentService = void 0;
    var ContentService = class {
      constructor(http) {
        this.http = http;
      }
      /**
       * Returns the FAQ content page in PML (Picnic Markup Language) format.
       * Used to populate the in-app FAQ / help section.
       */
      getFaqContent() {
        return this.http.sendRequest("GET", `/content/faq`, null, true);
      }
      /**
       * Returns the content shown on the search empty-state screen (no results).
       * Returned in PML (Picnic Markup Language) format.
       */
      getSearchEmptyState() {
        return this.http.sendRequest("GET", `/content/search_empty_state`, null, true);
      }
    };
    exports.ContentService = ContentService;
  }
});

// node_modules/picnic-api/lib/domains/user-onboarding/service.js
var require_service11 = __commonJS({
  "node_modules/picnic-api/lib/domains/user-onboarding/service.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.UserOnboardingService = void 0;
    var UserOnboardingService = class {
      constructor(http) {
        this.http = http;
      }
      // TODO: Test route and add types
      /**
       * Submits household details during user onboarding.
       * Used to personalize the shopping experience based on household composition.
       * @param {Record<string, any>} details Household details object (exact shape unknown).
       */
      setHouseholdDetails(details) {
        return this.http.sendRequest("POST", `/user-onboarding/household-details`, details);
      }
      // TODO: Test route and add types
      /**
       * Submits business details during user onboarding (for business accounts).
       * @param {Record<string, any>} details Business details object (exact shape unknown).
       */
      setBusinessDetails(details) {
        return this.http.sendRequest("POST", `/user-onboarding/business-details`, details);
      }
      // TODO: Test route and add types
      /**
       * Subscribes the user to push notifications during the onboarding flow.
       * @param {string[]} topics The list of push notification topics to subscribe to.
       */
      subscribePush(topics) {
        return this.http.sendRequest("POST", `/user-onboarding/subscribe-push`, { topics });
      }
    };
    exports.UserOnboardingService = UserOnboardingService;
  }
});

// node_modules/picnic-api/lib/domains/recipe/helpers.js
var require_helpers4 = __commonJS({
  "node_modules/picnic-api/lib/domains/recipe/helpers.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.extractUserDefinedRecipeDetails = void 0;
    exports.extractRecipes = extractRecipes;
    exports.extractUserDefinedRecipes = extractUserDefinedRecipes;
    exports.extractIngredientProductName = extractIngredientProductName;
    exports.extractRecipeDetails = extractRecipeDetails;
    exports.extractIngredientQuantities = extractIngredientQuantities;
    exports.extractSuggestedImages = extractSuggestedImages;
    var RECIPE_SCHEMA = "iglu:tech.picnic.snowplow.analytics/recipe/jsonschema/";
    var SEGMENT_SCHEMA = "iglu:tech.picnic.snowplow.analytics/segment/jsonschema/";
    var walkObjects = (node, visit) => {
      if (Array.isArray(node)) {
        node.forEach((child) => walkObjects(child, visit));
      } else if (node && typeof node === "object") {
        visit(node);
        Object.values(node).forEach((child) => walkObjects(child, visit));
      }
    };
    var plainText = (markdown) => markdown.replace(/#\([^)]*\)/g, "").replace(/\*\*/g, "").replace(/\u00a0/g, " ").trim();
    var textByType = (node, textType) => {
      let result = null;
      walkObjects(node, (obj) => {
        if (!result && obj.type === "RICH_TEXT" && obj.textType === textType && typeof obj.markdown === "string") {
          result = plainText(obj.markdown) || null;
        }
      });
      return result;
    };
    function extractRecipes(page, segmentType) {
      const byId = /* @__PURE__ */ new Map();
      walkObjects(page, (obj) => {
        const contexts = obj.analytics?.contexts ?? obj.contexts;
        if (!Array.isArray(contexts))
          return;
        const segment = contexts.find((c) => c.schema?.startsWith(SEGMENT_SCHEMA));
        if (segment?.data?.segment_type !== segmentType)
          return;
        const recipe = contexts.find((c) => c.schema?.startsWith(RECIPE_SCHEMA))?.data;
        if (typeof recipe?.recipe_id !== "string")
          return;
        const previous = byId.get(recipe.recipe_id);
        byId.set(recipe.recipe_id, {
          id: recipe.recipe_id,
          name: previous?.name || recipe.recipe_name || textByType(obj.pml, "SUBTITLE1") || "",
          imageType: previous?.imageType ?? recipe.recipe_image_type ?? recipe.image_type ?? null
        });
      });
      return [...byId.values()];
    }
    function extractUserDefinedRecipes(page) {
      return extractRecipes(page, "USER_DEFINED_RECIPES");
    }
    function extractIngredientNames(page) {
      const names = /* @__PURE__ */ new Map();
      walkObjects(page, (obj) => {
        if (obj.type !== "PML" || typeof obj.id !== "string" || !obj.id.includes("selling-unit-tile"))
          return;
        const contexts = obj.analytics?.contexts ?? [];
        const recipe = contexts.find((c) => c.schema?.startsWith(RECIPE_SCHEMA))?.data;
        const units = recipe?.selling_units;
        const ingredientId = Array.isArray(units) && units.length === 1 ? units[0].ingredient_id : JSON.stringify(obj.pml ?? {}).match(/ingredient_id=([a-f0-9-]+)&/)?.[1];
        const name = textByType(obj.pml, "SUBTITLE1");
        if (typeof ingredientId === "string" && name)
          names.set(ingredientId, name);
      });
      return names;
    }
    function extractIngredientProductName(page) {
      return textByType(page, "HEADER1");
    }
    function extractRecipeDetails(recipeId, page) {
      let recipeContext;
      let header;
      let owner;
      let note = null;
      let imageId = null;
      walkObjects(page, (obj) => {
        if (obj.id === "selling-group-details-image") {
          walkObjects(obj, (image) => {
            if (!imageId && image.type === "IMAGE" && typeof image.source?.id === "string")
              imageId = image.source.id;
          });
        }
        if (!recipeContext && obj.recipe_id === recipeId && Array.isArray(obj.selling_units) && typeof obj.recipe_name === "string") {
          recipeContext = obj;
        }
        if (!header && typeof obj.creator_type === "string" && typeof obj.sellable_name === "string") {
          header = obj;
        }
        if (!owner && typeof obj.is_recipe_owner === "boolean" && typeof obj.name === "string") {
          owner = obj;
        }
        if (note === null && obj.type === "TEXT_EDITOR" && typeof obj.initialContent === "string") {
          note = obj.initialContent;
        }
      });
      if (!recipeContext)
        throw new Error(`Could not extract recipe ${recipeId}: recipe context missing from details page`);
      const names = extractIngredientNames(page);
      const ingredients = recipeContext.selling_units.map((unit) => ({
        ingredientId: unit.ingredient_id,
        name: names.get(unit.ingredient_id) ?? null,
        sellingUnitId: unit.selling_unit_id ?? "",
        quantity: unit.quantity ?? 1,
        status: unit.status ?? "ACTIVE",
        swapType: unit.swap_type ?? null,
        checked: unit.checked ?? true
      }));
      return {
        id: recipeId,
        name: recipeContext?.recipe_name ?? header?.sellable_name ?? owner?.name ?? "",
        portions: recipeContext.portions ?? header?.default_portions ?? 0,
        defaultPortions: header?.default_portions ?? recipeContext.portions ?? 0,
        displayedPortions: recipeContext?.portions ?? header?.default_portions ?? 0,
        creatorType: header?.creator_type ?? "UNKNOWN",
        isRecipeOwner: owner?.is_recipe_owner ?? false,
        isSaved: header?.is_saved ?? false,
        imageType: recipeContext?.image_type ?? null,
        imageId,
        ingredients,
        note
      };
    }
    exports.extractUserDefinedRecipeDetails = extractRecipeDetails;
    function extractIngredientQuantities(page) {
      const result = {};
      walkObjects(page, (obj) => {
        if (obj.type !== "STATE_BOUNDARY" || obj.id !== "sellableContentState")
          return;
        for (const ingredient of obj.state?.ingredientsState ?? []) {
          if (!ingredient?.ingredientId || !ingredient.sellingUnits)
            continue;
          result[ingredient.ingredientId] = Object.fromEntries(Object.values(ingredient.sellingUnits).map((unit) => [unit.sellingUnitId, unit.requiredAmount ?? 0]));
        }
      });
      return result;
    }
    function extractSuggestedImages(page) {
      const images = [];
      walkObjects(page, (obj) => {
        if (obj.type !== "STATE_BOUNDARY" || obj.id !== "ImageSelectionState")
          return;
        for (const reference of Object.values(obj.state?.referenceImagesById ?? {})) {
          if (reference?.id)
            images.push({ id: reference.id, referenceImage: reference });
        }
      });
      return images;
    }
  }
});

// node_modules/picnic-api/lib/domains/recipe/service.js
var require_service12 = __commonJS({
  "node_modules/picnic-api/lib/domains/recipe/service.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.RecipeService = void 0;
    var service_1 = require_service4();
    var helpers_1 = require_helpers4();
    var RecipeService = class {
      constructor(http) {
        this.http = http;
      }
      /**
       * Returns the meals / meal-planner overview page.
       * This Fusion page is the meal planner root; its recipe content is loaded
       * lazily via SUSPENSE boundaries. To list the user's recipes, use
       * {@link getCookbookPage}.
       */
      getRecipesPage() {
        return this.http.sendRequest("GET", `/pages/meals-page-root`, null, true);
      }
      /**
       * Returns the cookbook page, listing the user's recipes grouped by segment.
       * Each recipe tile carries a `segment_type` analytics context, e.g.
       * `SAVED_RECIPES` (saved/favourites), `USER_DEFINED_RECIPES` (the user's own
       * recipes), `NEW_RECIPES`, `THIS_WEEK_RECIPES`, …
       */
      getCookbookPage() {
        return this.http.sendRequest("GET", `/pages/cookbook-page-content`, null, true);
      }
      /**
       * Returns the detail page for a single recipe.
       *
       * Recipes are modelled as "selling groups", so a recipe id is a
       * `selling_group_id` and the detail page is served from
       * `selling-group-details-page`. The previous `recipe-details-page-root`
       * route is no longer served and responds with HTTP 404
       * (`page-template with id 'recipe-details-page-root' was not found`).
       *
       * Contains ingredients, cooking steps, servings, cooking time, and pricing.
       * @param {string} recipeId The id of the recipe (a `selling_group_id`; 24 hex
       *   chars for catalog recipes, 32 for the user's own recipes).
       * @param {number} [portions] Render this many portions; omit to use the app's selection.
       */
      getRecipeDetailsPage(recipeId, portions) {
        if (portions !== void 0 && (!Number.isSafeInteger(portions) || portions <= 0)) {
          throw new RangeError("Recipe portions must be a positive integer");
        }
        const query = portions === void 0 ? "" : `&portions=${portions}`;
        return this.http.sendRequest("GET", `/pages/selling-group-details-page?selling_group_id=${encodeURIComponent(recipeId)}${query}`, null, true);
      }
      /**
       * Lists saved recipes from the cookbook's SAVED_RECIPES segment.
       * Returns the same summary shape as {@link getUserDefinedRecipes}; use
       * {@link getRecipe} for structured ingredients and other details.
       * Parses dynamic Fusion/PML tiles and may need updates if Picnic changes them.
       */
      async getSavedRecipes() {
        return (0, helpers_1.extractRecipes)(await this.getCookbookPage(), "SAVED_RECIPES");
      }
      /**
       * Returns structured catalog or user-defined recipe details at the requested
       * portions, or the stored default when omitted. If the app initially renders a
       * different count, refetches the full page so names, product ids and quantities
       * come from the same response. Products may change with the portion count.
       * `defaultPortions` retains the stored default; `portions` describes the result.
       *
       * Ingredient names come from recipe tiles. Set `resolveIngredientNames` to true
       * to fetch missing names from product pages concurrently; otherwise they remain
       * null. These extra requests can fail the call. Quantities are selling-unit
       * counts, not weights or volumes. The image id includes its namespace.
       *
       * Parses dynamic Fusion/PML and may need updates when Picnic changes its pages.
       * Use {@link getRecipeDetailsPage} for raw cooking steps, time and pricing.
       * The backend can briefly fail after mutations; deleted recipes fail persistently.
       * Some recipes reject particular portion counts with a page-rendering error.
       * @param {string} recipeId The selling group id of either kind of recipe.
       * @param {number} [portions] Positive integer portion count; defaults to the stored count.
       * @param {RecipeDetailsOptions} [options] Optional product-name lookup requests.
       */
      async getRecipe(recipeId, portions, options = {}) {
        let details = (0, helpers_1.extractRecipeDetails)(recipeId, await this.getRecipeDetailsPage(recipeId, portions));
        const requestedPortions = portions ?? details.defaultPortions;
        if (details.portions !== requestedPortions) {
          details = (0, helpers_1.extractRecipeDetails)(recipeId, await this.getRecipeDetailsPage(recipeId, requestedPortions));
        }
        if (details.portions !== requestedPortions) {
          throw new Error(`Recipe ${recipeId} rendered ${details.portions} portions instead of ${requestedPortions}`);
        }
        if (options.resolveIngredientNames) {
          const catalog = new service_1.CatalogService(this.http);
          const names = /* @__PURE__ */ new Map();
          await Promise.all(details.ingredients.map(async (ingredient) => {
            if (ingredient.name !== null || !ingredient.sellingUnitId)
              return;
            let name = names.get(ingredient.sellingUnitId);
            if (!name) {
              name = catalog.getProductDetailsPage(ingredient.sellingUnitId).then(helpers_1.extractIngredientProductName);
              names.set(ingredient.sellingUnitId, name);
            }
            ingredient.name = await name;
          }));
        }
        return details;
      }
      /**
       * Saves a recipe to the user's saved recipes list.
       * Sends the current timestamp as `saved_at` to mark the recipe as saved.
       * @param {string} recipeId The id of the recipe to save.
       */
      saveRecipe(recipeId) {
        return this.http.sendRequest("POST", `/pages/task/recipe-saving`, {
          payload: {
            recipe_id: recipeId,
            saved_at: (/* @__PURE__ */ new Date()).toISOString()
          }
        }, true);
      }
      /**
       * Removes a recipe from the user's saved recipes list.
       * Sends `null` as `saved_at` to mark the recipe as unsaved.
       * @param {string} recipeId The id of the recipe to unsave.
       */
      unsaveRecipe(recipeId) {
        return this.http.sendRequest("POST", `/pages/task/recipe-saving`, {
          payload: {
            recipe_id: recipeId,
            saved_at: null
          }
        }, true);
      }
      /**
       * Assigns a selling group (recipe bundle) to the basket in the meal planner.
       * @param {string} sellingGroupId The selling group / recipe id.
       * @param {number} [dayOffset] Which delivery day to plan for (relative to the selected slot).
       * @param {number} [portions] Number of servings.
       */
      assignSellingGroupToBasket(sellingGroupId, dayOffset, portions) {
        return this.http.sendRequest("POST", `/pages/task/assign-selling-group-to-basket`, {
          payload: {
            selling_group_id: sellingGroupId,
            ...dayOffset !== void 0 && { day_offset: dayOffset },
            ...portions !== void 0 && { portions }
          }
        }, true);
      }
      /**
       * Updates the number of portions for a selling group already in the basket.
       * @param {string} sellingGroupId The selling group / recipe id.
       * @param {number} dayOffset Which delivery day the recipe is planned for.
       * @param {number} portions The new number of servings.
       */
      updateSellingGroupPortions(sellingGroupId, dayOffset, portions) {
        return this.http.sendRequest("POST", `/pages/task/update-selling-group-number-of-portions-task`, {
          payload: {
            selling_group_id: sellingGroupId,
            day_offset: dayOffset,
            portions
          }
        }, true);
      }
      /**
       * Removes a selling group (recipe bundle) from the basket.
       * @param {string} sellingGroupId The selling group / recipe id to remove.
       */
      removeSellingGroupFromBasket(sellingGroupId) {
        return this.http.sendRequest("POST", `/pages/task/remove-selling-group-from-basket`, {
          payload: {
            selling_group_id: sellingGroupId
          }
        }, true);
      }
      // ─── User defined (custom) recipes ──────────────────────────────────────────
      //
      // The user's own recipes are "user defined recipes" (UDR): selling groups
      // with `creator_type: "USER"` and a 32-hex-character id. Their routes are not
      // declared in the app binary; they were extracted from the PML expressions of
      // the pages listed in `types.ts`. All mutations are `POST /pages/task/<id>`.
      /**
       * Lists the user's own (user defined) recipes.
       * Fetches the cookbook page and extracts the tiles of the `USER_DEFINED_RECIPES`
       * ("Eigen recepten") segment, with the same summary shape as {@link getSavedRecipes}.
       */
      async getUserDefinedRecipes() {
        return (0, helpers_1.extractRecipes)(await this.getCookbookPage(), "USER_DEFINED_RECIPES");
      }
      /**
       * Returns the same structured details as {@link getRecipe}, including ingredient
       * names and quantities for the requested or default portions. Extra product-name
       * requests are opt-in, as with getRecipe.
       * @param {string} recipeId The user-defined recipe's selling group id.
       * @param {number} [portions] Requested count; defaults to the stored count.
       * @param {RecipeDetailsOptions} [options] Optional product-name lookup requests.
       */
      getUserDefinedRecipe(recipeId, portions, options = {}) {
        return this.getRecipe(recipeId, portions, options);
      }
      /**
       * Returns the image selection page for a user defined recipe, listing the
       * suggested images the user can pick from with {@link selectUserDefinedRecipeImage}.
       * Unlike most pages this route returns the bare page layout without the `{ script, layout }` envelope.
       * @param {string} recipeId The recipe id.
       */
      getUserDefinedRecipeImageSelectionPage(recipeId) {
        return this.http.sendRequest("GET", `/pages/sellable-image-selection-page-root?origin=RECIPE_DETAILS&sellable_id=${encodeURIComponent(recipeId)}`, null, true);
      }
      /**
       * Returns the suggested images for a user defined recipe, extracted from
       * {@link getUserDefinedRecipeImageSelectionPage}. Pass an entry's `id` and
       * `referenceImage` to {@link selectUserDefinedRecipeImage}.
       * @param {string} recipeId The recipe id.
       */
      async getUserDefinedRecipeSuggestedImages(recipeId) {
        const page = await this.getUserDefinedRecipeImageSelectionPage(recipeId);
        return (0, helpers_1.extractSuggestedImages)(page);
      }
      /**
       * Creates a new user defined recipe.
       * Mirrors the "Lijstje opslaan" button of `user-defined-recipe-root`, which posts
       * to `create-user-defined-recipe` and receives the new `sellingGroupId`.
       * @param {string} name The recipe name (the app limits it to 43 characters).
       * @param {NewUserDefinedRecipeIngredient[]} ingredients The products to include.
       * @param {number} [portions=4] Default number of portions the quantities are based on.
       */
      createUserDefinedRecipe(name, ingredients, portions = 4) {
        const sellingUnits = ingredients.map((ingredient) => ingredient.sellingUnitId);
        const quantities = {};
        const sources = {};
        for (const ingredient of ingredients) {
          quantities[ingredient.sellingUnitId] = ingredient.quantity ?? 1;
          sources[ingredient.sellingUnitId] = ingredient.source ?? "search";
        }
        return this.http.sendRequest("POST", `/pages/task/create-user-defined-recipe`, {
          payload: {
            name,
            portions,
            selling_unit_quantities_by_id: quantities,
            selling_unit_sources: sources,
            selling_units: sellingUnits
          }
        }, true);
      }
      /**
       * Renames a user defined recipe.
       * @param {string} recipeId The recipe id.
       * @param {string} name The new name (the app limits it to 43 characters).
       */
      renameUserDefinedRecipe(recipeId, name) {
        return this.http.sendRequest("POST", `/pages/task/update-name-user-defined-recipe`, { payload: { name, selling_group_id: recipeId } }, true);
      }
      /**
       * Changes the default number of portions of a user defined recipe.
       * @param {string} recipeId The recipe id.
       * @param {number} portions The new default number of portions.
       */
      updateUserDefinedRecipePortions(recipeId, portions) {
        return this.http.sendRequest("POST", `/pages/task/update-portions-user-defined-recipe`, { payload: { portions, sellable_id: recipeId } }, true);
      }
      /**
       * Deletes a user defined recipe and all its ingredients.
       * The app follows this with `remove-sellable-context-from-basket` for the same
       * `sellable_id` when the recipe is in the basket; call
       * {@link removeSellingGroupFromBasket} first if you need that behaviour.
       * @param {string} recipeId The recipe id.
       */
      deleteUserDefinedRecipe(recipeId) {
        return this.http.sendRequest("POST", `/pages/task/delete-user-defined-sellable`, { payload: { sellable_id: recipeId } }, true);
      }
      /**
       * Adds a product as a new ingredient to a user defined recipe.
       * Mirrors the product tiles on the ingredient search page (`page_context=RECIPE_EDITING`).
       * @param {string} recipeId The recipe id.
       * @param {string} sellingUnitId The product (selling unit) id, e.g. `s1143210`.
       * @param {number} [quantity=1] Number of selling units for `portions` portions.
       * @param {number} [portions=4] The recipe's number of portions the quantity is based on.
       * @param {number} [order] Position in the ingredient list; the app sends the current ingredient count.
       */
      addUserDefinedRecipeIngredient(recipeId, sellingUnitId, quantity = 1, portions = 4, order = 0) {
        return this.http.sendRequest("POST", `/pages/task/add-ingredient-task`, {
          payload: {
            order: String(order),
            quantity,
            requested_portions: String(portions),
            selling_group_id: recipeId,
            selling_unit_id: sellingUnitId
          }
        }, true);
      }
      /**
       * Updates an ingredient of a user defined recipe: change its quantity, or swap
       * the product by passing a different selling unit id.
       * Mirrors the save button of `selling-group-component-edit-page?is_udr=true`. When
       * swapping an ingredient that has more than one selling unit, include each of its
       * current selling unit ids with quantity `0` next to the new selection.
       *
       * A response with `shouldUpdateCart: true` means the recipe is in the basket with a
       * selection that differs from this one; call {@link assignSellableComponentToDay}
       * with the same selection to update the basket.
       * @param {string} recipeId The recipe id.
       * @param {string} ingredientId The ingredient (selling group component) id.
       * @param {Record<string, number>} sellingUnitQuantities Selling unit id → quantity for this ingredient.
       * @param {number} [portions=4] The recipe's number of portions the quantities are based on.
       * @param {SellingGroupSwapType|null} [swapType] Swap type, when the product was swapped.
       */
      updateUserDefinedRecipeIngredient(recipeId, ingredientId, sellingUnitQuantities, portions = 4, swapType) {
        return this.http.sendRequest("POST", `/pages/task/save-selling-group-edit-task`, {
          payload: {
            requested_sellable_portions: String(portions),
            selling_group_component_id: ingredientId,
            selling_group_id: recipeId,
            selling_unit_quantity_by_id: sellingUnitQuantities,
            swapType: swapType ?? void 0
          }
        }, true);
      }
      /**
       * Pushes an updated ingredient selection of a recipe that is in the basket to the
       * basket. The app calls this after {@link updateUserDefinedRecipeIngredient}
       * returned `shouldUpdateCart: true`. The edit task itself removes the replaced
       * product from the basket; this call adds the new selection, so without it the
       * basket lacks that ingredient.
       * @param {string} recipeId The recipe id.
       * @param {string} ingredientId The ingredient (selling group component) id.
       * @param {Record<string, number>} sellingUnitQuantities The selected selling unit id → quantity (only the selected ones, no zeroes).
       * @param {number} portions The recipe's number of portions the quantities are based on.
       * @param {SellingGroupSwapType} swapType The swap type that was sent to the edit task.
       */
      assignSellableComponentToDay(recipeId, ingredientId, sellingUnitQuantities, portions, swapType) {
        return this.http.sendRequest("POST", `/pages/task/assign-sellable-component-to-day`, {
          payload: {
            component_swap_type: swapType,
            portions: String(portions),
            required_amount_by_selling_unit_id: sellingUnitQuantities,
            selected_component_id: ingredientId,
            selling_group_id: recipeId
          }
        }, true);
      }
      /**
       * Removes an ingredient from a user defined recipe.
       * @param {string} recipeId The recipe id.
       * @param {string} ingredientId The ingredient (selling group component) id.
       */
      removeUserDefinedRecipeIngredient(recipeId, ingredientId) {
        return this.http.sendRequest("POST", `/pages/task/delete-selling-group-component`, { payload: { selling_group_component_id: ingredientId, selling_group_id: recipeId } }, true);
      }
      /**
       * Sets (creates or replaces) the free-text note of a user defined recipe.
       * The note is HTML as produced by the app's editor, e.g. `<p>400g pasta</p><p>Kook de pasta.</p>`.
       * The app rejects notes whose text content exceeds 5000 characters.
       * @param {string} recipeId The recipe id.
       * @param {string} note The note as HTML.
       */
      setUserDefinedRecipeNote(recipeId, note) {
        return this.http.sendRequest("POST", `/pages/task/update-selling-group-note`, { payload: { note, selling_group_id: recipeId } }, true);
      }
      /**
       * Deletes the note of a user defined recipe.
       * @param {string} recipeId The recipe id.
       */
      deleteUserDefinedRecipeNote(recipeId) {
        return this.http.sendRequest("POST", `/pages/task/delete-selling-group-note-task`, { payload: { selling_group_id: recipeId } }, true);
      }
      /**
       * Uploads a custom photo for a user defined recipe.
       * The app sends the raw image bytes to `POST /user-defined-sellable/{sellableId}`
       * with the image MIME type as `Content-Type` (not multipart; the server answers
       * 415 to multipart bodies) and then selects the returned `image_id` with
       * {@link selectUserDefinedRecipeImage}.
       * @param {string} recipeId The recipe id.
       * @param {UserDefinedRecipeImageUpload} image The image to upload.
       */
      uploadUserDefinedRecipeImage(recipeId, image) {
        const type = (image.type ?? "image/jpeg").replace(/jpg/gi, "jpeg");
        const body = image.data instanceof Blob ? image.data : new Uint8Array(image.data);
        return this.http.sendRequest("POST", `/user-defined-sellable/${encodeURIComponent(recipeId)}`, body, true, false, type);
      }
      /**
       * Sets the image of a user defined recipe, either a suggested image from
       * {@link getUserDefinedRecipeImageSelectionPage} or a photo uploaded with
       * {@link uploadUserDefinedRecipeImage}.
       * @param {string} recipeId The recipe id.
       * @param {string} imageId The image id to select.
       * @param {UserDefinedRecipeReferenceImage} [referenceImage] Reference image metadata, for suggested images (see {@link getUserDefinedRecipeSuggestedImages}).
       */
      selectUserDefinedRecipeImage(recipeId, imageId, referenceImage) {
        return this.http.sendRequest("POST", `/pages/task/select-sellable-image`, {
          payload: {
            sellable_id: recipeId,
            selected_image_id: imageId,
            ...referenceImage !== void 0 && { reference_image: referenceImage }
          }
        }, true);
      }
    };
    exports.RecipeService = RecipeService;
  }
});

// node_modules/picnic-api/lib/index.js
var require_lib = __commonJS({
  "node_modules/picnic-api/lib/index.js"(exports, module) {
    "use strict";
    var __importDefault = exports && exports.__importDefault || function(mod) {
      return mod && mod.__esModule ? mod : { "default": mod };
    };
    var http_client_1 = __importDefault(require_http_client());
    var service_1 = require_service();
    var service_2 = require_service2();
    var service_3 = require_service3();
    var service_4 = require_service4();
    var service_5 = require_service5();
    var service_6 = require_service6();
    var service_7 = require_service7();
    var service_8 = require_service8();
    var service_9 = require_service9();
    var service_10 = require_service10();
    var service_11 = require_service11();
    var service_12 = require_service12();
    var checkout_error_1 = require_checkout_error();
    var page_format_error_1 = require_page_format_error();
    var PicnicClient2 = class extends http_client_1.default {
      /**
       * Creates a new Picnic API client.
       * @param {ApiConfig} [options] Configuration for the client.
       * @param {string} [options.countryCode="NL"] The country code for the API endpoint.
       * @param {string} [options.apiVersion="15"] The API version to use.
       * @param {string} [options.authKey] An existing auth key to skip the login step.
       * @param {string} [options.url] A custom API endpoint URL.
       */
      constructor(options) {
        super(options);
        this.app = new service_1.AppService(this);
        this.auth = new service_2.AuthService(this);
        this.user = new service_3.UserService(this);
        this.catalog = new service_4.CatalogService(this);
        this.cart = new service_5.CartService(this);
        this.delivery = new service_6.DeliveryService(this);
        this.payment = new service_7.PaymentService(this);
        this.consent = new service_8.ConsentService(this);
        this.customerService = new service_9.CustomerServiceService(this);
        this.content = new service_10.ContentService(this);
        this.userOnboarding = new service_11.UserOnboardingService(this);
        this.recipe = new service_12.RecipeService(this);
      }
    };
    PicnicClient2.CheckoutIssueError = checkout_error_1.CheckoutIssueError;
    PicnicClient2.isCheckoutIssueError = checkout_error_1.isCheckoutIssueError;
    PicnicClient2.UnexpectedPageFormatError = page_format_error_1.UnexpectedPageFormatError;
    PicnicClient2.isUnexpectedPageFormatError = page_format_error_1.isUnexpectedPageFormatError;
    module.exports = PicnicClient2;
  }
});

// src/server/main.ts
import { readFileSync as readFileSync2 } from "node:fs";
import { createServer } from "node:http";
import { dirname, join as join5 } from "node:path";
import { fileURLToPath } from "node:url";

// src/server/app.ts
import { createHash as createHash2 } from "node:crypto";
import { readFile as readFile2 } from "node:fs/promises";
import { extname, join as join4, normalize, sep } from "node:path";

// src/server/next-server.ts
var RequestCookies = class {
  #values = /* @__PURE__ */ new Map();
  constructor(values = {}) {
    for (const [name, value] of Object.entries(values)) this.#values.set(name, value);
  }
  get(name) {
    const value = this.#values.get(name);
    return value === void 0 ? void 0 : { name, value };
  }
  has(name) {
    return this.#values.has(name);
  }
  getAll() {
    return [...this.#values].map(([name, value]) => ({ name, value }));
  }
};
var NextURL = class extends URL {
  #origin;
  /**
   * `origin` can be given separately: behind Home Assistant ingress the page
   * lives under a path, and the one route that reads it (checkout) uses it to
   * build the address the payment page returns to.
   */
  constructor(url, origin) {
    super(url);
    this.#origin = origin ?? super.origin;
  }
  get origin() {
    return this.#origin;
  }
};
var NextRequest = class {
  method;
  url;
  nextUrl;
  headers;
  cookies;
  #body;
  constructor(url, init = {}) {
    this.method = (init.method ?? "GET").toUpperCase();
    this.url = url;
    this.nextUrl = new NextURL(url, init.origin);
    this.headers = new Headers(init.headers ?? {});
    this.cookies = new RequestCookies(init.cookies);
    this.#body = init.body ?? null;
  }
  /** Like Request.json(): rejects on an empty or malformed body. */
  async json() {
    if (this.#body === null || this.#body === "") throw new SyntaxError("Unexpected end of JSON input");
    return JSON.parse(this.#body);
  }
  async text() {
    return this.#body ?? "";
  }
};
var ResponseCookies = class {
  #headers;
  #set = /* @__PURE__ */ new Map();
  constructor(headers) {
    this.#headers = headers;
  }
  set(name, value, options = {}) {
    this.#set.set(name, { value, options });
    this.#headers.append("set-cookie", serializeCookie(name, value, options));
    return this;
  }
  get(name) {
    const entry = this.#set.get(name);
    return entry ? { name, value: entry.value, ...entry.options } : void 0;
  }
  getAll() {
    return [...this.#set].map(([name, entry]) => ({ name, value: entry.value, ...entry.options }));
  }
};
function serializeCookie(name, value, options) {
  const parts = [`${name}=${encodeURIComponent(value)}`];
  if (options.path) parts.push(`Path=${options.path}`);
  if (options.domain) parts.push(`Domain=${options.domain}`);
  if (typeof options.maxAge === "number") parts.push(`Max-Age=${Math.floor(options.maxAge)}`);
  if (options.expires) parts.push(`Expires=${options.expires.toUTCString()}`);
  if (options.httpOnly) parts.push("HttpOnly");
  if (options.secure) parts.push("Secure");
  if (options.sameSite) {
    const same = options.sameSite === true ? "strict" : options.sameSite;
    parts.push(`SameSite=${same[0].toUpperCase()}${same.slice(1)}`);
  }
  return parts.join("; ");
}
var NextResponse = class _NextResponse extends Response {
  cookies;
  constructor(body, init) {
    super(body, init);
    this.cookies = new ResponseCookies(this.headers);
  }
  static json(body, init) {
    const headers = new Headers(init?.headers);
    if (!headers.has("content-type")) headers.set("content-type", "application/json");
    return new _NextResponse(JSON.stringify(body), { ...init, headers });
  }
};

// vendor/picnic-web/src/lib/core/api-error.ts
var AUTH_STATUS_PREFIX = /^(401|403)\b/;
function hasAuthWording(message) {
  return message.includes("unauthorized") || message.includes("forbidden") || message.includes("login failed");
}
function isUpstreamBlockError(error2) {
  return error2 instanceof Error && /<html[\s>]/i.test(error2.message);
}
function isApiAuthError(error2) {
  if (!(error2 instanceof Error)) return false;
  const message = error2.message.toLowerCase();
  if (isUpstreamBlockError(error2)) return false;
  return AUTH_STATUS_PREFIX.test(message) || hasAuthWording(message);
}
function is2FAError(error2) {
  if (!(error2 instanceof Error)) return false;
  const message = error2.message.toLowerCase();
  return message.includes("2fa") || AUTH_STATUS_PREFIX.test(message) || hasAuthWording(message);
}

// vendor/picnic-web/src/lib/core/concurrency.ts
async function mapWithConcurrency(items, worker, limit) {
  const results = new Array(items.length);
  let next = 0;
  async function run() {
    while (next < items.length) {
      const index = next++;
      results[index] = await worker(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
  return results;
}

// vendor/picnic-web/src/lib/core/types.ts
var SUPPORTED_COUNTRY_CODES = ["NL", "DE", "FR"];
var DEFAULT_COUNTRY_CODE = "NL";
var COUNTRY_COOKIE_NAME = "picnic_country";
function getImageCdnBase(countryCode) {
  return `https://storefront-prod.${countryCode.toLowerCase()}.picnicinternational.com/static/images`;
}
var PRODUCT_MAIN_CONTAINER_ID = "product-details-page-root-main-container";
var PRODUCT_GALLERY_CONTAINER_ID = "product-page-image-gallery-main-image-container";
var PRODUCT_DESCRIPTION_ID = "description";
var PRODUCT_HIGHLIGHTS_ID = "product-page-highlights";
var PRODUCT_ALLERGIES_ID = "product-page-allergies";
var PRODUCT_ACCORDION_ID = "accordion-list";
var PRODUCT_BUNDLES_PREFIX = "product-page-bundles-";
var PRODUCT_ALTERNATIVES_ID = "alternatives-container";
var PRODUCT_LABELS_PREFIX = "product-page-labels-";

// vendor/picnic-web/src/lib/core/picnic-client.ts
var PicnicClient = require_lib();
var isUnexpectedPageFormatError = PicnicClient.isUnexpectedPageFormatError;
function buildPicnicClient(authToken, countryCode = DEFAULT_COUNTRY_CODE) {
  return new PicnicClient({
    countryCode,
    authKey: authToken
  });
}
function buildPicnicClientAnonymous(countryCode = DEFAULT_COUNTRY_CODE) {
  return new PicnicClient({
    countryCode
  });
}

// vendor/picnic-web/src/lib/core/constants.ts
var MEAL_PLAN_MAX_CANDIDATES = 40;
var RECIPE_PAGE_CONCURRENCY = 5;
var MEAL_PLAN_RECIPE_CONCURRENCY = 3;
var INGREDIENT_CONCURRENCY = 5;

// vendor/picnic-web/src/lib/core/page-cache.ts
import { createHash } from "node:crypto";
var cache = /* @__PURE__ */ new Map();
var PAGE_CACHE_TTL_MS = 10 * 60 * 1e3;
var MAX_ENTRIES = 500;
function cacheKey(client, path) {
  const token = client.authKey ?? "";
  const scope = createHash("sha256").update(token).digest("hex").slice(0, 16);
  return `${client.countryCode ?? ""}:${scope}:${path}`;
}
function evictIfFull() {
  if (cache.size < MAX_ENTRIES) return;
  const now = Date.now();
  for (const [key, entry] of cache) {
    if (entry.expiresAt <= now) cache.delete(key);
  }
  while (cache.size >= MAX_ENTRIES) {
    const oldest = cache.keys().next();
    if (oldest.done) break;
    cache.delete(oldest.value);
  }
}
async function fetchCachedPage(client, path, ttlMs = PAGE_CACHE_TTL_MS) {
  const typed = client;
  const key = cacheKey(typed, path);
  const hit = cache.get(key);
  if (hit && hit.expiresAt > Date.now()) return hit.promise;
  const promise = typed.sendRequest("GET", path, null, true);
  evictIfFull();
  cache.set(key, { promise, expiresAt: Date.now() + ttlMs });
  promise.catch(() => {
    if (cache.get(key)?.promise === promise) cache.delete(key);
  });
  return promise;
}

// vendor/picnic-web/src/lib/pml/pml-helpers.ts
function stripColorTags(md) {
  return md.replace(/#\([^)]+\)/g, "").trim();
}
function cleanMarkdown(md) {
  return stripColorTags(md).replace(/\*\*/g, "").replace(/__/g, "").trim();
}
function extractInnerColor(md) {
  const colorRegex = /#\(([^)]+)\)/g;
  const colors = [];
  let match;
  while ((match = colorRegex.exec(md)) !== null) {
    colors.push(match[1]);
  }
  if (colors.length === 0) return null;
  const DEFAULT_COLORS = /* @__PURE__ */ new Set(["#333333", "#5b534e", "#787570"]);
  for (const color of colors) {
    if (!DEFAULT_COLORS.has(color.toLowerCase())) {
      return color;
    }
  }
  return null;
}
function findSellingUnitContainers(obj) {
  const results = [];
  if (typeof obj !== "object" || obj === null) return results;
  if (Array.isArray(obj)) {
    for (const item of obj) {
      results.push(...findSellingUnitContainers(item));
    }
    return results;
  }
  const record = obj;
  if (record.type === "PML" && typeof record.id === "string" && record.id.includes("selling-unit") && record.id.includes("tile")) {
    results.push(record);
  }
  for (const value of Object.values(record)) {
    results.push(...findSellingUnitContainers(value));
  }
  return results;
}
function collectMarkdowns(node) {
  const results = [];
  if (typeof node !== "object" || node === null) return results;
  if (Array.isArray(node)) {
    for (const item of node) {
      results.push(...collectMarkdowns(item));
    }
    return results;
  }
  const record = node;
  if (typeof record.markdown === "string") {
    results.push(record.markdown);
  }
  for (const value of Object.values(record)) {
    if (typeof value === "object" && value !== null) {
      results.push(...collectMarkdowns(value));
    }
  }
  return results;
}
function findNodeById(obj, id) {
  if (typeof obj !== "object" || obj === null) return null;
  if (Array.isArray(obj)) {
    for (const item of obj) {
      const result = findNodeById(item, id);
      if (result) return result;
    }
    return null;
  }
  const record = obj;
  if (record.id === id) return record;
  for (const value of Object.values(record)) {
    const result = findNodeById(value, id);
    if (result) return result;
  }
  return null;
}
function findNodeByIdPrefix(obj, prefix) {
  if (typeof obj !== "object" || obj === null) return null;
  if (Array.isArray(obj)) {
    for (const item of obj) {
      const result = findNodeByIdPrefix(item, prefix);
      if (result) return result;
    }
    return null;
  }
  const record = obj;
  if (typeof record.id === "string" && record.id.startsWith(prefix)) {
    return record;
  }
  for (const value of Object.values(record)) {
    const result = findNodeByIdPrefix(value, prefix);
    if (result) return result;
  }
  return null;
}
function findNodeByIdSubstring(obj, idSubstring) {
  if (typeof obj !== "object" || obj === null) return null;
  if (Array.isArray(obj)) {
    for (const item of obj) {
      const result = findNodeByIdSubstring(item, idSubstring);
      if (result) return result;
    }
    return null;
  }
  const record = obj;
  if (typeof record.id === "string" && record.id.includes(idSubstring)) {
    return record;
  }
  for (const value of Object.values(record)) {
    const result = findNodeByIdSubstring(value, idSubstring);
    if (result) return result;
  }
  return null;
}
function collectPropertyValues(node, key) {
  const results = [];
  if (typeof node !== "object" || node === null) return results;
  if (Array.isArray(node)) {
    for (const item of node) {
      results.push(...collectPropertyValues(item, key));
    }
    return results;
  }
  const record = node;
  if (key in record) {
    results.push(record[key]);
  }
  for (const [k, value] of Object.entries(record)) {
    if (k !== key && typeof value === "object" && value !== null) {
      results.push(...collectPropertyValues(value, key));
    }
  }
  return results;
}
function findIconNodes(node) {
  const results = [];
  if (typeof node !== "object" || node === null) return results;
  if (Array.isArray(node)) {
    for (const item of node) {
      results.push(...findIconNodes(item));
    }
    return results;
  }
  const record = node;
  if (record.type === "ICON" && typeof record.iconKey === "string") {
    const fallback = record.fallback;
    results.push({
      iconKey: record.iconKey,
      fallbackId: fallback?.id ?? null,
      color: typeof record.color === "string" ? record.color : null
    });
  }
  for (const value of Object.values(record)) {
    if (typeof value === "object" && value !== null) {
      results.push(...findIconNodes(value));
    }
  }
  return results;
}

// vendor/picnic-web/src/lib/product/extract-product-data.ts
function findMainSellingUnit(page, productId) {
  const allUnits = collectPropertyValues(page, "sellingUnit").filter(
    (u) => typeof u === "object" && u !== null
  );
  const mainUnit = allUnits.find((u) => u.id === productId && u.max_count !== void 0);
  return {
    displayPrice: mainUnit?.display_price ?? 0,
    maxCount: mainUnit?.max_count ?? 99,
    imageId: mainUnit?.image_id ?? ""
  };
}
function resolveDisplayPrice(page, productId, mainUnitPrice) {
  if (mainUnitPrice) return mainUnitPrice;
  const bundleNode = findNodeById(page, productId);
  if (bundleNode) {
    const prices = collectPropertyValues(bundleNode, "price").filter(
      (p) => typeof p === "number"
    );
    if (prices[0]) return prices[0];
  }
  const mainContainer = findNodeById(page, PRODUCT_MAIN_CONTAINER_ID);
  if (mainContainer) {
    const prices = collectPropertyValues(mainContainer, "price").filter(
      (p) => typeof p === "number"
    );
    if (prices[0]) return prices[0];
  }
  return 0;
}
function extractPromotion(page) {
  const promoIds = collectPropertyValues(page, "promotion_id");
  const promoLabels = collectPropertyValues(page, "promotion_label");
  if (promoIds.length === 0 || promoLabels.length === 0) return null;
  const id = promoIds[0];
  const label = promoLabels[0];
  if (typeof id !== "string" || typeof label !== "string") return null;
  return { id, label };
}
function findStateBoundarySellingUnits(container) {
  const results = [];
  if (typeof container !== "object" || container === null) return results;
  if (Array.isArray(container)) {
    for (const item of container) {
      results.push(...findStateBoundarySellingUnits(item));
    }
    return results;
  }
  const record = container;
  if (record.type === "STATE_BOUNDARY" && typeof record.id === "string" && record.id.startsWith("s")) {
    results.push(record);
  }
  for (const value of Object.values(record)) {
    if (typeof value === "object" && value !== null) {
      results.push(...findStateBoundarySellingUnits(value));
    }
  }
  return results;
}
function extractBundles(page) {
  const tiers = findBundleTiers(page);
  if (tiers.length > 0) {
    return tiers.map((tier) => ({
      id: "",
      quantity: tier.from_quantity,
      pricePerUnit: tier.price,
      imageId: "",
      maxCount: 0
    }));
  }
  const bundleContainer = findNodeByIdPrefix(page, PRODUCT_BUNDLES_PREFIX);
  if (!bundleContainer) return [];
  const bundleItemNodes = findStateBoundarySellingUnits(bundleContainer);
  const bundles = [];
  for (let i = 0; i < bundleItemNodes.length; i++) {
    const node = bundleItemNodes[i];
    const sellingUnits = collectPropertyValues(node, "sellingUnit").filter(
      (u) => typeof u === "object" && u !== null
    );
    const prices = collectPropertyValues(node, "price").filter(
      (p) => typeof p === "number"
    );
    const su = sellingUnits[0];
    if (!su) continue;
    bundles.push({
      id: su.id ?? "",
      quantity: i + 1,
      pricePerUnit: prices[0] ?? 0,
      imageId: su.image_id ?? "",
      maxCount: su.max_count ?? 0
    });
  }
  return bundles;
}
function findBundleTiers(obj) {
  if (typeof obj !== "object" || obj === null) return [];
  if (Array.isArray(obj)) {
    if (obj.length > 1 && isBundleTier(obj[0])) {
      return obj;
    }
    for (const item of obj) {
      const result = findBundleTiers(item);
      if (result.length > 0) return result;
    }
    return [];
  }
  const record = obj;
  const ep1 = record["__ep1"];
  if (typeof ep1 === "object" && ep1 !== null && !Array.isArray(ep1)) {
    const v1 = ep1["v1"];
    if (Array.isArray(v1) && v1.length > 1 && isBundleTier(v1[0])) {
      return v1;
    }
  }
  for (const value of Object.values(record)) {
    const result = findBundleTiers(value);
    if (result.length > 0) return result;
  }
  return [];
}
function isBundleTier(obj) {
  return typeof obj === "object" && obj !== null && typeof obj["price"] === "number" && typeof obj["from_quantity"] === "number";
}
function extractSimilarProducts(page) {
  const altContainer = findNodeById(page, PRODUCT_ALTERNATIVES_ID);
  if (!altContainer) return [];
  const allUnits = collectPropertyValues(altContainer, "sellingUnit").filter(
    (u) => typeof u === "object" && u !== null
  );
  return allUnits.filter((u) => u.display_price !== void 0).map((u) => ({
    id: u.id ?? "",
    name: u.name ?? "",
    imageId: u.image_id ?? "",
    displayPrice: u.display_price ?? 0,
    unitQuantity: u.unit_quantity ?? "",
    maxCount: u.max_count ?? 0,
    ...u.deposit !== void 0 ? { deposit: u.deposit } : {}
  }));
}

// vendor/picnic-web/src/lib/pml/pml-product-helpers.ts
function collectPriceNodes(node) {
  const results = [];
  if (typeof node !== "object" || node === null) return results;
  if (Array.isArray(node)) {
    for (const item of node) {
      results.push(...collectPriceNodes(item));
    }
    return results;
  }
  const record = node;
  if (record.type === "PRICE" && typeof record.price === "number") {
    results.push({
      price: record.price,
      isCrossed: record.isCrossed === true,
      color: record.color ?? null
    });
  }
  for (const value of Object.values(record)) {
    if (typeof value === "object" && value !== null) {
      results.push(...collectPriceNodes(value));
    }
  }
  return results;
}
function collectHighlightRows(node) {
  const results = [];
  if (typeof node !== "object" || node === null) return results;
  const record = node;
  const children = record.children ?? record.child;
  if (record.type === "STACK" && record.axis === "HORIZONTAL") {
    const rowChildren = Array.isArray(children) ? children : [];
    const richText = rowChildren.find(
      (c) => typeof c === "object" && c !== null && c.type === "RICH_TEXT"
    );
    if (richText?.markdown && typeof richText.markdown === "string") {
      const icon = rowChildren.find(
        (c) => typeof c === "object" && c !== null && c.type === "ICON"
      );
      results.push({
        markdown: richText.markdown,
        iconKey: icon?.iconKey ?? null,
        linkTarget: null
      });
      return results;
    }
  }
  if (record.type === "TOUCHABLE") {
    const onPress = record.onPress;
    const target = onPress?.actionType === "OPEN" ? onPress.target ?? null : null;
    const innerRows = collectHighlightRows(record.child);
    for (const row of innerRows) {
      row.linkTarget = target;
    }
    return innerRows;
  }
  if (Array.isArray(children)) {
    for (const child of children) {
      results.push(...collectHighlightRows(child));
    }
  } else if (typeof children === "object" && children !== null) {
    results.push(...collectHighlightRows(children));
  }
  const pml = record.pml;
  if (pml?.component) {
    results.push(...collectHighlightRows(pml.component));
  }
  return results;
}
function collectLabels(node) {
  const results = [];
  if (typeof node !== "object" || node === null) return results;
  if (Array.isArray(node)) {
    for (const item of node) {
      results.push(...collectLabels(item));
    }
    return results;
  }
  const record = node;
  if (record.type === "CONTAINER" && typeof record.backgroundColor === "string" && typeof record.borderRadius === "number") {
    const markdowns = collectMarkdowns(record);
    if (markdowns.length > 0) {
      const textColors = collectPropertyValues(record, "textAttributes").filter((a) => typeof a === "object" && a !== null).map((a) => a.color).filter((c) => typeof c === "string");
      results.push({
        text: stripColorTags(markdowns[0]),
        textColor: textColors[0] ?? "#333333",
        backgroundColor: record.backgroundColor
      });
      return results;
    }
  }
  for (const value of Object.values(record)) {
    if (typeof value === "object" && value !== null) {
      results.push(...collectLabels(value));
    }
  }
  return results;
}
function collectNutritionRows(node) {
  const results = [];
  if (typeof node !== "object" || node === null) return results;
  if (Array.isArray(node)) {
    for (const item of node) {
      results.push(...collectNutritionRows(item));
    }
    return results;
  }
  const record = node;
  if (record.type === "STACK" && record.axis === "HORIZONTAL" && (record.distribution === "SPACE_BETWEEN" || record.distribution === "END")) {
    const rowChildren = Array.isArray(record.children) ? record.children : [];
    const texts = rowChildren.filter(
      (c) => typeof c === "object" && c !== null && c.type === "RICH_TEXT"
    ).map((c) => ({
      text: stripColorTags(c.markdown ?? ""),
      textType: c.textType ?? ""
    }));
    if (texts.length > 0) {
      const label = texts[0].text;
      const value = texts.length > 1 ? texts[1].text : null;
      const isCategory = texts[0].textType === "HEADLINE2";
      const bg = typeof record.backgroundColor === "string" ? record.backgroundColor : null;
      results.push({ label, value, isCategory, backgroundColor: bg });
      return results;
    }
  }
  const children = record.children ?? record.child;
  if (Array.isArray(children)) {
    for (const child of children) {
      results.push(...collectNutritionRows(child));
    }
  } else if (typeof children === "object" && children !== null) {
    results.push(...collectNutritionRows(children));
  }
  return results;
}
var ALLERGEN_HEADING_PATTERN = /^(bevat(\s+mogelijk)?|enthält|kann enthalten)$/i;
function collectAllergenGroups(node) {
  const results = [];
  if (typeof node !== "object" || node === null) return results;
  const component = findPmlComponent(node);
  if (!component) return results;
  const record = component;
  const children = Array.isArray(record.children) ? record.children : [];
  let currentCategory = "confirmed";
  for (const child of children) {
    if (typeof child !== "object" || child === null) continue;
    const childRecord = child;
    if (childRecord.type === "RICH_TEXT" && typeof childRecord.markdown === "string") {
      const text3 = stripColorTags(childRecord.markdown).trim();
      if (ALLERGEN_HEADING_PATTERN.test(text3)) {
        currentCategory = text3.toLowerCase().includes("mogelijk") ? "mayContain" : "confirmed";
        continue;
      }
    }
    if (childRecord.type === "STACK" && childRecord.axis === "HORIZONTAL") {
      const badges = collectLabels(childRecord);
      if (badges.length > 0) {
        results.push({ category: currentCategory, badges });
      }
    }
  }
  return results;
}
function findPmlComponent(node) {
  if (typeof node !== "object" || node === null) return null;
  const record = node;
  const pml = record.pml;
  if (pml?.component) return pml.component;
  const children = record.children ?? record.child;
  if (Array.isArray(children)) {
    for (const child of children) {
      const found = findPmlComponent(child);
      if (found) return found;
    }
  } else if (typeof children === "object" && children !== null) {
    return findPmlComponent(children);
  }
  return null;
}

// vendor/picnic-web/src/lib/product/parse-fusion-product.ts
function extractMainContainerInfo(page) {
  const mainContainer = findNodeById(page, PRODUCT_MAIN_CONTAINER_ID);
  const texts = collectMarkdowns(mainContainer).map((md) => md);
  const name = stripColorTags(texts[0] ?? "");
  const brand = stripColorTags(texts[1] ?? "");
  const unitQuantity = stripColorTags(texts[2] ?? "");
  const unitPrice = texts[3] ? stripColorTags(texts[3]) || null : null;
  let categoryTag = null;
  if (texts[4]) {
    const color = extractInnerColor(texts[4]);
    const text3 = stripColorTags(texts[4]);
    if (text3 && color) {
      categoryTag = { text: text3, color };
    }
  }
  return { name, brand, unitQuantity, unitPrice, categoryTag };
}
function extractImageIds(page, fallbackImageId) {
  const gallery = findNodeById(page, PRODUCT_GALLERY_CONTAINER_ID);
  if (!gallery) {
    return fallbackImageId ? [fallbackImageId] : [];
  }
  const sourceIds = collectPropertyValues(gallery, "source").filter((s) => typeof s === "object" && s !== null).map((s) => s.id).filter((id) => typeof id === "string");
  const uniqueIds = [...new Set(sourceIds)];
  return uniqueIds.length > 0 ? uniqueIds : fallbackImageId ? [fallbackImageId] : [];
}
function extractDescription(page) {
  const descBlock = findNodeById(page, PRODUCT_DESCRIPTION_ID);
  const markdowns = collectMarkdowns(descBlock);
  return markdowns.length > 0 ? markdowns.join("\n") : null;
}
function extractHighlights(page) {
  const highlightsBlock = findNodeById(page, PRODUCT_HIGHLIGHTS_ID);
  if (!highlightsBlock) return [];
  const rows = collectHighlightRows(highlightsBlock);
  return rows.map((row) => ({
    text: row.markdown,
    iconKey: row.iconKey,
    linkTarget: row.linkTarget
  }));
}
function extractAllergens(page) {
  const allergiesBlock = findNodeById(page, PRODUCT_ALLERGIES_ID);
  if (!allergiesBlock) return { confirmed: [], mayContain: [] };
  const groups = collectAllergenGroups(allergiesBlock);
  const confirmed = [];
  const mayContain = [];
  for (const group of groups) {
    const target = group.category === "mayContain" ? mayContain : confirmed;
    for (const badge of group.badges) {
      target.push({
        text: badge.text,
        backgroundColor: badge.backgroundColor,
        textColor: badge.textColor
      });
    }
  }
  return { confirmed, mayContain };
}
function extractInfoSections(page) {
  const accordionBlock = findNodeById(page, PRODUCT_ACCORDION_ID);
  if (!accordionBlock) return [];
  const itemsArrays = collectPropertyValues(accordionBlock, "items");
  const items = Array.isArray(itemsArrays[0]) ? itemsArrays[0] : [];
  const sections = [];
  for (const item of items) {
    if (typeof item !== "object" || item === null) continue;
    const record = item;
    const headerTexts = collectMarkdowns(record.header).map(cleanMarkdown);
    const bodyTexts = collectMarkdowns(record.body).map(stripColorTags);
    const title = headerTexts[0] ?? "";
    const content = bodyTexts.join("\n");
    if (title) {
      sections.push({ title, content });
    }
  }
  return sections;
}
function extractLabels(page) {
  const labelsNode = findNodeByIdPrefix(page, PRODUCT_LABELS_PREFIX);
  if (!labelsNode) return [];
  return collectLabels(labelsNode);
}
function extractOriginalPrice(page) {
  const mainContainer = findNodeById(page, PRODUCT_MAIN_CONTAINER_ID);
  if (!mainContainer) return null;
  const priceNodes = collectPriceNodes(mainContainer);
  const crossedPrice = priceNodes.find((p) => p.isCrossed);
  return crossedPrice?.price ?? null;
}
var DEFAULT_PRICE_COLORS = /* @__PURE__ */ new Set(["#333333", "#5b534e", "#787570"]);
function extractDisplayPriceColor(page, displayPrice) {
  const mainContainer = findNodeById(page, PRODUCT_MAIN_CONTAINER_ID);
  if (!mainContainer) return null;
  const priceNodes = collectPriceNodes(mainContainer);
  const active = priceNodes.find((p) => !p.isCrossed && p.price === displayPrice) ?? priceNodes.find((p) => !p.isCrossed);
  const color = active?.color ?? null;
  if (!color || DEFAULT_PRICE_COLORS.has(color.toLowerCase())) return null;
  return color;
}
function extractNutritionRows(page) {
  const accordionBlock = findNodeById(page, PRODUCT_ACCORDION_ID);
  if (!accordionBlock) return [];
  const itemsArrays = collectPropertyValues(accordionBlock, "items");
  const items = Array.isArray(itemsArrays[0]) ? itemsArrays[0] : [];
  for (const item of items) {
    if (typeof item !== "object" || item === null) continue;
    const record = item;
    const headerTexts = collectMarkdowns(record.header).map(cleanMarkdown);
    const title = headerTexts[0] ?? "";
    if (title.toLowerCase().includes("voedingswaarde") || title.toLowerCase().includes("nährwert")) {
      return collectNutritionRows(record.body);
    }
  }
  return [];
}
function extractProductNutritionRows(rawPage) {
  const page = rawPage?.body ?? rawPage;
  return extractNutritionRows(page);
}
function extractProductTileData(rawPage, productId) {
  const page = rawPage?.body ?? rawPage;
  const mainContainer = findNodeById(page, PRODUCT_MAIN_CONTAINER_ID);
  const texts = collectMarkdowns(mainContainer).map(stripColorTags);
  const name = cleanMarkdown(texts[0] ?? "");
  const unitQuantity = cleanMarkdown(texts[2] ?? "");
  const allUnits = collectPropertyValues(rawPage, "sellingUnit").filter(
    (u) => typeof u === "object" && u !== null
  );
  const unit = allUnits.find((u) => u.id === productId) ?? allUnits[0] ?? null;
  const rawPrice = unit?.display_price ?? 0;
  const maxCount = unit?.max_count ?? 99;
  const unitImageId = unit?.image_id ?? "";
  const imageId = unitImageId || (() => {
    const gallery = findNodeById(page, PRODUCT_GALLERY_CONTAINER_ID);
    const ids = collectPropertyValues(gallery, "source").filter((s) => typeof s === "object" && s !== null).map((s) => s.id).filter((id) => typeof id === "string");
    return ids[0] ?? "";
  })();
  let displayPrice = resolveDisplayPrice(page, productId, rawPrice);
  if (!displayPrice) {
    const allPriceNodes = collectPriceNodes(rawPage);
    const active = allPriceNodes.find((p) => !p.isCrossed && p.price > 0);
    if (active) displayPrice = active.price;
  }
  if (!displayPrice && texts[3]) {
    const m = texts[3].match(/(\d+)[.,](\d{2})/);
    if (m) displayPrice = parseInt(m[1]) * 100 + parseInt(m[2]);
  }
  const originalPrice = extractOriginalPrice(page);
  const bundleOptions = extractBundles(rawPage);
  const selfBundle = bundleOptions.find((b) => b.id === productId && b.quantity > 1);
  if (selfBundle) {
    const baseOption = bundleOptions.find((b) => b.quantity === 1);
    const singlePackPrice = baseOption?.pricePerUnit ?? 0;
    const bundleTotal = selfBundle.quantity * selfBundle.pricePerUnit;
    const originalTotal = singlePackPrice > 0 ? selfBundle.quantity * singlePackPrice : null;
    return {
      name,
      unitQuantity,
      imageId,
      displayPrice: bundleTotal,
      maxCount,
      originalPrice: originalTotal !== null && originalTotal > bundleTotal ? originalTotal : null,
      priceRanges: null
    };
  }
  let priceRanges = null;
  if (bundleOptions.length > 0) {
    const thresholds = bundleOptions.filter((b) => b.pricePerUnit > 0).map((b) => ({ quantity: b.quantity, pricePerUnit: b.pricePerUnit })).sort((a, b) => a.quantity - b.quantity);
    if (thresholds.length > 0) priceRanges = thresholds;
  }
  return { name, unitQuantity, imageId, displayPrice, maxCount, originalPrice, priceRanges };
}
function parseProductDetailPage(rawPage, productId) {
  const page = rawPage?.body ?? rawPage;
  const mainInfo = extractMainContainerInfo(page);
  const mainUnit = findMainSellingUnit(rawPage, productId);
  const displayPrice = resolveDisplayPrice(page, productId, mainUnit.displayPrice);
  const promotion = extractPromotion(rawPage);
  const labels = extractLabels(page).filter((l) => !promotion || l.text !== promotion.label);
  return {
    id: productId,
    name: mainInfo.name,
    brand: mainInfo.brand,
    unitQuantity: mainInfo.unitQuantity,
    unitPrice: mainInfo.unitPrice,
    categoryTag: mainInfo.categoryTag,
    displayPrice,
    originalPrice: extractOriginalPrice(page),
    displayPriceColor: extractDisplayPriceColor(page, displayPrice),
    maxCount: mainUnit.maxCount,
    imageIds: extractImageIds(page, mainUnit.imageId),
    labels,
    description: extractDescription(page),
    highlights: extractHighlights(page),
    allergens: extractAllergens(page),
    infoSections: extractInfoSections(page),
    promotion,
    bundles: extractBundles(page),
    similarProducts: extractSimilarProducts(page),
    nutritionRows: extractNutritionRows(page)
  };
}

// vendor/picnic-web/src/lib/product/extract-card-data.ts
function extractPromotionLabel(contexts) {
  if (!contexts) return null;
  for (const ctx of contexts) {
    if (ctx.schema?.includes("promotion")) {
      const label = ctx.data?.promotion_label;
      if (typeof label === "string" && label.trim() !== "") {
        return label.trim();
      }
    }
  }
  return null;
}
function extractPromotionBadge(contexts, pml, stackChildren) {
  const label = extractPromotionLabel(contexts);
  if (!label) return null;
  const matches = (l) => cleanMarkdown(l.text) === label;
  const inline = collectLabels(stackChildren).find(matches);
  const colored = inline ?? collectLabels(pml).find(matches);
  return {
    badge: {
      text: label,
      variant: "promo",
      backgroundColor: colored?.backgroundColor,
      textColor: colored?.textColor
    },
    placement: inline ? "inline" : "image"
  };
}
function findTextStackChildren(pml) {
  if (!pml) return null;
  const component = pml.component;
  if (!component) return null;
  const topChildren = component.children;
  if (!topChildren || topChildren.length < 2) return null;
  function findVerticalStack(node, depth) {
    if (depth > 5 || typeof node !== "object" || node === null) return null;
    if (Array.isArray(node)) {
      for (const item of node) {
        const r = findVerticalStack(item, depth + 1);
        if (r) return r;
      }
      return null;
    }
    const record = node;
    if (record.type === "STACK" && record.axis === "VERTICAL" && typeof record.spacing === "number" && Array.isArray(record.children)) {
      return record;
    }
    for (const value of Object.values(record)) {
      const r = findVerticalStack(value, depth + 1);
      if (r) return r;
    }
    return null;
  }
  const textArea = topChildren[1];
  const stack = findVerticalStack(textArea, 0);
  return stack?.children ?? null;
}
var SIZE_LABELS = /* @__PURE__ */ new Set(["Klein", "XL", "Groot"]);
function splitFlankingIcons(row) {
  const tokens = [];
  const walk = (node) => {
    if (Array.isArray(node)) {
      for (const item of node) walk(item);
      return;
    }
    if (typeof node !== "object" || node === null) return;
    const record = node;
    if (record.type === "ICON" && typeof record.iconKey === "string") {
      const fallback = record.fallback;
      if (fallback?.id) {
        tokens.push({
          kind: "icon",
          icon: {
            imageId: fallback.id,
            color: typeof record.color === "string" ? record.color : null
          }
        });
      }
      return;
    }
    if (typeof record.markdown === "string" && cleanMarkdown(record.markdown) !== "") {
      tokens.push({ kind: "text" });
    }
    for (const value of Object.values(record)) walk(value);
  };
  walk(row);
  const firstTextIdx = tokens.findIndex((t) => t.kind === "text");
  if (firstTextIdx === -1) {
    const firstIcon = tokens.find(
      (t) => t.kind === "icon"
    );
    return { leading: firstIcon?.icon ?? null, trailing: null };
  }
  const lastTextIdx = tokens.map((t) => t.kind).lastIndexOf("text");
  let leading = null;
  let trailing = null;
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.kind !== "icon") continue;
    if (i < firstTextIdx && !leading) leading = t.icon;
    else if (i > lastTextIdx && !trailing) trailing = t.icon;
  }
  return { leading, trailing };
}
function extractTextStackInfo(stackChildren, suName, unitQuantity) {
  const result = {
    subtitle: null,
    subtitleColor: null,
    subtitleLeadingIcon: null,
    subtitleTrailingIcon: null,
    displayName: null,
    namePrefix: null,
    brand: null,
    highlight: null,
    flagIconKey: null,
    flagFallbackImageId: null,
    extraLabel: null
  };
  if (!stackChildren || stackChildren.length < 3) return result;
  let nameRowIdx = -1;
  for (let i = 0; i < stackChildren.length; i++) {
    const json2 = JSON.stringify(stackChildren[i]);
    if (json2.includes("PicnicSymbols")) {
      nameRowIdx = i;
      break;
    }
  }
  if (nameRowIdx === -1) {
    nameRowIdx = stackChildren.length >= 5 ? 1 : 0;
  }
  if (nameRowIdx > 0) {
    const subtitleRow = stackChildren[0];
    const markdowns = collectMarkdowns(subtitleRow);
    const text3 = markdowns.map((m) => cleanMarkdown(m)).filter(Boolean).join(" ");
    if (text3) {
      result.subtitle = text3;
      for (const md of markdowns) {
        const color = extractInnerColor(md);
        if (color) {
          result.subtitleColor = color;
          break;
        }
      }
      const { leading, trailing } = splitFlankingIcons(subtitleRow);
      result.subtitleLeadingIcon = leading;
      result.subtitleTrailingIcon = trailing;
    }
  }
  const nameRow = stackChildren[nameRowIdx];
  const nameMarkdowns = collectMarkdowns(nameRow);
  for (const md of nameMarkdowns) {
    if (cleanMarkdown(md) === ">" || cleanMarkdown(md) === "") continue;
    const stripped = stripColorTags(md);
    const boldMatch = stripped.match(/\*\*([^*]+)\*\*\s+(.*)/);
    if (boldMatch) {
      result.namePrefix = boldMatch[1].trim();
      const remaining = boldMatch[2].replace(/\s+$/, "").replace(/\u00a0/g, "").trim();
      if (remaining) result.displayName = remaining;
    } else {
      const clean = cleanMarkdown(md);
      if (clean && clean !== ">") {
        result.displayName = clean;
      }
    }
  }
  const brandRowIdx = nameRowIdx + 1;
  if (brandRowIdx < stackChildren.length - 2) {
    const brandRow = stackChildren[brandRowIdx];
    const icons = findIconNodes(brandRow);
    for (const icon of icons) {
      if (icon.iconKey.startsWith("flag")) {
        result.flagIconKey = icon.iconKey;
        result.flagFallbackImageId = icon.fallbackId;
        break;
      }
    }
    const markdowns = collectMarkdowns(brandRow);
    for (const md of markdowns) {
      const clean = cleanMarkdown(md);
      if (!clean || clean === ">" || clean === "·") continue;
      const highlightColor = extractInnerColor(md);
      if (highlightColor) {
        result.highlight = { text: clean, color: highlightColor };
      } else if (!/^\d+[.,]\d{2}$/.test(clean) && !clean.startsWith("€")) {
        result.brand = clean;
      }
    }
  }
  const lastChild = stackChildren[stackChildren.length - 1];
  const lastMarkdowns = collectMarkdowns(lastChild);
  const cleanTexts = lastMarkdowns.map((m) => cleanMarkdown(m)).filter((t) => t !== "" && t !== ">");
  const UNIT_PATTERNS = /gram|liter|stuks|kilo|\bml\b|\bcl\b|\bkg\b/i;
  for (const text3 of cleanTexts) {
    if (text3 === unitQuantity || UNIT_PATTERNS.test(text3)) continue;
    if (SIZE_LABELS.has(text3)) {
      result.extraLabel = { text: text3, variant: "size" };
    } else if (text3.startsWith("€") || text3.includes("/l") || text3.includes("/kg")) {
      result.extraLabel = { text: text3, variant: "unit-price" };
    } else {
      result.extraLabel = { text: text3, variant: "info" };
    }
    break;
  }
  return result;
}
function extractUnavailabilityFromPml(pml) {
  if (!pml) return { isUnavailable: false, reason: null };
  const component = pml.component;
  if (!component) return { isUnavailable: false, reason: null };
  const topChildren = component.children;
  if (!topChildren) return { isUnavailable: false, reason: null };
  for (const child of topChildren) {
    const a11yLabel = child.accessibilityLabel;
    if (typeof a11yLabel === "string" && a11yLabel.includes(",")) {
      const commaIdx = a11yLabel.indexOf(",");
      const reason = a11yLabel.substring(commaIdx + 1).trim();
      if (reason) {
        return { isUnavailable: true, reason };
      }
    }
  }
  const allMarkdowns = collectMarkdowns(pml);
  for (const md of allMarkdowns) {
    const clean = cleanMarkdown(md);
    if (clean === "Snel weer terug" || clean === "Tijdelijk niet leverbaar" || clean === "Niet meer leverbaar") {
      return { isUnavailable: true, reason: clean };
    }
  }
  return { isUnavailable: false, reason: null };
}
function extractOriginalPriceFromPml(stackChildren, displayPrice) {
  if (!stackChildren) return null;
  for (const child of stackChildren) {
    const markdowns = collectMarkdowns(child);
    const cleanTexts = markdowns.map((m) => cleanMarkdown(m)).filter((t) => t !== "" && t !== ">");
    const prices = [];
    for (const text3 of cleanTexts) {
      const priceMatch = text3.match(/^(\d+[.,]\d{2})$/);
      if (priceMatch) {
        prices.push(Math.round(parseFloat(priceMatch[1].replace(",", ".")) * 100));
      }
    }
    if (prices.length === 2) {
      const original = Math.max(...prices);
      if (original > displayPrice) {
        return original;
      }
    }
  }
  return null;
}
var DEFAULT_PRICE_COLORS2 = /* @__PURE__ */ new Set(["#333333", "#5b534e", "#787570"]);
function extractDisplayPriceColor2(stackChildren, displayPrice) {
  if (!stackChildren) return null;
  let found = null;
  const walk = (node) => {
    if (found) return;
    if (Array.isArray(node)) {
      for (const item of node) walk(item);
      return;
    }
    if (typeof node !== "object" || node === null) return;
    const record = node;
    const md = record.markdown;
    if (typeof md === "string") {
      const match = cleanMarkdown(md).match(/^€?\s*(\d+)[.,](\d{2})$/);
      if (match) {
        const cents = parseInt(match[1], 10) * 100 + parseInt(match[2], 10);
        if (cents === displayPrice) {
          const attrs = record.textAttributes;
          const color = typeof attrs?.color === "string" ? attrs.color : null;
          if (color && !DEFAULT_PRICE_COLORS2.has(color.toLowerCase())) {
            found = color;
            return;
          }
        }
      }
    }
    for (const value of Object.values(record)) walk(value);
  };
  walk(stackChildren);
  return found;
}

// vendor/picnic-web/src/lib/recipe/parse-recipe-detail.ts
var ALLERGEN_CONFIRMED_BG = "#fef3c7";
var ALLERGEN_CONFIRMED_TEXT = "#92400e";
var ALLERGEN_MAY_CONTAIN_BG = "#f3f4f6";
var ALLERGEN_MAY_CONTAIN_TEXT = "#4b5563";
function extractCookingTimeFromMarkdowns(markdowns) {
  const cleaned = markdowns.map((md) => cleanMarkdown(md).trim()).filter(Boolean);
  for (let i = 0; i < cleaned.length; i++) {
    const line = cleaned[i];
    const combined = /^(\d+)\s*[Mm]in\.?$/.exec(line);
    if (combined) return parseInt(combined[1], 10);
    if (/^\d+$/.test(line) && i + 1 < cleaned.length && /^[Mm]in\.?$/.test(cleaned[i + 1])) {
      return parseInt(line, 10);
    }
  }
  return null;
}
function findRecipeAnalyticsData(obj) {
  if (typeof obj !== "object" || obj === null) return null;
  if (Array.isArray(obj)) {
    for (const item of obj) {
      const r = findRecipeAnalyticsData(item);
      if (r) return r;
    }
    return null;
  }
  const record = obj;
  const analytics = record.analytics;
  for (const ctx of analytics?.contexts ?? []) {
    if (typeof ctx !== "object" || ctx === null) continue;
    const c = ctx;
    if (typeof c.schema === "string" && c.schema.includes("recipe")) {
      const data = c.data;
      if (data && Array.isArray(data.selling_units) && typeof data.recipe_id === "string") {
        return data;
      }
    }
  }
  for (const value of Object.values(record)) {
    const r = findRecipeAnalyticsData(value);
    if (r) return r;
  }
  return null;
}
function collectSellingUnitMap(obj, map) {
  if (typeof obj !== "object" || obj === null) return;
  if (Array.isArray(obj)) {
    for (const item of obj) collectSellingUnitMap(item, map);
    return;
  }
  const record = obj;
  if (typeof record.id === "string" && /^s\d+$/.test(record.id) && typeof record.name === "string" && typeof record.display_price === "number") {
    const su = record;
    if (!map.has(su.id)) {
      map.set(su.id, {
        name: cleanMarkdown(su.name),
        imageId: su.image_id ?? null,
        displayPrice: su.display_price,
        unitQuantity: su.unit_quantity ?? "",
        maxCount: su.max_count ?? 99
      });
    }
  }
  for (const value of Object.values(record)) {
    collectSellingUnitMap(value, map);
  }
}
var NEEDED_MD_RE = /^\(\d+(?:[.,]\d+)?\s+\S/;
var PACKAGE_SIZE_RE = /^\d+\s*(g|ml|kg|l)\b/i;
function buildRecipeQuantityMap(rawPage, sellingUnits) {
  const result = /* @__PURE__ */ new Map();
  const seen = /* @__PURE__ */ new Set();
  const activeIds = [];
  for (const u of sellingUnits) {
    if (!u.selling_unit_id || seen.has(u.selling_unit_id)) continue;
    if (u.status !== "ACTIVE") continue;
    seen.add(u.selling_unit_id);
    activeIds.push(u.selling_unit_id);
  }
  if (activeIds.length === 0) return result;
  const allMarkdowns = collectMarkdowns(rawPage).map((md) => cleanMarkdown(md).trim()).filter(Boolean);
  const pairs = [];
  let prevMd = null;
  for (const md of allMarkdowns) {
    if (NEEDED_MD_RE.test(md)) {
      const packageSize = prevMd && PACKAGE_SIZE_RE.test(prevMd) ? prevMd : null;
      pairs.push({ neededText: md, packageSize });
    }
    prevMd = md;
  }
  for (let i = 0; i < Math.min(activeIds.length, pairs.length); i++) {
    result.set(activeIds[i], pairs[i]);
  }
  return result;
}
function extractImageId(obj) {
  if (typeof obj !== "object" || obj === null) return null;
  if (Array.isArray(obj)) {
    for (const item of obj) {
      const id = extractImageId(item);
      if (id) return id;
    }
    return null;
  }
  const record = obj;
  if (record.type === "IMAGE") {
    const source = record.source;
    if (typeof source?.id === "string") return source.id;
    const fallback = record.fallbackSource;
    if (typeof fallback?.id === "string") return fallback.id;
  }
  for (const value of Object.values(record)) {
    const id = extractImageId(value);
    if (id) return id;
  }
  return null;
}
function parseStepsWarningFromMarkdowns(markdowns) {
  for (const raw of markdowns) {
    const clean = stripColorTags(cleanMarkdown(raw)).trim();
    if (/^(achtung|let op)[:\s]/i.test(clean)) return clean;
  }
  return null;
}
function parseStepsFromMarkdowns(markdowns) {
  const steps = [];
  let expectingContent = false;
  for (const raw of markdowns) {
    const clean = cleanMarkdown(raw).trim();
    if (/^(schritt|stap)\s*\d+$/i.test(clean)) {
      expectingContent = true;
    } else if (expectingContent && clean && clean !== "Notiz" && clean !== "Hinzufügen...") {
      steps.push(stripColorTags(raw).trim());
      expectingContent = false;
    }
  }
  return steps;
}
function parseNutritionFromMarkdowns(markdowns) {
  const rows = [];
  let inNutrition = false;
  let pendingLabel = null;
  const pendingValues = [];
  const flush = () => {
    if (pendingLabel === null || pendingValues.length === 0) return;
    const filtered = pendingValues.filter((v) => !/^(kcal|kJ)$/i.test(v.trim()));
    if (filtered.length === 0) return;
    const label = pendingLabel;
    const value = filtered.join(" / ");
    const isCategory = !label.toLowerCase().startsWith("davon") && !label.toLowerCase().startsWith("waarvan");
    rows.push({ label, value, isCategory, backgroundColor: null });
    pendingLabel = null;
    pendingValues.length = 0;
  };
  for (const raw of markdowns) {
    const clean = cleanMarkdown(raw).trim();
    if (!clean) continue;
    if (!inNutrition) {
      if (/nährwert|voedingswaarde/i.test(raw)) inNutrition = true;
      continue;
    }
    if (/allergen/i.test(raw)) {
      flush();
      break;
    }
    if (clean.length > 40 || /portion|ungefähr|bevat|enthält/i.test(clean)) continue;
    const hasDigit = /\d/.test(clean);
    const isUnitOnly = /^(kcal|kJ)$/i.test(clean);
    if (hasDigit || isUnitOnly) {
      if (pendingLabel !== null) pendingValues.push(clean);
    } else {
      flush();
      pendingLabel = clean;
    }
  }
  flush();
  return rows;
}
function parseAllergensFromMarkdowns(markdowns) {
  const confirmed = [];
  const mayContain = [];
  let inAllergens = false;
  let afterIngredientHeader = false;
  let inMayContain = false;
  for (const raw of markdowns) {
    const clean = cleanMarkdown(raw).trim();
    if (!inAllergens) {
      if (/allergen/i.test(clean)) inAllergens = true;
      continue;
    }
    if (/^(zutaten|ingrediënten|so wird|bereiding|schritt|stap)\b/i.test(clean)) break;
    if (/zutaten.*enthalten|ingrediënten.*bevatten/i.test(clean)) {
      afterIngredientHeader = true;
      continue;
    }
    if (/kann enthalten|kan bevatten/i.test(clean)) {
      inMayContain = true;
      continue;
    }
    if (/keine allergene|geen allergenen|enthält keine|bevat geen/i.test(clean)) continue;
    if (!clean || clean.length > 40) continue;
    if (inMayContain) mayContain.push(clean);
    else if (afterIngredientHeader) confirmed.push(clean);
  }
  return {
    confirmed: confirmed.map((text3) => ({
      text: text3,
      backgroundColor: ALLERGEN_CONFIRMED_BG,
      textColor: ALLERGEN_CONFIRMED_TEXT
    })),
    mayContain: mayContain.map((text3) => ({
      text: text3,
      backgroundColor: ALLERGEN_MAY_CONTAIN_BG,
      textColor: ALLERGEN_MAY_CONTAIN_TEXT
    }))
  };
}
var QUANTITY_ONLY_RE = /^\d+(?:[.,]\d+)?\s*(?:x\s*\d+(?:[.,]\d+)?\s*)?(?:g|kg|ml|cl|l|st|stk|stuk|stuks|st[üu]ck|pack|packs|portie|portion(?:en)?)\.?$/i;
function buildIngredientTileNameMap(rawPage) {
  const result = /* @__PURE__ */ new Map();
  function getMarkdowns(obj, acc) {
    if (!obj || typeof obj !== "object") return;
    if (Array.isArray(obj)) {
      obj.forEach((v) => getMarkdowns(v, acc));
      return;
    }
    const o = obj;
    if (typeof o.markdown === "string") acc.push(o.markdown);
    for (const v of Object.values(o)) getMarkdowns(v, acc);
  }
  function walk(obj, depth) {
    if (depth > 60 || !obj || typeof obj !== "object") return;
    if (Array.isArray(obj)) {
      obj.forEach((v) => walk(v, depth + 1));
      return;
    }
    const o = obj;
    if (o.type === "PML" && o.analytics && o.pml) {
      const ctxs = o.analytics.contexts ?? [];
      const productCtx = ctxs.find(
        (c) => typeof c === "object" && c !== null && typeof c.schema === "string" && c.schema.includes("/product/") && typeof c.data?.product_id === "string"
      );
      if (productCtx) {
        const productId = productCtx.data.product_id;
        const promotionLabel = extractPromotionLabel(ctxs)?.toLowerCase();
        const markdowns = [];
        getMarkdowns(o.pml, markdowns);
        const clean = markdowns.map(
          (t) => t.replace(/#\([^)]+\)/g, "").replace(/\*\*/g, "").replace(/\xa0/g, " ").trim()
        ).filter(Boolean);
        const name = clean.find(
          (t) => !/^[><%]/.test(t) && !/^-?\d+%/.test(t) && !/€/.test(t) && !/jetzt|nu\s+tijdelijk/i.test(t) && // A product name always contains letters. This rejects the tile's
          // quantity-stepper value ("1") and any other bare number.
          new RegExp("\\p{L}{2}", "u").test(t) && // Quantity lines ("500 g", "1 Stück", "2 x 400 ml") sit above the name
          // in the tile; without this they win and the real name is never used.
          !QUANTITY_ONLY_RE.test(t) && t.toLowerCase() !== promotionLabel
        );
        if (name && productId && !result.has(productId)) result.set(productId, name);
        return;
      }
    }
    for (const v of Object.values(o)) walk(v, depth + 1);
  }
  walk(rawPage, 0);
  return result;
}
function parseRecipeDetail(rawPage, recipeId) {
  const meta = findRecipeAnalyticsData(rawPage);
  const name = meta?.recipe_name ?? "";
  const portions = meta?.portions ?? 2;
  const imageId = extractImageId(rawPage);
  const tileMap = /* @__PURE__ */ new Map();
  collectSellingUnitMap(rawPage, tileMap);
  const tileNameByProductId = buildIngredientTileNameMap(rawPage);
  const tileNameByUnitId = /* @__PURE__ */ new Map();
  for (const unit of meta?.selling_units ?? []) {
    if (unit.ingredient_id) {
      const tileName = tileNameByProductId.get(unit.ingredient_id);
      if (tileName) tileNameByUnitId.set(unit.selling_unit_id, tileName);
    }
  }
  const recipeQtyMap = buildRecipeQuantityMap(rawPage, meta?.selling_units ?? []);
  const ingredients = [];
  const seen = /* @__PURE__ */ new Set();
  const seenIngredientIds = /* @__PURE__ */ new Set();
  for (const unit of meta?.selling_units ?? []) {
    if (!unit.selling_unit_id || seen.has(unit.selling_unit_id)) continue;
    if (unit.status !== "ACTIVE") continue;
    if (unit.ingredient_id && seenIngredientIds.has(unit.ingredient_id)) continue;
    seen.add(unit.selling_unit_id);
    if (unit.ingredient_id) seenIngredientIds.add(unit.ingredient_id);
    const tile = tileMap.get(unit.selling_unit_id);
    const recipeInfo = recipeQtyMap.get(unit.selling_unit_id) ?? null;
    const displayName = tileNameByUnitId.get(unit.selling_unit_id) ?? tile?.name ?? "";
    ingredients.push({
      id: unit.selling_unit_id,
      ingredientId: unit.ingredient_id ?? null,
      name: displayName,
      imageId: tile?.imageId ?? null,
      displayPrice: tile?.displayPrice ?? 0,
      unitQuantity: tile?.unitQuantity ?? "",
      maxCount: tile?.maxCount ?? 99,
      quantity: unit.quantity ?? 1,
      isCondiment: !unit.checked,
      nutritionRows: [],
      recipeQuantityText: recipeInfo?.neededText ?? null,
      recipePackageSize: recipeInfo?.packageSize ?? null,
      originalPrice: null,
      priceRanges: null
    });
  }
  const allMarkdowns = collectMarkdowns(rawPage);
  const steps = parseStepsFromMarkdowns(allMarkdowns);
  const stepsPortionWarning = parseStepsWarningFromMarkdowns(allMarkdowns);
  const recipeNutritionRows = parseNutritionFromMarkdowns(allMarkdowns);
  const allergens = parseAllergensFromMarkdowns(allMarkdowns);
  const cookingTimeMinutes = meta?.cooking_time_minutes != null ? meta.cooking_time_minutes : extractCookingTimeFromMarkdowns(allMarkdowns);
  return {
    id: recipeId,
    name: name || recipeId,
    imageId,
    cookingTimeMinutes,
    portions,
    ingredients,
    steps,
    stepsPortionWarning,
    recipeNutritionRows,
    allergens
  };
}

// vendor/picnic-web/src/lib/recipe/fetch-recipe-detail.ts
async function fetchRecipePage(client, id, portions) {
  const portionsParam = portions ? `&portions=${portions}` : "";
  try {
    return await fetchCachedPage(
      client,
      `/pages/selling-group-details-page?selling_group_id=${encodeURIComponent(id)}${portionsParam}`
    );
  } catch {
  }
  return fetchCachedPage(
    client,
    `/pages/recipe-details-page-root?recipe_id=${encodeURIComponent(id)}${portionsParam}`
  );
}
async function enrichIngredients(client, ingredients) {
  const uniqueIds = [...new Set(ingredients.map((i) => i.id))];
  const tileMap = /* @__PURE__ */ new Map();
  await mapWithConcurrency(
    uniqueIds,
    async (unitId) => {
      try {
        const rawPage = await fetchCachedPage(
          client,
          `/pages/product-details-page-root?id=${encodeURIComponent(unitId)}`
        );
        const tile = extractProductTileData(rawPage, unitId);
        const nutritionRows = extractProductNutritionRows(rawPage);
        if (tile.name) tileMap.set(unitId, { ...tile, nutritionRows });
      } catch {
      }
    },
    INGREDIENT_CONCURRENCY
  );
  return ingredients.map((ing) => {
    const data = tileMap.get(ing.id);
    if (!data) return ing;
    return {
      ...ing,
      // Keep the recipe-page tile name (short display name); fall back to product page name
      name: ing.name || data.name,
      imageId: data.imageId || ing.imageId,
      displayPrice: data.displayPrice ?? ing.displayPrice,
      unitQuantity: data.unitQuantity || ing.unitQuantity,
      maxCount: data.maxCount || ing.maxCount,
      nutritionRows: data.nutritionRows,
      originalPrice: data.originalPrice,
      priceRanges: data.priceRanges
    };
  });
}
async function fetchRecipeDetail(client, id, portions) {
  const rawPage = await fetchRecipePage(client, id, portions);
  const detail = parseRecipeDetail(rawPage, id);
  const ingredients = await enrichIngredients(
    client,
    detail.ingredients
  );
  return { ...detail, ingredients };
}

// src/shared/recipe-price.ts
function packs(ingredient, portions, basePortions) {
  if (basePortions <= 0) return Math.max(1, ingredient.quantity);
  return Math.max(1, Math.ceil(ingredient.quantity * portions / basePortions));
}
function packsPrice(ingredient, count) {
  const tier = ingredient.priceRanges?.filter((t) => t.quantity <= count).at(-1);
  const unit = tier ? tier.pricePerUnit : ingredient.displayPrice;
  const total = unit * count;
  const regular = tier ? ingredient.displayPrice * count : ingredient.originalPrice !== null ? ingredient.originalPrice * count : null;
  return { total, was: regular !== null && regular > total ? regular : null };
}
function recipePrice(recipe, portions = recipe.portions) {
  const main = recipe.ingredients.filter((i) => !i.isCondiment);
  const total = main.reduce((sum, ing) => sum + packsPrice(ing, packs(ing, portions, recipe.portions)).total, 0);
  return { total, perServing: portions > 0 ? Math.round(total / portions) : total, portions };
}

// src/server/demo/data.ts
var img = (name) => `demo-${name}`;
var INPUT = [
  { id: "s1001", name: "Volkoren tijgerbrood", price: 229, unit: "800 g", brand: "Picnic", words: ["brood", "tijger"], category: "brood" },
  { id: "s1002", name: "Spelt meergranen", price: 289, unit: "600 g", brand: "Bakkerij Bart", words: ["brood", "spelt"], category: "brood" },
  { id: "s1003", name: "Croissants", price: 249, unit: "4 stuks", brand: "Picnic", words: ["croissant", "brood"], category: "brood", was: 299, promo: "Actie" },
  { id: "s1004", name: "Tofu naturel", price: 179, unit: "375 g", brand: "Taifun", words: ["tofu", "vegan"], category: "vegan" },
  { id: "s1005", name: "Gerookte tofu", price: 219, unit: "200 g", brand: "Taifun", words: ["tofu", "vegan"], category: "vegan" },
  { id: "s1006", name: "Havermelk barista", price: 239, unit: "1 l", brand: "Oatly", words: ["havermelk", "melk", "vegan"], category: "vegan", bundle: [{ quantity: 2, pricePerUnit: 199 }] },
  { id: "s1007", name: "Sojayoghurt naturel", price: 199, unit: "500 g", brand: "Alpro", words: ["yoghurt", "vegan"], category: "vegan", unavailable: "Tijdelijk niet leverbaar" },
  { id: "s1008", name: "Halfvolle melk", price: 125, unit: "1 l", brand: "Picnic", words: ["melk", "zuivel"], category: "zuivel" },
  { id: "s1009", name: "Griekse yoghurt", price: 259, unit: "1 kg", brand: "Mona", words: ["yoghurt", "zuivel"], category: "zuivel" },
  { id: "s1010", name: "Jong belegen kaas plakken", price: 319, unit: "300 g", brand: "Picnic", words: ["kaas", "zuivel"], category: "zuivel" },
  { id: "s1011", name: "Bananen", price: 159, unit: "5 stuks", prefix: "Bio", words: ["banaan", "bananen", "fruit"], category: "fruit" },
  { id: "s1012", name: "Elstar appels", price: 249, unit: "1 kg", words: ["appel", "appels", "fruit"], category: "fruit" },
  { id: "s1013", name: "Cherrytomaten", price: 199, unit: "250 g", words: ["tomaat", "tomaten", "groente"], category: "groente" },
  { id: "s1014", name: "Tomatenblokjes", price: 89, unit: "400 g", brand: "Mutti", words: ["tomaat", "tomaten", "tomatenblokjes"], category: "groente", bundle: [{ quantity: 3, pricePerUnit: 75 }] },
  { id: "s1015", name: "Rode ui", price: 99, unit: "500 g", words: ["ui", "uien", "groente"], category: "groente" },
  { id: "s1016", name: "Knoflook", price: 79, unit: "3 bollen", words: ["knoflook", "groente"], category: "groente" },
  { id: "s1017", name: "Spinazie", price: 179, unit: "300 g", words: ["spinazie", "groente"], category: "groente" },
  { id: "s1018", name: "Penne rigate", price: 139, unit: "500 g", brand: "De Cecco", words: ["pasta", "penne"], category: "voorraad" },
  { id: "s1019", name: "Rode linzen", price: 189, unit: "400 g", brand: "Picnic", words: ["linzen", "vegan"], category: "voorraad" },
  { id: "s1020", name: "Kokosmelk", price: 149, unit: "400 ml", brand: "Go-Tan", words: ["kokos", "kokosmelk"], category: "voorraad" },
  { id: "s1021", name: "Olijfolie extra vierge", price: 699, unit: "500 ml", brand: "Bertolli", words: ["olie", "olijfolie"], category: "voorraad" },
  { id: "s1022", name: "Zeezout", price: 99, unit: "250 g", words: ["zout"], category: "voorraad" },
  { id: "s1023", name: "Currypasta geel", price: 229, unit: "110 g", brand: "Go-Tan", words: ["curry", "currypasta"], category: "voorraad" },
  { id: "s1024", name: "Koffiebonen espresso", price: 899, unit: "1 kg", brand: "Lavazza", words: ["koffie", "bonen"], category: "koffie", was: 1099, promo: "18% korting" },
  { id: "s1025", name: "Basmatirijst", price: 219, unit: "1 kg", brand: "Lassie", words: ["rijst", "basmati"], category: "voorraad" },
  { id: "s1026", name: "Verse koriander", price: 99, unit: "30 g", words: ["koriander", "kruiden"], category: "groente" }
];
var PRODUCTS = INPUT.map((p) => ({
  id: p.id,
  name: p.name,
  namePrefix: p.prefix ?? null,
  subtitle: null,
  subtitleColor: null,
  subtitleLeadingIcon: null,
  subtitleTrailingIcon: null,
  brand: p.brand ?? null,
  highlight: p.id === "s1001" ? { text: "Prijskampioen", color: "#B40117" } : null,
  flagIconKey: null,
  flagFallbackImageId: null,
  imageId: img(p.id),
  displayPrice: p.price,
  originalPrice: p.was ?? null,
  // Picnic colours offer prices red, chosen for its white app; the dark theme must cope.
  displayPriceColor: p.was ? "#B40117" : null,
  unitQuantity: p.unit,
  maxCount: p.max ?? 99,
  priceRanges: p.bundle ?? null,
  badges: [],
  promoBadge: p.promo ? { text: p.promo, variant: "promo" } : null,
  promoPlacement: p.promo ? "image" : null,
  isUnavailable: Boolean(p.unavailable),
  unavailableReason: p.unavailable ?? null,
  words: p.words,
  category: p.category
}));
var productById = (id) => PRODUCTS.find((p) => p.id === id) ?? null;
var plainProduct = ({ words: _w, category: _c, ...product }) => product;
var NUTRITION = [
  { label: "Energie", value: "1050 kJ / 250 kcal", isCategory: true, backgroundColor: null },
  { label: "Vet", value: "3,1 g", isCategory: true, backgroundColor: "#f5f1ec" },
  { label: "waarvan verzadigd", value: "0,6 g", isCategory: false, backgroundColor: null },
  { label: "Koolhydraten", value: "41 g", isCategory: true, backgroundColor: "#f5f1ec" },
  { label: "waarvan suikers", value: "3,5 g", isCategory: false, backgroundColor: null },
  { label: "Eiwitten", value: "11 g", isCategory: true, backgroundColor: "#f5f1ec" },
  { label: "Zout", value: "1,0 g", isCategory: true, backgroundColor: null }
];
var ALLERGENS = {
  brood: {
    confirmed: [{ text: "Gluten", backgroundColor: "#b40117", textColor: "#ffffff" }],
    mayContain: [{ text: "Sesam", backgroundColor: "#fbd92b", textColor: "#333333" }]
  },
  vegan: {
    confirmed: [{ text: "Soja", backgroundColor: "#b40117", textColor: "#ffffff" }],
    mayContain: []
  },
  zuivel: {
    confirmed: [{ text: "Melk", backgroundColor: "#b40117", textColor: "#ffffff" }],
    mayContain: []
  }
};
function productDetail(id) {
  const product = productById(id);
  if (!product) return null;
  const similar = PRODUCTS.filter((p) => p.category === product.category && p.id !== id).slice(0, 6);
  return {
    id: product.id,
    name: product.name,
    brand: product.brand ?? "",
    unitQuantity: product.unitQuantity,
    unitPrice: `€${(product.displayPrice / 100 * 1.5).toFixed(2).replace(".", ",")}/kg`,
    categoryTag: { text: product.category[0].toUpperCase() + product.category.slice(1), color: "#295813" },
    displayPrice: product.displayPrice,
    originalPrice: product.originalPrice,
    displayPriceColor: null,
    maxCount: product.maxCount,
    imageIds: [product.imageId, img(`${product.id}-back`)],
    labels: product.namePrefix ? [{ text: "Biologisch", textColor: "#ffffff", backgroundColor: "#4B8505" }] : [],
    description: `**${product.name}** uit de demowinkel. Alles op deze pagina is verzonnen om Picnic Desk te laten zien.`,
    highlights: [
      { text: "**Nederlands** product", iconKey: "pin", linkTarget: null },
      { text: "Lang houdbaar", iconKey: "starsOutlined", linkTarget: null }
    ],
    allergens: ALLERGENS[product.category] ?? { confirmed: [], mayContain: [] },
    infoSections: [
      { title: "Ingrediënten", content: `${product.name.toLowerCase()} (98%), zout, **gist**.` },
      { title: "Voedingswaarde", content: "per 100 g" },
      { title: "Bewaren", content: "Koel en droog bewaren. Na openen binnen 3 dagen gebruiken." }
    ],
    promotion: product.promoBadge ? { id: "promo-1", label: product.promoBadge.text } : null,
    bundles: (product.priceRanges ?? []).map((tier, i) => ({
      id: `${product.id}-b${i}`,
      quantity: tier.quantity,
      pricePerUnit: tier.pricePerUnit,
      imageId: product.imageId,
      maxCount: product.maxCount
    })),
    similarProducts: similar.map((p) => ({
      id: p.id,
      name: p.name,
      imageId: p.imageId,
      displayPrice: p.displayPrice,
      unitQuantity: p.unitQuantity,
      maxCount: p.maxCount
    })),
    nutritionRows: NUTRITION
  };
}
var L1_CATEGORIES = [
  {
    id: "21001",
    name: "Brood & ontbijt",
    children: [
      { id: "22001", name: "Brood", imageId: img("cat-brood"), deepLinkTarget: "app.picnic://store/page;id=L2-category-page-root,category_id=22001" },
      { id: "22002", name: "Croissants & koffiebroodjes", imageId: img("cat-croissant"), deepLinkTarget: "app.picnic://store/page;id=L2-category-page-root,category_id=22002" }
    ]
  },
  {
    id: "21002",
    name: "Vegetarisch & vegan",
    children: [
      { id: "22003", name: "Tofu & tempeh", imageId: img("cat-tofu"), deepLinkTarget: "app.picnic://store/page;id=L2-category-page-root,category_id=22003" },
      { id: "22004", name: "Plantaardige zuivel", imageId: img("cat-plantmelk"), deepLinkTarget: "app.picnic://store/page;id=L2-category-page-root,category_id=22004" }
    ]
  },
  {
    id: "21003",
    name: "Groente & fruit",
    children: [
      { id: "22005", name: "Groente", imageId: img("cat-groente"), deepLinkTarget: "app.picnic://store/page;id=L2-category-page-root,category_id=22005" },
      { id: "22006", name: "Fruit", imageId: img("cat-fruit"), deepLinkTarget: "app.picnic://store/page;id=L2-category-page-root,category_id=22006" }
    ]
  },
  {
    id: "21004",
    name: "Zuivel & kaas",
    children: [{ id: "22007", name: "Melk & yoghurt", imageId: img("cat-zuivel"), deepLinkTarget: "app.picnic://store/page;id=L2-category-page-root,category_id=22007" }]
  },
  {
    id: "21005",
    name: "Voorraadkast",
    children: [
      { id: "22008", name: "Pasta, rijst & wereldkeuken", imageId: img("cat-pasta"), deepLinkTarget: "app.picnic://store/page;id=L2-category-page-root,category_id=22008" },
      { id: "22009", name: "Koffie", imageId: img("cat-koffie"), deepLinkTarget: "app.picnic://store/page;id=L2-category-page-root,category_id=22009" }
    ]
  }
];
var L2_PRODUCTS = {
  "22001": ["s1001", "s1002"],
  "22002": ["s1003"],
  "22003": ["s1004", "s1005"],
  "22004": ["s1006", "s1007"],
  "22005": ["s1013", "s1014", "s1015", "s1016", "s1017", "s1026"],
  "22006": ["s1011", "s1012"],
  "22007": ["s1008", "s1009", "s1010"],
  "22008": ["s1018", "s1019", "s1020", "s1021", "s1022", "s1023", "s1025"],
  "22009": ["s1024"]
};
var RECIPE_CATEGORIES = [
  { id: "recipe-cattree-vegan", name: "Vegan" },
  { id: "recipe-cattree-25min", name: "Snel klaar" },
  { id: "recipe-cattree-pasta", name: "Pasta" }
];
var slot = (n) => `0000000${n}-0000-4000-8000-00000000000${n}`.slice(-36);
var RECIPES = [
  {
    id: "64a000000000000000000001",
    name: "Rode linzencurry met spinazie",
    minutes: 30,
    portions: 2,
    categories: ["recipe-cattree-vegan", "recipe-cattree-25min"],
    ingredients: [
      { product: "s1019", slot: slot(1), quantity: 1, text: "200 g" },
      { product: "s1020", slot: slot(2), quantity: 1, text: "400 ml" },
      { product: "s1017", slot: slot(3), quantity: 1, text: "300 g" },
      { product: "s1015", slot: slot(4), quantity: 1, text: "1 stuk" },
      { product: "s1023", slot: slot(5), quantity: 1, text: "2 el" },
      { product: "s1025", slot: slot(6), quantity: 1, text: "150 g" },
      { product: "s1021", slot: slot(7), quantity: 1, text: "1 el", condiment: true },
      { product: "s1022", slot: slot(8), quantity: 1, text: "snufje", condiment: true }
    ],
    steps: [
      "Snipper de **ui** en fruit hem in de olie.",
      "Voeg de **currypasta** en de **linzen** toe en bak 1 minuut mee.",
      "Schenk de **kokosmelk** en 200 ml water erbij en laat 15 minuten zacht koken.",
      "Roer de **spinazie** erdoor en serveer met rijst."
    ]
  },
  {
    id: "64a000000000000000000002",
    name: "Penne met tomaat en gerookte tofu",
    minutes: 20,
    portions: 2,
    categories: ["recipe-cattree-vegan", "recipe-cattree-25min", "recipe-cattree-pasta"],
    ingredients: [
      { product: "s1018", slot: slot(1), quantity: 1, text: "250 g" },
      { product: "s1014", slot: slot(2), quantity: 1, text: "400 g" },
      { product: "s1005", slot: slot(3), quantity: 1, text: "200 g" },
      { product: "s1016", slot: slot(4), quantity: 1, text: "2 tenen" },
      { product: "s1013", slot: slot(5), quantity: 1, text: "125 g" },
      { product: "s1021", slot: slot(6), quantity: 1, text: "2 el", condiment: true }
    ],
    steps: ["Kook de **penne**.", "Bak de **tofu** krokant.", "Voeg de **tomaten** en knoflook toe en meng met de pasta."]
  },
  {
    id: "64a000000000000000000003",
    name: "Tomatensoep met croissant",
    minutes: 35,
    portions: 4,
    categories: ["recipe-cattree-vegan"],
    ingredients: [
      { product: "s1014", slot: slot(1), quantity: 2, text: "800 g" },
      { product: "s1015", slot: slot(2), quantity: 1, text: "1 stuk" },
      { product: "s1003", slot: slot(3), quantity: 1, text: "4 stuks" },
      { product: "s1026", slot: slot(4), quantity: 1, text: "handje" }
    ],
    steps: ["Fruit de ui.", "Voeg de tomaten toe en laat 20 minuten trekken.", "Pureer en serveer met croissants."]
  }
];
var recipeById = (id) => RECIPES.find((r) => r.id === id) ?? null;
function recipeIngredients(recipe, portions) {
  return recipe.ingredients.map((ing) => {
    const product = productById(ing.product);
    return {
      id: product.id,
      ingredientId: ing.slot,
      name: product.name,
      imageId: product.imageId,
      displayPrice: product.displayPrice,
      unitQuantity: product.unitQuantity,
      maxCount: product.maxCount,
      quantity: Math.max(1, Math.ceil(ing.quantity * portions / recipe.portions)),
      isCondiment: Boolean(ing.condiment),
      nutritionRows: [],
      recipeQuantityText: ing.text,
      recipePackageSize: product.unitQuantity,
      originalPrice: product.originalPrice,
      priceRanges: product.priceRanges
    };
  });
}

// src/server/desk-routes.ts
import { join as join3 } from "node:path";

// src/server/pictures.ts
import { mkdirSync, readdirSync, statSync } from "node:fs";
import { readFile, rename, rm, utimes, writeFile } from "node:fs/promises";
import { join } from "node:path";
var IMAGE_ID = /^(?:[a-z][a-z0-9_-]{1,30}\/)?[A-Za-z0-9_-]{8,128}$/;
var PRODUCT_VARIANTS = ["medium.png", "padded.webp", "small.png", "large.png", "tile-medium.webp", "regular.png"];
var RECIPE_VARIANTS = ["filled-600x600.webp", "large.png", "medium.png", "padded.webp"];
var DEFAULT_CACHE_MB = 500;
var MISSING_FOR_MS = 10 * 60 * 1e3;
var TROUBLE_FOR_MS = 60 * 1e3;
var RETRY_STATUSES = /* @__PURE__ */ new Set([429, 500, 502, 503, 504]);
var ABSENT_STATUSES = /* @__PURE__ */ new Set([400, 403, 404, 410]);
var MAX_PICTURE_BYTES = 8 * 1024 * 1024;
var AT_ONCE = 6;
var AFTER_EVICTION = 0.9;
var TOUCH_EVERY_MS = 60 * 60 * 1e3;
var TYPES = {
  png: "image/png",
  jpg: "image/jpeg",
  webp: "image/webp",
  avif: "image/avif",
  gif: "image/gif"
};
var EXTENSIONS = Object.fromEntries(Object.entries(TYPES).map(([ext, type]) => [type, ext]));
function pictureType(data) {
  if (data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return "image/png";
  if (data[0] === 255 && data[1] === 216 && data[2] === 255) return "image/jpeg";
  if (data.subarray(0, 4).toString("latin1") === "RIFF" && data.subarray(8, 12).toString("latin1") === "WEBP")
    return "image/webp";
  const brand = data.subarray(4, 12).toString("latin1");
  if (brand === "ftypavif" || brand === "ftypavis") return "image/avif";
  const head = data.subarray(0, 6).toString("latin1");
  if (head === "GIF87a" || head === "GIF89a") return "image/gif";
  return null;
}
var NOT_A_PICTURE = /* @__PURE__ */ new Set(["empty", "not a picture", "too large"]);
async function readLimited(response, max) {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > max) {
    response.body?.cancel().catch(() => void 0);
    return null;
  }
  if (!response.body) return Buffer.alloc(0);
  const chunks = [];
  let size = 0;
  const reader = response.body.getReader();
  for (; ; ) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      reader.cancel().catch(() => void 0);
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}
var Pictures = class {
  #dir;
  #maxBytes;
  #fetch;
  #now;
  #pause;
  /** What is on disk, by key; Map order is not relied on, `used` is. */
  #entries = /* @__PURE__ */ new Map();
  #bytes = 0;
  #missing = /* @__PURE__ */ new Map();
  #loading = /* @__PURE__ */ new Map();
  #running = 0;
  #queue = [];
  #writeTrouble = false;
  worked = /* @__PURE__ */ new Map();
  failures = [];
  constructor(options = {}) {
    this.#fetch = options.fetch ?? ((...args) => fetch(...args));
    this.#now = options.now ?? Date.now;
    this.#pause = options.pause ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.#maxBytes = options.maxBytes ?? DEFAULT_CACHE_MB * 1024 * 1024;
    this.#dir = options.dir ?? null;
    if (this.#dir) this.#scan(this.#dir);
  }
  /** How much is kept: for the self-check. */
  get stored() {
    return { count: this.#entries.size, bytes: this.#bytes, maxBytes: this.#maxBytes, enabled: this.#dir !== null };
  }
  variants(kind) {
    const base = kind === "recipe" ? RECIPE_VARIANTS : PRODUCT_VARIANTS;
    return [...base].sort((a, b) => (this.worked.get(b) ?? 0) - (this.worked.get(a) ?? 0));
  }
  /**
   * The picture from disk, or from Picnic when it is not there yet. `fresh`
   * asks Picnic even so (the self-check uses it to test Picnic itself).
   */
  async load(id, kind, country, fresh = false) {
    if (!IMAGE_ID.test(id)) return { picture: null, tried: [] };
    const key = `${country}/${kind}/${encodeURIComponent(id)}`;
    if (!fresh) {
      const kept = await this.#read(key);
      if (kept) return { picture: kept, tried: [], from: "disk" };
      if ((this.#missing.get(key) ?? 0) > this.#now()) return { picture: null, tried: [] };
    }
    const running = this.#loading.get(key);
    if (running) return running;
    const loading = this.#limit(() => this.#fromPicnic(key, id, kind, country)).finally(() => this.#loading.delete(key));
    this.#loading.set(key, loading);
    return loading;
  }
  /** Forget which pictures were missing, so they are asked again. Kept pictures stay. */
  forget() {
    this.#missing.clear();
  }
  // ─── Picnic ────────────────────────────────────────────────────────────────
  async #fromPicnic(key, id, kind, country) {
    const tried = [];
    let trouble = false;
    for (const variant of this.variants(kind)) {
      const outcome = await this.#get(`${getImageCdnBase(country)}/${id}/${variant}`);
      tried.push({ variant, outcome: typeof outcome === "object" ? 200 : outcome });
      if (typeof outcome === "object") {
        this.worked.set(variant, (this.worked.get(variant) ?? 0) + 1);
        this.#missing.delete(key);
        await this.#write(key, outcome.data, outcome.type);
        return { picture: { ...outcome, variant }, tried, from: "picnic" };
      }
      if (typeof outcome === "number" ? !ABSENT_STATUSES.has(outcome) : !NOT_A_PICTURE.has(outcome)) {
        trouble = true;
        break;
      }
    }
    this.#missing.set(key, this.#now() + (trouble ? TROUBLE_FOR_MS : MISSING_FOR_MS));
    if (this.#missing.size > 5e3) this.#missing.clear();
    this.failures.push({ id, tried });
    if (this.failures.length > 40) this.failures.shift();
    return { picture: null, tried };
  }
  async #get(url) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      let response;
      try {
        response = await this.#fetch(url, { headers: { "User-Agent": "okhttp/4.9.0" } });
      } catch (error2) {
        return error2 instanceof Error ? error2.name : "network";
      }
      if (response.ok) {
        let data;
        try {
          data = await readLimited(response, MAX_PICTURE_BYTES);
        } catch (error2) {
          return error2 instanceof Error ? error2.name : "cut off";
        }
        if (data === null) return "too large";
        if (data.length === 0) return "empty";
        const type = pictureType(data);
        return type ? { data, type } : "not a picture";
      }
      response.body?.cancel().catch(() => void 0);
      if (attempt === 1 && RETRY_STATUSES.has(response.status)) {
        await this.#pause(600);
        continue;
      }
      return response.status;
    }
    return "no answer";
  }
  /** A shelf of 60 new products should not become 60 requests to Picnic at once. */
  async #limit(job) {
    if (this.#running >= AT_ONCE) await new Promise((resolve) => this.#queue.push(resolve));
    this.#running++;
    try {
      return await job();
    } finally {
      this.#running--;
      this.#queue.shift()?.();
    }
  }
  // ─── Disk ──────────────────────────────────────────────────────────────────
  /** What is already in the folder, from an earlier run. */
  #scan(dir) {
    try {
      mkdirSync(dir, { recursive: true });
      for (const country of readdirSync(dir)) {
        if (!/^[A-Z]{2}$/.test(country)) continue;
        for (const kind of ["product", "recipe"]) {
          let names;
          try {
            names = readdirSync(join(dir, country, kind));
          } catch {
            continue;
          }
          for (const name of names) {
            const match = /^(.+)\.([a-z]+)$/.exec(name);
            const file = join(dir, country, kind, name);
            if (!match || !TYPES[match[2]]) {
              void rm(file, { force: true }).catch(() => void 0);
              continue;
            }
            const key = `${country}/${kind}/${match[1]}`;
            let stat;
            try {
              stat = statSync(file);
            } catch {
              continue;
            }
            const used = stat.mtimeMs;
            const twin = this.#entries.get(key);
            if (twin) {
              this.#drop(key);
              void rm(twin.file, { force: true }).catch(() => void 0);
            }
            this.#entries.set(key, { file, size: stat.size, used, touched: used });
            this.#bytes += stat.size;
          }
        }
      }
    } catch (error2) {
      console.error("[pictures] cannot use the picture folder:", error2 instanceof Error ? error2.message : error2);
    }
    void this.#evict();
  }
  async #read(key) {
    const entry = this.#entries.get(key);
    if (!entry) return null;
    let data;
    try {
      data = await readFile(entry.file);
    } catch {
      this.#drop(key);
      return null;
    }
    const type = pictureType(data);
    if (!type) {
      this.#drop(key);
      void rm(entry.file, { force: true }).catch(() => void 0);
      return null;
    }
    const now = this.#now();
    entry.used = now;
    if (now - entry.touched > TOUCH_EVERY_MS) {
      entry.touched = now;
      void utimes(entry.file, new Date(now), new Date(now)).catch(() => void 0);
    }
    return { data, type, variant: "kept" };
  }
  async #write(key, data, type) {
    if (!this.#dir || data.length > this.#maxBytes) return;
    const ext = EXTENSIONS[type];
    const [country, kind, name] = key.split("/");
    const folder = join(this.#dir, country, kind);
    const file = join(folder, `${name}.${ext}`);
    const temporary = `${file}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`;
    try {
      mkdirSync(folder, { recursive: true });
      await writeFile(temporary, data);
      await rename(temporary, file);
      const old = this.#entries.get(key);
      if (old) {
        this.#bytes -= old.size;
        if (old.file !== file) void rm(old.file, { force: true }).catch(() => void 0);
      }
      const now = this.#now();
      this.#entries.set(key, { file, size: data.length, used: now, touched: now });
      this.#bytes += data.length;
      this.#writeTrouble = false;
    } catch (error2) {
      void rm(temporary, { force: true }).catch(() => void 0);
      if (!this.#writeTrouble) console.error("[pictures] cannot keep a picture:", error2 instanceof Error ? error2.message : error2);
      this.#writeTrouble = true;
      return;
    }
    await this.#evict();
  }
  #drop(key) {
    const entry = this.#entries.get(key);
    if (!entry) return;
    this.#entries.delete(key);
    this.#bytes -= entry.size;
  }
  async #evict() {
    if (this.#bytes <= this.#maxBytes) return;
    const oldestFirst = [...this.#entries].sort((a, b) => a[1].used - b[1].used);
    for (const [key, entry] of oldestFirst) {
      if (this.#bytes <= this.#maxBytes * AFTER_EVICTION) break;
      this.#drop(key);
      await rm(entry.file, { force: true }).catch(() => void 0);
    }
  }
};

// src/server/store.ts
import { closeSync, fsyncSync, mkdirSync as mkdirSync2, openSync, readFileSync, renameSync, rmSync, writeSync } from "node:fs";
import { join as join2 } from "node:path";
var SOON_MS = 3e3;
var Store = class {
  constructor(dir) {
    this.dir = dir;
    mkdirSync2(dir, { recursive: true, mode: 448 });
  }
  dir;
  #soon = /* @__PURE__ */ new Map();
  #timer = null;
  #readFile(name, fallback, check) {
    try {
      const value = JSON.parse(readFileSync(join2(this.dir, name), "utf8"));
      return check(value) ? value : fallback;
    } catch {
      return fallback;
    }
  }
  read(name, fallback, check) {
    if (this.#soon.has(name)) {
      const value = this.#soon.get(name);
      return check(value) ? value : fallback;
    }
    return this.#readFile(name, fallback, check);
  }
  write(name, value, { durable = true } = {}) {
    this.#soon.delete(name);
    const path = join2(this.dir, name);
    const temporary = `${path}.${process.pid}.tmp`;
    const fd = openSync(temporary, "w", 384);
    try {
      writeSync(fd, durable ? JSON.stringify(value, null, 1) : JSON.stringify(value));
      if (durable) fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    renameSync(temporary, path);
  }
  /** Write a cache a little later; several changes in a row become one write. */
  writeSoon(name, value) {
    this.#soon.set(name, value);
    if (this.#timer) return;
    this.#timer = setTimeout(() => this.flush(), SOON_MS);
    this.#timer.unref();
  }
  /** Write what is waiting now (when stopping). */
  flush() {
    if (this.#timer) clearTimeout(this.#timer);
    this.#timer = null;
    const waiting = [...this.#soon];
    this.#soon.clear();
    for (const [name, value] of waiting) {
      try {
        this.write(name, value, { durable: false });
      } catch (error2) {
        console.error(`[store] cannot write ${name}:`, error2 instanceof Error ? error2.message : error2);
      }
    }
  }
  remove(name) {
    this.#soon.delete(name);
    rmSync(join2(this.dir, name), { force: true });
  }
};
var isObject = (value) => typeof value === "object" && value !== null && !Array.isArray(value);

// src/server/desk-routes.ts
var LANGUAGES = ["en", "nl", "de", "fr"];
var SAVED_MAX = 500;
var LISTS_MAX = 30;
var LIST_ITEMS_MAX = 200;
var LIST_ID = /^[a-z0-9-]{1,40}$/;
var PICKS_MAX = 500;
var SHORTCUTS_MAX = 24;
var HISTORY_DELIVERIES = 10;
var HISTORY_MAX_AGE_MS = 12 * 60 * 60 * 1e3;
var RECIPE_ID = /^[0-9a-f]{24}$/;
var RECIPE_PRICE_MAX_AGE_MS = 24 * 60 * 60 * 1e3;
var RECIPE_PRICES_MAX = 2e3;
var RECIPE_PRICE_PARALLEL = 2;
var SELF_CHECK_WORD = { NL: "melk", DE: "milch", FR: "lait" };
var PAGE_ID = /^[A-Za-z0-9_.-]{1,80}(\?[A-Za-z0-9_=&.%-]{0,200})?$/;
var DEFAULT_SHORTCUTS = {
  NL: [
    { label: "Brood", query: "brood" },
    { label: "Vegan", query: "vegan" },
    { label: "Groente", query: "groente" },
    { label: "Fruit", query: "fruit" },
    { label: "Zuivel", query: "zuivel" },
    { label: "Koffie", query: "koffie" }
  ],
  DE: [
    { label: "Brot", query: "brot" },
    { label: "Vegan", query: "vegan" },
    { label: "Gemüse", query: "gemüse" },
    { label: "Obst", query: "obst" },
    { label: "Milchprodukte", query: "milch" },
    { label: "Kaffee", query: "kaffee" }
  ],
  FR: [
    { label: "Pain", query: "pain" },
    { label: "Vegan", query: "vegan" },
    { label: "Légumes", query: "légumes" },
    { label: "Fruits", query: "fruits" },
    { label: "Produits laitiers", query: "lait" },
    { label: "Café", query: "café" }
  ]
};
var text = (value, max) => typeof value === "string" && value.trim().length > 0 && value.length <= max;
var isSavedProduct = (value) => isObject(value) && text(value.id, 100) && text(value.name, 300) && typeof value.imageId === "string" && value.imageId.length <= 200 && typeof value.unitQuantity === "string" && value.unitQuantity.length <= 100 && typeof value.displayPrice === "number" && Number.isFinite(value.displayPrice);
function fromOldSaved(value) {
  if (!isObject(value) || "displayPrice" in value || typeof value.id !== "string") return value;
  return {
    id: value.id,
    name: value.name,
    imageId: typeof value.image === "string" ? value.image : "",
    unitQuantity: typeof value.unit === "string" ? value.unit : "",
    displayPrice: typeof value.price === "number" ? value.price : 0
  };
}
function savedSnapshot(product) {
  const snapshot = {
    id: product.id,
    name: product.name,
    imageId: product.imageId ?? "",
    unitQuantity: product.unitQuantity ?? "",
    displayPrice: product.displayPrice
  };
  return isSavedProduct(snapshot) ? snapshot : null;
}
var isListItem = (value) => isObject(value) && isObject(value.product) && savedSnapshot(value.product) !== null && Number.isInteger(value.count) && value.count >= 1 && value.count <= 99 && Number.isInteger(value.maxCount) && value.maxCount >= 1 && value.maxCount <= 999;
var snapshotItem = (item) => ({
  product: savedSnapshot(item.product),
  count: Math.min(item.count, item.maxCount),
  maxCount: item.maxCount
});
var isShoppingList = (value) => isObject(value) && typeof value.id === "string" && LIST_ID.test(value.id) && text(value.name, 60) && typeof value.updatedAt === "string" && value.updatedAt.length <= 40 && Array.isArray(value.items) && value.items.length <= LIST_ITEMS_MAX && value.items.every(isListItem);
function pickTerm(words) {
  return words.trim().toLowerCase().replace(/\s+/g, " ").slice(0, 100);
}
var isShortcut = (value) => isObject(value) && text(value.label, 40) && text(value.query, 100);
var isHistory = (value) => isObject(value) && typeof value.builtAt === "string" && Array.isArray(value.items);
var error = (message, status) => NextResponse.json({ error: message }, { status });
var signedOut = () => NextResponse.json({ error: "Sign in to Picnic first.", code: "TOKEN_EXPIRED" }, { status: 401 });
var DeskRoutes = class {
  constructor(desk) {
    this.desk = desk;
    this.pictures = new Pictures({
      // The demo shop draws its own pictures and keeps none.
      dir: desk.options.demo ? void 0 : join3(desk.options.dataDir, "picture-cache"),
      maxBytes: (desk.options.pictureCacheMb ?? DEFAULT_CACHE_MB) * 1024 * 1024,
      now: desk.options.now
    });
  }
  desk;
  pictures;
  #historyBuild = null;
  /**
   * Goes up when the account changes. Work started for the old account
   * (bought before, recipe prices) checks it before keeping its result, so
   * nothing of one account is written after signing out of it.
   */
  #account = 0;
  async handle(request, segments, user = null) {
    const route = `${request.method} ${segments.join("/")}`;
    switch (route) {
      case "GET state":
        return NextResponse.json(this.state(user));
      case "POST code":
        return this.#resendCode(request);
      case "GET image":
        return this.#image(request);
      case "GET saved":
        return NextResponse.json({ products: this.saved() });
      case "POST saved":
        return this.#toggleSaved(request);
      case "GET shortcuts":
        return NextResponse.json({ shortcuts: this.shortcuts() });
      case "PUT shortcuts":
        return this.#setShortcuts(request);
      case "GET history":
        return this.#history(request);
      case "GET selfcheck":
        return this.#selfcheck();
      case "GET raw":
        return this.#raw(request);
      case "GET recipe-price":
        return this.#recipePrice(request);
      case "GET lists":
        return NextResponse.json({ lists: this.lists() });
      case "PUT lists":
        return this.#setLists(request);
      case "GET picks":
        return NextResponse.json({ picks: this.picks() });
      case "PUT picks":
        return this.#setPick(request);
      case "DELETE payment":
        if (this.desk.payments.open?.gaveUp) this.desk.payments.forget();
        return NextResponse.json({ payment: this.desk.payments.open });
    }
    const known = ["state", "code", "image", "saved", "shortcuts", "history", "selfcheck", "raw", "recipe-price", "lists", "picks", "payment"];
    return known.includes(segments.join("/")) ? error("Method not allowed.", 405) : error("Not found.", 404);
  }
  state(user = null) {
    const { session } = this.desk;
    if (!this.desk.mayUse(user)) {
      return {
        notYours: true,
        signedIn: false,
        expired: false,
        awaitingCode: false,
        country: session.country,
        language: this.desk.options.language,
        demo: Boolean(this.desk.options.demo),
        version: this.desk.options.version,
        payment: null
      };
    }
    return {
      notYours: false,
      signedIn: session.signedIn && !this.desk.expired,
      expired: session.signedIn && this.desk.expired,
      awaitingCode: session.partialToken() !== null,
      country: session.country,
      language: this.desk.options.language,
      demo: Boolean(this.desk.options.demo),
      version: this.desk.options.version,
      payment: session.signedIn ? this.desk.payments.open : null
    };
  }
  // ─── Sign-in ──────────────────────────────────────────────────────────────
  async #resendCode(request) {
    const body = await request.json().catch(() => null);
    const channel = isObject(body) ? body.channel : void 0;
    if (channel !== "SMS" && channel !== "EMAIL") return error("channel must be SMS or EMAIL", 400);
    const partial = this.desk.session.partialToken();
    if (!partial) return error("Start signing in again: the verification step has expired.", 409);
    if (this.desk.options.demo) return NextResponse.json({ sent: channel });
    try {
      await buildPicnicClient(partial, this.desk.session.country).auth.generate2FACode(channel);
      return NextResponse.json({ sent: channel });
    } catch (err) {
      console.error("[/api/desk/code] Failed:", err instanceof Error ? err.message : err);
      return error("Picnic did not send a code. Please try again in a minute.", 502);
    }
  }
  // ─── Pictures ─────────────────────────────────────────────────────────────
  async #image(request) {
    const id = request.nextUrl.searchParams.get("id") ?? "";
    const kind = request.nextUrl.searchParams.get("kind") === "recipe" ? "recipe" : "product";
    const { picture } = this.desk.options.demo ? { picture: demoPicture(id) } : await this.pictures.load(id, kind, this.desk.session.country);
    if (!picture) return new NextResponse(null, { status: 404, headers: { "cache-control": "no-store" } });
    return new NextResponse(new Uint8Array(picture.data), {
      headers: {
        "content-type": picture.type,
        // The browser may keep it too; a picture's id stays with that picture.
        "cache-control": "private, max-age=2592000",
        "content-security-policy": "default-src 'none'"
      }
    });
  }
  // ─── Starred products ─────────────────────────────────────────────────────
  saved() {
    const list = this.desk.store.read("saved.json", [], (v) => Array.isArray(v));
    return list.map(fromOldSaved).filter(isSavedProduct);
  }
  async #toggleSaved(request) {
    const body = await request.json().catch(() => null);
    const product = isObject(body) ? body.product : void 0;
    if (!isObject(product)) return error("product is required", 400);
    const snapshot = savedSnapshot(product);
    if (!snapshot) return error("product needs id, name and displayPrice", 400);
    const saved = this.saved();
    const at = saved.findIndex((p) => p.id === snapshot.id);
    if (at >= 0) saved.splice(at, 1);
    else saved.unshift(snapshot);
    this.desk.store.write("saved.json", saved.slice(0, SAVED_MAX));
    return NextResponse.json({ products: saved.slice(0, SAVED_MAX), saved: at < 0 });
  }
  // ─── Lists ────────────────────────────────────────────────────────────────
  lists() {
    const raw = this.desk.store.read("lists.json", [], (v) => Array.isArray(v));
    return raw.filter(isShoppingList);
  }
  /** The page edits lists and sends them all back: few lists, small, from one household. */
  async #setLists(request) {
    const body = await request.json().catch(() => null);
    const lists = isObject(body) ? body.lists : void 0;
    if (!Array.isArray(lists) || lists.length > LISTS_MAX || !lists.every(isShoppingList)) {
      return error(`lists must be at most ${LISTS_MAX} lists of at most ${LIST_ITEMS_MAX} products, each with a name`, 400);
    }
    if (new Set(lists.map((l) => l.id)).size !== lists.length) return error("each list needs its own id", 400);
    const clean = lists.map((list) => ({
      id: list.id,
      name: list.name.trim(),
      updatedAt: list.updatedAt,
      // One line per product: a product twice on a list is counted together.
      items: [...list.items.reduce((byId, item) => {
        const known = byId.get(item.product.id);
        byId.set(item.product.id, known ? { ...known, count: Math.min(known.maxCount, known.count + item.count) } : snapshotItem(item));
        return byId;
      }, /* @__PURE__ */ new Map()).values()]
    }));
    this.desk.store.write("lists.json", clean);
    return NextResponse.json({ lists: clean });
  }
  // ─── Picks for a pasted list ──────────────────────────────────────────────
  picks() {
    const raw = this.desk.store.read("picks.json", {}, isObject);
    return Object.fromEntries(Object.entries(raw).filter((entry) => isSavedProduct(entry[1])));
  }
  async #setPick(request) {
    const body = await request.json().catch(() => null);
    const term = isObject(body) && typeof body.term === "string" ? pickTerm(body.term) : "";
    if (!term) return error("term is required: the words of a line", 400);
    const picks = this.picks();
    delete picks[term];
    if (isObject(body) && body.product !== null) {
      const product = isObject(body.product) ? savedSnapshot(body.product) : null;
      if (!product) return error("product needs id, name and displayPrice", 400);
      picks[term] = product;
    }
    const kept = Object.entries(picks).slice(-PICKS_MAX);
    this.desk.store.write("picks.json", Object.fromEntries(kept));
    return NextResponse.json({ picks: Object.fromEntries(kept) });
  }
  // ─── Shortcuts ────────────────────────────────────────────────────────────
  shortcuts() {
    const own = this.desk.store.read(
      "shortcuts.json",
      null,
      (v) => Array.isArray(v)
    );
    return own ? own.filter(isShortcut) : DEFAULT_SHORTCUTS[this.desk.session.country];
  }
  async #setShortcuts(request) {
    const body = await request.json().catch(() => null);
    const list = isObject(body) ? body.shortcuts : void 0;
    if (list === null) {
      this.desk.store.remove("shortcuts.json");
      return NextResponse.json({ shortcuts: this.shortcuts() });
    }
    if (!Array.isArray(list) || list.length > SHORTCUTS_MAX || !list.every(isShortcut)) {
      return error(`shortcuts must be a list of at most ${SHORTCUTS_MAX} {label, query}`, 400);
    }
    const clean = list.map((s) => ({ label: s.label.trim(), query: s.query.trim() }));
    this.desk.store.write("shortcuts.json", clean);
    return NextResponse.json({ shortcuts: clean });
  }
  // ─── Bought before ────────────────────────────────────────────────────────
  async #history(request) {
    if (!this.desk.session.signedIn && !this.desk.options.demo) return signedOut();
    const cached = this.desk.store.read(
      "history.json",
      null,
      (v) => isHistory(v)
    );
    const now = (this.desk.options.now ?? Date.now)();
    const fresh = cached && now - Date.parse(cached.builtAt) < HISTORY_MAX_AGE_MS;
    if (fresh && request.nextUrl.searchParams.get("refresh") !== "1") return NextResponse.json(cached);
    try {
      const build = this.#historyBuild ??= this.#buildHistory().finally(() => {
        if (this.#historyBuild === build) this.#historyBuild = null;
      });
      return NextResponse.json(await build);
    } catch (err) {
      if (err instanceof HistoryError) {
        if (cached) return NextResponse.json(cached);
        return NextResponse.json(err.body, { status: err.status });
      }
      throw err;
    }
  }
  async #buildHistory() {
    const account = this.#account;
    const list = await this.desk.internal("deliveries?status=COMPLETED");
    if (list.status !== 200) throw new HistoryError(list.status, list.body);
    const deliveries = (list.body.deliveries ?? []).slice(0, HISTORY_DELIVERIES);
    const details = await mapWithConcurrency(
      deliveries,
      (d) => this.desk.internal(`deliveries/${encodeURIComponent(d.id)}`),
      3
    );
    const byProduct = /* @__PURE__ */ new Map();
    details.forEach((result, index) => {
      if (result.status !== 200) return;
      const detail = result.body;
      const when = deliveries[index].windowStart ?? deliveries[index].creationTime;
      for (const order of detail.orders ?? []) {
        for (const item of order.items ?? []) {
          const known = byProduct.get(item.productId);
          if (known) {
            known.times += 1;
            if (Date.parse(when) > Date.parse(known.lastBought)) known.lastBought = when;
          } else {
            byProduct.set(item.productId, { item, times: 1, lastBought: when });
          }
        }
      }
    });
    const items = [...byProduct.values()].sort(
      (a, b) => b.times - a.times || (Date.parse(b.lastBought) || 0) - (Date.parse(a.lastBought) || 0) || a.item.name.localeCompare(b.item.name)
    );
    const data = {
      builtAt: new Date((this.desk.options.now ?? Date.now)()).toISOString(),
      deliveries: deliveries.length,
      items
    };
    if (account !== this.#account) throw new HistoryError(401, { error: "Signed out meanwhile.", code: "TOKEN_EXPIRED" });
    this.desk.store.write("history.json", data);
    return data;
  }
  // ─── Recipe prices ────────────────────────────────────────────────────────
  #recipePrices = null;
  #priceSlots = RECIPE_PRICE_PARALLEL;
  #priceWaiting = [];
  #priceRuns = /* @__PURE__ */ new Map();
  async #recipePrice(request) {
    if (!this.desk.session.signedIn && !this.desk.options.demo) return signedOut();
    const id = request.nextUrl.searchParams.get("id") ?? "";
    if (!RECIPE_ID.test(id)) return error("id must be a recipe id", 400);
    this.#recipePrices ??= this.desk.store.read(
      "recipe_prices.json",
      {},
      (v) => isObject(v)
    );
    const now = (this.desk.options.now ?? Date.now)();
    const known = this.#recipePrices[id];
    if (known && now - Date.parse(known.at) < RECIPE_PRICE_MAX_AGE_MS) return NextResponse.json(known);
    let run = this.#priceRuns.get(id);
    if (!run) {
      const started = this.#workOutPrice(id).finally(() => {
        if (this.#priceRuns.get(id) === started) this.#priceRuns.delete(id);
      });
      this.#priceRuns.set(id, started);
      run = started;
    }
    return (await run).clone();
  }
  async #workOutPrice(id) {
    const account = this.#account;
    if (this.#priceSlots === 0) await new Promise((resolve) => this.#priceWaiting.push(resolve));
    else this.#priceSlots -= 1;
    try {
      let recipe;
      if (this.desk.options.demo) {
        const result = await this.desk.internal(`recipe/${id}`);
        if (result.status !== 200) return NextResponse.json({ error: "no price" }, { status: result.status });
        recipe = result.body;
      } else {
        try {
          const client = buildPicnicClient(this.desk.session.token, this.desk.session.country);
          recipe = parseRecipeDetail(await fetchRecipePage(client, id), id);
        } catch (err) {
          if (isApiAuthError(err)) return signedOut();
          return NextResponse.json({ error: "Picnic did not send the recipe." }, { status: 502 });
        }
      }
      if (account !== this.#account) return signedOut();
      const price = recipePrice(recipe);
      const entry = {
        id,
        total: price.total,
        perServing: price.perServing,
        portions: price.portions,
        at: new Date((this.desk.options.now ?? Date.now)()).toISOString()
      };
      const prices = this.#recipePrices ??= {};
      prices[id] = entry;
      const ids = Object.keys(prices);
      if (ids.length > RECIPE_PRICES_MAX) {
        ids.sort((a, b) => prices[a].at.localeCompare(prices[b].at));
        for (const old of ids.slice(0, ids.length - RECIPE_PRICES_MAX)) delete prices[old];
      }
      this.desk.store.writeSoon("recipe_prices.json", prices);
      return NextResponse.json(entry);
    } finally {
      const next = this.#priceWaiting.shift();
      if (next) next();
      else this.#priceSlots += 1;
    }
  }
  /** After signing out: nothing of the old account may show for the next one. */
  forgetAccountData() {
    this.#account += 1;
    this.#historyBuild = null;
    this.#priceRuns.clear();
    this.#recipePrices = {};
    this.desk.store.remove("recipe_prices.json");
    this.desk.store.remove("history.json");
    this.pictures.forget();
    this.desk.payments.forget();
  }
  // ─── Self-check ───────────────────────────────────────────────────────────
  async #selfcheck() {
    if (!this.desk.session.signedIn && !this.desk.options.demo) return signedOut();
    const checks = [];
    const run = async (key, name, step) => {
      const started = Date.now();
      try {
        const detail = await step();
        checks.push({ key, name, ok: true, ms: Date.now() - started, detail });
      } catch (err) {
        checks.push({ key, name, ok: false, ms: Date.now() - started, detail: err instanceof Error ? err.message : String(err) });
      }
    };
    const get = async (path) => {
      const result = await this.desk.internal(path);
      if (result.status !== 200) {
        const message = isObject(result.body) && typeof result.body.error === "string" ? result.body.error : "";
        throw new Error(`${result.status} ${message}`.trim());
      }
      return result.body;
    };
    let products = [];
    await run("account", "Account", async () => {
      const profile = await get("user/profile");
      return profile.name ? `Signed in as ${profile.name}` : "Signed in";
    });
    await run("access", "Who may use it", async () => {
      const owner = this.desk.session.owner;
      const others = (this.desk.options.allowedUsers ?? []).filter((name) => name.trim());
      if (!this.desk.options.ingressOnly) return "anyone who can reach the app (not running under Home Assistant)";
      if (!owner) {
        throw new Error(
          "anyone in Home Assistant: this sign-in is not tied to a Home Assistant user. Sign out and in again to tie it to you."
        );
      }
      return `${owner.displayName || owner.name}${others.length ? ` and ${others.join(", ")}` : " only"}`;
    });
    await run("search", "Search", async () => {
      const word = SELF_CHECK_WORD[this.desk.session.country];
      const result = await get(`search?${new URLSearchParams({ q: word })}`);
      products = result.products ?? [];
      if (!products.length) throw new Error(`no products for “${word}”`);
      return `${products.length} products for “${word}”`;
    });
    await run("product", "Product page", async () => {
      if (!products.length) throw new Error("skipped: search found nothing");
      const detail = await get(`product/${encodeURIComponent(products[0].id)}`);
      const parts = [
        detail.description ? "description" : "",
        detail.infoSections?.length ? `${detail.infoSections.length} sections` : "",
        detail.nutritionRows?.length ? "nutrition" : "",
        detail.allergens?.confirmed?.length || detail.allergens?.mayContain?.length ? "allergens" : ""
      ].filter(Boolean);
      return `${detail.name}: ${parts.join(", ") || "name and price only"}`;
    });
    await run("pictures", "Pictures", async () => {
      const sample = products.slice(0, 4).filter((p) => p.imageId);
      if (!sample.length) throw new Error("skipped: no product pictures to try");
      if (this.desk.options.demo) return `${sample.length} of ${sample.length} loaded`;
      const results = await Promise.all(
        sample.map((p) => this.pictures.load(p.imageId, "product", this.desk.session.country, true))
      );
      const loaded = results.filter((r) => r.picture);
      const variants = [...new Set(loaded.map((r) => r.picture.variant))].join(", ");
      const failed = results.find((r) => !r.picture);
      const failure = failed ? `; failed: ${failed.tried.map((t) => `${t.variant} → ${t.outcome}`).join(", ")}` : "";
      const kept = this.pictures.stored;
      const mb = (bytes) => `${Math.round(bytes / 1024 / 1024)} MB`;
      const store = kept.enabled ? `; ${kept.count} kept on this computer (${mb(kept.bytes)} of ${mb(kept.maxBytes)})` : "";
      if (!loaded.length) throw new Error(`none of ${sample.length} loaded from Picnic${failure}${store}`);
      return `${loaded.length} of ${sample.length} loaded from Picnic (${variants})${failure}${store}`;
    });
    await run("basket", "Basket", async () => {
      const cart2 = await get("cart");
      return `${cart2.totalCount} items`;
    });
    await run("slots", "Delivery slots", async () => {
      const picker = await get("cart/delivery-slots");
      const days = picker.dayGroups ?? [];
      const count = days.reduce((n, d) => n + d.greenSlots.length + d.regularSlots.length, 0);
      return `${count} slots over ${days.length} days`;
    });
    await run("categories", "Categories", async () => {
      const page = await get("rsc-pages?pageId=category-tree-root");
      return `${page.nodes?.length ?? 0} sections`;
    });
    await run("recipes", "Recipes", async () => {
      const book = await get("cookbook");
      return `${book.recipes?.length ?? 0} recipes in ${book.categories?.length ?? 0} categories`;
    });
    await run("deliveries", "Deliveries", async () => {
      const list = await get("deliveries");
      return `${list.deliveries?.length ?? 0} deliveries`;
    });
    return NextResponse.json({ checks });
  }
  // ─── What Picnic sent ─────────────────────────────────────────────────────
  async #raw(request) {
    if (!this.desk.session.signedIn && !this.desk.options.demo) return signedOut();
    const page = request.nextUrl.searchParams.get("page") ?? "";
    if (!PAGE_ID.test(page)) return error("page must be a Picnic page id", 400);
    let content;
    if (this.desk.options.demo) {
      content = { demo: true, page };
    } else {
      try {
        const client = buildPicnicClient(this.desk.session.token, this.desk.session.country);
        content = await client.sendRequest("GET", `/pages/${page}`, null, true);
      } catch (err) {
        if (isApiAuthError(err)) return signedOut();
        return error(`Picnic answered: ${err instanceof Error ? err.message.slice(0, 300) : "unknown error"}`, 502);
      }
    }
    const isText = typeof content === "string";
    const file = `picnic-${page.replace(/[^A-Za-z0-9_.-]+/g, "_").slice(0, 60)}.${isText ? "txt" : "json"}`;
    return new NextResponse(isText ? content : JSON.stringify(content, null, 2), {
      headers: {
        "content-type": isText ? "text/plain; charset=utf-8" : "application/json",
        "content-disposition": `attachment; filename="${file}"`
      }
    });
  }
};
var HistoryError = class extends Error {
  constructor(status, body) {
    super(`history: ${status}`);
    this.status = status;
    this.body = body;
  }
  status;
  body;
};
function demoPicture(id) {
  if (!/^demo-[a-z0-9-]{1,60}$/.test(id)) return null;
  const key = id.slice(5);
  let hash = 0;
  for (const char of key) hash = hash * 31 + char.charCodeAt(0) >>> 0;
  hash = Math.imul(hash ^ hash >>> 16, 73244475) >>> 0;
  hash = Math.imul(hash ^ hash >>> 16, 73244475) >>> 0;
  const hue = hash % 360;
  let svg;
  if (key.startsWith("recipe-")) {
    const circles = [0, 1, 2, 3].map((i) => {
      const h = (hue + i * 47) % 360;
      return `<circle cx="${30 + (hash >>> i * 3) % 140}" cy="${40 + (hash >>> i * 5) % 70}" r="${18 + (hash >>> i) % 22}" fill="hsl(${h} 55% 60%)"/>`;
    }).join("");
    svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 150"><rect width="200" height="150" fill="hsl(${hue} 40% 90%)"/>${circles}</svg>`;
  } else {
    const product = productById(key);
    const aisle = L1_CATEGORIES.find((c) => `l1-${c.id}` === key)?.name;
    const name = product?.name ?? aisle ?? key.replace(/^cat-/, "");
    const letter = (name.match(/[A-Za-zÀ-ž]/)?.[0] ?? "?").toUpperCase();
    svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="hsl(${hue} 45% 92%)"/><circle cx="50" cy="50" r="32" fill="hsl(${hue} 50% 62%)"/><text x="50" y="62" text-anchor="middle" font-family="sans-serif" font-size="34" font-weight="700" fill="hsl(${hue} 60% 22%)">${letter}</text></svg>`;
  }
  return { data: Buffer.from(svg), type: "image/svg+xml", variant: "demo" };
}

// src/server/router.ts
var Router = class {
  #routes;
  constructor(routes) {
    this.#routes = routes.map((route) => {
      const segments = route.path.split("/");
      return { ...route, segments, dynamic: segments.filter((s) => s.startsWith("[")).length };
    }).sort((a, b) => a.dynamic - b.dynamic || b.segments.length - a.segments.length);
  }
  /** `path` is what follows /api/, already split on "/" and percent-decoded per segment. */
  match(method, segments) {
    for (const route of this.#routes) {
      if (route.segments.length !== segments.length) continue;
      const params = {};
      let ok2 = true;
      for (let i = 0; i < segments.length; i++) {
        const pattern = route.segments[i];
        if (pattern.startsWith("[") && pattern.endsWith("]")) {
          if (!segments[i]) {
            ok2 = false;
            break;
          }
          params[pattern.slice(1, -1)] = segments[i];
        } else if (pattern !== segments[i]) {
          ok2 = false;
          break;
        }
      }
      if (!ok2) continue;
      const handler = route.module[method];
      if (!handler) return { kind: "method", allowed: route.methods };
      return { kind: "found", entry: route, handler, params };
    }
    return { kind: "none" };
  }
};

// src/server/payments.ts
var FILE = "payment.json";
var PAYMENT_POLL_MS = 15e3;
var PAYMENT_WATCH_MS = 2 * 60 * 60 * 1e3;
var FAILED_PAYMENT = /CANCEL|FAIL|EXPIR|ERROR|REJECT/i;
var isDeliveries = (value) => isObject(value) && Object.values(value).every((n) => typeof n === "number");
var isSaved = (value) => isObject(value) && typeof value.orderId === "string" && value.orderId !== "" && typeof value.transactionId === "string" && value.transactionId !== "" && typeof value.startedAt === "number" && (value.before === null || isDeliveries(value.before));
var Payments = class {
  constructor(host) {
    this.host = host;
    this.#open = host.store.read(FILE, null, (value) => value === null || isSaved(value));
    if (this.#open && !this.#open.gaveUp) this.#schedule();
  }
  host;
  #open;
  #timer = null;
  #confirming = null;
  /** The last order confirmed, so a late second ask is answered without asking Picnic again. */
  #confirmed = null;
  #ticking = null;
  get open() {
    if (!this.#open) return null;
    const { orderId, transactionId, startedAt, gaveUp } = this.#open;
    return { orderId, transactionId, startedAt, gaveUp: Boolean(gaveUp) };
  }
  /** The payment for `orderId` started; Picnic gave it `transactionId`. */
  async started(orderId, transactionId) {
    this.#confirmed = null;
    this.#open = { orderId, transactionId, startedAt: this.host.now(), before: null };
    this.#save();
    this.#schedule();
    const before = await this.#currentDeliveries();
    if (this.#open?.transactionId === transactionId) {
      this.#open = { ...this.#open, before };
      this.#save();
    }
  }
  /** The payment will not finish (cancelled, failed): nothing to confirm. */
  ended(transactionId) {
    if (this.#open?.transactionId === transactionId) this.forget();
  }
  /** Signed out, or the page dismissed a payment the server gave up on. */
  forget() {
    this.#open = null;
    this.#confirmed = null;
    this.#stop();
    this.host.store.remove(FILE);
  }
  /**
   * Confirm an order, one at a time. `send` is picnic-web's confirm route.
   * Answers a second ask for the same order with the first answer.
   */
  async confirm(request, send2) {
    let orderId = "";
    try {
      const body = JSON.parse(await request.text());
      if (isObject(body) && typeof body.orderId === "string") orderId = body.orderId;
    } catch {
    }
    if (!orderId) return send2(request);
    if (this.#confirmed?.orderId === orderId) return answer(this.#confirmed);
    if (this.#confirming?.orderId === orderId) return answer(await this.#confirming.answer);
    const run = this.#confirmOnce(orderId, request, send2);
    this.#confirming = { orderId, answer: run };
    try {
      return answer(await run);
    } finally {
      if (this.#confirming?.answer === run) this.#confirming = null;
    }
  }
  async #confirmOnce(orderId, request, send2) {
    let status = 502;
    let body = JSON.stringify({ error: "Failed to confirm order. Please try again later." });
    try {
      const response = await send2(request);
      status = response.status;
      body = await response.text();
    } catch (error2) {
      console.error("[desk] confirming the order failed:", error2 instanceof Error ? error2.message : error2);
    }
    const placed = status >= 200 && status < 300 || status >= 500 && await this.#placedAnyway(orderId);
    if (!placed) return { orderId, status, body };
    const confirmed = status >= 200 && status < 300 ? { orderId, status, body } : { orderId, status: 200, body: JSON.stringify({ success: true, orderId }) };
    this.#confirmed = confirmed;
    if (this.#open?.orderId === orderId) {
      this.#open = null;
      this.#stop();
      this.host.store.remove(FILE);
    }
    return confirmed;
  }
  /** A confirmation failed: did Picnic take the order all the same? */
  async #placedAnyway(orderId) {
    const open = this.#open;
    if (!open || open.orderId !== orderId || !open.before) return false;
    const now = await this.#currentDeliveries();
    if (!now) return false;
    return Object.entries(now).some(([id, orders]) => orders > (open.before[id] ?? 0));
  }
  async #currentDeliveries() {
    try {
      const result = await this.host.internal("deliveries?status=CURRENT");
      if (result.status !== 200 || !isObject(result.body) || !Array.isArray(result.body.deliveries)) return null;
      const deliveries = {};
      for (const delivery of result.body.deliveries) {
        if (isObject(delivery) && typeof delivery.id === "string") {
          deliveries[delivery.id] = typeof delivery.orderCount === "number" ? delivery.orderCount : 0;
        }
      }
      return deliveries;
    } catch {
      return null;
    }
  }
  /** Ask Picnic about the open payment once, and confirm it when it is paid. */
  tick() {
    this.#ticking ??= this.#tick().finally(() => this.#ticking = null);
    return this.#ticking;
  }
  async #tick() {
    const open = this.#open;
    if (!open || open.gaveUp) return;
    if (this.host.now() - open.startedAt > PAYMENT_WATCH_MS) {
      this.#open = { ...open, gaveUp: true };
      this.#save();
      this.#stop();
      console.error(`[desk] payment ${open.transactionId}: no answer either way after two hours; check the orders`);
      return;
    }
    const status = await this.host.internal(
      `cart/checkout/status?${new URLSearchParams({ transactionId: open.transactionId })}`
    );
    if (this.#open?.transactionId !== open.transactionId) return;
    const checkoutStatus2 = isObject(status.body) ? status.body.checkoutStatus : void 0;
    if (status.status !== 200 || typeof checkoutStatus2 !== "string") return;
    if (FAILED_PAYMENT.test(checkoutStatus2)) {
      this.ended(open.transactionId);
      return;
    }
    if (checkoutStatus2 !== "FINISHED") return;
    const confirmed = await this.host.internal("cart/checkout/confirm", {
      method: "POST",
      body: { orderId: open.orderId, transactionId: open.transactionId }
    });
    if (confirmed.status === 200) console.log(`[desk] order ${open.orderId} confirmed by the app`);
  }
  #schedule() {
    if (!this.host.watch || this.#timer) return;
    const next = () => {
      this.#timer = setTimeout(() => {
        void this.tick().finally(() => {
          this.#timer = null;
          if (this.#open && !this.#open.gaveUp) next();
        });
      }, PAYMENT_POLL_MS);
      this.#timer.unref();
    };
    next();
  }
  #stop() {
    if (this.#timer) clearTimeout(this.#timer);
    this.#timer = null;
  }
  #save() {
    if (this.#open) this.host.store.write(FILE, this.#open);
  }
};
var answer = (confirmed) => new NextResponse(confirmed.body, { status: confirmed.status, headers: { "content-type": "application/json" } });

// vendor/picnic-web/src/lib/core/auth.ts
var AUTH_COOKIE_NAME = "picnic_auth_token";
var AUTH_COOKIE_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;
function readAuthToken(request) {
  const value = request.cookies.get(AUTH_COOKIE_NAME)?.value;
  if (!value || value.trim() === "") {
    return null;
  }
  return value;
}
function readCountryCode(request) {
  const value = request.cookies.get(COUNTRY_COOKIE_NAME)?.value?.toUpperCase();
  if (value && SUPPORTED_COUNTRY_CODES.includes(value)) {
    return value;
  }
  return DEFAULT_COUNTRY_CODE;
}

// src/server/session.ts
var FILE2 = "auth.json";
var PARTIAL_TOKEN_LIFETIME_MS = 15 * 60 * 1e3;
var readOwner = (value) => isObject(value) && typeof value.id === "string" && value.id && typeof value.name === "string" ? { id: value.id, name: value.name, displayName: typeof value.displayName === "string" ? value.displayName : value.name } : void 0;
var isCountry = (value) => typeof value === "string" && SUPPORTED_COUNTRY_CODES.includes(value);
var readSaved = (value, country) => {
  if (!isObject(value) || typeof value.token !== "string" || !value.token) return null;
  return {
    token: value.token,
    country: isCountry(value.country) ? value.country : country,
    since: typeof value.since === "string" ? value.since : "",
    owner: readOwner(value.owner)
  };
};
var Session = class {
  constructor(store, defaultCountry, now = Date.now) {
    this.store = store;
    this.defaultCountry = defaultCountry;
    this.now = now;
    this.#saved = readSaved(store.read(FILE2, null, (_value) => true), defaultCountry);
  }
  store;
  defaultCountry;
  now;
  #saved;
  #partial = null;
  get signedIn() {
    return this.#saved !== null;
  }
  get token() {
    return this.#saved?.token ?? null;
  }
  get country() {
    return this.#saved?.country ?? this.#pendingCountry ?? this.defaultCountry;
  }
  #pendingCountry = null;
  /** The cookies a picnic-web route expects to find on the request. */
  cookies() {
    const cookies = { [COUNTRY_COOKIE_NAME]: this.country };
    if (this.#saved) cookies[AUTH_COOKIE_NAME] = this.#saved.token;
    return cookies;
  }
  /** Apply the cookies a route set: sign in, sign out or a country change. */
  apply(set) {
    let token;
    let country;
    for (const cookie2 of set) {
      const removed = cookie2.value === "" || cookie2.maxAge === 0;
      if (cookie2.name === AUTH_COOKIE_NAME) token = removed ? null : cookie2.value;
      if (cookie2.name === COUNTRY_COOKIE_NAME && !removed && isCountry(cookie2.value)) country = cookie2.value;
    }
    if (country) this.#pendingCountry = country;
    if (token === null) {
      this.signOut();
    } else if (typeof token === "string") {
      this.#saved = { token, country: country ?? this.country, since: new Date(this.now()).toISOString() };
      this.#partial = null;
      this.store.write(FILE2, this.#saved);
    } else if (country && this.#saved && this.#saved.country !== country) {
      this.#saved = { ...this.#saved, country };
      this.store.write(FILE2, this.#saved);
    }
  }
  signOut() {
    this.#saved = null;
    this.#partial = null;
    this.store.remove(FILE2);
  }
  /** The half-finished sign-in token, kept here while Picnic waits for a verification code. */
  holdPartialToken(token) {
    this.#partial = { token, until: this.now() + PARTIAL_TOKEN_LIFETIME_MS };
  }
  partialToken() {
    if (!this.#partial || this.#partial.until < this.now()) return null;
    return this.#partial.token;
  }
  get since() {
    return this.#saved?.since ?? null;
  }
  /** Who signed in to Picnic here; undefined when Home Assistant did not say (or before 1.0). */
  get owner() {
    return this.#saved?.owner;
  }
  setOwner(owner) {
    if (!this.#saved) return;
    const { owner: _old, ...rest } = this.#saved;
    this.#saved = owner ? { ...rest, owner } : rest;
    this.store.write(FILE2, this.#saved);
  }
};

// src/server/app.ts
var INGRESS_GATEWAY = "172.30.32.2";
var MAX_BODY_BYTES = 1024 * 1024;
var INTERNAL_BASE = "http://picnic-desk.internal";
var TYPES2 = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".json": "application/json",
  ".map": "application/json",
  ".woff2": "font/woff2"
};
var PAGE_POLICY = [
  "default-src 'self'",
  "img-src 'self' data:",
  "style-src 'self'",
  "script-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "frame-ancestors 'self'",
  "base-uri 'none'",
  "form-action 'self'"
].join("; ");
var PERMISSIONS_POLICY = "camera=(), microphone=(), geolocation=(), payment=(), usb=(), serial=(), bluetooth=(), midi=(), magnetometer=(), gyroscope=(), accelerometer=(), display-capture=(), clipboard-read=()";
var PASSED_HEADERS = ["content-type", "accept-language"];
var NOT_YOURS = {
  error: "This Picnic account was connected by another Home Assistant user.",
  code: "NOT_YOUR_ACCOUNT"
};
var Desk = class {
  constructor(options) {
    this.options = options;
    this.store = new Store(options.dataDir);
    this.session = new Session(this.store, options.country, options.now);
    this.router = new Router(options.routes);
    this.desk = new DeskRoutes(this);
    this.payments = new Payments({
      store: this.store,
      internal: (path, init) => this.internal(path, init),
      now: options.now ?? Date.now,
      watch: options.watchPayments ?? true
    });
  }
  options;
  session;
  store;
  router;
  desk;
  payments;
  /** Set when Picnic refused the saved token; cleared by the next answer that worked. */
  expired = false;
  /** Node's request handler. Never throws. */
  handle = async (req, res) => {
    try {
      await this.#handle(req, res);
    } catch (error2) {
      console.error("[desk] unexpected:", error2 instanceof Error ? error2.stack : error2);
      if (!res.headersSent) send(res, 500, json({ error: "Something went wrong in Picnic Desk." }));
      else res.destroy();
    }
  };
  async #handle(req, res) {
    if (this.options.ingressOnly && !fromGateway(req.socket.remoteAddress, this.options.gateway)) {
      send(res, 403, text2("Only Home Assistant may open this app."));
      return;
    }
    const url = new URL(req.url ?? "/", INTERNAL_BASE);
    const method = (req.method ?? "GET").toUpperCase();
    let segments;
    try {
      segments = url.pathname.split("/").slice(1).map(decodeURIComponent);
    } catch {
      send(res, 400, text2("Bad address."));
      return;
    }
    if (segments.some((s) => s === ".." || s === "." || s.includes("/") || s.includes("\\") || s.includes("\0"))) {
      send(res, 404, text2("Not found."));
      return;
    }
    if (segments[0] === "api") {
      await this.#api(req, res, method, url, segments.slice(1), this.haUser(req));
      return;
    }
    if (method !== "GET" && method !== "HEAD") {
      send(res, 405, text2("Method not allowed."), { allow: "GET, HEAD" });
      return;
    }
    if (url.pathname === "/checkout/return") {
      send(res, 303, text2("See the Picnic Desk tab."), { location: "../#/checkout/return" });
      return;
    }
    const file = url.pathname === "/" ? "index.html" : segments.join("/");
    await this.#static(req, res, file, method === "HEAD");
  }
  async #static(req, res, file, headOnly) {
    const root = normalize(this.options.publicDir + sep);
    const path = normalize(join4(root, file));
    if (!path.startsWith(root)) {
      send(res, 404, text2("Not found."));
      return;
    }
    let data;
    try {
      data = await readFile2(path);
    } catch {
      send(res, 404, text2("Not found."));
      return;
    }
    const etag = `"${createHash2("sha256").update(data).digest("base64url").slice(0, 22)}"`;
    const headers = {
      "content-type": TYPES2[extname(path)] ?? "application/octet-stream",
      "cache-control": "no-cache",
      etag
    };
    if (extname(path) === ".html") headers["content-security-policy"] = PAGE_POLICY;
    if (ifNoneMatch(req.headers["if-none-match"], etag)) {
      send(res, 304, { body: "", headers: { etag, "cache-control": "no-cache" } });
      return;
    }
    send(res, 200, {
      body: headOnly ? Buffer.alloc(0) : data,
      headers: headOnly ? { ...headers, "content-length": String(data.length) } : headers
    });
  }
  async #api(req, res, method, url, segments, user) {
    const writing = method !== "GET" && method !== "HEAD";
    const site = req.headers["sec-fetch-site"];
    if (writing && (typeof req.headers["x-desk-base"] !== "string" || site !== void 0 && site !== "same-origin")) {
      send(res, 403, json({ error: "Changes are only accepted from Picnic Desk's own page." }));
      return;
    }
    if (!this.mayUse(user) && segments.join("/") !== "desk/state") {
      send(res, 403, json(NOT_YOURS));
      return;
    }
    let body;
    try {
      body = await readBody(req);
    } catch {
      send(res, 413, json({ error: "Request too large." }));
      return;
    }
    const headers = {};
    for (const name of PASSED_HEADERS) {
      const value = req.headers[name];
      if (typeof value === "string") headers[name] = value;
    }
    const request = new NextRequest(`${INTERNAL_BASE}${url.pathname}${url.search}`, {
      method,
      headers,
      body,
      cookies: this.session.cookies(),
      origin: pageBase(req.headers["x-desk-base"])
    });
    const response = await this.dispatch(request, segments, user);
    await this.#reply(res, response);
  }
  /**
   * Who Home Assistant says is using the page. Only trusted when only Home
   * Assistant's gateway can connect: anyone else could send these headers.
   */
  haUser(req) {
    if (!this.options.ingressOnly) return null;
    const one = (name2) => {
      const value = req.headers[name2];
      return typeof value === "string" ? value.trim() : "";
    };
    const id = one("x-remote-user-id");
    if (!id) return null;
    const name = one("x-remote-user-name");
    return { id, name, displayName: one("x-remote-user-display-name") || name };
  }
  /**
   * The Picnic account belongs to the Home Assistant user who signed in to it
   * here, and to the users named in the app's `allowed_users` option.
   * Signing in is open to everyone; a session from before this rule, or a
   * request Home Assistant did not name a user for, is not restricted.
   */
  mayUse(user) {
    const owner = this.session.owner;
    if (!this.session.signedIn || !owner || !user) return true;
    if (user.id === owner.id) return true;
    const allowed = (this.options.allowedUsers ?? []).map((name) => name.trim().toLowerCase()).filter(Boolean);
    return user.name !== "" && allowed.includes(user.name.toLowerCase());
  }
  /** Answer one API request; also used inside the app (self-check, bought before). */
  async dispatch(request, segments, user = null) {
    if (segments[0] === "desk") return this.desk.handle(request, segments.slice(1), user);
    const isAuthRoute = segments[0] === "auth";
    if (isAuthRoute) request = await prepareAuthRequest(this, request, segments[1]);
    let response = null;
    try {
      if (this.options.demo) {
        const demo = this.options.demo;
        response = await this.#checkout(request, segments, async (r) => await demo(r, segments) ?? notFound());
      } else {
        const match = this.router.match(request.method, segments);
        if (match.kind === "method") {
          return new Response(JSON.stringify({ error: "Method not allowed." }), {
            status: 405,
            headers: { allow: match.allowed.join(", "), "content-type": "application/json" }
          });
        }
        if (match.kind === "found") {
          const route = async (r) => match.handler(r, { params: Promise.resolve(match.params) });
          response = await this.#checkout(request, segments, route);
        }
      }
    } catch (error2) {
      console.error(`[desk] /api/${segments.join("/")} failed:`, error2 instanceof Error ? error2.message : error2);
      return NextResponse.json({ error: "Picnic could not be reached. Please try again." }, { status: 502 });
    }
    if (!response) return NextResponse.json({ error: "Not found." }, { status: 404 });
    if (isAuthRoute) response = await finishAuthResponse(this, response, segments[1], user);
    else this.#noteTokenState(response);
    return response;
  }
  /**
   * The checkout steps the server keeps track of (see payments.ts): a payment
   * that started is remembered, confirming goes one at a time, and a
   * cancelled payment is forgotten.
   */
  async #checkout(request, segments, route) {
    const step = request.method === "POST" && segments.length === 3 && segments[0] === "cart" && segments[1] === "checkout" ? segments[2] : null;
    if (step === "confirm") return this.payments.confirm(request, route);
    const response = await route(request);
    if (!response.ok || step !== "initiate" && step !== "cancel") return response;
    const body = await response.clone().json().catch(() => null);
    if (step === "cancel") {
      const sent2 = await request.json().catch(() => null);
      if (typeof sent2?.transactionId === "string") this.payments.ended(sent2.transactionId);
      return response;
    }
    const sent = await request.json().catch(() => null);
    if (typeof sent?.orderId === "string" && sent.orderId && typeof body?.transactionId === "string" && body.transactionId) {
      void this.payments.started(sent.orderId, body.transactionId).catch(
        (error2) => console.error("[desk] cannot keep the payment:", error2 instanceof Error ? error2.message : error2)
      );
    }
    return response;
  }
  /** Call an API route from inside the app and read its JSON answer. */
  async internal(path, init = {}) {
    const url = new URL(path, `${INTERNAL_BASE}/api/`);
    const request = new NextRequest(url.href, {
      method: init.method ?? "GET",
      body: init.body === void 0 ? null : JSON.stringify(init.body),
      headers: init.body === void 0 ? {} : { "content-type": "application/json" },
      cookies: this.session.cookies()
    });
    const segments = url.pathname.split("/").slice(2).map(decodeURIComponent);
    const response = await this.dispatch(request, segments);
    const raw = await response.text();
    let parsed = raw;
    try {
      parsed = JSON.parse(raw);
    } catch {
    }
    return { status: response.status, body: parsed };
  }
  #noteTokenState(response) {
    if (!this.session.signedIn) return;
    if (response.status === 401) this.expired = true;
    else if (response.ok) this.expired = false;
  }
  async #reply(res, response) {
    const headers = {};
    response.headers.forEach((value, name) => {
      if (name !== "set-cookie") headers[name] = value;
    });
    headers["cache-control"] ??= "no-store";
    const data = Buffer.from(await response.arrayBuffer());
    send(res, response.status, { body: data, headers });
  }
};
async function prepareAuthRequest(desk, request, step) {
  if (step !== "verify-2fa") return request;
  let body = {};
  try {
    const parsed = JSON.parse(await request.text());
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) body = parsed;
  } catch {
  }
  const headers = {};
  request.headers.forEach((value, name) => headers[name] = value);
  return new NextRequest(request.url, {
    method: request.method,
    headers,
    body: JSON.stringify({ ...body, partialToken: desk.session.partialToken() ?? void 0 }),
    cookies: desk.session.cookies(),
    origin: request.nextUrl.origin
  });
}
async function finishAuthResponse(desk, response, step, user) {
  const before = desk.session.token;
  desk.session.apply(readSetCookies(response));
  if (desk.session.signedIn && response.ok) desk.expired = false;
  if (desk.session.signedIn && desk.session.token !== before) desk.session.setOwner(user);
  if (before !== null && desk.session.token !== before) desk.desk.forgetAccountData();
  if (step !== "login-credentials") return stripCookies(response);
  const body = await response.clone().json().catch(() => null);
  if (body && typeof body.partialToken === "string") {
    desk.session.holdPartialToken(body.partialToken);
    const { partialToken: _held, ...rest } = body;
    return NextResponse.json(rest, { status: response.status });
  }
  return stripCookies(response);
}
var notFound = () => NextResponse.json({ error: "Not found." }, { status: 404 });
function readSetCookies(response) {
  return response.headers.getSetCookie().map((line) => {
    const [pair, ...attributes] = line.split(";");
    const at = pair.indexOf("=");
    const name = pair.slice(0, at).trim();
    let value = "";
    try {
      value = decodeURIComponent(pair.slice(at + 1).trim());
    } catch {
      value = pair.slice(at + 1).trim();
    }
    const maxAgeAttribute = attributes.map((a) => a.trim()).find((a) => /^max-age=/i.test(a));
    const maxAge = maxAgeAttribute ? Number(maxAgeAttribute.split("=")[1]) : void 0;
    return { name, value, maxAge };
  });
}
function stripCookies(response) {
  const headers = new Headers(response.headers);
  headers.delete("set-cookie");
  return new Response(response.body, { status: response.status, headers });
}
function ifNoneMatch(header, etag) {
  if (!header) return false;
  return header.split(",").some((tag) => {
    const value = tag.trim().replace(/^W\//, "");
    return value === etag || value === "*";
  });
}
function fromGateway(address, gateway = INGRESS_GATEWAY) {
  return address === gateway || address === `::ffff:${gateway}`;
}
function pageBase(value) {
  if (typeof value !== "string" || value.length > 500) return void 0;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return void 0;
    if (url.username || url.password || url.search || url.hash) return void 0;
    return `${url.origin}${url.pathname}`.replace(/\/+$/, "");
  } catch {
    return void 0;
  }
}
async function readBody(req) {
  if (req.method === "GET" || req.method === "HEAD") return null;
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw new Error("too large");
    chunks.push(chunk);
  }
  return chunks.length ? Buffer.concat(chunks).toString("utf8") : null;
}
var text2 = (message) => ({
  body: message,
  headers: { "content-type": "text/plain; charset=utf-8" }
});
var json = (value) => ({
  body: JSON.stringify(value),
  headers: { "content-type": "application/json" }
});
function send(res, status, reply, extra = {}) {
  res.writeHead(status, {
    "x-content-type-options": "nosniff",
    "referrer-policy": "no-referrer",
    // Other sites may not embed or read anything from here (pictures and answers included).
    "cross-origin-resource-policy": "same-origin",
    "x-frame-options": "SAMEORIGIN",
    "permissions-policy": PERMISSIONS_POLICY,
    ...reply.headers,
    ...extra
  });
  res.end(reply.body);
}

// src/server/fetch-timeout.ts
var UPSTREAM_TIMEOUT_MS = 25e3;
var PICNIC_HOST = /^storefront-prod\.(nl|de|fr)\.picnicinternational\.com$/;
function installFetchTimeout(timeoutMs = UPSTREAM_TIMEOUT_MS) {
  const original = globalThis.fetch;
  if (original.deskTimeout) return;
  const wrapped = ((input, init) => original(input, { ...init, signal: init?.signal ?? AbortSignal.timeout(timeoutMs) }));
  wrapped.deskTimeout = true;
  wrapped.deskOnlyPicnic = original.deskOnlyPicnic;
  globalThis.fetch = wrapped;
}
function installOnlyPicnic() {
  const original = globalThis.fetch;
  if (original.deskOnlyPicnic) return;
  const wrapped = (async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.protocol !== "https:" || !PICNIC_HOST.test(url.hostname) || url.port !== "") {
      throw new TypeError(`Picnic Desk only talks to Picnic, not to ${url.host}`);
    }
    return original(input, init);
  });
  wrapped.deskOnlyPicnic = true;
  wrapped.deskTimeout = original.deskTimeout;
  globalThis.fetch = wrapped;
}

// vendor/picnic-web/src/lib/delivery/format-delivery-window.ts
var DAY_NAMES = {
  NL: ["Zondag", "Maandag", "Dinsdag", "Woensdag", "Donderdag", "Vrijdag", "Zaterdag"],
  DE: ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"],
  FR: ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"]
};
var MONTH_ABBREVIATIONS = {
  NL: ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"],
  DE: ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"],
  FR: ["janv", "févr", "mars", "avr", "mai", "juin", "juil", "août", "sept", "oct", "nov", "déc"]
};
var RELATIVE_LABELS = {
  NL: { today: "Vandaag", tomorrow: "Morgen", yesterday: "Gisteren" },
  DE: { today: "Heute", tomorrow: "Morgen", yesterday: "Gestern" },
  FR: { today: "Aujourd'hui", tomorrow: "Demain", yesterday: "Hier" }
};
function formatBannerText(windowStart, windowEnd, countryCode) {
  if (!windowStart || !windowEnd) return null;
  const start = new Date(windowStart);
  const end = new Date(windowEnd);
  const dayLabel = getRelativeDayLabel(start, countryCode);
  const startTime = formatTime(start);
  const endTime = formatTime(end);
  return `${dayLabel} ${startTime} - ${endTime}`;
}
function formatDayTabLabel(dateStr, countryCode) {
  const date = /* @__PURE__ */ new Date(dateStr + "T12:00:00");
  const dayLabel = getRelativeDayLabel(date, countryCode);
  const day = date.getDate();
  const month = MONTH_ABBREVIATIONS[countryCode][date.getMonth()];
  return { dayLabel, dateLabel: `${day} ${month}` };
}
function formatTime(date) {
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}
function formatDeliveryWindowText(windowStart, windowEnd, countryCode) {
  if (!windowStart || !windowEnd) return "—";
  const start = new Date(windowStart);
  const end = new Date(windowEnd);
  const dayLabel = getRelativeDayLabel(start, countryCode);
  return `${dayLabel} ${formatTime(start)} - ${formatTime(end)}`;
}
function getRelativeDayLabel(date, countryCode) {
  const today = /* @__PURE__ */ new Date();
  const todayDate = toDateString(today);
  const tomorrowDate = toDateString(addDays(today, 1));
  const targetDate = toDateString(date);
  const labels = RELATIVE_LABELS[countryCode];
  if (targetDate === todayDate) return labels.today;
  if (targetDate === tomorrowDate) return labels.tomorrow;
  return DAY_NAMES[countryCode][date.getDay()];
}
function toDateString(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
function addDays(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

// src/server/demo/shop.ts
var ok = (body) => NextResponse.json(body);
var fail = (error2, status, code) => NextResponse.json(code ? { error: error2, code } : { error: error2 }, { status });
var expired = () => fail("Your token has expired", 401, "TOKEN_EXPIRED");
var cookie = { httpOnly: true, sameSite: "lax", path: "/", maxAge: AUTH_COOKIE_MAX_AGE_SECONDS };
var DemoState = class {
  constructor(now = Date.now) {
    this.now = now;
  }
  now;
  lines = [];
  slotId = null;
  explicitSlot = false;
  savedRecipes = /* @__PURE__ */ new Set([RECIPES[0].id]);
  ingredientChoice = /* @__PURE__ */ new Map();
  cancelled = /* @__PURE__ */ new Set();
  rated = /* @__PURE__ */ new Set();
  checkouts = /* @__PURE__ */ new Map();
  orders = 0;
  /** The checkout start fails once with an age check while the basket holds this product. */
  ageChecked = false;
};
function demoShop(state = new DemoState()) {
  return async (request, segments) => {
    const route = segments.join("/");
    const method = request.method;
    if (route.startsWith("auth/")) return auth(request, segments[1]);
    if (!readAuthToken(request)) return expired();
    const q = request.nextUrl.searchParams;
    const body = async () => method === "GET" ? null : await request.json().catch(() => null);
    switch (`${method} ${segments[0]}`) {
      case "GET search": {
        if (segments.length !== 1) break;
        const query = (q.get("q") ?? "").trim().toLowerCase();
        if (!query) return fail("Missing query", 400);
        return ok(search(query));
      }
      case "GET suggestions": {
        const query = (q.get("q") ?? "").trim().toLowerCase();
        const words = [...new Set(PRODUCTS.flatMap((p) => p.words))].filter((w) => w.startsWith(query));
        return ok({
          query,
          suggestions: query.length < 2 ? [] : words.slice(0, 6).map((w) => ({ id: w, suggestion: w }))
        });
      }
      case "GET product": {
        const detail = segments[1] ? productDetail(segments[1]) : null;
        return detail ? ok(detail) : fail("Product not found", 404);
      }
      case "GET rsc-pages":
        if (q.get("pageId") !== "category-tree-root") return fail("Failed to load the page. Please try again later.", 502);
        return ok(categoryTree());
      case "GET categories": {
        const id = segments[1];
        if (segments[2] === "subcategories") {
          const l1 = L1_CATEGORIES.find((c) => c.id === id);
          return l1 ? ok({ title: l1.name, subcategories: l1.children }) : fail("Failed to load subcategories.", 502);
        }
        if (segments[2] === "products") {
          const ids = L2_PRODUCTS[id];
          if (!ids) return fail("Failed to load products.", 502);
          const name = L1_CATEGORIES.flatMap((c) => c.children).find((c) => c.id === id)?.name ?? null;
          return ok({
            title: name,
            products: ids.map((pid) => plainProduct(productById(pid))),
            sections: []
          });
        }
        break;
      }
      case "GET pages": {
        const pageId = q.get("pageId") ?? "";
        if (pageId.startsWith("promo-group-deep-dive")) {
          return ok({
            title: "Acties",
            products: [],
            sections: [],
            rscPage: promoPage(pageId)
          });
        }
        const products = PRODUCTS.filter((p) => p.promoBadge || p.priceRanges).map(plainProduct);
        return ok({
          title: pageId === "basket-recommendations" ? "Niets vergeten?" : "",
          products,
          sections: [
            { title: "Acties", products: products.filter((p) => p.promoBadge) },
            { title: "Meer voor minder", products: products.filter((p) => p.priceRanges) }
          ]
        });
      }
      case "GET cart":
        if (segments[1] === "footer") return ok(footer(state));
        if (segments[1] === "delivery-slots") return ok(slots(state));
        if (segments[1] === "checkout" && segments[2] === "payment-profile") return ok(paymentProfile());
        if (segments[1] === "checkout" && segments[2] === "status") return checkoutStatus(state, q.get("transactionId"));
        return ok(cart(state));
      case "POST cart":
        return cartPost(state, segments, await body(), request.nextUrl.origin);
      case "DELETE cart":
        state.lines = [];
        return ok(cart(state));
      case "GET cookbook":
        return cookbook(state, segments[1], q);
      case "GET recipe": {
        if (segments[1] === "saved") return ok({ recipeIds: [...state.savedRecipes] });
        const recipe = recipeById(segments[1] ?? "");
        if (!recipe) return fail("Recipe not found", 404);
        if (segments[2] === "ingredient") return ok(ingredientEdit(state, segments[1], segments[3]));
        const portions = Number(q.get("portions")) || recipe.portions;
        return ok(recipeDetail(state, segments[1], portions));
      }
      case "POST recipe":
        return recipePost(state, segments, await body());
      case "POST meal-plan":
        return mealPlan(segments[1], await body());
      case "GET deliveries":
        return deliveriesGet(state, segments, q.get("status"));
      case "POST deliveries":
        return deliveriesPost(state, segments, await body());
      case "GET parcels":
        return segments[1] ? ok(parcel(segments[1])) : ok(parcels());
      case "GET user":
        if (segments[1] === "profile") {
          return ok({
            name: "Demo Klant",
            addressLine: "Demostraat 1",
            avatarUrl: null,
            hasMembership: false,
            menu: [
              { id: "orders", deepLink: null },
              { id: "parcels", deepLink: null }
            ]
          });
        }
        break;
      case "GET debug-cookbook":
      case "GET debug-category-page":
        return ok({ demo: true, route });
    }
    return fail("Not found.", 404);
  };
}
async function auth(request, step) {
  const body = await request.json().catch(() => null);
  const country = String(body?.countryCode ?? "").toUpperCase();
  const signIn = (token) => {
    const response = NextResponse.json({ success: true });
    response.cookies.set(AUTH_COOKIE_NAME, token, cookie);
    if (["NL", "DE", "FR"].includes(country)) response.cookies.set(COUNTRY_COOKIE_NAME, country, cookie);
    return response;
  };
  switch (step) {
    case "login":
      if (typeof body?.token !== "string" || !body.token.trim()) {
        return NextResponse.json({ success: false, error: "TOKEN_INVALID" });
      }
      return signIn(`demo-${body.token.trim().slice(0, 20)}`);
    case "login-credentials":
      if (!body?.email || !body?.password) {
        return NextResponse.json({ success: false, error: "CREDENTIALS_INVALID" });
      }
      if (body.password === "wrong") {
        return NextResponse.json({ success: false, error: "CREDENTIALS_INVALID" });
      }
      if (body.password === "2fa") {
        return NextResponse.json({ success: false, error: "2FA_REQUIRED", partialToken: "demo-partial" });
      }
      return signIn("demo-credentials");
    case "verify-2fa":
      if (body?.partialToken !== "demo-partial" || body?.code !== "123456") {
        return NextResponse.json({ success: false, error: "2FA_INVALID" });
      }
      return signIn("demo-2fa");
    case "logout": {
      const response = NextResponse.json({ success: true });
      response.cookies.set(AUTH_COOKIE_NAME, "", { ...cookie, maxAge: 0 });
      return response;
    }
  }
  return fail("Not found.", 404);
}
function search(query) {
  const words = query.split(/\s+/);
  const hits = PRODUCTS.filter(
    (p) => words.every((w) => p.words.some((pw) => pw.startsWith(w)) || p.name.toLowerCase().includes(w))
  );
  const byCategory = /* @__PURE__ */ new Map();
  for (const hit of hits) byCategory.set(hit.category, [...byCategory.get(hit.category) ?? [], hit]);
  return {
    query,
    products: hits.map(plainProduct),
    sections: byCategory.size > 1 ? [...byCategory].map(([category, list]) => ({
      title: category[0].toUpperCase() + category.slice(1),
      products: list.map(plainProduct)
    })) : []
  };
}
function categoryTree() {
  const row = (title, image, deeplink, label) => ({
    type: "row-item",
    testID: `row-${title}`,
    title,
    image,
    deeplink,
    ...label ? { label: { title: label, backgroundColor: "YELLOW2", textColor: "#333333" } } : {}
  });
  return {
    pageId: "category-tree-root",
    tokens: { YELLOW2: "#FBD92B", GOLD1: "#95710F" },
    nodes: [
      {
        id: "list",
        component: "vertical-list",
        children: [],
        props: {
          items: [
            row("Acties", img("cat-acties"), "app.picnic://store/page;id=promo-group-deep-dive,promo_group_id=demo", "12 producten"),
            { type: "section-title", title: "Alle categorieën" },
            ...L1_CATEGORIES.map(
              (c) => row(c.name, img(`l1-${c.id}`), `app.picnic://store/page;id=L1-category-page-root,category_id=${c.id}`)
            )
          ]
        }
      }
    ]
  };
}
function promoPage(pageId) {
  return {
    pageId,
    tokens: {},
    nodes: [
      {
        id: "promo",
        component: "promo-deep-dive-content",
        children: [],
        props: {
          // The shape lib/rsc/map-sellable-tile.ts reads.
          sellableTiles: PRODUCTS.filter((p) => p.promoBadge).map((p) => ({
            type: "sellable",
            id: p.id,
            title: { title: p.name },
            subtitle: p.brand ? { text: p.brand } : void 0,
            images: { primaryImage: { imageId: p.imageId } },
            price: { priceValue: p.displayPrice / 100, referencePriceValue: p.originalPrice ? p.originalPrice / 100 : void 0 },
            suffixes: [{ type: "TEXT", text: p.unitQuantity }],
            labels: { bottomLeft: [{ type: "PROMO", labelText: p.promoBadge.text }] },
            unavailability: null
          }))
        }
      }
    ]
  };
}
function slotList(state) {
  const out = [];
  const start = new Date(state.now());
  start.setHours(0, 0, 0, 0);
  for (let day = 1; day <= 4; day++) {
    for (const [hour, green] of [
      [8, false],
      [17, true],
      [19, false]
    ]) {
      const from = new Date(start);
      from.setDate(start.getDate() + day);
      from.setHours(hour, 0, 0, 0);
      const to = new Date(from);
      to.setHours(hour + 1);
      const cutOff = new Date(from);
      cutOff.setDate(from.getDate() - 1);
      cutOff.setHours(22);
      const slotId = `slot-${day}-${hour}`;
      out.push({
        slotId,
        windowStart: from.toISOString(),
        windowEnd: to.toISOString(),
        cutOffTime: cutOff.toISOString(),
        isAvailable: !(day === 1 && hour === 8),
        isSelected: slotId === state.slotId,
        isGreenChoice: green,
        minimumOrderValue: 3500
      });
    }
  }
  return out;
}
function slots(state) {
  const all = slotList(state);
  const days = /* @__PURE__ */ new Map();
  for (const s of all) {
    const date = s.windowStart.slice(0, 10);
    days.set(date, [...days.get(date) ?? [], s]);
  }
  const dayGroups = [...days].map(([date, list]) => {
    const { dayLabel, dateLabel } = formatDayTabLabel(date, "NL");
    return {
      date,
      dayLabel,
      dateLabel,
      greenSlots: list.filter((s) => s.isGreenChoice),
      regularSlots: list.filter((s) => !s.isGreenChoice)
    };
  });
  return { dayGroups, selectedSlot: selectedSlot(state, all) };
}
function selectedSlot(state, all = slotList(state)) {
  const chosen = all.find((s) => s.slotId === state.slotId) ?? all.find((s) => s.isAvailable);
  return {
    slotId: chosen.slotId,
    state: state.explicitSlot ? "EXPLICIT" : "IMPLICIT",
    windowStart: chosen.windowStart,
    windowEnd: chosen.windowEnd,
    isExplicitSelection: state.explicitSlot
  };
}
function lineItem(line, index) {
  const product = productById(line.productId);
  const tier = product.priceRanges?.filter((t) => t.quantity <= line.quantity).at(-1);
  const unit = tier ? tier.pricePerUnit : product.displayPrice;
  const regular = product.originalPrice ?? product.displayPrice;
  return {
    id: `line-${index}-${product.id}`,
    productId: product.id,
    name: product.name,
    unitQuantity: product.unitQuantity,
    imageId: product.imageId,
    displayPrice: unit * line.quantity,
    originalPrice: unit < regular ? regular * line.quantity : null,
    quantity: line.quantity,
    maxCount: product.maxCount,
    badges: tier ? [{ text: `${tier.quantity} voor ${(tier.pricePerUnit * tier.quantity / 100).toFixed(2).replace(".", ",")}`, variant: "bundle" }] : [],
    isUnavailable: product.isUnavailable,
    unavailableExplanation: product.unavailableReason,
    replacements: product.isUnavailable ? PRODUCTS.filter((p) => p.category === product.category && !p.isUnavailable).slice(0, 3).map((p) => ({ id: p.id, name: p.name, imageId: p.imageId, displayPrice: p.displayPrice, unitQuantity: p.unitQuantity, maxCount: p.maxCount })) : [],
    basketGroupId: line.group
  };
}
function cart(state) {
  const items = state.lines.map(lineItem);
  const available = items.filter((i) => !i.isUnavailable);
  const goods = available.reduce((sum, i) => sum + i.displayPrice, 0);
  const promoSavings = available.reduce((sum, i) => sum + Math.max(0, (i.originalPrice ?? i.displayPrice) - i.displayPrice), 0);
  const bottles = available.filter((i) => i.productId === "s1006").reduce((n, i) => n + i.quantity, 0);
  const depositBreakdown = bottles ? [{ type: "BOTTLE", value: 15, count: bottles, total: 15 * bottles }] : [];
  const depositTotal = depositBreakdown.reduce((n, d) => n + d.total, 0);
  const slot2 = selectedSlot(state);
  const groups = [...new Set(state.lines.map((l) => l.group).filter((g) => g !== null))];
  return {
    items,
    totalPrice: goods + depositTotal,
    totalCount: available.reduce((n, i) => n + i.quantity, 0),
    totalDiscount: promoSavings,
    depositTotal,
    depositBreakdown,
    membershipSavings: 0,
    promoSavings,
    fees: [],
    minimumOrderValue: 3500,
    suggestions: PRODUCTS.filter((p) => p.promoBadge).slice(0, 4).map((p) => ({ id: p.id, name: p.name, imageId: p.imageId, displayPrice: p.displayPrice, unitQuantity: p.unitQuantity, maxCount: p.maxCount })),
    selectedSlot: slot2,
    deliveryBannerText: state.explicitSlot ? formatBannerText(slot2.windowStart, slot2.windowEnd, "NL") ?? "Kies je bezorgmoment" : "Kies je bezorgmoment",
    recipeGroups: groups.map((id) => {
      const recipe = recipeById(id);
      return { id, title: recipe?.name ?? "Recept", imageId: img(`recipe-${id.slice(-1)}`) };
    })
  };
}
function footer(state) {
  const total = cart(state).totalPrice;
  return {
    loyaltyPoints: total > 0 ? { label: { text: "Spaarpunten", color: null }, value: { text: `${Math.floor(total / 100)} punten`, color: "#295813" } } : null,
    recommendations: {
      title: "Niets vergeten?",
      pageId: "basket-recommendations",
      tiles: PRODUCTS.filter((p) => !p.isUnavailable).slice(0, 6).map((p) => ({ productId: p.id, imageId: p.imageId, backgroundColor: "#f5f1ec", hasPromo: Boolean(p.promoBadge) }))
    }
  };
}
function addLine(state, productId, count, group = null) {
  const line = state.lines.find((l) => l.productId === productId);
  if (line) {
    line.quantity += count;
    if (group && !line.group) line.group = group;
  } else {
    state.lines.push({ productId, quantity: count, group });
  }
}
function cartPost(state, segments, body, origin) {
  if (segments[1] === "delivery-slots") {
    const slot2 = slotList(state).find((s) => s.slotId === body?.slotId);
    if (!slot2) return fail("slotId is required", 400);
    if (!slot2.isAvailable) return fail("Dit bezorgmoment is vol.", 409);
    state.slotId = slot2.slotId;
    state.explicitSlot = true;
    return ok(cart(state));
  }
  if (segments[1] === "checkout") return checkout(state, segments[2], body, origin);
  if (segments.length !== 1) return fail("Not found.", 404);
  if (!body?.productId || !body?.action || typeof body.count !== "number") {
    return fail("Missing required fields: productId, action, count", 400);
  }
  if (body.action !== "add" && body.action !== "remove") return fail('action must be "add" or "remove"', 400);
  const product = productById(body.productId);
  if (!product) return fail("Failed to update cart. Please try again later.", 502);
  if (body.action === "add") {
    if (product.isUnavailable) return fail("Failed to update cart. Please try again later.", 502);
    const current = state.lines.find((l) => l.productId === product.id)?.quantity ?? 0;
    addLine(state, product.id, Math.min(body.count, product.maxCount - current));
  } else {
    const line = state.lines.find((l) => l.productId === product.id);
    if (line) {
      line.quantity -= body.count;
      if (line.quantity <= 0) state.lines = state.lines.filter((l) => l !== line);
    }
  }
  return ok(cart(state));
}
function paymentProfile() {
  return {
    preferredPaymentOptionId: "ideal-1",
    storedOptions: [{ id: "ideal-1", displayName: "iDEAL", account: "NL** DEMO 0000 0000 01", paymentMethod: "IDEAL", iconUrl: "" }]
  };
}
function checkout(state, step, body, origin) {
  const current = cart(state);
  switch (step) {
    case "start": {
      if (current.totalCount === 0) return fail("Failed to start checkout. Please try again later.", 502);
      const hasCoffee = current.items.some((i) => i.productId === "s1024");
      if (hasCoffee && !state.ageChecked && body?.resolveKey !== "age-ok") {
        return NextResponse.json(
          {
            issue: {
              code: "AGE_VERIFICATION",
              title: "Ben je 18 of ouder?",
              message: "Er zit een product in je mandje waarvoor je 18 moet zijn. (Demo: dit vraagt de winkel bij koffie.)",
              resolveKey: "age-ok",
              blocking: true,
              issueType: "AGE_VERIFICATION",
              requiresAgeVerification: true
            }
          },
          { status: 409 }
        );
      }
      if (body?.resolveKey === "age-ok") state.ageChecked = true;
      state.orders += 1;
      const data = {
        orderId: `demo-order-${state.orders}`,
        totalPrice: current.totalPrice,
        totalCount: current.totalCount,
        totalDeposit: current.depositTotal,
        totalSavings: current.promoSavings,
        transactionExpiry: new Date(state.now() + 15 * 60 * 1e3).toISOString()
      };
      return ok(data);
    }
    case "initiate": {
      if (typeof body?.orderId !== "string" || !body.orderId) return fail("orderId is required", 400);
      const transactionId = `demo-tx-${state.checkouts.size + 1}`;
      state.checkouts.set(transactionId, { orderId: body.orderId, polls: 0, cancelled: false });
      return ok({ paymentId: `demo-pay-${state.checkouts.size}`, transactionId, redirectUrl: `${origin}/checkout/return` });
    }
    case "confirm": {
      if (typeof body?.orderId !== "string" || !body.orderId) return fail("orderId is required", 400);
      const tx = body.transactionId ? state.checkouts.get(body.transactionId) : null;
      if (tx && tx.polls < 2) return fail("Payment not completed yet. Cannot confirm order.", 409);
      state.lines = [];
      state.explicitSlot = false;
      return ok({ success: true, orderId: body.orderId });
    }
    case "cancel": {
      const tx = typeof body?.transactionId === "string" ? state.checkouts.get(body.transactionId) : null;
      if (!tx) return fail("transactionId is required", 400);
      tx.cancelled = true;
      return ok({ success: true });
    }
  }
  return fail("Not found.", 404);
}
function checkoutStatus(state, transactionId) {
  if (!transactionId) return fail("transactionId is required", 400);
  const tx = state.checkouts.get(transactionId);
  if (!tx) return fail("Failed to load checkout status. Please try again later.", 502);
  tx.polls += 1;
  const checkoutStatus2 = tx.cancelled ? "CANCELLED" : tx.polls >= 2 ? "FINISHED" : "PENDING";
  return ok({ checkoutStatus: checkoutStatus2 });
}
var recipeItem = (r) => ({
  id: r.id,
  name: r.name,
  imageId: img(`recipe-${r.id.slice(-1)}`),
  cookingTimeMinutes: r.minutes
});
function cookbook(state, sub, q) {
  if (sub === "counts") {
    const counts = { __featured__: RECIPES.length, __saved__: state.savedRecipes.size };
    for (const c of RECIPE_CATEGORIES) counts[c.id] = RECIPES.filter((r) => r.categories.includes(c.id)).length;
    return ok(counts);
  }
  if (sub === "search") {
    const query = (q.get("q") ?? "").toLowerCase();
    return ok({
      categories: [],
      recipes: RECIPES.filter(
        (r) => r.name.toLowerCase().includes(query) || r.ingredients.some((i) => productById(i.product).name.toLowerCase().includes(query))
      ).map(recipeItem)
    });
  }
  const category = q.get("category");
  let list = RECIPES;
  if (category === "__saved__") list = RECIPES.filter((r) => state.savedRecipes.has(r.id));
  else if (category) {
    if (!/^recipe-cattree-[\w-]+$/.test(category)) return fail("Invalid category ID", 400);
    list = RECIPES.filter((r) => r.categories.includes(category));
  }
  return ok({ categories: category ? [] : RECIPE_CATEGORIES, recipes: list.map(recipeItem) });
}
function recipeDetail(state, id, portions) {
  const recipe = recipeById(id);
  const ingredients = recipeIngredients(recipe, portions).map((ing) => {
    const swapped = ing.ingredientId ? state.ingredientChoice.get(`${id}:${ing.ingredientId}`) : void 0;
    const product = swapped ? productById(swapped) : null;
    return product ? { ...ing, id: product.id, name: product.name, imageId: product.imageId, displayPrice: product.displayPrice, unitQuantity: product.unitQuantity } : ing;
  });
  return {
    id,
    name: recipe.name,
    imageId: img(`recipe-${id.slice(-1)}`),
    cookingTimeMinutes: recipe.minutes,
    portions,
    ingredients,
    steps: recipe.steps,
    stepsPortionWarning: portions > 6 ? "Let op: de bereiding is geschreven voor 6 personen of minder." : null,
    recipeNutritionRows: [
      { label: "Energie", value: "520 kcal", isCategory: true, backgroundColor: null },
      { label: "Eiwitten", value: "21 g", isCategory: true, backgroundColor: "#f5f1ec" }
    ],
    allergens: {
      confirmed: [{ text: "Soja", backgroundColor: "#b40117", textColor: "#ffffff" }],
      mayContain: [{ text: "Gluten", backgroundColor: "#fbd92b", textColor: "#333333" }]
    }
  };
}
function ingredientEdit(state, recipeId, slotId) {
  const recipe = recipeById(recipeId);
  const ingredient = recipe.ingredients.find((i) => i.slot === slotId) ?? recipe.ingredients[0];
  const own = productById(ingredient.product);
  const chosen = state.ingredientChoice.get(`${recipeId}:${ingredient.slot}`) ?? own.id;
  const alternatives = PRODUCTS.filter((p) => p.category === own.category && p.id !== own.id).slice(0, 4);
  const tile = (p) => ({
    id: p.id,
    name: p.name,
    brand: p.brand,
    imageId: p.imageId,
    displayPrice: p.isUnavailable ? 0 : p.displayPrice,
    originalPrice: p.originalPrice,
    promotionLabel: p.promoBadge?.text ?? null,
    unitQuantity: p.unitQuantity,
    tags: p.words.includes("vegan") ? ["Vegan"] : [],
    isUnavailable: p.isUnavailable,
    unavailableReason: p.unavailableReason
  });
  return {
    ingredientId: ingredient.slot,
    subtitle: `${ingredient.text} volgens het originele recept`,
    groups: [
      { title: own.name, alternatives: [tile(own)] },
      { title: "Andere keuzes", alternatives: alternatives.map(tile) }
    ],
    selected: { [chosen]: 1 }
  };
}
function recipePost(state, segments, body) {
  const [, id, action, slotId] = segments;
  const recipe = recipeById(id ?? "");
  if (!recipe) return fail("Invalid recipe ID", 400);
  if (action === "save") {
    if (typeof body?.saved !== "boolean") return fail("saved must be a boolean", 400);
    if (body.saved) state.savedRecipes.add(id);
    else state.savedRecipes.delete(id);
    return ok({ saved: body.saved });
  }
  if (action === "add-to-cart") {
    const portions = typeof body?.portions === "number" && body.portions > 0 ? body.portions : recipe.portions;
    const chosen = Array.isArray(body?.selectedIngredients) ? body.selectedIngredients : recipeIngredients(recipe, portions).filter((i) => !i.isCondiment).map((i) => ({ id: i.id, count: i.quantity }));
    for (const item of chosen) {
      if (item.count > 0 && productById(item.id) && !productById(item.id).isUnavailable) addLine(state, item.id, item.count, id);
    }
    return ok({ success: true });
  }
  if (action === "ingredient" && slotId) {
    const quantities = body?.quantities;
    if (typeof quantities !== "object" || quantities === null) return fail("quantities is required", 400);
    const picked = Object.entries(quantities).find(([, n]) => n > 0)?.[0];
    if (picked && productById(picked)) state.ingredientChoice.set(`${id}:${slotId}`, picked);
    return ok({ success: true });
  }
  return fail("Not found.", 404);
}
function mealPlan(step, body) {
  const people = Number.isInteger(body?.people) ? body.people : 0;
  if (step === "search") {
    const candidates = Array.isArray(body?.candidateIds) ? body.candidateIds : [];
    const fixed = Array.isArray(body?.fixedIds) ? body.fixedIds : [];
    const slots2 = Number.isInteger(body?.slots) ? body.slots : 0;
    if (slots2 < 1) return fail("slots must be at least 1", 400);
    if (people < 1 || people > 12) return fail("people must be between 1 and 12", 400);
    const picked = candidates.filter((c) => !fixed.includes(c) && recipeById(c)).slice(0, slots2);
    return ok({
      combinations: [{ recipeIds: picked, packagesSaved: picked.length > 1 ? 2 : 0, totalPriceCents: 1850 * picked.length }]
    });
  }
  if (step === "shopping-list") {
    const ids = Array.isArray(body?.recipeIds) ? body.recipeIds : [];
    const recipes = ids.map(recipeById).filter((r) => r !== null);
    const seen = /* @__PURE__ */ new Map();
    for (const recipe of recipes) {
      for (const ing of recipeIngredients(recipe, people || 2).filter((i) => !i.isCondiment)) {
        const known = seen.get(ing.id);
        if (known) known.usedInRecipeIds.push(recipe.id);
        else
          seen.set(ing.id, {
            ingredientId: ing.ingredientId ?? ing.id,
            ownerSellingUnitId: ing.id,
            name: ing.name,
            imageId: ing.imageId,
            packagesNeeded: ing.quantity,
            unitPriceCents: ing.displayPrice,
            ownerRecipeId: recipe.id,
            usedInRecipeIds: [recipe.id]
          });
      }
    }
    const items = [...seen.values()];
    return ok({
      recipes: recipes.map((r) => ({ id: r.id, name: r.name, imageId: img(`recipe-${r.id.slice(-1)}`) })),
      items,
      totalPriceCents: items.reduce((n, i) => n + i.unitPriceCents * i.packagesNeeded, 0),
      packagesSaved: items.filter((i) => i.usedInRecipeIds.length > 1).length
    });
  }
  return fail("Not found.", 404);
}
function deliveryList(state) {
  const day = 24 * 60 * 60 * 1e3;
  const at = (offsetDays, hour) => {
    const d = new Date(state.now() + offsetDays * day);
    d.setHours(hour, 0, 0, 0);
    return d.toISOString();
  };
  const make = (id, status, offset, total, count) => ({
    id,
    status: state.cancelled.has(id) ? "CANCELLED" : status,
    creationTime: at(offset - 2, 12),
    windowStart: at(offset, 17),
    windowEnd: at(offset, 18),
    deliveryWindowText: formatDeliveryWindowText(at(offset, 17), at(offset, 18), "NL"),
    orderCount: 1,
    totalPrice: total,
    itemCount: count
  });
  return [
    make("demo-delivery-current", "CURRENT", 0, 5412, 14),
    make("demo-delivery-1", "COMPLETED", -7, 6230, 18),
    make("demo-delivery-2", "COMPLETED", -14, 4875, 12),
    make("demo-delivery-3", "CANCELLED", -21, 3990, 9)
  ];
}
function deliveryDetail(state, id) {
  const summary = deliveryList(state).find((d) => d.id === id);
  if (!summary) return null;
  const picks = {
    "demo-delivery-current": [["s1001", 1], ["s1004", 2], ["s1011", 1], ["s1024", 1]],
    "demo-delivery-1": [["s1001", 1], ["s1006", 2], ["s1011", 1], ["s1013", 2]],
    "demo-delivery-2": [["s1001", 2], ["s1008", 1], ["s1012", 1]],
    "demo-delivery-3": [["s1018", 1]]
  };
  const items = (picks[id] ?? []).map(([productId, quantity], i) => lineItem({ productId, quantity, group: null }, i));
  const total = items.reduce((n, i) => n + i.displayPrice, 0);
  return {
    id,
    status: summary.status,
    creationTime: summary.creationTime,
    windowStart: summary.windowStart,
    windowEnd: summary.windowEnd,
    deliveryWindowText: summary.deliveryWindowText,
    orders: [
      {
        id: `${id}-order`,
        items,
        totalPrice: total,
        checkoutTotalPrice: total,
        totalSavings: 0,
        totalDeposit: 0,
        membershipSavings: 0,
        cancellable: summary.status === "CURRENT",
        status: summary.status,
        creationTime: summary.creationTime,
        fees: [],
        depositBreakdown: [],
        payment: { paymentType: "iDEAL", redactedIban: "NL** DEMO 0000 0000 01", bankId: "DEMO" }
      }
    ],
    returnedContainers: summary.status === "COMPLETED" ? [{ type: "BOTTLE", name: "Statiegeldfles", quantity: 2, price: -30 }] : [],
    totalPrice: total,
    totalCount: items.reduce((n, i) => n + i.quantity, 0),
    totalDiscount: 0,
    depositTotal: 0,
    depositBreakdown: [],
    membershipSavings: 0,
    promoSavings: 0,
    fees: [],
    cancellable: summary.status === "CURRENT"
  };
}
function deliveriesGet(state, segments, status) {
  if (segments.length === 1) {
    const all = deliveryList(state);
    return ok({ deliveries: status ? all.filter((d) => d.status === status) : all });
  }
  const id = segments[1];
  const detail = deliveryDetail(state, id);
  if (!detail) return fail("Failed to load delivery. Please try again later.", 502);
  if (segments[2] === "position") {
    const base = state.now();
    return ok({
      version: 1,
      scenario_ts: base - 6e4,
      scenario_in_progress: detail.status === "CURRENT",
      query_interval: 15e3,
      eta: base + 20 * 6e4,
      eta_window: { start: new Date(base + 15 * 6e4).toISOString(), end: new Date(base + 25 * 6e4).toISOString() }
    });
  }
  if (segments[2] === "scenario") {
    const base = state.now();
    const route = Array.from({ length: 12 }, (_, i) => ({ lat: 52.37 + i * 2e-3, lng: 4.88 + i * 3e-3, ts: base - (11 - i) * 6e4 }));
    return ok({
      version: 1,
      scenario: route,
      driver: { name: "Sam" },
      vehicle: { name: "Elektrisch busje" },
      destination: { lat: 52.395, lng: 4.92, street: "Demostraat 1", city: "Amsterdam", postcode: "1000 AA" }
    });
  }
  if (segments.length === 2) return ok(detail);
  return fail("Not found.", 404);
}
function deliveriesPost(state, segments, body) {
  const id = segments[1];
  const detail = id ? deliveryDetail(state, id) : null;
  if (!detail) return fail("Not found.", 404);
  switch (segments[2]) {
    case "cancel":
      if (!detail.cancellable) return fail("Failed to cancel delivery. Please try again later.", 502);
      state.cancelled.add(id);
      return ok({ success: true });
    case "invoice":
      return ok({ success: true });
    case "rating": {
      const rating = body?.rating;
      if (!Number.isInteger(rating) || rating < 0 || rating > 10) return fail("rating must be an integer between 0 and 10", 400);
      if (state.rated.has(id)) return fail("Delivery already rated", 409);
      state.rated.add(id);
      return ok({ success: true });
    }
  }
  return fail("Not found.", 404);
}
function parcels() {
  return {
    title: "Pakketservice",
    subtitle: "Laat je pakketjes thuisbezorgen door Picnic",
    sections: [
      {
        title: "Verwerkt",
        parcels: [
          { id: "p1", name: "DHL-pakket", statusText: "Bezorgd", statusColor: "#308807", dateText: "3 oktober 2026", parcelId: "JVGL0000DEMO1" },
          { id: "p2", name: "PostNL-retour", statusText: "Opgehaald door Picnic", statusColor: null, dateText: "21 september 2026", parcelId: "3SDEMO0002" }
        ]
      }
    ]
  };
}
function parcel(id) {
  return {
    title: "Jouw pakketje",
    shipmentLabel: "Zendingsnummer:",
    shipmentNumber: id,
    copiedMessage: "Zendingsnummer gekopieerd!",
    steps: [
      { title: "Aangemeld", dateText: "Woensdag 1 oktober 2026", done: true, markerColor: "#295813", markerSize: 12, lineColor: "#295813" },
      { title: "Opgehaald door Picnic", dateText: "Donderdag 2 oktober 2026", done: true, markerColor: "#295813", markerSize: 12, lineColor: "#295813" },
      { title: "Bezorgd", dateText: "Vrijdag 3 oktober 2026", done: true, markerColor: "#295813", markerSize: 18, lineColor: null }
    ],
    footerText: "Dankjewel! Samen besparen we een onnodig ritje in de buurt."
  };
}

// vendor/picnic-web/src/app/api/auth/login/route.ts
var route_exports = {};
__export(route_exports, {
  POST: () => POST
});
async function POST(request) {
  const body = await request.json().catch(() => null);
  const token = body?.token;
  const rawCode = String(body?.countryCode ?? "").toUpperCase();
  const countryCode = SUPPORTED_COUNTRY_CODES.includes(rawCode) ? rawCode : readCountryCode(request);
  if (!token || token.trim() === "") {
    return NextResponse.json({ success: false, error: "TOKEN_INVALID" });
  }
  try {
    const client = buildPicnicClient(token.trim(), countryCode);
    await client.catalog.getSuggestions("");
    const response = NextResponse.json({ success: true });
    response.cookies.set(AUTH_COOKIE_NAME, token.trim(), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: AUTH_COOKIE_MAX_AGE_SECONDS
    });
    response.cookies.set(COUNTRY_COOKIE_NAME, countryCode, {
      httpOnly: false,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: AUTH_COOKIE_MAX_AGE_SECONDS
    });
    return response;
  } catch (error2) {
    const isAuthError = isApiAuthError(error2);
    if (isAuthError) {
      return NextResponse.json({ success: false, error: "TOKEN_INVALID" });
    }
    return NextResponse.json({ success: false, error: "API_UNREACHABLE" });
  }
}

// vendor/picnic-web/src/app/api/auth/login-credentials/route.ts
var route_exports2 = {};
__export(route_exports2, {
  POST: () => POST2
});
async function POST2(request) {
  const body = await request.json().catch(() => null);
  const email = body?.email;
  const password = body?.password;
  const rawCode = String(body?.countryCode ?? "").toUpperCase();
  const countryCode = SUPPORTED_COUNTRY_CODES.includes(rawCode) ? rawCode : readCountryCode(request);
  if (!email || email.trim() === "" || !password || password.trim() === "") {
    return NextResponse.json({
      success: false,
      error: "CREDENTIALS_INVALID"
    });
  }
  const cookieOptions = {
    httpOnly: false,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: AUTH_COOKIE_MAX_AGE_SECONDS
  };
  try {
    const client = buildPicnicClientAnonymous(countryCode);
    const result = await client.auth.login(email.trim(), password);
    const authKey = result.authKey;
    if (!authKey) {
      return NextResponse.json({
        success: false,
        error: "CREDENTIALS_INVALID"
      });
    }
    if (result.second_factor_authentication_required) {
      await client.auth.generate2FACode("SMS");
      const response2 = NextResponse.json({
        success: false,
        error: "2FA_REQUIRED",
        partialToken: authKey
      });
      response2.cookies.set(COUNTRY_COOKIE_NAME, countryCode, cookieOptions);
      return response2;
    }
    const validatedClient = buildPicnicClient(authKey, countryCode);
    await validatedClient.catalog.getSuggestions("");
    const response = NextResponse.json({ success: true });
    response.cookies.set(AUTH_COOKIE_NAME, authKey, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: AUTH_COOKIE_MAX_AGE_SECONDS
    });
    response.cookies.set(COUNTRY_COOKIE_NAME, countryCode, cookieOptions);
    return response;
  } catch (error2) {
    if (isApiAuthError(error2)) {
      return NextResponse.json({
        success: false,
        error: "CREDENTIALS_INVALID"
      });
    }
    return NextResponse.json({ success: false, error: "API_UNREACHABLE" });
  }
}

// vendor/picnic-web/src/app/api/auth/logout/route.ts
var route_exports3 = {};
__export(route_exports3, {
  POST: () => POST3
});
async function POST3() {
  const response = NextResponse.json({ success: true });
  response.cookies.set(AUTH_COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0
  });
  return response;
}

// vendor/picnic-web/src/app/api/auth/verify-2fa/route.ts
var route_exports4 = {};
__export(route_exports4, {
  POST: () => POST4
});
async function POST4(request) {
  const body = await request.json().catch(() => null);
  const partialToken = body?.partialToken;
  const code = body?.code;
  const countryCode = readCountryCode(request);
  if (!partialToken || !code || code.trim() === "") {
    return NextResponse.json({
      success: false,
      error: "2FA_INVALID"
    });
  }
  try {
    const client = buildPicnicClient(partialToken, countryCode);
    const result = await client.auth.verify2FACode(code.trim());
    const authKey = result.authKey;
    if (!authKey) {
      return NextResponse.json({
        success: false,
        error: "2FA_INVALID"
      });
    }
    const validatedClient = buildPicnicClient(authKey, countryCode);
    await validatedClient.catalog.getSuggestions("");
    const response = NextResponse.json({ success: true });
    response.cookies.set(AUTH_COOKIE_NAME, authKey, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: AUTH_COOKIE_MAX_AGE_SECONDS
    });
    return response;
  } catch (error2) {
    if (is2FAError(error2)) {
      return NextResponse.json({
        success: false,
        error: "2FA_INVALID"
      });
    }
    return NextResponse.json({ success: false, error: "API_UNREACHABLE" });
  }
}

// vendor/picnic-web/src/app/api/cart/route.ts
var route_exports5 = {};
__export(route_exports5, {
  DELETE: () => DELETE,
  GET: () => GET,
  POST: () => POST5
});

// vendor/picnic-web/src/lib/core/i18n/de.ts
var de = {
  // Search bar
  searchPlaceholder: "Produkte suchen...",
  searchAriaLabel: "Produkte suchen",
  searchButtonAriaLabel: "Suchen",
  // Home page errors
  searchError: "Ein Fehler ist aufgetreten. Bitte versuche es später erneut.",
  categoriesLoadError: "Kategorien konnten nicht geladen werden.",
  // Results view
  noResultsFor: "Keine Ergebnisse gefunden für",
  tryAnotherTerm: "Versuche einen anderen Suchbegriff",
  resultSingular: "Ergebnis",
  resultPlural: "Ergebnisse",
  // Login page
  loginTitle: "Anmelden",
  sessionExpired: "Deine Sitzung ist abgelaufen. Bitte melde dich erneut an.",
  enter2FACode: "Gib den Bestätigungscode ein",
  verificationFailed: "Verifizierung fehlgeschlagen. Bitte versuche es später erneut.",
  enterEmailAndPassword: "Gib deine E-Mail-Adresse und dein Passwort ein",
  loginFailed: "Anmeldung fehlgeschlagen. Bitte versuche es später erneut.",
  enterToken: "Gib ein Token ein",
  tokenVerifyFailed: "Token konnte nicht verifiziert werden. Bitte versuche es später erneut.",
  smsSent: "Ein Bestätigungscode wurde per SMS an dein Telefon gesendet.",
  verificationCodeLabel: "Bestätigungscode",
  verificationCodePlaceholder: "Code eingeben",
  emailLabel: "E-Mail-Adresse",
  emailPlaceholder: "deine-email@beispiel.de",
  passwordLabel: "Passwort",
  passwordPlaceholder: "Dein Passwort",
  tokenPlaceholder: "Token hier einfügen",
  hideToken: "Token verbergen",
  showToken: "Token anzeigen",
  verifyButton: "Verifizieren",
  loginButton: "Anmelden",
  howToGetToken: "Wie bekomme ich einen Auth-Token?",
  npmPackageUseBefore: "Nutze das",
  npmPackageText: "npm-Paket zum Anmelden bei deinem Picnic-Konto:",
  copyAuthKeyBefore: "Kopiere den",
  copyAuthKeyAfter: "Wert und füge ihn oben ein.",
  whyAuthToken: "Warum brauche ich einen Auth-Token?",
  whyAuthTokenBody: "Aus Sicherheitsgründen zeigen wir kein Standard-Anmeldeformular mit E-Mail-Adresse und Passwort. Ein Auth-Token stellt sicher, dass deine Anmeldedaten niemals über diese Website übertragen werden. Das Token kann jederzeit widerrufen werden, ohne dein Passwort zu ändern.",
  isOfficialSite: "Ist dies die offizielle Picnic-Website?",
  isOfficialSiteBody: "Nein, dies ist nicht die offizielle Picnic-Website. Dies ist ein unabhängiges Open-Source-Projekt und steht in keiner Verbindung zu Picnic. Sieh dir den Quellcode auf",
  tokenInvalid: "Token ist ungültig. Bitte versuche es erneut.",
  credentialsInvalid: "E-Mail-Adresse oder Passwort ist falsch. Bitte versuche es erneut.",
  twoFAInvalid: "Bestätigungscode ist falsch. Bitte versuche es erneut.",
  apiUnreachable: "Verbindung mit Picnic nicht möglich. Bitte versuche es später erneut.",
  genericError: "Ein Fehler ist aufgetreten. Bitte versuche es später erneut.",
  loadingAriaLabel: "Laden",
  codeSnippetEmail: "deine-email",
  codeSnippetPassword: "dein-passwort",
  // Cart
  emptyCartTitle: "Dein Warenkorb ist leer",
  emptyCartText: "Füge Produkte über die Picnic-App hinzu oder suche etwas.",
  goToSearch: "Zur Suche",
  cartTitle: "Warenkorb",
  nothingForgotten: "Alles dabei?",
  cartMutationError: "Ein Fehler ist aufgetreten. Bitte versuche es erneut.",
  cartLoadError: "Ein Fehler ist aufgetreten. Bitte versuche es später erneut.",
  cartOtherItems: "Weitere Produkte",
  clearCartButton: "Warenkorb leeren",
  clearCartError: "Warenkorb konnte nicht geleert werden. Bitte versuche es erneut.",
  clearCartConfirmTitle: "Warenkorb leeren?",
  clearCartConfirmMessage: "Alle Produkte werden aus deinem Warenkorb entfernt.",
  confirmButton: "Bestätigen",
  cancelButton: "Abbrechen",
  // Checkout
  checkoutLabel: "Zur Kasse",
  checkoutDeepLinkCountry: "de",
  checkoutPageTitle: "Kasse",
  checkoutLoadError: "Checkout konnte nicht geladen werden.",
  checkoutContinueButton: "Weiter zur Zahlung",
  checkoutProcessing: "Wird verarbeitet…",
  checkoutStartError: "Checkout konnte nicht gestartet werden.",
  checkoutPaymentError: "Zahlung konnte nicht gestartet werden.",
  checkoutPaymentTitle: "Zahlungsdaten",
  checkoutOrderTotal: "Gesamt",
  checkoutExpires: "Gültig bis",
  checkoutPayButton: "Zur Bank",
  checkoutReturnTitle: "Zahlung abschließen",
  checkoutMissingSession: "Keine aktive Zahlungssitzung gefunden.",
  checkoutPollingMessage: "Wir prüfen deine Zahlung…",
  checkoutStatusLabel: "Status",
  checkoutCancelPaymentButton: "Zahlung abbrechen",
  checkoutStatusError: "Zahlungsstatus konnte nicht abgerufen werden.",
  checkoutConfirmError: "Bestellung konnte nicht bestätigt werden.",
  checkoutCancelError: "Zahlung konnte nicht abgebrochen werden.",
  checkoutMinimumNotMet: "Mindestbestellwert noch nicht erreicht.",
  // Delivery slot picker
  pickerTitle: "Wähle deinen Lieferzeitpunkt",
  freeDeliveryLabel: "Immer kostenlos geliefert!",
  selectedSectionLabel: "Von dir ausgewählt",
  otherMomentLabel: "Oder wähle einen anderen Zeitpunkt",
  greenChoiceLabel: "Grünste Wahl für deine Nachbarschaft",
  noSlotsLabel: "Keine Lieferzeitpunkte verfügbar.",
  closeAriaLabel: "Schließen",
  retryLabel: "Erneut versuchen",
  tapToChoose: "Tippen zum Auswählen",
  // Order summary
  depositBag: "Pfand Tasche",
  depositBottle: "Pfand Flasche",
  depositGeneric: "Pfand",
  orderSummaryTitle: "Bestellübersicht",
  itemsLabel: "Artikel",
  minimumOrderLabel: "Mindestbestellwert",
  totalLabel: "Gesamt",
  cartPromoLabel: "Aktion",
  cartDeliveryLabel: "Lieferung",
  cartDeliveryFree: "Kostenlos",
  // Quantity stepper
  removeOneAriaLabel: "1 entfernen",
  addOneAriaLabel: "1 hinzufügen",
  // Savings label
  savedSuffix: "gespart",
  // Product card
  addToCartAriaLabel: "Zum Warenkorb hinzufügen",
  addToCartButton: "In den Warenkorb",
  inCartLabel: "im Warenkorb",
  bundleFromLabel: "Ab",
  similarProductsTitle: "Ähnliche Produkte",
  descriptionTitle: "Beschreibung",
  // Section nav bar
  sectionNavGoTo: "Gehe zu",
  // Category products view
  backButton: "Zurück",
  breadcrumbLabel: "Navigationspfad",
  noProductsInCategory: "Keine Produkte in dieser Kategorie gefunden.",
  productSingular: "Produkt",
  productPlural: "Produkte",
  // Pages
  defaultPageTitle: "Produkte",
  noPageSpecified: "Keine Seite angegeben.",
  productsLoadError: "Produkte konnten nicht geladen werden.",
  // Cookbook
  cookbookTitle: "Alle Rezepte",
  cookbookFeatured: "Empfehlungen",
  cookbookSaved: "Gespeicherte Rezepte",
  cookbookSearchPlaceholder: "Nach Rezept oder Zutat suchen...",
  cookbookLoadError: "Rezepte konnten nicht geladen werden.",
  noRecipes: "Keine Rezepte gefunden.",
  cookingTimeMinutes: "Min.",
  cookbookCategoryLabel: "Kategorie",
  recipeSave: "Rezept speichern",
  recipeUnsave: "Rezept nicht mehr speichern",
  recipeSaveError: "Rezept konnte nicht gespeichert werden.",
  mealPlanSelectAll: "Alle auswählen",
  mealPlanDays: "Tage",
  mealPlanGenerate: "Plan generieren",
  mealPlanContinue: "weiter planen",
  mealPlanNotEnoughRecipes: "Nur {available} von {requested} Rezepten in den gewählten Kategorien verfügbar — Plan auf {available} Tage begrenzt.",
  mealPlanPeople: "Personen",
  mealPlanConfirmLabel: "Rezept im Plan behalten",
  mealPlanAddLabel: "Rezept zum Plan hinzufügen",
  mealPlanSelectAllRecipes: "Alle Rezepte auswählen",
  mealPlanPageTitle: "Rezepte Planung",
  mealPlanContinueDisabledHint: "Mehr Tage eintragen oder ein Rezept abwählen, um weiterzuplanen",
  mealPlanRecent: "Letzter Essensplan",
  mealPlanClear: "Plan löschen",
  mealPlanViewShoppingList: "Einkaufsliste ansehen",
  mealPlanPackagesSaved: "{n} Packungen gespart",
  mealPlanSharedWith: "Auch verwendet in {recipe}",
  mealPlanAddAllToCart: "Alles in den Warenkorb legen",
  mealPlanAddingToCart: "Wird hinzugefügt…",
  mealPlanAddedToCart: "Hinzugefügt!",
  mealPlanGenerateError: "Der Plan konnte nicht generiert werden.",
  mealPlanRateLimited: "Zu viele Anfragen. Warte kurz und versuche es erneut.",
  mealPlanShoppingListTitle: "Einkaufsliste",
  mealPlanShoppingListError: "Einkaufsliste konnte nicht geladen werden.",
  mealPlanTotal: "Gesamt",
  // Auth
  signOut: "Abmelden",
  // App navigation
  navMainAriaLabel: "Hauptnavigation",
  navDiscover: "Entdecken",
  navFavorites: "Favoriten",
  navCooking: "Kochen",
  navSearch: "Suchen",
  navCart: "Korb",
  navAccount: "Konto",
  closeLabel: "Schließen",
  // Account panel
  accountParcels: "Paketservice",
  accountFamilyAccount: "Mein {highlight}",
  accountFamilyAccountHighlight: "Family-Konto",
  accountFamilyBadge: "Family",
  accountLoyaltyPrograms: "Sparprogramme",
  accountWallet: "Geldbörse",
  accountFriends: "Freunde werben",
  accountReminders: "Einkaufswecker",
  accountSupport: "Kundenservice",
  accountFaq: "Häufige Fragen",
  comingSoon: "Demnächst",
  // Discover and favorites placeholders
  discoverTitle: "Entdecken",
  favoritesTitle: "Favoriten",
  // Recipe detail
  recipeIngredients: "Zutaten",
  recipeSteps: "Zubereitung",
  recipePortions: "Personen",
  recipeAddToCart: "Alle Zutaten in den Warenkorb",
  recipeAddingToCart: "Wird hinzugefügt...",
  recipeAddedToCart: "Hinzugefügt!",
  recipeCondiments: "Hast du wahrscheinlich schon",
  recipeLoadError: "Rezept konnte nicht geladen werden.",
  recipePricePerServing: "pro Portion",
  recipePriceTotal: "gesamt",
  recipeAllergens: "Enthält",
  recipeMayContain: "Kann enthalten",
  recipeEditIngredient: "Zutat anpassen",
  recipeEditSave: "Speichern",
  recipeEditSaving: "Wird gespeichert...",
  recipeEditCancel: "Abbrechen",
  recipeEditLoadError: "Alternativen konnten nicht geladen werden.",
  recipeEditSaveError: "Zutat konnte nicht angepasst werden.",
  recipeEditUnavailable: "Produkt nicht mehr lieferbar",
  recipeNutrition: "Nährwerte",
  // Toast / error view
  dismissAriaLabel: "Schließen",
  retryButton: "Erneut versuchen",
  // Generic error page
  errorHeading: "Ein Fehler ist aufgetreten",
  errorUnexpected: "Ein unerwarteter Fehler ist aufgetreten.",
  errorRetry: "Erneut versuchen",
  // Category page
  categoryFallbackTitle: "Kategorie",
  subcategoriesLoadError: "Unterkategorien konnten nicht geladen werden.",
  // Token login label
  authTokenLabel: "Picnic Auth-Token",
  // Search results count
  resultFor: "für",
  // Allergen badges
  allergenTitle: "Allergene",
  // Deliveries
  deliveriesTitle: "Bestellungen",
  deliveriesNavLabel: "Bestellungen",
  deliveriesTabAll: "Alle",
  deliveriesEmptyAll: "Noch keine Bestellungen.",
  deliveriesTabCurrent: "Aktuell",
  deliveriesTabCompleted: "Abgeschlossen",
  deliveriesTabCancelled: "Storniert",
  deliveriesEmptyCurrent: "Keine aktiven Bestellungen.",
  deliveriesEmptyCompleted: "Keine abgeschlossenen Bestellungen.",
  deliveriesEmptyCancelled: "Keine stornierten Bestellungen.",
  deliveriesLoadError: "Bestellungen konnten nicht geladen werden.",
  deliveriesLiveTrack: "Live verfolgen",
  deliveriesOrdersLabel: "Bestellungen",
  deliveriesStatusCurrent: "Aktiv",
  deliveriesStatusCompleted: "Abgeschlossen",
  deliveriesStatusCancelled: "Storniert",
  deliveriesStatusPlanned: "Geplant",
  deliveriesStatusEnRoute: "Unterwegs",
  deliveriesStatusDelivered: "Geliefert",
  deliveriesDetailTitle: "Bestellung",
  deliveriesDetailLoadError: "Bestellung konnte nicht geladen werden.",
  deliveriesWindowTitle: "Lieferzeitfenster",
  deliveriesPaymentTitle: "Zahlung",
  deliveriesPaymentType: "Zahlungsart",
  deliveriesReturnedContainers: "Zurückgegebenes Pfand",
  deliveriesCancelButton: "Bestellung stornieren",
  deliveriesCancelConfirmTitle: "Bestellung stornieren?",
  deliveriesCancelConfirmMessage: "Möchtest du diese Bestellung wirklich stornieren?",
  deliveriesCancelSuccess: "Bestellung storniert.",
  deliveriesCancelError: "Stornierung fehlgeschlagen. Bitte erneut versuchen.",
  deliveriesRateTitle: "Bewerte deine Lieferung",
  deliveriesRateSubmit: "Bewertung absenden",
  deliveriesRateSuccess: "Danke für deine Bewertung!",
  deliveriesRateError: "Bewertung konnte nicht gesendet werden.",
  deliveriesRateAlready: "Diese Bestellung wurde bereits bewertet.",
  deliveriesInvoiceButton: "Rechnung erneut senden",
  deliveriesInvoiceSuccess: "Rechnung wurde per E-Mail gesendet.",
  deliveriesInvoiceError: "Rechnung konnte nicht gesendet werden.",
  parcelsLoadError: "Pakete konnten nicht geladen werden.",
  parcelsEmpty: "Du hast noch keine Pakete angemeldet.",
  parcelCopyShipmentNumber: "Sendungsnummer kopieren",
  // Wallet
  walletLoadError: "Das Portemonnaie konnte nicht geladen werden.",
  walletPaymentTitle: "Zahlung",
  walletViewReceipt: "Vollständigen Kassenbon ansehen",
  walletReturnedDeposits: "Pfand zurück",
  walletPaidOn: "Bezahlt am {date}",
  walletRefundedOn: "Erstattet am {date}",
  walletSubstitution: "Ersatz",
  walletYourPaymentMethod: "Deine Zahlungsmethode",
  walletNoPaymentMethod: "Du hast noch keine Zahlungsmethode.",
  // Vriendenkorting
  referralLoadError: "Dein Empfehlungscode konnte nicht geladen werden.",
  familyLoadError: "Dein Family-Konto konnte nicht geladen werden.",
  referralBodyBefore: "Nutzen deine Freunde oder Nachbarn deinen Code bei ihrer",
  referralBodyBold: "ersten Bestellung",
  referralBodyAfter: "? Dann bekommt ihr beide {amount}!",
  referralShare: "Code teilen",
  referralShareText: "Nutze meinen Code {code} bei deiner ersten Bestellung bei Picnic und erhalte {amount} Rabatt.",
  referralCopied: "Link kopiert!",
  referralTerms: "Teilnahmebedingungen",
  // Boodschappenwekker
  reminderSubtitle: "Vergiss nie wieder, rechtzeitig zu bestellen. Stell deinen eigenen Picnic-Moment ein.",
  reminderPerDevice: "Den Einkaufswecker stellst du in der Picnic-App ein. Er gehört zu dem Gerät, auf dem du ihn einstellst, und du bekommst die Erinnerung nur dort. Deshalb kannst du ihn hier nicht ansehen oder einstellen.",
  deliveriesTrackingDriver: "Fahrer",
  deliveriesTrackingEta: "Voraussichtliche Ankunft",
  deliveriesTrackingNoMap: "Live-Karte noch nicht verfügbar.",
  deliveriesTrackingLoading: "Tracking wird geladen..."
};

// vendor/picnic-web/src/lib/core/i18n/fr.ts
var fr = {
  // Search bar
  searchPlaceholder: "Rechercher des produits...",
  searchAriaLabel: "Rechercher des produits",
  searchButtonAriaLabel: "Rechercher",
  // Home page errors
  searchError: "Une erreur s'est produite. Veuillez réessayer plus tard.",
  categoriesLoadError: "Impossible de charger les catégories.",
  // Results view
  noResultsFor: "Aucun résultat trouvé pour",
  tryAnotherTerm: "Essayez un autre terme de recherche",
  resultSingular: "résultat",
  resultPlural: "résultats",
  // Login page
  loginTitle: "Connexion",
  sessionExpired: "Votre session a expiré. Veuillez vous reconnecter.",
  enter2FACode: "Saisissez le code de vérification",
  verificationFailed: "Échec de la vérification. Veuillez réessayer plus tard.",
  enterEmailAndPassword: "Saisissez votre adresse e-mail et votre mot de passe",
  loginFailed: "Échec de la connexion. Veuillez réessayer plus tard.",
  enterToken: "Saisissez un token",
  tokenVerifyFailed: "Impossible de vérifier le token. Veuillez réessayer plus tard.",
  smsSent: "Un code de vérification a été envoyé sur votre téléphone par SMS.",
  verificationCodeLabel: "Code de vérification",
  verificationCodePlaceholder: "Saisissez le code",
  emailLabel: "Adresse e-mail",
  emailPlaceholder: "votre-email@exemple.fr",
  passwordLabel: "Mot de passe",
  passwordPlaceholder: "Votre mot de passe",
  tokenPlaceholder: "Collez votre token ici",
  hideToken: "Masquer le token",
  showToken: "Afficher le token",
  verifyButton: "Vérifier",
  loginButton: "Se connecter",
  howToGetToken: "Comment obtenir un token d'authentification ?",
  npmPackageUseBefore: "Utilisez le",
  npmPackageText: "package npm pour vous connecter avec votre compte Picnic :",
  copyAuthKeyBefore: "Copiez la valeur",
  copyAuthKeyAfter: "et collez-la ci-dessus.",
  whyAuthToken: "Pourquoi ai-je besoin d'un token d'authentification ?",
  whyAuthTokenBody: "Pour des raisons de sécurité, nous n'affichons pas de formulaire de connexion standard avec adresse e-mail et mot de passe. Un token d'authentification garantit que vos identifiants ne sont jamais transmis via ce site. Le token peut être révoqué à tout moment sans changer votre mot de passe.",
  isOfficialSite: "Est-ce le site officiel de Picnic ?",
  isOfficialSiteBody: "Non, ce n'est pas le site officiel de Picnic. Il s'agit d'un projet open source indépendant qui n'est en aucune façon affilié à Picnic. Consultez le code source sur",
  tokenInvalid: "Le token est invalide. Veuillez réessayer.",
  credentialsInvalid: "Adresse e-mail ou mot de passe incorrect. Veuillez réessayer.",
  twoFAInvalid: "Le code de vérification est incorrect. Veuillez réessayer.",
  apiUnreachable: "Impossible de se connecter à Picnic. Veuillez réessayer plus tard.",
  genericError: "Une erreur s'est produite. Veuillez réessayer plus tard.",
  loadingAriaLabel: "Chargement",
  codeSnippetEmail: "votre-email",
  codeSnippetPassword: "votre-mot-de-passe",
  // Cart
  emptyCartTitle: "Votre panier est vide",
  emptyCartText: "Ajoutez des produits via l'application Picnic ou recherchez quelque chose.",
  goToSearch: "Aller à la recherche",
  cartTitle: "Panier",
  nothingForgotten: "Rien oublié ?",
  cartMutationError: "Une erreur s'est produite. Veuillez réessayer.",
  cartLoadError: "Une erreur s'est produite. Veuillez réessayer plus tard.",
  cartOtherItems: "Autres produits",
  clearCartButton: "Vider le panier",
  clearCartError: "Impossible de vider le panier. Veuillez réessayer.",
  clearCartConfirmTitle: "Vider le panier ?",
  clearCartConfirmMessage: "Tous les produits seront supprimés de votre panier.",
  confirmButton: "Confirmer",
  cancelButton: "Annuler",
  // Checkout
  checkoutLabel: "Passer à la caisse",
  checkoutDeepLinkCountry: "fr",
  checkoutPageTitle: "Paiement",
  checkoutLoadError: "Impossible de charger le paiement.",
  checkoutContinueButton: "Continuer vers le paiement",
  checkoutProcessing: "Traitement…",
  checkoutStartError: "Impossible de démarrer le paiement.",
  checkoutPaymentError: "Impossible de lancer le paiement.",
  checkoutPaymentTitle: "Informations de paiement",
  checkoutOrderTotal: "Total",
  checkoutExpires: "Valable jusqu'au",
  checkoutPayButton: "Vers la banque",
  checkoutReturnTitle: "Finaliser le paiement",
  checkoutMissingSession: "Aucune session de paiement active trouvée.",
  checkoutPollingMessage: "Nous vérifions votre paiement…",
  checkoutStatusLabel: "Statut",
  checkoutCancelPaymentButton: "Annuler le paiement",
  checkoutStatusError: "Impossible de récupérer le statut du paiement.",
  checkoutConfirmError: "Impossible de confirmer la commande.",
  checkoutCancelError: "Impossible d'annuler le paiement.",
  checkoutMinimumNotMet: "Montant minimum de commande non atteint.",
  // Delivery slot picker
  pickerTitle: "Choisissez votre créneau de livraison",
  freeDeliveryLabel: "Toujours livré gratuitement !",
  selectedSectionLabel: "Sélectionné par vous",
  otherMomentLabel: "Ou choisissez un autre moment",
  greenChoiceLabel: "Choix le plus écologique pour votre quartier",
  noSlotsLabel: "Aucun créneau de livraison disponible.",
  closeAriaLabel: "Fermer",
  retryLabel: "Réessayer",
  tapToChoose: "Appuyez pour choisir",
  // Order summary
  depositBag: "Consigne sac",
  depositBottle: "Consigne bouteille",
  depositGeneric: "Consigne",
  orderSummaryTitle: "Récapitulatif de la commande",
  itemsLabel: "Articles",
  minimumOrderLabel: "Montant minimum de commande",
  totalLabel: "Total",
  cartPromoLabel: "Promo",
  cartDeliveryLabel: "Livraison",
  cartDeliveryFree: "Gratuit",
  // Quantity stepper
  removeOneAriaLabel: "Retirer 1",
  addOneAriaLabel: "Ajouter 1",
  // Savings label
  savedSuffix: "économisé",
  // Product card
  addToCartAriaLabel: "Ajouter au panier",
  addToCartButton: "Au panier",
  inCartLabel: "dans le panier",
  bundleFromLabel: "À partir de",
  similarProductsTitle: "Produits similaires",
  descriptionTitle: "Description",
  // Section nav bar
  sectionNavGoTo: "Aller à",
  // Category products view
  backButton: "Retour",
  breadcrumbLabel: "Fil d'Ariane",
  noProductsInCategory: "Aucun produit trouvé dans cette catégorie.",
  productSingular: "produit",
  productPlural: "produits",
  // Pages
  defaultPageTitle: "Produits",
  noPageSpecified: "Aucune page spécifiée.",
  productsLoadError: "Impossible de charger les produits.",
  // Cookbook
  cookbookTitle: "Toutes les recettes",
  cookbookFeatured: "À la une",
  cookbookSaved: "Recettes enregistrées",
  cookbookSearchPlaceholder: "Rechercher une recette ou un ingrédient...",
  cookbookLoadError: "Impossible de charger les recettes.",
  noRecipes: "Aucune recette trouvée.",
  cookingTimeMinutes: "min",
  cookbookCategoryLabel: "Catégorie",
  recipeSave: "Enregistrer la recette",
  recipeUnsave: "Ne plus enregistrer la recette",
  recipeSaveError: "La recette n'a pas pu être enregistrée.",
  mealPlanSelectAll: "Tout sélectionner",
  mealPlanDays: "jours",
  mealPlanGenerate: "Générer le plan",
  mealPlanContinue: "continuer la planification",
  mealPlanNotEnoughRecipes: "Seulement {available} recette(s) sur {requested} disponibles dans les catégories sélectionnées — plan limité à {available} jour(s).",
  mealPlanPeople: "personnes",
  mealPlanConfirmLabel: "Garder cette recette dans le plan",
  mealPlanAddLabel: "Ajouter cette recette au plan",
  mealPlanSelectAllRecipes: "Sélectionner toutes les recettes",
  mealPlanPageTitle: "Planification des recettes",
  mealPlanContinueDisabledHint: "Augmentez le nombre de jours ou décochez une recette pour continuer",
  mealPlanRecent: "Plan de repas récent",
  mealPlanClear: "Effacer le plan",
  mealPlanViewShoppingList: "Voir la liste de courses",
  mealPlanPackagesSaved: "{n} emballages économisés",
  mealPlanSharedWith: "Aussi utilisé dans {recipe}",
  mealPlanAddAllToCart: "Tout ajouter au panier",
  mealPlanAddingToCart: "Ajout en cours…",
  mealPlanAddedToCart: "Ajouté !",
  mealPlanGenerateError: "Le plan n'a pas pu être généré.",
  mealPlanRateLimited: "Trop de requêtes. Patiente un instant et réessaie.",
  mealPlanShoppingListTitle: "Liste de courses",
  mealPlanShoppingListError: "La liste de courses n'a pas pu être chargée.",
  mealPlanTotal: "Total",
  // Auth
  signOut: "Se déconnecter",
  // App navigation
  navMainAriaLabel: "Navigation principale",
  navDiscover: "Découvrir",
  navFavorites: "Favoris",
  navCooking: "Cuisine",
  navSearch: "Recherche",
  navCart: "Panier",
  navAccount: "Compte",
  closeLabel: "Fermer",
  // Account panel
  accountParcels: "Service colis",
  accountFamilyAccount: "Mon {highlight}",
  accountFamilyAccountHighlight: "compte Family",
  accountFamilyBadge: "Family",
  accountLoyaltyPrograms: "Programmes de fidélité",
  accountWallet: "Portefeuille",
  accountFriends: "Parrainage",
  accountReminders: "Rappel courses",
  accountSupport: "Service client",
  accountFaq: "Questions fréquentes",
  comingSoon: "Bientôt",
  // Discover and favorites placeholders
  discoverTitle: "Découvrir",
  favoritesTitle: "Favoris",
  // Recipe detail
  recipeIngredients: "Ingrédients",
  recipeSteps: "Préparation",
  recipePortions: "Personnes",
  recipeAddToCart: "Ajouter tous les ingrédients",
  recipeAddingToCart: "Ajout en cours...",
  recipeAddedToCart: "Ajouté !",
  recipeCondiments: "Vous avez probablement déjà",
  recipeLoadError: "Impossible de charger la recette.",
  recipePricePerServing: "par portion",
  recipePriceTotal: "total",
  recipeAllergens: "Contient",
  recipeMayContain: "Peut contenir",
  recipeEditIngredient: "Modifier l'ingrédient",
  recipeEditSave: "Enregistrer",
  recipeEditSaving: "Enregistrement...",
  recipeEditCancel: "Annuler",
  recipeEditLoadError: "Impossible de charger les alternatives.",
  recipeEditSaveError: "Impossible de modifier l'ingrédient.",
  recipeEditUnavailable: "Produit plus disponible",
  recipeNutrition: "Valeurs nutritionnelles",
  // Toast / error view
  dismissAriaLabel: "Fermer",
  retryButton: "Réessayer",
  // Generic error page
  errorHeading: "Une erreur s'est produite",
  errorUnexpected: "Une erreur inattendue s'est produite.",
  errorRetry: "Réessayer",
  // Category page
  categoryFallbackTitle: "Catégorie",
  subcategoriesLoadError: "Impossible de charger les sous-catégories.",
  // Token login label
  authTokenLabel: "Token d'authentification Picnic",
  // Search results count
  resultFor: "pour",
  // Allergen badges
  allergenTitle: "Allergènes",
  // Deliveries
  deliveriesTitle: "Commandes",
  deliveriesNavLabel: "Commandes",
  deliveriesTabAll: "Toutes",
  deliveriesEmptyAll: "Aucune commande pour l'instant.",
  deliveriesTabCurrent: "En cours",
  deliveriesTabCompleted: "Terminées",
  deliveriesTabCancelled: "Annulées",
  deliveriesEmptyCurrent: "Aucune commande en cours.",
  deliveriesEmptyCompleted: "Aucune commande terminée.",
  deliveriesEmptyCancelled: "Aucune commande annulée.",
  deliveriesLoadError: "Impossible de charger les commandes.",
  deliveriesLiveTrack: "Suivre en direct",
  deliveriesOrdersLabel: "commandes",
  deliveriesStatusCurrent: "En cours",
  deliveriesStatusCompleted: "Terminée",
  deliveriesStatusCancelled: "Annulée",
  deliveriesStatusPlanned: "Planifiée",
  deliveriesStatusEnRoute: "En route",
  deliveriesStatusDelivered: "Livrée",
  deliveriesDetailTitle: "Commande",
  deliveriesDetailLoadError: "Impossible de charger la commande.",
  deliveriesWindowTitle: "Créneau de livraison",
  deliveriesPaymentTitle: "Paiement",
  deliveriesPaymentType: "Mode de paiement",
  deliveriesReturnedContainers: "Consignes retournées",
  deliveriesCancelButton: "Annuler la commande",
  deliveriesCancelConfirmTitle: "Annuler la commande ?",
  deliveriesCancelConfirmMessage: "Voulez-vous vraiment annuler cette commande ?",
  deliveriesCancelSuccess: "Commande annulée.",
  deliveriesCancelError: "Échec de l'annulation. Veuillez réessayer.",
  deliveriesRateTitle: "Évaluez votre livraison",
  deliveriesRateSubmit: "Envoyer l'évaluation",
  deliveriesRateSuccess: "Merci pour votre évaluation !",
  deliveriesRateError: "Impossible d'envoyer l'évaluation.",
  deliveriesRateAlready: "Cette commande a déjà été évaluée.",
  deliveriesInvoiceButton: "Renvoyer la facture",
  deliveriesInvoiceSuccess: "Facture envoyée par e-mail.",
  deliveriesInvoiceError: "Impossible d'envoyer la facture.",
  parcelsLoadError: "Impossible de charger les colis.",
  parcelsEmpty: "Vous n'avez encore déclaré aucun colis.",
  parcelCopyShipmentNumber: "Copier le numéro d'envoi",
  // Wallet
  walletLoadError: "Impossible de charger le porte-monnaie.",
  walletPaymentTitle: "Paiement",
  walletViewReceipt: "Voir le ticket complet",
  walletReturnedDeposits: "Consigne rendue",
  walletPaidOn: "Payé le {date}",
  walletRefundedOn: "Remboursé le {date}",
  walletSubstitution: "Remplacement",
  walletYourPaymentMethod: "Votre moyen de paiement",
  walletNoPaymentMethod: "Vous n'avez pas encore de moyen de paiement.",
  // Vriendenkorting
  referralLoadError: "Impossible de charger votre code de parrainage.",
  familyLoadError: "Impossible de charger votre compte Family.",
  referralBodyBefore: "Vos amis ou voisins utilisent votre code lors de leur",
  referralBodyBold: "première commande",
  referralBodyAfter: " ? Vous gagnez alors tous les deux {amount} !",
  referralShare: "Partager votre code",
  referralShareText: "Utilisez mon code {code} lors de votre première commande Picnic et recevez {amount} de réduction.",
  referralCopied: "Lien copié !",
  referralTerms: "Conditions de l'offre",
  // Boodschappenwekker
  reminderSubtitle: "N'oubliez plus jamais de commander à temps. Choisissez votre moment Picnic.",
  reminderPerDevice: "Le rappel de courses se règle dans l'application Picnic. Il est lié à l'appareil sur lequel vous le réglez, et vous ne recevez la notification que sur cet appareil. C'est pourquoi vous ne pouvez pas le voir ni le régler ici.",
  deliveriesTrackingDriver: "Livreur",
  deliveriesTrackingEta: "Arrivée prévue",
  deliveriesTrackingNoMap: "Carte en direct pas encore disponible.",
  deliveriesTrackingLoading: "Chargement du suivi..."
};

// vendor/picnic-web/src/lib/core/i18n/nl.ts
var nl = {
  // Search bar
  searchPlaceholder: "Zoek producten...",
  searchAriaLabel: "Zoek producten",
  searchButtonAriaLabel: "Zoeken",
  // Home page errors
  searchError: "Er is iets misgegaan. Probeer het later opnieuw.",
  categoriesLoadError: "Kan categorieën niet laden.",
  // Results view
  noResultsFor: "Geen resultaten gevonden voor",
  tryAnotherTerm: "Probeer een andere zoekterm",
  resultSingular: "resultaat",
  resultPlural: "resultaten",
  // Login page
  loginTitle: "Inloggen",
  sessionExpired: "Je sessie is verlopen. Log opnieuw in.",
  enter2FACode: "Voer de verificatiecode in",
  verificationFailed: "Verificatie mislukt. Probeer het later opnieuw.",
  enterEmailAndPassword: "Vul je e-mailadres en wachtwoord in",
  loginFailed: "Inloggen mislukt. Probeer het later opnieuw.",
  enterToken: "Voer een token in",
  tokenVerifyFailed: "Kan token niet verifiëren. Probeer het later opnieuw.",
  smsSent: "Er is een verificatiecode naar je telefoon gestuurd via SMS.",
  verificationCodeLabel: "Verificatiecode",
  verificationCodePlaceholder: "Voer de code in",
  emailLabel: "E-mailadres",
  emailPlaceholder: "je-email@voorbeeld.nl",
  passwordLabel: "Wachtwoord",
  passwordPlaceholder: "Je wachtwoord",
  tokenPlaceholder: "Plak je token hier",
  hideToken: "Token verbergen",
  showToken: "Token tonen",
  verifyButton: "Verifiëren",
  loginButton: "Inloggen",
  howToGetToken: "Hoe krijg ik een auth token?",
  npmPackageUseBefore: "Gebruik de",
  npmPackageText: "npm package om in te loggen met je Picnic account:",
  copyAuthKeyBefore: "Kopieer de",
  copyAuthKeyAfter: "waarde en plak deze hierboven in.",
  whyAuthToken: "Waarom heb ik een auth token nodig?",
  whyAuthTokenBody: "Om veiligheidsredenen tonen we geen standaard inlogformulier met e-mailadres en wachtwoord. Een auth token zorgt ervoor dat je inloggegevens nooit via deze website worden verstuurd. Het token kan op elk moment worden ingetrokken zonder je wachtwoord te wijzigen.",
  isOfficialSite: "Is dit de officiële Picnic website?",
  isOfficialSiteBody: "Nee, dit is niet de officiële Picnic website. Dit is een onafhankelijk open-source project en is op geen enkele manier verbonden aan Picnic. Bekijk de broncode op",
  tokenInvalid: "Token is ongeldig. Probeer opnieuw.",
  credentialsInvalid: "E-mailadres of wachtwoord is onjuist. Probeer opnieuw.",
  twoFAInvalid: "Verificatiecode is onjuist. Probeer opnieuw.",
  apiUnreachable: "Kan niet verbinden met Picnic. Probeer het later opnieuw.",
  genericError: "Er is iets misgegaan. Probeer het later opnieuw.",
  loadingAriaLabel: "Laden",
  codeSnippetEmail: "je-email",
  codeSnippetPassword: "je-wachtwoord",
  // Cart
  emptyCartTitle: "Je winkelwagen is leeg",
  emptyCartText: "Voeg producten toe via de Picnic app of zoek iets op.",
  goToSearch: "Naar zoeken",
  cartTitle: "Winkelwagen",
  nothingForgotten: "Niets vergeten?",
  cartMutationError: "Er ging iets mis. Probeer het opnieuw.",
  cartLoadError: "Er is iets misgegaan. Probeer het later opnieuw.",
  cartOtherItems: "Overige producten",
  clearCartButton: "Winkelwagen leegmaken",
  clearCartError: "Kan winkelwagen niet leegmaken. Probeer het opnieuw.",
  clearCartConfirmTitle: "Winkelwagen leegmaken?",
  clearCartConfirmMessage: "Alle producten worden verwijderd uit je winkelwagen.",
  confirmButton: "Bevestigen",
  cancelButton: "Annuleren",
  // Checkout
  checkoutLabel: "Naar de kassa",
  checkoutDeepLinkCountry: "nl",
  checkoutPageTitle: "Afrekenen",
  checkoutLoadError: "Kon checkout niet laden.",
  checkoutContinueButton: "Doorgaan naar betaling",
  checkoutProcessing: "Bezig…",
  checkoutStartError: "Kon checkout niet starten.",
  checkoutPaymentError: "Kon betaling niet starten.",
  checkoutPaymentTitle: "Betaalgegevens",
  checkoutOrderTotal: "Totaal",
  checkoutExpires: "Geldig tot",
  checkoutPayButton: "Naar de bank",
  checkoutReturnTitle: "Betaling afronden",
  checkoutMissingSession: "Geen actieve betalingssessie gevonden.",
  checkoutPollingMessage: "We controleren je betaling…",
  checkoutStatusLabel: "Status",
  checkoutCancelPaymentButton: "Betaling annuleren",
  checkoutStatusError: "Kon betalingsstatus niet ophalen.",
  checkoutConfirmError: "Kon bestelling niet bevestigen.",
  checkoutCancelError: "Kon betaling niet annuleren.",
  checkoutMinimumNotMet: "Minimale bestelwaarde nog niet bereikt.",
  // Delivery slot picker
  pickerTitle: "Kies je bezorgmoment",
  freeDeliveryLabel: "Altijd gratis bezorgd!",
  selectedSectionLabel: "Geselecteerd door jou",
  otherMomentLabel: "Of kies een ander moment",
  greenChoiceLabel: "Groenste keuze voor jouw buurt",
  noSlotsLabel: "Geen bezorgmomenten beschikbaar.",
  closeAriaLabel: "Sluiten",
  retryLabel: "Opnieuw proberen",
  tapToChoose: "Tik om te kiezen",
  // Order summary
  depositBag: "Statiegeld tasje",
  depositBottle: "Statiegeld fles",
  depositGeneric: "Statiegeld",
  orderSummaryTitle: "Besteloverzicht",
  itemsLabel: "Artikelen",
  minimumOrderLabel: "Minimale bestelwaarde",
  totalLabel: "Totaal",
  cartPromoLabel: "Actie",
  cartDeliveryLabel: "Bezorging",
  cartDeliveryFree: "Gratis",
  // Quantity stepper
  removeOneAriaLabel: "Verwijder 1",
  addOneAriaLabel: "Voeg 1 toe",
  // Savings label
  savedSuffix: "bespaard",
  // Product card
  addToCartAriaLabel: "Toevoegen aan winkelwagen",
  addToCartButton: "In mandje",
  inCartLabel: "in mandje",
  bundleFromLabel: "Vanaf",
  similarProductsTitle: "Vergelijkbare producten",
  descriptionTitle: "Beschrijving",
  // Section nav bar
  sectionNavGoTo: "Ga naar",
  // Category products view
  backButton: "Terug",
  breadcrumbLabel: "Navigatiepad",
  noProductsInCategory: "Geen producten gevonden in deze categorie.",
  productSingular: "product",
  productPlural: "producten",
  // Pages
  defaultPageTitle: "Producten",
  noPageSpecified: "Geen pagina opgegeven.",
  productsLoadError: "Kan producten niet laden.",
  // Cookbook
  cookbookTitle: "Alle recepten",
  cookbookFeatured: "Uitgelicht",
  cookbookSaved: "Opgeslagen recepten",
  cookbookSearchPlaceholder: "Zoek op recept of ingrediënt...",
  cookbookLoadError: "Recepten konden niet worden geladen.",
  noRecipes: "Geen recepten gevonden.",
  cookingTimeMinutes: "min",
  cookbookCategoryLabel: "Categorie",
  recipeSave: "Recept opslaan",
  recipeUnsave: "Recept niet meer opslaan",
  recipeSaveError: "Recept kon niet worden opgeslagen.",
  mealPlanSelectAll: "Alles selecteren",
  mealPlanDays: "dagen",
  mealPlanGenerate: "Plan genereren",
  mealPlanContinue: "verder plannen",
  mealPlanNotEnoughRecipes: "Slechts {available} van de {requested} recepten beschikbaar in de gekozen categorieën — plan beperkt tot {available} dagen.",
  mealPlanPeople: "personen",
  mealPlanConfirmLabel: "Recept behouden in plan",
  mealPlanAddLabel: "Recept aan plan toevoegen",
  mealPlanSelectAllRecipes: "Alle recepten selecteren",
  mealPlanPageTitle: "Receptenplanning",
  mealPlanContinueDisabledHint: "Verhoog het aantal dagen of vink een recept uit om verder te plannen",
  mealPlanRecent: "Recent voedingsplan",
  mealPlanClear: "Plan wissen",
  mealPlanViewShoppingList: "Boodschappenlijst bekijken",
  mealPlanPackagesSaved: "{n} verpakkingen bespaard",
  mealPlanSharedWith: "Ook gebruikt in {recipe}",
  mealPlanAddAllToCart: "Alles toevoegen aan winkelmandje",
  mealPlanAddingToCart: "Toevoegen...",
  mealPlanAddedToCart: "Toegevoegd!",
  mealPlanGenerateError: "Het plan kon niet worden gegenereerd.",
  mealPlanRateLimited: "Te veel verzoeken. Wacht een minuutje en probeer opnieuw.",
  mealPlanShoppingListTitle: "Boodschappenlijst",
  mealPlanShoppingListError: "Boodschappenlijst kon niet worden geladen.",
  mealPlanTotal: "Totaal",
  // Auth
  signOut: "Uitloggen",
  // App navigation
  navMainAriaLabel: "Hoofdnavigatie",
  navDiscover: "Ontdek",
  navFavorites: "Favorieten",
  navCooking: "Koken",
  navSearch: "Zoeken",
  navCart: "Mandje",
  navAccount: "Account",
  closeLabel: "Sluiten",
  // Account panel
  accountParcels: "Pakketservice",
  accountFamilyAccount: "Mijn {highlight}",
  accountFamilyAccountHighlight: "Family-account",
  accountFamilyBadge: "Family",
  accountLoyaltyPrograms: "Spaarprogramma's",
  accountWallet: "Portemonnee",
  accountFriends: "Vriendenkorting",
  accountReminders: "Boodschappenwekker",
  accountSupport: "Klantenservice",
  accountFaq: "Veelgestelde vragen",
  comingSoon: "Binnenkort",
  // Discover and favorites placeholders
  discoverTitle: "Ontdek",
  favoritesTitle: "Favorieten",
  // Recipe detail
  recipeIngredients: "Ingrediënten",
  recipeSteps: "Bereiding",
  recipePortions: "Personen",
  recipeAddToCart: "Alle ingrediënten toevoegen",
  recipeAddingToCart: "Wordt toegevoegd...",
  recipeAddedToCart: "Toegevoegd!",
  recipeCondiments: "Heb je waarschijnlijk al",
  recipeLoadError: "Recept kon niet worden geladen.",
  recipePricePerServing: "per portie",
  recipePriceTotal: "totaal",
  recipeAllergens: "Bevat",
  recipeMayContain: "Kan bevatten",
  recipeEditIngredient: "Ingrediënt aanpassen",
  recipeEditSave: "Opslaan",
  recipeEditSaving: "Opslaan...",
  recipeEditCancel: "Annuleren",
  recipeEditLoadError: "Alternatieven konden niet worden geladen.",
  recipeEditSaveError: "Ingrediënt kon niet worden aangepast.",
  recipeEditUnavailable: "Niet meer leverbaar",
  recipeNutrition: "Voedingswaarde",
  // Toast / error view
  dismissAriaLabel: "Sluiten",
  retryButton: "Opnieuw proberen",
  // Generic error page
  errorHeading: "Er is iets misgegaan",
  errorUnexpected: "Een onverwachte fout is opgetreden.",
  errorRetry: "Probeer opnieuw",
  // Category page
  categoryFallbackTitle: "Categorie",
  subcategoriesLoadError: "Kan subcategorieën niet laden.",
  // Token login label
  authTokenLabel: "Picnic Auth-token",
  // Search results count
  resultFor: "voor",
  // Allergen badges
  allergenTitle: "Allergenen",
  // Deliveries
  deliveriesTitle: "Bestellingen",
  deliveriesNavLabel: "Bestellingen",
  deliveriesTabAll: "Alle",
  deliveriesEmptyAll: "Nog geen bestellingen.",
  deliveriesTabCurrent: "Actueel",
  deliveriesTabCompleted: "Afgerond",
  deliveriesTabCancelled: "Geannuleerd",
  deliveriesEmptyCurrent: "Geen actieve bestellingen.",
  deliveriesEmptyCompleted: "Geen afgeronde bestellingen.",
  deliveriesEmptyCancelled: "Geen geannuleerde bestellingen.",
  deliveriesLoadError: "Bestellingen konden niet worden geladen.",
  deliveriesLiveTrack: "Live volgen",
  deliveriesOrdersLabel: "bestellingen",
  deliveriesStatusCurrent: "Actief",
  deliveriesStatusCompleted: "Afgerond",
  deliveriesStatusCancelled: "Geannuleerd",
  deliveriesStatusPlanned: "Gepland",
  deliveriesStatusEnRoute: "Onderweg",
  deliveriesStatusDelivered: "Bezorgd",
  deliveriesDetailTitle: "Bestelling",
  deliveriesDetailLoadError: "Bestelling kon niet worden geladen.",
  deliveriesWindowTitle: "Bezorgmoment",
  deliveriesPaymentTitle: "Betaling",
  deliveriesPaymentType: "Betaalmethode",
  deliveriesReturnedContainers: "Teruggebracht statiegeld",
  deliveriesCancelButton: "Bestelling annuleren",
  deliveriesCancelConfirmTitle: "Bestelling annuleren?",
  deliveriesCancelConfirmMessage: "Weet je zeker dat je deze bestelling wilt annuleren?",
  deliveriesCancelSuccess: "Bestelling geannuleerd.",
  deliveriesCancelError: "Annuleren mislukt. Probeer het opnieuw.",
  deliveriesRateTitle: "Beoordeel je bezorging",
  deliveriesRateSubmit: "Beoordeling versturen",
  deliveriesRateSuccess: "Bedankt voor je beoordeling!",
  deliveriesRateError: "Beoordeling kon niet worden verstuurd.",
  deliveriesRateAlready: "Deze bestelling is al beoordeeld.",
  deliveriesInvoiceButton: "Factuur opnieuw versturen",
  deliveriesInvoiceSuccess: "Factuur is per e-mail verstuurd.",
  deliveriesInvoiceError: "Factuur kon niet worden verstuurd.",
  parcelsLoadError: "Pakketten konden niet worden geladen.",
  parcelsEmpty: "Je hebt nog geen pakketjes aangemeld.",
  parcelCopyShipmentNumber: "Zendingsnummer kopiëren",
  // Wallet
  walletLoadError: "Portemonnee kon niet worden geladen.",
  walletPaymentTitle: "Betaling",
  walletViewReceipt: "Bekijk volledige bonnetje",
  walletReturnedDeposits: "Statiegeld retour",
  walletPaidOn: "Betaald op {date}",
  walletRefundedOn: "Terugbetaald op {date}",
  walletSubstitution: "Vervanging",
  walletYourPaymentMethod: "Jouw betaalmethode",
  walletNoPaymentMethod: "Je hebt nog geen betaalmethode.",
  // Vriendenkorting
  referralLoadError: "Je vriendenkortingscode kon niet worden geladen.",
  familyLoadError: "Je Family-account kon niet worden geladen.",
  referralBodyBefore: "Gebruiken je vrienden of buren jouw code bij hun",
  referralBodyBold: "eerste bestelling",
  referralBodyAfter: "? Dan verdienen jullie allebei {amount}!",
  referralShare: "Deel je code",
  referralShareText: "Gebruik mijn code {code} bij je eerste bestelling bij Picnic en krijg {amount} korting.",
  referralCopied: "Link gekopieerd!",
  referralTerms: "Actievoorwaarden",
  // Boodschappenwekker
  reminderSubtitle: "Vergeet nooit meer op tijd te bestellen. Stel je eigen Picnic-moment in.",
  reminderPerDevice: "De Boodschappenwekker stel je in de Picnic-app in. Hij hoort bij het apparaat waarop je hem instelt, dus je krijgt de melding alleen daar. Daarom kun je hem hier niet bekijken of instellen.",
  deliveriesTrackingDriver: "Bezorger",
  deliveriesTrackingEta: "Verwachte aankomst",
  deliveriesTrackingNoMap: "Live routekaart is nog niet beschikbaar.",
  deliveriesTrackingLoading: "Tracking laden..."
};

// vendor/picnic-web/src/lib/core/i18n/index.ts
var translations = { NL: nl, DE: de, FR: fr };
function getTranslations(countryCode) {
  return translations[countryCode];
}

// vendor/picnic-web/src/lib/core/type-guards.ts
function isObject2(val) {
  return typeof val === "object" && val !== null && !Array.isArray(val);
}
function isArray(val) {
  return Array.isArray(val);
}
function asString(val, fallback = "") {
  return typeof val === "string" ? val : fallback;
}
function asNumber(val, fallback = 0) {
  return typeof val === "number" && isFinite(val) ? val : fallback;
}
function asArray(val) {
  return isArray(val) ? val : [];
}

// vendor/picnic-web/src/lib/cart/parse-cart.ts
function getDecorators(item) {
  return asArray(item["decorators"]).filter(isObject2);
}
function mergeOverrides(decorators, overrides) {
  if (overrides.length === 0) return decorators;
  const result = [...decorators];
  for (const override of overrides) {
    const overrideType = asString(override["type"]);
    const existingIdx = result.findIndex((d) => asString(d["type"]) === overrideType);
    if (existingIdx >= 0) {
      result[existingIdx] = override;
    } else {
      result.push(override);
    }
  }
  return result;
}
function applyDecoratorOverrides(items, overridesMap) {
  return items.map((rawLine) => {
    if (!isObject2(rawLine)) return rawLine;
    const lineId = asString(rawLine["id"]);
    const lineOverrides = asArray(overridesMap[lineId]).filter(isObject2);
    const mergedLineDecorators = mergeOverrides(getDecorators(rawLine), lineOverrides);
    let overrideDisplayPrice;
    let overridePrice;
    for (const ov of lineOverrides) {
      if (typeof ov["display_price"] === "number") {
        overrideDisplayPrice = ov["display_price"];
      }
      if (typeof ov["price"] === "number") {
        overridePrice = ov["price"];
      }
    }
    const articles = asArray(rawLine["items"]).map((rawArticle) => {
      if (!isObject2(rawArticle)) return rawArticle;
      const articleId = asString(rawArticle["id"]);
      const articleOverrides = asArray(overridesMap[articleId]).filter(isObject2);
      for (const ov of articleOverrides) {
        if (typeof ov["display_price"] === "number") {
          overrideDisplayPrice = ov["display_price"];
        }
        if (typeof ov["price"] === "number") {
          overridePrice = ov["price"];
        }
      }
      return {
        ...rawArticle,
        decorators: mergeOverrides(getDecorators(rawArticle), articleOverrides)
      };
    });
    const lineScalarOverrides = {};
    if (overrideDisplayPrice !== void 0) {
      lineScalarOverrides["display_price"] = overrideDisplayPrice;
    }
    if (overridePrice !== void 0) {
      lineScalarOverrides["price"] = overridePrice;
    }
    return {
      ...rawLine,
      ...lineScalarOverrides,
      decorators: mergedLineDecorators,
      items: articles
    };
  });
}
function mapDecoratorsToBadges(decorators) {
  const badges = [];
  for (const dec of decorators) {
    const type = asString(dec["type"]);
    switch (type) {
      case "LABEL":
      case "PROMO": {
        const text3 = asString(dec["text"]);
        if (!text3) break;
        const isBundleLabel = text3.toLowerCase().includes("bundel");
        const backgroundColor = asString(dec["background_color"]) || void 0;
        const textColor = asString(dec["text_color"]) || void 0;
        badges.push({
          text: text3,
          variant: isBundleLabel ? "bundle" : "promo",
          backgroundColor,
          textColor
        });
        break;
      }
      case "FRESH_LABEL": {
        const period = asString(dec["period"]);
        if (period) badges.push({ text: period, variant: "freshness" });
        break;
      }
      case "BASE_PRICE": {
        const basePriceText = asString(dec["base_price_text"]);
        if (basePriceText) badges.push({ text: basePriceText, variant: "unit-price" });
        break;
      }
      case "BUNDLES_BUTTON":
        badges.push({ text: "BundelBonus", variant: "bundle" });
        break;
    }
  }
  return badges;
}
function extractQuantity(decorators) {
  const quantityDec = decorators.find((d) => asString(d["type"]) === "QUANTITY");
  if (quantityDec) {
    return asNumber(quantityDec["quantity"], 1);
  }
  return 1;
}
function extractUnavailableInfo(decorators) {
  const unavailableDec = decorators.find((d) => asString(d["type"]) === "UNAVAILABLE");
  if (!unavailableDec) {
    return { isUnavailable: false, unavailableExplanation: null, replacements: [] };
  }
  const explanation = isObject2(unavailableDec["explanation"]) ? asString(unavailableDec["explanation"]["short_explanation"], null) : null;
  const replacements = asArray(unavailableDec["replacements"]).filter(isObject2).map(mapRawToSliderProduct).filter((p) => p !== null);
  return {
    isUnavailable: true,
    unavailableExplanation: explanation || null,
    replacements
  };
}
function mapRawToSliderProduct(raw) {
  const id = asString(raw["id"]);
  if (!id) return null;
  const imageIds = asArray(raw["image_ids"]);
  return {
    id,
    name: asString(raw["name"]),
    imageId: typeof imageIds[0] === "string" ? imageIds[0] : "",
    displayPrice: asNumber(raw["display_price"]),
    unitQuantity: asString(raw["unit_quantity"]),
    maxCount: asNumber(raw["max_count"], 99)
  };
}
function mapDepositBreakdown(raw) {
  return asArray(raw).filter(isObject2).map((entry) => {
    const value = asNumber(entry["value"]);
    const count = asNumber(entry["count"]);
    return {
      type: asString(entry["type"]),
      value,
      count,
      total: value * count
    };
  });
}
function extractMinimumOrderValue(raw) {
  const selectedSlot2 = raw["selected_slot"];
  if (!isObject2(selectedSlot2)) return null;
  const slotId = asString(selectedSlot2["slot_id"]);
  if (!slotId) return null;
  const deliverySlots = asArray(raw["delivery_slots"]);
  const matchedSlot = deliverySlots.filter(isObject2).find((slot2) => asString(slot2["slot_id"]) === slotId);
  if (!matchedSlot) return null;
  const mov = matchedSlot["minimum_order_value"];
  if (typeof mov !== "number") return null;
  return mov;
}
function parseSelectedSlot(raw) {
  const selectedSlot2 = raw["selected_slot"];
  if (!isObject2(selectedSlot2)) return null;
  const slotId = asString(selectedSlot2["slot_id"]);
  if (!slotId) return null;
  const state = asString(selectedSlot2["state"]);
  const matchedSlot = asArray(raw["delivery_slots"]).filter(isObject2).find((slot2) => asString(slot2["slot_id"]) === slotId);
  return {
    slotId,
    state,
    windowStart: matchedSlot && asString(matchedSlot["window_start"]) || null,
    windowEnd: matchedSlot && asString(matchedSlot["window_end"]) || null,
    isExplicitSelection: state !== "IMPLICIT" && state !== ""
  };
}
function extractRecipeGroups(raw) {
  const groups = [];
  for (const section of asArray(raw["basket_sections"]).filter(isObject2)) {
    for (const group of asArray(section["groups"]).filter(isObject2)) {
      const id = asString(group["id"]);
      if (!id) continue;
      groups.push({
        id,
        title: asString(group["title"]),
        imageId: asString(group["image_id"]) || null
      });
    }
  }
  return groups;
}
function extractSuggestions(raw) {
  const sections = asArray(raw["basket_sections"]);
  const suggestions = [];
  for (const section of sections) {
    if (!isObject2(section)) continue;
    const items = asArray(section["items"] ?? section["products"] ?? []);
    for (const item of items) {
      if (!isObject2(item)) continue;
      const mapped = mapRawToSliderProduct(item);
      if (mapped) {
        suggestions.push(mapped);
        continue;
      }
      const articles = asArray(item["items"]);
      for (const article of articles) {
        if (!isObject2(article)) continue;
        const mappedArticle = mapRawToSliderProduct(article);
        if (mappedArticle) suggestions.push(mappedArticle);
      }
    }
  }
  return suggestions;
}
function mapOrderLineToCartItem(rawLine) {
  if (!isObject2(rawLine)) return null;
  const lineId = asString(rawLine["id"]);
  if (!lineId) return null;
  const lineDecorators = getDecorators(rawLine);
  const articles = asArray(rawLine["items"]).filter(isObject2);
  const firstArticle = articles[0];
  const articleDecorators = firstArticle ? getDecorators(firstArticle) : [];
  const effectiveDecorators = mergeOverrides(articleDecorators, lineDecorators);
  const productId = firstArticle ? asString(firstArticle["id"]) : "";
  const name = firstArticle ? asString(firstArticle["name"]) : asString(rawLine["name"]);
  const unitQuantity = firstArticle ? asString(firstArticle["unit_quantity"]) : asString(rawLine["unit_quantity"]);
  const imageIds = firstArticle ? asArray(firstArticle["image_ids"]) : [];
  const imageId = typeof imageIds[0] === "string" ? imageIds[0] : "";
  let displayPrice = asNumber(rawLine["display_price"]);
  const rawPrice = asNumber(rawLine["price"]);
  const priceDec = effectiveDecorators.find((d) => asString(d["type"]) === "PRICE");
  if (priceDec && typeof priceDec["display_price"] === "number") {
    displayPrice = priceDec["display_price"];
  }
  const originalPrice = rawPrice !== displayPrice ? rawPrice : null;
  const quantity = extractQuantity(effectiveDecorators);
  const badges = mapDecoratorsToBadges(effectiveDecorators);
  const unavailable = extractUnavailableInfo(effectiveDecorators);
  const basketGroupDec = lineDecorators.find((d) => asString(d["type"]) === "BASKET_GROUP");
  const basketGroupId = basketGroupDec ? asString(basketGroupDec["id"]) || null : null;
  return {
    id: lineId,
    productId,
    name,
    unitQuantity,
    imageId,
    displayPrice,
    originalPrice,
    quantity,
    maxCount: firstArticle ? asNumber(firstArticle["max_count"], 99) : 99,
    badges,
    isUnavailable: unavailable.isUnavailable,
    unavailableExplanation: unavailable.unavailableExplanation,
    replacements: unavailable.replacements,
    basketGroupId
  };
}
function parseCartResponse(rawData, countryCode) {
  if (!isObject2(rawData)) {
    return emptyCartData(countryCode);
  }
  const overridesMap = isObject2(rawData["decorator_overrides"]) ? rawData["decorator_overrides"] : {};
  const rawItems = applyDecoratorOverrides(asArray(rawData["items"]), overridesMap);
  const items = rawItems.map(mapOrderLineToCartItem).filter((item) => item !== null);
  items.sort((a, b) => {
    if (a.isUnavailable === b.isUnavailable) return 0;
    return a.isUnavailable ? 1 : -1;
  });
  const totalPrice = asNumber(rawData["checkout_total_price"]);
  const totalCount = asNumber(rawData["total_count"]);
  const membershipSavings = asNumber(rawData["membership_savings"]);
  const promoSavings = asNumber(rawData["total_savings"]);
  const fees = asArray(rawData["fees"]).filter(isObject2).map((f) => ({
    type: asString(f["type"]),
    name: asString(f["name"]),
    amount: asNumber(f["amount"])
  })).filter((f) => f.amount !== 0);
  let totalDiscount = 0;
  for (const rawLine of rawItems) {
    if (!isObject2(rawLine)) continue;
    const price = asNumber(rawLine["price"]);
    let effectiveDisplayPrice = asNumber(rawLine["display_price"]);
    const lineDecs = getDecorators(rawLine);
    const articleDecs = asArray(rawLine["items"]).filter(isObject2).flatMap((a) => getDecorators(a));
    const allDecs = mergeOverrides(articleDecs, lineDecs);
    const priceDec = allDecs.find((d) => asString(d["type"]) === "PRICE");
    if (priceDec && typeof priceDec["display_price"] === "number") {
      effectiveDisplayPrice = priceDec["display_price"];
    }
    if (price > effectiveDisplayPrice) {
      totalDiscount += price - effectiveDisplayPrice;
    }
  }
  const depositBreakdown = mapDepositBreakdown(rawData["deposit_breakdown"]);
  const depositTotal = depositBreakdown.reduce((sum, e) => sum + e.total, 0);
  const minimumOrderValue = extractMinimumOrderValue(rawData);
  const recipeGroups = extractRecipeGroups(rawData);
  const suggestions = extractSuggestions(rawData);
  const selectedSlot2 = parseSelectedSlot(rawData);
  const t = getTranslations(countryCode);
  const deliveryBannerText = (selectedSlot2?.isExplicitSelection ? formatBannerText(selectedSlot2.windowStart, selectedSlot2.windowEnd, countryCode) : null) ?? t.pickerTitle;
  return {
    items,
    totalPrice,
    totalCount,
    totalDiscount,
    depositTotal,
    depositBreakdown,
    membershipSavings,
    promoSavings,
    fees,
    minimumOrderValue,
    suggestions,
    selectedSlot: selectedSlot2,
    deliveryBannerText,
    recipeGroups
  };
}
function emptyCartData(countryCode) {
  return {
    items: [],
    totalPrice: 0,
    totalCount: 0,
    totalDiscount: 0,
    depositTotal: 0,
    depositBreakdown: [],
    membershipSavings: 0,
    promoSavings: 0,
    fees: [],
    minimumOrderValue: null,
    suggestions: [],
    selectedSlot: null,
    deliveryBannerText: getTranslations(countryCode).pickerTitle,
    recipeGroups: []
  };
}

// vendor/picnic-web/src/app/api/cart/route.ts
async function GET(request) {
  const token = readAuthToken(request);
  if (!token) {
    return NextResponse.json(
      { error: "Your token has expired", code: "TOKEN_EXPIRED" },
      { status: 401 }
    );
  }
  const countryCode = readCountryCode(request);
  try {
    const client = buildPicnicClient(token, countryCode);
    const rawCart = await client.sendRequest("GET", "/cart", null, true);
    const cartData = parseCartResponse(rawCart, countryCode);
    return NextResponse.json(cartData);
  } catch (error2) {
    if (isApiAuthError(error2)) {
      return NextResponse.json(
        { error: "Your token has expired", code: "TOKEN_EXPIRED" },
        { status: 401 }
      );
    }
    const message = error2 instanceof Error ? error2.message : "Unknown error occurred";
    console.error("[/api/cart] Failed to fetch cart:", message);
    return NextResponse.json(
      {
        error: "Failed to fetch cart. Please try again later."
      },
      { status: 502 }
    );
  }
}
async function DELETE(request) {
  const token = readAuthToken(request);
  if (!token) {
    return NextResponse.json(
      { error: "Your token has expired", code: "TOKEN_EXPIRED" },
      { status: 401 }
    );
  }
  const countryCode = readCountryCode(request);
  try {
    const client = buildPicnicClient(token, countryCode);
    const rawCart = await client.cart.clearCart();
    const cartData = parseCartResponse(rawCart, countryCode);
    return NextResponse.json(cartData);
  } catch (error2) {
    if (isApiAuthError(error2)) {
      return NextResponse.json(
        { error: "Your token has expired", code: "TOKEN_EXPIRED" },
        { status: 401 }
      );
    }
    const message = error2 instanceof Error ? error2.message : "Unknown error occurred";
    console.error("[/api/cart] Failed to clear cart:", message);
    return NextResponse.json({ error: "Failed to clear cart. Please try again." }, { status: 502 });
  }
}
async function POST5(request) {
  const token = readAuthToken(request);
  if (!token) {
    return NextResponse.json(
      { error: "Your token has expired", code: "TOKEN_EXPIRED" },
      { status: 401 }
    );
  }
  const countryCode = readCountryCode(request);
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!body.productId || !body.action || typeof body.count !== "number") {
    return NextResponse.json(
      { error: "Missing required fields: productId, action, count" },
      { status: 400 }
    );
  }
  if (body.action !== "add" && body.action !== "remove") {
    return NextResponse.json({ error: 'action must be "add" or "remove"' }, { status: 400 });
  }
  const endpoint = body.action === "add" ? "/cart/add_product" : "/cart/remove_product";
  try {
    const client = buildPicnicClient(token, countryCode);
    const rawCart = await client.sendRequest(
      "POST",
      endpoint,
      {
        product_id: body.productId,
        count: body.count
      },
      true
    );
    const cartData = parseCartResponse(rawCart, countryCode);
    return NextResponse.json(cartData);
  } catch (error2) {
    if (isApiAuthError(error2)) {
      return NextResponse.json(
        { error: "Your token has expired", code: "TOKEN_EXPIRED" },
        { status: 401 }
      );
    }
    const message = error2 instanceof Error ? error2.message : "Unknown error occurred";
    console.error("[/api/cart] Failed to mutate cart:", message);
    return NextResponse.json(
      {
        error: "Failed to update cart. Please try again."
      },
      { status: 502 }
    );
  }
}

// vendor/picnic-web/src/app/api/cart/checkout/cancel/route.ts
var route_exports6 = {};
__export(route_exports6, {
  POST: () => POST6
});
async function POST6(request) {
  const token = readAuthToken(request);
  if (!token) {
    return NextResponse.json(
      { error: "Your token has expired", code: "TOKEN_EXPIRED" },
      { status: 401 }
    );
  }
  let transactionId;
  try {
    const body = await request.json();
    if (typeof body.transactionId !== "string" || !body.transactionId) {
      return NextResponse.json({ error: "transactionId is required" }, { status: 400 });
    }
    transactionId = body.transactionId;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  try {
    const client = buildPicnicClient(token, readCountryCode(request));
    await client.cart.cancelCheckout(transactionId);
    return NextResponse.json({ success: true });
  } catch (error2) {
    if (isApiAuthError(error2)) {
      return NextResponse.json(
        { error: "Your token has expired", code: "TOKEN_EXPIRED" },
        { status: 401 }
      );
    }
    const message = error2 instanceof Error ? error2.message : "Unknown error occurred";
    console.error("[/api/cart/checkout/cancel] Failed:", message);
    return NextResponse.json(
      { error: "Failed to cancel checkout. Please try again later." },
      { status: 502 }
    );
  }
}

// vendor/picnic-web/src/app/api/cart/checkout/confirm/route.ts
var route_exports7 = {};
__export(route_exports7, {
  POST: () => POST7
});
async function POST7(request) {
  const token = readAuthToken(request);
  if (!token) {
    return NextResponse.json(
      { error: "Your token has expired", code: "TOKEN_EXPIRED" },
      { status: 401 }
    );
  }
  let orderId;
  let transactionId = null;
  try {
    const body = await request.json();
    if (typeof body.orderId !== "string" || !body.orderId) {
      return NextResponse.json({ error: "orderId is required" }, { status: 400 });
    }
    orderId = body.orderId;
    if (typeof body.transactionId === "string" && body.transactionId) {
      transactionId = body.transactionId;
    }
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  try {
    const client = buildPicnicClient(token, readCountryCode(request));
    if (transactionId) {
      const status = await client.cart.getCheckoutStatus(transactionId);
      if (status.checkout_status !== "FINISHED") {
        return NextResponse.json(
          { error: "Payment not completed yet. Cannot confirm order." },
          { status: 409 }
        );
      }
    }
    const confirmation = await client.cart.confirmOrder(orderId);
    return NextResponse.json({ success: true, orderId: confirmation.order_id });
  } catch (error2) {
    if (isApiAuthError(error2)) {
      return NextResponse.json(
        { error: "Your token has expired", code: "TOKEN_EXPIRED" },
        { status: 401 }
      );
    }
    const message = error2 instanceof Error ? error2.message : "Unknown error occurred";
    console.error("[/api/cart/checkout/confirm] Failed:", message);
    return NextResponse.json(
      { error: "Failed to confirm order. Please try again later." },
      { status: 502 }
    );
  }
}

// vendor/picnic-web/src/app/api/cart/checkout/initiate/route.ts
var route_exports8 = {};
__export(route_exports8, {
  POST: () => POST8
});
async function POST8(request) {
  const token = readAuthToken(request);
  if (!token) {
    return NextResponse.json(
      { error: "Your token has expired", code: "TOKEN_EXPIRED" },
      { status: 401 }
    );
  }
  let orderId;
  try {
    const body = await request.json();
    if (typeof body.orderId !== "string" || !body.orderId) {
      return NextResponse.json({ error: "orderId is required" }, { status: 400 });
    }
    orderId = body.orderId;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  const origin = request.nextUrl.origin;
  const returnUrl = `${origin}/checkout/return`;
  try {
    const client = buildPicnicClient(token, readCountryCode(request));
    const raw = await client.cart.initiatePayment(orderId, returnUrl);
    const redirectUrl = raw.action?.redirect_url ?? raw.issuer_authentication_url ?? "";
    if (!redirectUrl) {
      return NextResponse.json({ error: "Payment redirect URL missing from Picnic response" }, { status: 502 });
    }
    return NextResponse.json({
      paymentId: raw.payment_id,
      transactionId: raw.transaction_id,
      redirectUrl
    });
  } catch (error2) {
    if (isApiAuthError(error2)) {
      return NextResponse.json(
        { error: "Your token has expired", code: "TOKEN_EXPIRED" },
        { status: 401 }
      );
    }
    const message = error2 instanceof Error ? error2.message : "Unknown error occurred";
    console.error("[/api/cart/checkout/initiate] Failed:", message);
    return NextResponse.json(
      { error: "Failed to initiate payment. Please try again later." },
      { status: 502 }
    );
  }
}

// vendor/picnic-web/src/app/api/cart/checkout/payment-profile/route.ts
var route_exports9 = {};
__export(route_exports9, {
  GET: () => GET2
});

// vendor/picnic-web/src/lib/checkout/parse-checkout.ts
function parseCheckoutStart(raw) {
  if (!isObject2(raw)) {
    return emptyCheckoutStart();
  }
  return {
    orderId: asString(raw["order_id"]),
    totalPrice: asNumber(raw["total_price"]),
    totalCount: asNumber(raw["total_count"]),
    totalDeposit: asNumber(raw["total_deposit"]),
    totalSavings: asNumber(raw["total_savings"]),
    transactionExpiry: asString(raw["transaction_expiry"])
  };
}
function emptyCheckoutStart() {
  return {
    orderId: "",
    totalPrice: 0,
    totalCount: 0,
    totalDeposit: 0,
    totalSavings: 0,
    transactionExpiry: ""
  };
}
function parsePaymentProfile(raw) {
  if (!isObject2(raw)) {
    return { preferredPaymentOptionId: "", storedOptions: [] };
  }
  const stored = asArray(raw["stored_payment_options"]).filter(isObject2).map((option) => ({
    id: asString(option["id"]),
    displayName: asString(option["display_name"]),
    account: asString(option["account"]) || null,
    paymentMethod: asString(option["payment_method"]),
    iconUrl: asString(option["icon_url"])
  }));
  return {
    preferredPaymentOptionId: asString(raw["preferred_payment_option_id"]),
    storedOptions: stored
  };
}

// vendor/picnic-web/src/app/api/cart/checkout/payment-profile/route.ts
async function GET2(request) {
  const token = readAuthToken(request);
  if (!token) {
    return NextResponse.json(
      { error: "Your token has expired", code: "TOKEN_EXPIRED" },
      { status: 401 }
    );
  }
  try {
    const client = buildPicnicClient(token, readCountryCode(request));
    const raw = await client.payment.getPaymentProfile();
    return NextResponse.json(parsePaymentProfile(raw));
  } catch (error2) {
    if (isApiAuthError(error2)) {
      return NextResponse.json(
        { error: "Your token has expired", code: "TOKEN_EXPIRED" },
        { status: 401 }
      );
    }
    const message = error2 instanceof Error ? error2.message : "Unknown error occurred";
    console.error("[/api/cart/checkout/payment-profile] Failed:", message);
    return NextResponse.json(
      { error: "Failed to load payment profile. Please try again later." },
      { status: 502 }
    );
  }
}

// vendor/picnic-web/src/app/api/cart/checkout/start/route.ts
var route_exports10 = {};
__export(route_exports10, {
  POST: () => POST9
});

// vendor/picnic-web/src/lib/checkout/checkout-issue.ts
function isCheckoutIssueError(error2) {
  return typeof error2 === "object" && error2 !== null && "name" in error2 && error2.name === "CheckoutIssueError";
}
function mapCheckoutIssue(error2) {
  const requiresAgeVerification = typeof error2.isAgeVerificationIssue === "function" ? error2.isAgeVerificationIssue() : error2.issueType === "LEGACY_ALCOHOL_AGE_VERIFICATION_REQUIRED";
  return {
    code: error2.code ?? "CART_HAS_ISSUES",
    title: error2.title ?? "Checkout issue",
    message: error2.issueMessage ?? "Unable to proceed with checkout.",
    resolveKey: error2.resolveKey ?? "",
    blocking: error2.blocking ?? true,
    issueType: error2.issueType ?? "UNKNOWN",
    requiresAgeVerification
  };
}

// vendor/picnic-web/src/app/api/cart/checkout/start/route.ts
async function POST9(request) {
  const token = readAuthToken(request);
  if (!token) {
    return NextResponse.json(
      { error: "Your token has expired", code: "TOKEN_EXPIRED" },
      { status: 401 }
    );
  }
  const countryCode = readCountryCode(request);
  let mts;
  let resolveKey;
  try {
    const body = await request.json();
    if (typeof body.mts === "number") mts = body.mts;
    if (typeof body.resolveKey === "string" && body.resolveKey.length > 0) {
      resolveKey = body.resolveKey;
    }
  } catch {
  }
  try {
    const client = buildPicnicClient(token, countryCode);
    if (mts === void 0) {
      const cart2 = await client.cart.getCart();
      mts = cart2.mts;
    }
    const raw = await client.cart.startCheckout({
      mts,
      ...resolveKey ? { resolve_key: resolveKey } : {}
    });
    return NextResponse.json(parseCheckoutStart(raw));
  } catch (error2) {
    if (isCheckoutIssueError(error2)) {
      return NextResponse.json({ issue: mapCheckoutIssue(error2) }, { status: 409 });
    }
    if (isApiAuthError(error2)) {
      return NextResponse.json(
        { error: "Your token has expired", code: "TOKEN_EXPIRED" },
        { status: 401 }
      );
    }
    const message = error2 instanceof Error ? error2.message : "Unknown error occurred";
    console.error("[/api/cart/checkout/start] Failed:", message);
    return NextResponse.json({ error: "Failed to start checkout. Please try again later." }, { status: 502 });
  }
}

// vendor/picnic-web/src/app/api/cart/checkout/status/route.ts
var route_exports11 = {};
__export(route_exports11, {
  GET: () => GET3
});
async function GET3(request) {
  const token = readAuthToken(request);
  if (!token) {
    return NextResponse.json(
      { error: "Your token has expired", code: "TOKEN_EXPIRED" },
      { status: 401 }
    );
  }
  const transactionId = request.nextUrl.searchParams.get("transactionId");
  if (!transactionId) {
    return NextResponse.json({ error: "transactionId is required" }, { status: 400 });
  }
  try {
    const client = buildPicnicClient(token, readCountryCode(request));
    const raw = await client.cart.getCheckoutStatus(transactionId);
    return NextResponse.json({ checkoutStatus: raw.checkout_status });
  } catch (error2) {
    if (isApiAuthError(error2)) {
      return NextResponse.json(
        { error: "Your token has expired", code: "TOKEN_EXPIRED" },
        { status: 401 }
      );
    }
    const message = error2 instanceof Error ? error2.message : "Unknown error occurred";
    console.error("[/api/cart/checkout/status] Failed:", message);
    return NextResponse.json(
      { error: "Failed to load checkout status. Please try again later." },
      { status: 502 }
    );
  }
}

// vendor/picnic-web/src/app/api/cart/delivery-slots/route.ts
var route_exports12 = {};
__export(route_exports12, {
  GET: () => GET4,
  POST: () => POST10
});

// vendor/picnic-web/src/lib/delivery/group-delivery-slots.ts
function extractDateKey(isoTimestamp) {
  const date = new Date(isoTimestamp);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
function groupSlotsByDay(slots2, countryCode) {
  const dayMap = /* @__PURE__ */ new Map();
  const dayOrder = [];
  for (const slot2 of slots2) {
    const dateKey = extractDateKey(slot2.windowStart);
    if (!dayMap.has(dateKey)) {
      dayMap.set(dateKey, []);
      dayOrder.push(dateKey);
    }
    dayMap.get(dateKey).push(slot2);
  }
  return dayOrder.map((dateKey) => {
    const daySlots = dayMap.get(dateKey);
    const { dayLabel, dateLabel } = formatDayTabLabel(dateKey, countryCode);
    const greenSlots = daySlots.filter((s) => s.isGreenChoice);
    const regularSlots = daySlots.filter((s) => !s.isGreenChoice);
    return { date: dateKey, dayLabel, dateLabel, greenSlots, regularSlots };
  });
}
function buildSlotPicker(overview, countryCode) {
  return {
    dayGroups: groupSlotsByDay(overview.slots, countryCode),
    selectedSlot: overview.selectedSlot
  };
}

// vendor/picnic-web/src/app/api/cart/delivery-slots/route.ts
async function GET4(request) {
  const token = readAuthToken(request);
  if (!token) {
    return NextResponse.json(
      { error: "Your token has expired", code: "TOKEN_EXPIRED" },
      { status: 401 }
    );
  }
  const countryCode = readCountryCode(request);
  try {
    const client = buildPicnicClient(token, countryCode);
    const overview = await client.cart.getDeliverySlotOverview();
    const pickerData = buildSlotPicker(overview, countryCode);
    return NextResponse.json(pickerData);
  } catch (error2) {
    if (isApiAuthError(error2)) {
      return NextResponse.json(
        { error: "Your token has expired", code: "TOKEN_EXPIRED" },
        { status: 401 }
      );
    }
    const message = error2 instanceof Error ? error2.message : "Unknown error occurred";
    console.error("[/api/cart/delivery-slots] Failed to fetch slots:", message);
    return NextResponse.json(
      {
        error: "Failed to fetch delivery slots. Please try again later."
      },
      { status: 502 }
    );
  }
}
async function POST10(request) {
  const token = readAuthToken(request);
  if (!token) {
    return NextResponse.json(
      { error: "Your token has expired", code: "TOKEN_EXPIRED" },
      { status: 401 }
    );
  }
  const countryCode = readCountryCode(request);
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!body.slotId || typeof body.slotId !== "string") {
    return NextResponse.json({ error: "Missing required field: slotId" }, { status: 400 });
  }
  try {
    const client = buildPicnicClient(token, countryCode);
    const rawCart = await client.cart.setDeliverySlot(body.slotId);
    const cartData = parseCartResponse(rawCart, countryCode);
    return NextResponse.json(cartData);
  } catch (error2) {
    if (isApiAuthError(error2)) {
      return NextResponse.json(
        { error: "Your token has expired", code: "TOKEN_EXPIRED" },
        { status: 401 }
      );
    }
    const message = error2 instanceof Error ? error2.message : "Unknown error occurred";
    console.error("[/api/cart/delivery-slots] Failed to set slot:", message);
    return NextResponse.json(
      {
        error: "Failed to set delivery slot. Please try again."
      },
      { status: 502 }
    );
  }
}

// vendor/picnic-web/src/app/api/cart/footer/route.ts
var route_exports13 = {};
__export(route_exports13, {
  GET: () => GET5
});
async function GET5(request) {
  const token = readAuthToken(request);
  if (!token) {
    return NextResponse.json(
      { error: "Your token has expired", code: "TOKEN_EXPIRED" },
      { status: 401 }
    );
  }
  try {
    const client = buildPicnicClient(token, readCountryCode(request));
    return NextResponse.json(await client.cart.getBasketFooter());
  } catch (error2) {
    if (isApiAuthError(error2)) {
      return NextResponse.json(
        { error: "Your token has expired", code: "TOKEN_EXPIRED" },
        { status: 401 }
      );
    }
    const message = error2 instanceof Error ? error2.message : "Unknown error occurred";
    console.error("[/api/cart/footer] Failed:", message);
    return NextResponse.json(
      { error: "Failed to load the basket footer. Please try again later." },
      { status: 502 }
    );
  }
}

// vendor/picnic-web/src/app/api/categories/[categoryId]/products/route.ts
var route_exports14 = {};
__export(route_exports14, {
  GET: () => GET6
});

// vendor/picnic-web/src/lib/search/parse-content-page.ts
function extractSectionTitle(headerNode) {
  const markdowns = collectMarkdowns(headerNode);
  const cleaned = markdowns.map((md) => stripColorTags(md)).filter(Boolean);
  return cleaned.join(" / ");
}
function extractProductsFromWrappers(wrappers, seenIds) {
  const products = [];
  for (const wrapper of wrappers) {
    const containers = findSellingUnitContainers(wrapper);
    for (const container of containers) {
      const product = containerToProduct(container);
      if (!product || seenIds.has(product.id)) continue;
      seenIds.add(product.id);
      products.push(product);
    }
  }
  return products;
}
function findAllByIdPrefix(obj, prefix, results = []) {
  if (typeof obj !== "object" || obj === null) return results;
  if (Array.isArray(obj)) {
    for (const item of obj) findAllByIdPrefix(item, prefix, results);
    return results;
  }
  const record = obj;
  if (typeof record.id === "string" && record.id.startsWith(prefix)) {
    results.push(record);
    return results;
  }
  for (const value of Object.values(record)) {
    findAllByIdPrefix(value, prefix, results);
  }
  return results;
}
function findAllByRegex(obj, regex, results = []) {
  if (typeof obj !== "object" || obj === null) return results;
  if (Array.isArray(obj)) {
    for (const item of obj) findAllByRegex(item, regex, results);
    return results;
  }
  const record = obj;
  if (typeof record.id === "string" && regex.test(record.id)) {
    results.push(record);
    return results;
  }
  for (const value of Object.values(record)) {
    findAllByRegex(value, regex, results);
  }
  return results;
}
var CAMPAIGN_SECTION_RE = /^(?:\d+-)?campaign-(?:promo|highlight|selling-unit-horizontal-carousel)-section_/;
var CORE_SUB_HEADER_SUFFIX = "-core-sub-header";
function parseCampaignPageSections(rawPage) {
  const campaignSections = findAllByRegex(rawPage, CAMPAIGN_SECTION_RE);
  if (campaignSections.length === 0) {
    return parseHorizontalSellingSections(rawPage);
  }
  const seenIds = /* @__PURE__ */ new Set();
  const sections = [];
  for (const section of campaignSections) {
    const sectionId = section.id ?? "";
    const subHeaderId = sectionId + CORE_SUB_HEADER_SUFFIX;
    const subHeader = findNodeByIdSubstring(section, subHeaderId);
    let title = "";
    if (subHeader) {
      title = extractSectionTitle(subHeader);
    }
    const products2 = extractProductsFromWrappers([section], seenIds);
    if (products2.length === 0) continue;
    if (!title) title = "Producten";
    sections.push({ title, products: products2 });
  }
  const products = sections.flatMap((s) => s.products);
  return { sections, products };
}
var HORIZONTAL_SECTION_PREFIX = "core-horizontal-selling-unit-section-localized";
var SUB_HEADER_PML_PREFIX = "horizontal-selling-unit-tiles-sub-header-pml";
function parseHorizontalSellingSections(rawPage) {
  const hSections = findAllByIdPrefix(rawPage, HORIZONTAL_SECTION_PREFIX);
  if (hSections.length === 0) {
    return fallbackFlatParse(rawPage);
  }
  const seenIds = /* @__PURE__ */ new Set();
  const sections = [];
  for (const section of hSections) {
    const subHeader = findNodeByIdPrefix(section, SUB_HEADER_PML_PREFIX);
    let title = "";
    if (subHeader) {
      title = extractSectionTitle(subHeader);
    }
    const products2 = extractProductsFromWrappers([section], seenIds);
    if (products2.length === 0) continue;
    if (!title) title = "Producten";
    sections.push({ title, products: products2 });
  }
  const hasRealTitles = sections.some((s) => s.title !== "Producten");
  if (!hasRealTitles) {
    const allProducts = sections.flatMap((s) => s.products);
    return { sections: [], products: allProducts };
  }
  const products = sections.flatMap((s) => s.products);
  return { sections, products };
}
function fallbackFlatParse(rawPage) {
  const containers = findSellingUnitContainers(rawPage);
  const productMap = /* @__PURE__ */ new Map();
  for (const container of containers) {
    const product = containerToProduct(container);
    if (!product) continue;
    const existing = productMap.get(product.id);
    if (!existing || product.badges.length > existing.badges.length || product.namePrefix || product.subtitle || product.brand) {
      productMap.set(product.id, product);
    }
  }
  const products = Array.from(productMap.values());
  return { sections: [], products };
}
function parseContentPageSections(rawPage) {
  return parseCampaignPageSections(rawPage);
}

// vendor/picnic-web/src/lib/search/parse-fusion-search.ts
function parsePriceRangesFromRaw(raw) {
  if (!raw || raw.length === 0) return null;
  const thresholds = [];
  for (const entry of raw) {
    if (typeof entry === "object" && entry !== null && "price" in entry && typeof entry.price === "number" && "from_quantity" in entry && typeof entry.from_quantity === "number") {
      const e = entry;
      thresholds.push({ quantity: e.from_quantity, pricePerUnit: e.price });
    }
  }
  if (thresholds.length === 0) return null;
  thresholds.sort((a, b) => a.quantity - b.quantity);
  return thresholds;
}
function containerToProduct(container) {
  const su = container.content?.sellingUnit;
  if (!su) return null;
  const pml = container.pml?.component ? container.pml : void 0;
  const contexts = container.analytics?.contexts;
  const stackChildren = findTextStackChildren(pml);
  const promotion = extractPromotionBadge(contexts, pml, stackChildren);
  const textInfo = extractTextStackInfo(stackChildren, su.name, su.unit_quantity);
  const { isUnavailable, reason } = extractUnavailabilityFromPml(pml);
  const originalPrice = extractOriginalPriceFromPml(stackChildren, su.display_price);
  const badges = [];
  if (textInfo.extraLabel) {
    badges.push(textInfo.extraLabel);
  }
  const hasDiscount = originalPrice !== null && originalPrice > su.display_price;
  return {
    id: su.id,
    name: textInfo.displayName ?? su.name,
    namePrefix: textInfo.namePrefix,
    subtitle: textInfo.subtitle,
    subtitleColor: textInfo.subtitleColor,
    subtitleLeadingIcon: textInfo.subtitleLeadingIcon,
    subtitleTrailingIcon: textInfo.subtitleTrailingIcon,
    brand: textInfo.brand,
    highlight: textInfo.highlight,
    flagIconKey: textInfo.flagIconKey,
    flagFallbackImageId: textInfo.flagFallbackImageId,
    imageId: su.image_id,
    displayPrice: su.display_price,
    originalPrice: hasDiscount ? originalPrice : null,
    displayPriceColor: extractDisplayPriceColor2(stackChildren, su.display_price),
    unitQuantity: su.unit_quantity,
    maxCount: su.max_count,
    priceRanges: parsePriceRangesFromRaw(su.price_ranges),
    badges,
    promoBadge: promotion?.badge ?? null,
    promoPlacement: promotion?.placement ?? null,
    isUnavailable,
    unavailableReason: reason
  };
}
function extractSectionTitle2(headerNode) {
  const markdowns = collectMarkdowns(headerNode);
  const cleaned = markdowns.map((md) => stripColorTags(md)).filter(Boolean);
  return cleaned.join(" / ");
}
function extractProductsFromWrappers2(wrappers, seenIds) {
  const products = [];
  for (const wrapper of wrappers) {
    const containers = findSellingUnitContainers(wrapper);
    for (const container of containers) {
      const product = containerToProduct(container);
      if (!product || seenIds.has(product.id)) continue;
      seenIds.add(product.id);
      products.push(product);
    }
  }
  return products;
}
var HEADER_PREFIX = "client-side-filtering-section-header-wrapper-";
var WRAPPER_PREFIX = "client-side-filtering-section-wrapper-";
var VISUAL_SECTIONS_ID = "structured-selling-unit-search-result-visual-sections";
function parseFusionSearchSections(rawPage) {
  const seenIds = /* @__PURE__ */ new Set();
  const sections = [];
  const resultNode = findNodeByIdSubstring(rawPage, "structured-selling-unit-search-result");
  if (!resultNode) {
    return parseContentPageSections(rawPage);
  }
  const resultChildren = resultNode.children;
  if (!resultChildren) return parseContentPageSections(rawPage);
  for (let i = 0; i < resultChildren.length; i++) {
    const child = resultChildren[i];
    const childId = child.id ?? "";
    if (childId.startsWith(HEADER_PREFIX)) {
      const sectionKey = childId.slice(HEADER_PREFIX.length);
      const title = extractSectionTitle2(child);
      const wrappers = [];
      for (let j = i + 1; j < resultChildren.length; j++) {
        const sibling = resultChildren[j];
        const nextId = sibling.id ?? "";
        if (nextId.startsWith(WRAPPER_PREFIX + sectionKey)) {
          wrappers.push(sibling);
        } else if (nextId.startsWith(HEADER_PREFIX) || nextId === VISUAL_SECTIONS_ID || nextId.includes(VISUAL_SECTIONS_ID)) {
          break;
        } else {
          const nested = findNodeByIdSubstring(sibling, WRAPPER_PREFIX + sectionKey);
          if (nested) wrappers.push(nested);
        }
      }
      const products2 = extractProductsFromWrappers2(wrappers, seenIds);
      if (products2.length > 0) {
        sections.push({ title, products: products2 });
      }
    }
    if (childId === VISUAL_SECTIONS_ID || childId.includes(VISUAL_SECTIONS_ID)) {
      const vsChildren = child.children;
      if (vsChildren) {
        parseSectionsFromChildren(vsChildren, sections, seenIds);
      }
    }
  }
  const products = sections.flatMap((s) => s.products);
  if (products.length === 0) {
    const flat = extractProductsFromWrappers2([resultNode], /* @__PURE__ */ new Set());
    return { sections: [], products: flat };
  }
  return { sections, products };
}
function isWrapperForSection(id, sectionKey) {
  const prefix = WRAPPER_PREFIX + sectionKey;
  return id === prefix || id.startsWith(prefix + "__");
}
function collectWrappers(children, start, sectionKey) {
  let j = start;
  while (j < children.length) {
    const nextId = children[j].id ?? "";
    if (!isWrapperForSection(nextId, sectionKey)) break;
    j++;
  }
  return j;
}
function parseSectionsFromChildren(children, sections, seenIds) {
  let i = 0;
  while (i < children.length) {
    const child = children[i];
    const childId = child.id ?? "";
    if (childId.startsWith(HEADER_PREFIX)) {
      const sectionKey = childId.slice(HEADER_PREFIX.length);
      const title = extractSectionTitle2(child);
      const j = collectWrappers(children, i + 1, sectionKey);
      const products = extractProductsFromWrappers2(children.slice(i + 1, j), seenIds);
      if (products.length > 0) {
        sections.push({ title, products });
      }
      i = j;
    } else if (childId.startsWith(WRAPPER_PREFIX)) {
      const sectionKey = childId.slice(WRAPPER_PREFIX.length).replace(/__\d+$/, "");
      const j = collectWrappers(children, i, sectionKey);
      const products = extractProductsFromWrappers2(children.slice(i, j), seenIds);
      if (products.length > 0) {
        sections.push({ title: sectionKey, products });
      }
      i = j;
    } else {
      i++;
    }
  }
}
var CATEGORY_ARTICLES_PREFIX = "category-tree-page-articles-section";
var CATEGORY_SUB_HEADER_PREFIX = "vertical-article-tiles-sub-header-";
function parseCategoryPageSections(rawPage) {
  const articleSections = findAllByIdPrefix2(rawPage, CATEGORY_ARTICLES_PREFIX);
  if (articleSections.length === 0) {
    return parseFusionSearchSections(rawPage);
  }
  const seenIds = /* @__PURE__ */ new Set();
  const sections = [];
  for (const section of articleSections) {
    const headerNodes = findAllByIdPrefix2(section, CATEGORY_SUB_HEADER_PREFIX);
    let title = "";
    for (const h of headerNodes) {
      title = extractSectionTitle2(h);
      if (title) break;
    }
    if (!title) continue;
    const products2 = extractProductsFromWrappers2([section], seenIds);
    if (products2.length > 0) {
      sections.push({ title, products: products2 });
    }
  }
  const products = sections.flatMap((s) => s.products);
  return { sections, products };
}
function findAllByIdPrefix2(obj, prefix, results = []) {
  if (typeof obj !== "object" || obj === null) return results;
  if (Array.isArray(obj)) {
    for (const item of obj) findAllByIdPrefix2(item, prefix, results);
    return results;
  }
  const record = obj;
  if (typeof record.id === "string" && record.id.startsWith(prefix)) {
    results.push(record);
    return results;
  }
  for (const value of Object.values(record)) {
    findAllByIdPrefix2(value, prefix, results);
  }
  return results;
}

// vendor/picnic-web/src/lib/category/parse-categories.ts
var CATEGORY_ITEM_PREFIX = "core-list-item-category-";
function extractCategoryFromPmlItem(item, itemId) {
  const id = itemId.slice(CATEGORY_ITEM_PREFIX.length);
  if (!id) return null;
  const pml = item.pml;
  if (typeof pml !== "object" || pml === null) return null;
  const component = pml.component;
  if (typeof component !== "object" || component === null) return null;
  const componentRecord = component;
  const name = componentRecord.accessibilityLabel;
  if (typeof name !== "string" || name === "") return null;
  const onPress = componentRecord.onPress;
  let deepLinkTarget = "";
  if (typeof onPress === "object" && onPress !== null) {
    const target = onPress.target;
    if (typeof target === "string") {
      deepLinkTarget = target;
    }
  }
  const imageId = findFirstImageId(componentRecord);
  if (!imageId) return null;
  return { id, name, imageId, deepLinkTarget };
}
function findFirstImageId(component) {
  const sources = collectPropertyValues(component, "source");
  for (const source of sources) {
    if (typeof source !== "object" || source === null) continue;
    const sourceId = source.id;
    if (typeof sourceId === "string" && sourceId !== "") {
      return sourceId;
    }
  }
  return null;
}

// vendor/picnic-web/src/lib/category/parse-subcategories.ts
var L1_CATEGORY_LIST_BLOCK_ID = "L1-category-page-list";
function parseSubcategoryPage(rawPage) {
  const listBlock = findNodeByIdSubstring(rawPage, L1_CATEGORY_LIST_BLOCK_ID);
  if (!listBlock) return [];
  const children = listBlock.children;
  if (!Array.isArray(children)) return [];
  const subcategories = [];
  for (const child of children) {
    if (typeof child !== "object" || child === null) continue;
    const record = child;
    if (record.type !== "PML") continue;
    const itemId = record.id;
    if (typeof itemId !== "string") continue;
    if (!itemId.startsWith(CATEGORY_ITEM_PREFIX)) continue;
    const category = extractCategoryFromPmlItem(record, itemId);
    if (category) subcategories.push(category);
  }
  return subcategories;
}
function asRecord(value) {
  return typeof value === "object" && value !== null ? value : null;
}
function extractPageTitle(rawPage) {
  const page = asRecord(rawPage);
  if (!page) return null;
  const header = asRecord(asRecord(page.layout)?.header) ?? asRecord(page.header);
  if (!header) return null;
  const title = header.title;
  return typeof title === "string" ? title : null;
}

// vendor/picnic-web/src/app/api/categories/[categoryId]/products/route.ts
var L2_PAGE_PREFIX = "L2-category-page-root?category_id=";
async function GET6(request, { params }) {
  const { categoryId } = await params;
  const token = readAuthToken(request);
  if (!token) {
    return NextResponse.json(
      { error: "Authentication required", code: "TOKEN_EXPIRED" },
      { status: 401 }
    );
  }
  const countryCode = readCountryCode(request);
  try {
    const client = buildPicnicClient(token, countryCode);
    const rawPage = await client.app.getPage(`${L2_PAGE_PREFIX}${categoryId}`);
    const title = extractPageTitle(rawPage);
    const { sections, products } = parseCategoryPageSections(rawPage);
    return NextResponse.json({ title, products, sections });
  } catch (error2) {
    if (isApiAuthError(error2)) {
      return NextResponse.json(
        { error: "Your token has expired", code: "TOKEN_EXPIRED" },
        { status: 401 }
      );
    }
    const message = error2 instanceof Error ? error2.message : "Unknown error occurred";
    console.error(`[/api/categories/${categoryId}/products] Failed:`, message);
    return NextResponse.json(
      {
        error: "Failed to load products. Please try again later."
      },
      { status: 502 }
    );
  }
}

// vendor/picnic-web/src/app/api/categories/[categoryId]/subcategories/route.ts
var route_exports15 = {};
__export(route_exports15, {
  GET: () => GET7
});
var L1_PAGE_PREFIX = "L1-category-page-root?category_id=";
async function GET7(request, { params }) {
  const { categoryId } = await params;
  const token = readAuthToken(request);
  if (!token) {
    return NextResponse.json(
      { error: "Authentication required", code: "TOKEN_EXPIRED" },
      { status: 401 }
    );
  }
  const countryCode = readCountryCode(request);
  try {
    const client = buildPicnicClient(token, countryCode);
    const rawPage = await client.app.getPage(`${L1_PAGE_PREFIX}${categoryId}`);
    const title = extractPageTitle(rawPage) ?? categoryId;
    const subcategories = parseSubcategoryPage(rawPage);
    return NextResponse.json({ title, subcategories });
  } catch (error2) {
    if (isApiAuthError(error2)) {
      return NextResponse.json(
        { error: "Your token has expired", code: "TOKEN_EXPIRED" },
        { status: 401 }
      );
    }
    const message = error2 instanceof Error ? error2.message : "Unknown error occurred";
    console.error(`[/api/categories/${categoryId}/subcategories] Failed:`, message);
    return NextResponse.json(
      {
        error: "Subcategories are not loading. Please try again later."
      },
      { status: 502 }
    );
  }
}

// vendor/picnic-web/src/app/api/cookbook/route.ts
var route_exports16 = {};
__export(route_exports16, {
  GET: () => GET8
});

// vendor/picnic-web/src/lib/recipe/parse-cookbook.ts
var RECIPE_ID_RE = /^[0-9a-f]{24}$/;
function findRecipeCardNodes(obj, results = []) {
  if (typeof obj !== "object" || obj === null) return results;
  if (Array.isArray(obj)) {
    for (const item of obj) findRecipeCardNodes(item, results);
    return results;
  }
  const record = obj;
  if (record.type === "BLOCK" || record.type === "PML") {
    const analytics = record.analytics;
    for (const ctx of analytics?.contexts ?? []) {
      if (typeof ctx !== "object" || ctx === null) continue;
      const data = ctx.data;
      if (data && typeof data.recipe_id === "string" && RECIPE_ID_RE.test(data.recipe_id)) {
        results.push(record);
        return results;
      }
    }
    if (typeof record.id === "string" && record.id.includes("recipe")) {
      const lastSegment = record.id.split("-").at(-1) ?? "";
      if (RECIPE_ID_RE.test(lastSegment)) {
        results.push(record);
        return results;
      }
    }
  }
  for (const value of Object.values(record)) {
    findRecipeCardNodes(value, results);
  }
  return results;
}
function extractImageId2(obj) {
  if (typeof obj !== "object" || obj === null) return null;
  if (Array.isArray(obj)) {
    for (const item of obj) {
      const id = extractImageId2(item);
      if (id) return id;
    }
    return null;
  }
  const record = obj;
  if (record.type === "IMAGE") {
    const source = record.source;
    if (typeof source?.id === "string") return source.id;
    const fallback = record.fallbackSource;
    if (typeof fallback?.id === "string") return fallback.id;
  }
  for (const value of Object.values(record)) {
    const id = extractImageId2(value);
    if (id) return id;
  }
  return null;
}
function extractFromAnalytics(node) {
  const analytics = node.analytics;
  for (const ctx of analytics?.contexts ?? []) {
    if (typeof ctx !== "object" || ctx === null) continue;
    const data = ctx.data;
    if (!data || typeof data.recipe_id !== "string") continue;
    if (!RECIPE_ID_RE.test(data.recipe_id)) continue;
    const name = typeof data.name === "string" ? data.name : typeof data.recipe_name === "string" ? data.recipe_name : "";
    const cookingTimeMinutes = typeof data.cooking_time_minutes === "number" ? data.cooking_time_minutes : null;
    return { recipeId: data.recipe_id, name, cookingTimeMinutes };
  }
  return null;
}
function parseCookbookPage(rawPage) {
  const cardNodes = findRecipeCardNodes(rawPage);
  const seen = /* @__PURE__ */ new Set();
  const recipes = [];
  for (const node of cardNodes) {
    const fromAnalytics = extractFromAnalytics(node);
    let recipeId = fromAnalytics?.recipeId ?? "";
    let name = fromAnalytics?.name ?? "";
    const cookingTimeMinutes = fromAnalytics?.cookingTimeMinutes ?? null;
    if (!recipeId) {
      const lastSegment = (node.id ?? "").split("-").at(-1) ?? "";
      if (RECIPE_ID_RE.test(lastSegment)) recipeId = lastSegment;
    }
    if (!recipeId || seen.has(recipeId)) continue;
    seen.add(recipeId);
    if (!name) {
      name = collectMarkdowns(node).map(cleanMarkdown).find((m) => m.length > 3) ?? "";
    }
    if (!name) continue;
    const imageId = extractImageId2(node);
    recipes.push({ id: recipeId, name, imageId, cookingTimeMinutes });
  }
  return recipes;
}

// vendor/picnic-web/src/lib/recipe/fetch-saved-recipes.ts
var SAVED_PAGE_ID = "saved-deep-dive-page-content";
async function fetchSavedRecipes(client) {
  const rawPage = await client.sendRequest(
    "GET",
    `/pages/${SAVED_PAGE_ID}`,
    null,
    true
  );
  return parseCookbookPage(rawPage);
}

// vendor/picnic-web/src/lib/recipe/recipe-categories.ts
var DE_CATEGORIES = [
  { id: "recipe-cattree-25min", name: "Blitzrezepte" },
  { id: "recipe-cattree-onepot", name: "One Pot" },
  { id: "recipe-cattree-pasta", name: "Pasta" },
  { id: "recipe-cattree-stuffedpasta", name: "Gefüllte Pasta" },
  { id: "recipe-cattree-lasagne", name: "Lasagne" },
  { id: "recipe-cattree-gnocchi", name: "Gnocchi" },
  { id: "recipe-cattree-noodles", name: "Nudeln" },
  { id: "recipe-cattree-schupfnudeln", name: "Schupfnudeln" },
  { id: "recipe-cattree-maultaschen", name: "Maultaschen" },
  { id: "recipe-cattree-spaetzle", name: "Spätzle" },
  { id: "recipe-cattree-asia-reis", name: "Asia & Reis" },
  { id: "recipe-cattree-risotto", name: "Risotto" },
  { id: "recipe-cattree-couscous", name: "Couscous" },
  { id: "recipe-cattree-bulgur", name: "Bulgur" },
  { id: "recipe-cattree-knoedel", name: "Knödel" },
  { id: "recipe-cattree-kartoffel", name: "Kartoffel" },
  { id: "recipe-cattree-suppen", name: "Suppen" },
  { id: "recipe-cattree-eintopf", name: "Eintopf" },
  { id: "recipe-cattree-curry2", name: "Curry" },
  { id: "recipe-cattree-l2-salad", name: "Salate" },
  { id: "recipe-cattree-bowls", name: "Bowls" },
  { id: "recipe-cattree-wraps", name: "Wraps" },
  { id: "recipe-cattree-pita2", name: "Pita" },
  { id: "recipe-cattree-l2-burger", name: "Burger" },
  { id: "recipe-cattree-quiche", name: "Quiche" },
  { id: "recipe-cattree-traybake", name: "Traybake" },
  { id: "recipe-cattree-auflaufe", name: "Aufläufe" },
  { id: "recipe-cattree-l2-pizza", name: "Pizza" },
  { id: "recipe-cattree-vegetarisch", name: "Vegetarisch" },
  { id: "recipe-cattree-vegan", name: "Vegan" },
  { id: "recipe-cattree-highinveg", name: "Viel Gemüse" },
  { id: "recipe-cattree-brunch", name: "Brunch" },
  { id: "recipe-cattree-aperitif", name: "Aperitif" },
  { id: "recipe-cattree-dessert", name: "Dessert" },
  { id: "recipe-cattree-abendbrot", name: "Abendbrot" },
  { id: "recipe-cattree-bbq", name: "BBQ" },
  { id: "recipe-cattree-l2-party", name: "Party" },
  { id: "recipe-cattree-basic", name: "Basics" },
  { id: "recipe-cattree-baking", name: "Backen" },
  { id: "recipe-cattree-snacks", name: "Snacks" },
  { id: "recipe-cattree-getraenke", name: "Getränke" },
  { id: "recipe-cattree-airfryer", name: "Airfryer" },
  { id: "recipe-cattree-budget", name: "Budget" },
  { id: "recipe-cattree-jamieoliver", name: "Jamie Oliver" },
  { id: "recipe-cattree-season", name: "Saisonal" },
  { id: "recipe-cattree-l2-kids", name: "Für Kinder" }
];
var NL_CATEGORIES = [
  {
    id: "meals-category-page-content?category_id=c24af7dc-f056-4067-8953-6a8f85410bf8",
    name: "Onder de 20 minuten"
  },
  {
    id: "meals-category-page-content?category_id=8efb8aab-c728-4df0-a427-ef3e18727dd1",
    name: "Weinig snijwerk"
  },
  {
    id: "meals-category-page-content?category_id=0524acc5-8f37-4f2e-b85a-d58b6f24b528",
    name: "Eenpansgerechten"
  },
  {
    id: "meals-category-page-content?category_id=ba089fa4-23c1-4361-b5a1-b24be2e013b6",
    name: "Pasta"
  },
  {
    id: "meals-category-page-content?category_id=d420d519-0c36-4109-86a8-e46cb5723f6e",
    name: "Ravioli & tortellini"
  },
  {
    id: "meals-category-page-content?category_id=9f238cf6-355d-4c96-bd66-36a1bed2ca4e",
    name: "Lasagne"
  },
  {
    id: "meals-category-page-content?category_id=14a589b9-57d8-4c36-bbea-2e095879cafa",
    name: "Noedels"
  },
  {
    id: "meals-category-page-content?category_id=8c6641c8-3b40-4d02-ae1c-cffc74533403",
    name: "Rijst"
  },
  {
    id: "meals-category-page-content?category_id=3bc87ef2-97ae-4ced-a67d-ba1db99e835c",
    name: "Risotto"
  },
  {
    id: "meals-category-page-content?category_id=aaf728c0-faf4-4d2b-81be-381cf0bbf81f",
    name: "Couscous, bulgur & quinoa"
  },
  {
    id: "meals-category-page-content?category_id=32e341cb-b9dd-4fd7-bbb4-a374a279f973",
    name: "Stamppot"
  },
  {
    id: "meals-category-page-content?category_id=745a4764-9670-4973-aa56-435ab4eca1ec",
    name: "Aardappelen"
  },
  {
    id: "meals-category-page-content?category_id=b29cbecb-6ddf-4ee0-a35e-d069ffd3c157",
    name: "Wraps & taco's"
  },
  {
    id: "meals-category-page-content?category_id=88f94486-b6d3-46f5-860e-0a1e1067f31d",
    name: "Pita & platbrood"
  },
  {
    id: "meals-category-page-content?category_id=16ee3d05-7e6a-40bc-b00a-1825514e51cf",
    name: "Pizza"
  },
  {
    id: "meals-category-page-content?category_id=5989ff24-36c9-43b3-83b1-57676ea2ca6c",
    name: "Burgers"
  },
  {
    id: "meals-category-page-content?category_id=2701028e-a90c-4198-ad91-a2f66e201b1b",
    name: "Ovenschotels"
  },
  {
    id: "meals-category-page-content?category_id=a5401880-0ad7-458b-aa5f-eac84da20865",
    name: "Traybakes"
  },
  {
    id: "meals-category-page-content?category_id=77eca1e7-1f83-43ad-a184-25da3532f065",
    name: "Plaattaart & flammkuchen"
  },
  {
    id: "meals-category-page-content?category_id=95512d80-583a-4d7b-907c-6899dd08d941",
    name: "Quiche"
  },
  {
    id: "meals-category-page-content?category_id=fcf06318-8f10-494b-8655-d283b3fbad18",
    name: "Airfryer"
  },
  {
    id: "meals-category-page-content?category_id=392d64fb-9452-4b24-9d82-36eda598382a",
    name: "Soep"
  },
  {
    id: "meals-category-page-content?category_id=5c45153e-c5aa-4402-b186-0ae09ee69fc5",
    name: "Vega"
  },
  {
    id: "meals-category-page-content?category_id=c6c05c56-49e6-4121-8803-ec3845384d36",
    name: "Vegan"
  },
  {
    id: "meals-category-page-content?category_id=60ac9475-3d4c-49c0-bf72-65cfecdfcfec",
    name: "Veel groente"
  },
  {
    id: "meals-category-page-content?category_id=5ef7b94b-15ba-4428-964b-181ee15feb0c",
    name: "Koolhydraatarm"
  },
  {
    id: "meals-category-page-content?category_id=c771f79e-65c7-4c25-873f-f45d738b2d4f",
    name: "Caloriearm"
  },
  {
    id: "meals-category-page-content?category_id=e0842ef6-770b-4324-ba51-eb8ca5368c38",
    name: "Zwangerproof"
  },
  {
    id: "meals-category-page-content?category_id=a8ce9cb8-61ba-44ab-bb7a-429e835659af",
    name: "Ontbijt"
  },
  {
    id: "meals-category-page-content?category_id=16c7d514-9f19-4568-b673-4513db894215",
    name: "Brunch & lunch"
  },
  {
    id: "meals-category-page-content?category_id=c92f50ef-2704-4585-9a50-40778a25ddef",
    name: "Drankjes"
  },
  {
    id: "meals-category-page-content?category_id=13bd904b-b39b-470b-aa71-3c91a9f3d1cc",
    name: "BBQ"
  },
  {
    id: "meals-category-page-content?category_id=bea9f93c-35e4-46f1-8ab4-19943074268a",
    name: "Budget"
  },
  {
    id: "meals-category-page-content?category_id=98733940-cdfe-4009-951a-89878911763e",
    name: "Koken met het seizoen"
  },
  {
    id: "meals-category-page-content?category_id=fc6a8ef1-8410-4f20-8137-332ddc8bb749",
    name: "Basisrecepten"
  },
  {
    id: "meals-category-page-content?category_id=33fa5851-be5d-40ba-92a4-35a382cbe9b8",
    name: "Verspakketten"
  },
  {
    id: "meals-category-page-content?category_id=3aa8ebe4-d0b5-4cad-b638-dcbd1d3ab8c4",
    name: "Jamie Oliver"
  },
  {
    id: "meals-category-page-content?category_id=f54dd9a3-9009-4832-b326-ecda25cd8834",
    name: "Eef Kookt Zo"
  },
  {
    id: "meals-category-page-content?category_id=f4b5b9e4-bb06-4078-a44f-2814b0c12030",
    name: "24Kitchen"
  }
];
function getRecipeCategories(countryCode) {
  if (countryCode === "DE") return DE_CATEGORIES;
  if (countryCode === "NL") return NL_CATEGORIES;
  return [];
}

// vendor/picnic-web/src/app/api/cookbook/route.ts
var CATEGORY_ID_RE = /^recipe-cattree-[\w-]+$|^meals-category-page-content\?category_id=[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
async function GET8(request) {
  const token = readAuthToken(request);
  if (!token) {
    return NextResponse.json(
      { error: "Authentication required", code: "TOKEN_EXPIRED" },
      { status: 401 }
    );
  }
  const countryCode = readCountryCode(request);
  const categoryId = request.nextUrl.searchParams.get("category");
  try {
    const client = buildPicnicClient(token, countryCode);
    if (categoryId === "__saved__") {
      const recipes2 = await fetchSavedRecipes(client);
      return NextResponse.json({ categories: [], recipes: recipes2 });
    }
    if (categoryId) {
      if (!CATEGORY_ID_RE.test(categoryId)) {
        return NextResponse.json({ error: "Invalid category ID" }, { status: 400 });
      }
      const rawPage2 = await fetchCachedPage(client, `/pages/${categoryId}`);
      const recipes2 = parseCookbookPage(rawPage2);
      return NextResponse.json({ categories: [], recipes: recipes2 });
    }
    const rawPage = await client.recipe.getRecipesPage();
    const recipes = parseCookbookPage(rawPage);
    const categories = getRecipeCategories(countryCode);
    return NextResponse.json({ categories, recipes });
  } catch (error2) {
    if (isApiAuthError(error2)) {
      return NextResponse.json(
        { error: "Your token has expired", code: "TOKEN_EXPIRED" },
        { status: 401 }
      );
    }
    const message = error2 instanceof Error ? error2.message : "Unknown error occurred";
    console.error("[/api/cookbook] Failed:", message);
    return NextResponse.json(
      { error: "Failed to load recipes. Please try again later." },
      { status: 502 }
    );
  }
}

// vendor/picnic-web/src/app/api/cookbook/counts/route.ts
var route_exports17 = {};
__export(route_exports17, {
  GET: () => GET9
});
import crypto from "node:crypto";
var cache2 = /* @__PURE__ */ new Map();
var CACHE_TTL_MS = 60 * 60 * 1e3;
async function fetchCount(client, categoryId) {
  try {
    const rawPage = await fetchCachedPage(client, `/pages/${categoryId}`);
    return parseCookbookPage(rawPage).length;
  } catch (err) {
    console.error(`[cookbook/counts] Failed to fetch count for "${categoryId}":`, err);
    return 0;
  }
}
async function GET9(request) {
  const token = readAuthToken(request);
  if (!token) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }
  const countryCode = readCountryCode(request);
  const cacheKey2 = `${countryCode}:${crypto.createHash("sha256").update(token).digest("hex").slice(0, 16)}`;
  const cached = cache2.get(cacheKey2);
  if (cached && cached.expiresAt > Date.now()) {
    return NextResponse.json(cached.counts);
  }
  try {
    const client = buildPicnicClient(token, countryCode);
    const categories = getRecipeCategories(countryCode);
    const [featuredCount, savedCount, ...categoryEntries] = await Promise.all([
      fetchCount(client, "meals-page-root"),
      fetchCount(client, "saved-deep-dive-page-content"),
      ...categories.map(async (cat) => [cat.id, await fetchCount(client, cat.id)])
    ]);
    const counts = {
      __featured__: featuredCount,
      __saved__: savedCount,
      ...Object.fromEntries(categoryEntries)
    };
    const total = Object.values(counts).reduce((sum, n) => sum + n, 0);
    if (total > 0) {
      cache2.set(cacheKey2, { counts, expiresAt: Date.now() + CACHE_TTL_MS });
    }
    return NextResponse.json(counts);
  } catch (error2) {
    if (isApiAuthError(error2)) {
      return NextResponse.json({ error: "Your token has expired" }, { status: 401 });
    }
    return NextResponse.json({ error: "Failed to load counts" }, { status: 502 });
  }
}

// vendor/picnic-web/src/app/api/cookbook/search/route.ts
var route_exports18 = {};
__export(route_exports18, {
  GET: () => GET10
});
async function GET10(request) {
  const token = readAuthToken(request);
  if (!token) {
    return NextResponse.json(
      { error: "Authentication required", code: "TOKEN_EXPIRED" },
      { status: 401 }
    );
  }
  const q = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (!q) {
    return NextResponse.json({ categories: [], recipes: [] });
  }
  const countryCode = readCountryCode(request);
  try {
    const client = buildPicnicClient(token, countryCode);
    const path = `/pages/search-page-results?search_term=${encodeURIComponent(q)}&page_context=MEALS&is_recipe=true`;
    const rawPage = await client.sendRequest(
      "GET",
      path,
      null,
      true
    );
    const recipes = parseCookbookPage(rawPage);
    return NextResponse.json({ categories: [], recipes });
  } catch (error2) {
    if (isApiAuthError(error2)) {
      return NextResponse.json(
        { error: "Your token has expired", code: "TOKEN_EXPIRED" },
        { status: 401 }
      );
    }
    const message = error2 instanceof Error ? error2.message : "Unknown error occurred";
    console.error("[/api/cookbook/search] Failed:", message);
    return NextResponse.json(
      { error: "Failed to search recipes. Please try again later." },
      { status: 502 }
    );
  }
}

// vendor/picnic-web/src/app/api/debug-category-page/[categoryId]/route.ts
var route_exports19 = {};
__export(route_exports19, {
  GET: () => GET11
});
var L2_PAGE_PREFIX2 = "L2-category-page-root?category_id=";
async function GET11(request, { params }) {
  const { categoryId } = await params;
  const token = readAuthToken(request);
  if (!token) {
    return NextResponse.json({ error: "No auth token" }, { status: 401 });
  }
  const countryCode = readCountryCode(request);
  const client = buildPicnicClient(token, countryCode);
  const rawPage = await client.app.getPage(`${L2_PAGE_PREFIX2}${categoryId}`);
  return NextResponse.json(rawPage);
}

// vendor/picnic-web/src/app/api/debug-cookbook/route.ts
var route_exports20 = {};
__export(route_exports20, {
  GET: () => GET12
});
async function GET12(request) {
  const token = readAuthToken(request);
  if (!token) return NextResponse.json({ error: "No auth token" }, { status: 401 });
  const countryCode = readCountryCode(request);
  const client = buildPicnicClient(token, countryCode);
  const rawPage = await client.recipe.getRecipesPage();
  return NextResponse.json(rawPage);
}

// vendor/picnic-web/src/app/api/deliveries/route.ts
var route_exports21 = {};
__export(route_exports21, {
  GET: () => GET13
});

// vendor/picnic-web/src/lib/delivery/to-delivery-list-items.ts
function toDeliveryListItems(summaries, countryCode) {
  return summaries.map((summary) => ({
    ...summary,
    deliveryWindowText: formatDeliveryWindowText(
      summary.windowStart,
      summary.windowEnd,
      countryCode
    )
  }));
}

// vendor/picnic-web/src/app/api/deliveries/route.ts
var VALID_STATUSES = /* @__PURE__ */ new Set(["CURRENT", "COMPLETED", "CANCELLED"]);
async function GET13(request) {
  const token = readAuthToken(request);
  if (!token) {
    return NextResponse.json(
      { error: "Your token has expired", code: "TOKEN_EXPIRED" },
      { status: 401 }
    );
  }
  const countryCode = readCountryCode(request);
  const statusParam = request.nextUrl.searchParams.get("status");
  const filter = statusParam && VALID_STATUSES.has(statusParam) ? [statusParam] : [];
  try {
    const client = buildPicnicClient(token, countryCode);
    const summaries = await client.delivery.getDeliverySummaries(filter);
    const deliveries = toDeliveryListItems(summaries, countryCode);
    return NextResponse.json({ deliveries });
  } catch (error2) {
    if (isApiAuthError(error2)) {
      return NextResponse.json(
        { error: "Your token has expired", code: "TOKEN_EXPIRED" },
        { status: 401 }
      );
    }
    const message = error2 instanceof Error ? error2.message : "Unknown error occurred";
    console.error("[/api/deliveries] Failed:", message);
    return NextResponse.json(
      { error: "Failed to load deliveries. Please try again later." },
      { status: 502 }
    );
  }
}

// vendor/picnic-web/src/app/api/deliveries/[deliveryId]/route.ts
var route_exports22 = {};
__export(route_exports22, {
  GET: () => GET14
});

// vendor/picnic-web/src/lib/delivery/parse-delivery-detail.ts
function mapDepositBreakdown2(raw) {
  return asArray(raw).filter(isObject2).map((entry) => {
    const value = asNumber(entry["value"]);
    const count = asNumber(entry["count"]);
    return {
      type: asString(entry["type"]),
      value,
      count,
      total: value * count
    };
  });
}
function mapFees(raw) {
  return asArray(raw).filter(isObject2).map((f) => ({
    type: asString(f["type"]),
    name: asString(f["name"]),
    amount: asNumber(f["amount"])
  })).filter((f) => f.amount !== 0);
}
function mapPayment(raw) {
  if (!isObject2(raw)) return null;
  const paymentType = asString(raw["payment_type"]);
  const redactedIban = asString(raw["redacted_iban"]);
  if (!paymentType && !redactedIban) return null;
  return {
    paymentType,
    redactedIban,
    bankId: asString(raw["bank_id"])
  };
}
function mapOrder(raw) {
  if (!isObject2(raw)) return null;
  const id = asString(raw["id"]);
  if (!id) return null;
  const overridesMap = isObject2(raw["decorator_overrides"]) ? raw["decorator_overrides"] : {};
  const rawItems = applyDecoratorOverrides(asArray(raw["items"]), overridesMap);
  const items = rawItems.map(mapOrderLineToCartItem).filter((item) => item !== null);
  const depositBreakdown = mapDepositBreakdown2(raw["deposit_breakdown"]);
  const depositTotal = depositBreakdown.reduce((sum, entry) => sum + entry.total, 0);
  return {
    id,
    items,
    totalPrice: asNumber(raw["total_price"]),
    checkoutTotalPrice: asNumber(raw["checkout_total_price"]),
    totalSavings: asNumber(raw["total_savings"]),
    totalDeposit: asNumber(raw["total_deposit"]) || depositTotal,
    membershipSavings: asNumber(raw["membership_savings"]),
    cancellable: raw["cancellable"] === true,
    status: asString(raw["status"]),
    creationTime: asString(raw["creation_time"]),
    fees: mapFees(raw["fees"]),
    depositBreakdown,
    payment: mapPayment(raw["transaction_info"])
  };
}
function mapReturnedContainers(raw) {
  return asArray(raw).filter(isObject2).map((entry) => ({
    type: asString(entry["type"]),
    name: asString(entry["localized_name"]) || asString(entry["type"]),
    quantity: asNumber(entry["quantity"]),
    price: asNumber(entry["price"])
  }));
}
function parseDeliveryDetail(rawData, countryCode) {
  if (!isObject2(rawData)) {
    return emptyDeliveryDetail(countryCode);
  }
  const id = asString(rawData["delivery_id"]) || asString(rawData["id"]);
  const slot2 = isObject2(rawData["slot"]) ? rawData["slot"] : null;
  const deliveryTime = isObject2(rawData["delivery_time"]) ? rawData["delivery_time"] : null;
  const windowStart = asString(slot2?.["window_start"]) || asString(deliveryTime?.["start"]) || null;
  const windowEnd = asString(slot2?.["window_end"]) || asString(deliveryTime?.["end"]) || null;
  const orders = asArray(rawData["orders"]).map(mapOrder).filter((order) => order !== null);
  const allItems = orders.flatMap((order) => order.items);
  const totalPrice = orders.reduce((sum, order) => sum + order.checkoutTotalPrice, 0);
  const totalCount = allItems.reduce((sum, item) => sum + item.quantity, 0);
  let totalDiscount = 0;
  for (const item of allItems) {
    if (item.originalPrice !== null && item.originalPrice > item.displayPrice) {
      totalDiscount += (item.originalPrice - item.displayPrice) * item.quantity;
    }
  }
  const depositBreakdown = orders.flatMap((order) => order.depositBreakdown);
  const depositTotal = depositBreakdown.reduce((sum, entry) => sum + entry.total, 0);
  const membershipSavings = orders.reduce((sum, order) => sum + order.membershipSavings, 0);
  const promoSavings = orders.reduce((sum, order) => sum + order.totalSavings, 0);
  const fees = orders.flatMap((order) => order.fees);
  const cancellable = orders.some((order) => order.cancellable);
  return {
    id,
    status: asString(rawData["status"]),
    creationTime: asString(rawData["creation_time"]),
    windowStart,
    windowEnd,
    deliveryWindowText: formatDeliveryWindowText(windowStart, windowEnd, countryCode),
    orders,
    returnedContainers: mapReturnedContainers(rawData["returned_containers"]),
    totalPrice,
    totalCount,
    totalDiscount,
    depositTotal,
    depositBreakdown,
    membershipSavings,
    promoSavings,
    fees,
    cancellable
  };
}
function emptyDeliveryDetail(countryCode) {
  return {
    id: "",
    status: "COMPLETED",
    creationTime: "",
    windowStart: null,
    windowEnd: null,
    deliveryWindowText: formatDeliveryWindowText(null, null, countryCode),
    orders: [],
    returnedContainers: [],
    totalPrice: 0,
    totalCount: 0,
    totalDiscount: 0,
    depositTotal: 0,
    depositBreakdown: [],
    membershipSavings: 0,
    promoSavings: 0,
    fees: [],
    cancellable: false
  };
}

// vendor/picnic-web/src/app/api/deliveries/[deliveryId]/route.ts
async function GET14(request, { params }) {
  const token = readAuthToken(request);
  if (!token) {
    return NextResponse.json(
      { error: "Your token has expired", code: "TOKEN_EXPIRED" },
      { status: 401 }
    );
  }
  const countryCode = readCountryCode(request);
  const { deliveryId } = await params;
  if (!deliveryId) {
    return NextResponse.json({ error: "Delivery not found" }, { status: 404 });
  }
  try {
    const client = buildPicnicClient(token, countryCode);
    const rawDelivery = await client.delivery.getDelivery(deliveryId);
    const delivery = parseDeliveryDetail(rawDelivery, countryCode);
    if (!delivery.id) {
      return NextResponse.json({ error: "Delivery not found" }, { status: 404 });
    }
    return NextResponse.json(delivery);
  } catch (error2) {
    if (isApiAuthError(error2)) {
      return NextResponse.json(
        { error: "Your token has expired", code: "TOKEN_EXPIRED" },
        { status: 401 }
      );
    }
    const message = error2 instanceof Error ? error2.message : "Unknown error occurred";
    console.error(`[/api/deliveries/${deliveryId}] Failed:`, message);
    return NextResponse.json(
      { error: "Failed to load delivery. Please try again later." },
      { status: 502 }
    );
  }
}

// vendor/picnic-web/src/app/api/deliveries/[deliveryId]/cancel/route.ts
var route_exports23 = {};
__export(route_exports23, {
  POST: () => POST11
});
async function POST11(request, { params }) {
  const token = readAuthToken(request);
  if (!token) {
    return NextResponse.json(
      { error: "Your token has expired", code: "TOKEN_EXPIRED" },
      { status: 401 }
    );
  }
  const { deliveryId } = await params;
  if (!deliveryId) {
    return NextResponse.json({ error: "Delivery not found" }, { status: 404 });
  }
  try {
    const client = buildPicnicClient(token, readCountryCode(request));
    await client.delivery.cancelDelivery(deliveryId);
    return NextResponse.json({ success: true });
  } catch (error2) {
    if (isApiAuthError(error2)) {
      return NextResponse.json(
        { error: "Your token has expired", code: "TOKEN_EXPIRED" },
        { status: 401 }
      );
    }
    const message = error2 instanceof Error ? error2.message : "Unknown error occurred";
    console.error(`[/api/deliveries/${deliveryId}/cancel] Failed:`, message);
    return NextResponse.json(
      { error: "Failed to cancel delivery. Please try again later." },
      { status: 502 }
    );
  }
}

// vendor/picnic-web/src/app/api/deliveries/[deliveryId]/invoice/route.ts
var route_exports24 = {};
__export(route_exports24, {
  POST: () => POST12
});
async function POST12(request, { params }) {
  const token = readAuthToken(request);
  if (!token) {
    return NextResponse.json(
      { error: "Your token has expired", code: "TOKEN_EXPIRED" },
      { status: 401 }
    );
  }
  const { deliveryId } = await params;
  if (!deliveryId) {
    return NextResponse.json({ error: "Delivery not found" }, { status: 404 });
  }
  try {
    const client = buildPicnicClient(token, readCountryCode(request));
    await client.delivery.sendDeliveryInvoiceEmail(deliveryId);
    return NextResponse.json({ success: true });
  } catch (error2) {
    if (isApiAuthError(error2)) {
      return NextResponse.json(
        { error: "Your token has expired", code: "TOKEN_EXPIRED" },
        { status: 401 }
      );
    }
    const message = error2 instanceof Error ? error2.message : "Unknown error occurred";
    console.error(`[/api/deliveries/${deliveryId}/invoice] Failed:`, message);
    return NextResponse.json(
      { error: "Failed to send invoice. Please try again later." },
      { status: 502 }
    );
  }
}

// vendor/picnic-web/src/app/api/deliveries/[deliveryId]/position/route.ts
var route_exports25 = {};
__export(route_exports25, {
  GET: () => GET15
});
async function GET15(request, { params }) {
  const token = readAuthToken(request);
  if (!token) {
    return NextResponse.json(
      { error: "Your token has expired", code: "TOKEN_EXPIRED" },
      { status: 401 }
    );
  }
  const { deliveryId } = await params;
  if (!deliveryId) {
    return NextResponse.json({ error: "Delivery not found" }, { status: 404 });
  }
  try {
    const client = buildPicnicClient(token, readCountryCode(request));
    const position = await client.delivery.getDeliveryPosition(deliveryId);
    return NextResponse.json(position);
  } catch (error2) {
    if (isApiAuthError(error2)) {
      return NextResponse.json(
        { error: "Your token has expired", code: "TOKEN_EXPIRED" },
        { status: 401 }
      );
    }
    const message = error2 instanceof Error ? error2.message : "Unknown error occurred";
    console.error(`[/api/deliveries/${deliveryId}/position] Failed:`, message);
    return NextResponse.json(
      { error: "Failed to load delivery position. Please try again later." },
      { status: 502 }
    );
  }
}

// vendor/picnic-web/src/app/api/deliveries/[deliveryId]/rating/route.ts
var route_exports26 = {};
__export(route_exports26, {
  POST: () => POST13
});
async function POST13(request, { params }) {
  const token = readAuthToken(request);
  if (!token) {
    return NextResponse.json(
      { error: "Your token has expired", code: "TOKEN_EXPIRED" },
      { status: 401 }
    );
  }
  const { deliveryId } = await params;
  if (!deliveryId) {
    return NextResponse.json({ error: "Delivery not found" }, { status: 404 });
  }
  let rating;
  try {
    const body = await request.json();
    if (typeof body.rating !== "number" || body.rating < 0 || body.rating > 10) {
      return NextResponse.json({ error: "Rating must be a number between 0 and 10" }, { status: 400 });
    }
    rating = body.rating;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  try {
    const client = buildPicnicClient(token, readCountryCode(request));
    await client.delivery.setDeliveryRating(deliveryId, rating);
    return NextResponse.json({ success: true });
  } catch (error2) {
    if (isApiAuthError(error2)) {
      return NextResponse.json(
        { error: "Your token has expired", code: "TOKEN_EXPIRED" },
        { status: 401 }
      );
    }
    const message = error2 instanceof Error ? error2.message : "Unknown error occurred";
    const alreadyRated = message.includes("400") || message.toLowerCase().includes("already");
    if (alreadyRated) {
      return NextResponse.json({ error: "Delivery already rated" }, { status: 400 });
    }
    console.error(`[/api/deliveries/${deliveryId}/rating] Failed:`, message);
    return NextResponse.json(
      { error: "Failed to submit rating. Please try again later." },
      { status: 502 }
    );
  }
}

// vendor/picnic-web/src/app/api/deliveries/[deliveryId]/scenario/route.ts
var route_exports27 = {};
__export(route_exports27, {
  GET: () => GET16
});
async function GET16(request, { params }) {
  const token = readAuthToken(request);
  if (!token) {
    return NextResponse.json(
      { error: "Your token has expired", code: "TOKEN_EXPIRED" },
      { status: 401 }
    );
  }
  const { deliveryId } = await params;
  if (!deliveryId) {
    return NextResponse.json({ error: "Delivery not found" }, { status: 404 });
  }
  try {
    const client = buildPicnicClient(token, readCountryCode(request));
    const scenario = await client.delivery.getDeliveryScenario(deliveryId);
    return NextResponse.json(scenario);
  } catch (error2) {
    if (isApiAuthError(error2)) {
      return NextResponse.json(
        { error: "Your token has expired", code: "TOKEN_EXPIRED" },
        { status: 401 }
      );
    }
    const message = error2 instanceof Error ? error2.message : "Unknown error occurred";
    console.error(`[/api/deliveries/${deliveryId}/scenario] Failed:`, message);
    return NextResponse.json(
      { error: "Failed to load delivery scenario. Please try again later." },
      { status: 502 }
    );
  }
}

// vendor/picnic-web/src/app/api/meal-plan/search/route.ts
var route_exports28 = {};
__export(route_exports28, {
  POST: () => POST14
});

// vendor/picnic-web/src/lib/meal-plan/package-fraction.ts
var UNIT_FACTORS = {
  g: { base: "g", factor: 1 },
  kg: { base: "g", factor: 1e3 },
  ml: { base: "ml", factor: 1 },
  cl: { base: "ml", factor: 10 },
  l: { base: "ml", factor: 1e3 }
};
var CONTAINER_UNITS = /^(dose|dosen|pck|packung|packungen|glas|gl[äa]ser|flasche|flaschen|becher|beutel|t[üu]te|karton|blik|blikje|pak|pakje|pot|potje|zak|zakje|bak|bakje|fles)\.?$/i;
var PIECE_UNITS = /^(stk|st[üu]ck|stuks|stuk|st)\.?$/i;
var SPOON_ML = { el: 15, tl: 5 };
var SPOON_MAX_G = { el: 25, tl: 8 };
function parseNumber(raw) {
  return parseFloat(raw.replace(",", "."));
}
function normalize2(measure) {
  if (!measure) return null;
  const entry = UNIT_FACTORS[measure.unit.toLowerCase()];
  if (!entry) return null;
  return { base: entry.base, value: measure.value * entry.factor };
}
function parseNeeded(text3) {
  if (!text3) return null;
  const match = /^\(\s*(\d+(?:[.,]\d+)?)\s*([^\s)]+)/.exec(text3.trim());
  return match ? { value: parseNumber(match[1]), unit: match[2] } : null;
}
function looksLikePrice(text3) {
  return /[€$£]|\//.test(text3);
}
function findMeasure(text3) {
  if (!text3 || looksLikePrice(text3)) return null;
  const match = /(\d+(?:[.,]\d+)?)\s*(kg|g|ml|cl|l)\b/i.exec(text3);
  return match ? { value: parseNumber(match[1]), unit: match[2] } : null;
}
function findPieceCount(text3) {
  if (!text3 || looksLikePrice(text3)) return null;
  const match = /(\d+)\s*(stk|st[üu]ck|stuks|stuk|st)\b\.?/i.exec(text3);
  if (!match) return null;
  const count = parseInt(match[1], 10);
  return count > 0 ? count : null;
}
function packageFraction(recipeQuantityText, recipePackageSize, unitQuantity = null) {
  const needed = parseNeeded(recipeQuantityText);
  if (!needed || !(needed.value > 0)) return null;
  if (CONTAINER_UNITS.test(needed.unit)) return needed.value;
  if (PIECE_UNITS.test(needed.unit)) {
    const perPack = findPieceCount(recipePackageSize) ?? findPieceCount(unitQuantity);
    return perPack ? needed.value / perPack : null;
  }
  const spoonKey = needed.unit.toLowerCase().replace(/\.$/, "");
  if (SPOON_ML[spoonKey] !== void 0) {
    const packSize = normalize2(findMeasure(recipePackageSize)) ?? normalize2(findMeasure(unitQuantity));
    if (!packSize || !(packSize.value > 0)) return null;
    return packSize.base === "ml" ? needed.value * SPOON_ML[spoonKey] / packSize.value : needed.value * SPOON_MAX_G[spoonKey] / packSize.value;
  }
  const neededBase = normalize2(needed);
  if (!neededBase) return null;
  const packBase = normalize2(findMeasure(recipePackageSize)) ?? normalize2(findMeasure(unitQuantity));
  if (!packBase || neededBase.base !== packBase.base || !(packBase.value > 0)) return null;
  return neededBase.value / packBase.value;
}

// vendor/picnic-web/src/lib/meal-plan/consolidate-ingredients.ts
function buildIngredientGroups(recipes) {
  const groups = /* @__PURE__ */ new Map();
  for (const recipe of recipes) {
    const seenInRecipe = /* @__PURE__ */ new Set();
    for (const ing of recipe.ingredients) {
      if (ing.isCondiment) continue;
      const key = ing.id;
      if (seenInRecipe.has(key)) continue;
      seenInRecipe.add(key);
      const need = packageFraction(ing.recipeQuantityText, ing.recipePackageSize, ing.unitQuantity) ?? ing.quantity;
      const individual = Math.max(1, Math.ceil(need));
      const existing = groups.get(key);
      if (existing) {
        existing.rawTotal += need;
        existing.individualPackages += individual;
        existing.usedInRecipeIds.push(recipe.id);
        if (need > existing.ownerNeed) {
          existing.ownerRecipeId = recipe.id;
          existing.ownerSellingUnitId = ing.id;
          existing.ownerIngredientId = ing.ingredientId;
          existing.ownerNeed = need;
          existing.ownerUnitPriceCents = ing.displayPrice;
        }
      } else {
        groups.set(key, {
          ownerIngredientId: ing.ingredientId,
          name: ing.name,
          imageId: ing.imageId,
          rawTotal: need,
          individualPackages: individual,
          ownerRecipeId: recipe.id,
          ownerSellingUnitId: ing.id,
          ownerNeed: need,
          ownerUnitPriceCents: ing.displayPrice,
          usedInRecipeIds: [recipe.id]
        });
      }
    }
  }
  return Array.from(groups.values()).map((e) => ({
    // The owner's slot id, which its add-to-cart call needs as the
    // selling_group_component_id; falls back to the product id.
    ingredientId: e.ownerIngredientId ?? e.ownerSellingUnitId,
    ownerSellingUnitId: e.ownerSellingUnitId,
    name: e.name,
    imageId: e.imageId,
    // Epsilon absorbs float drift from summing fractional quantities (e.g. 1/3 + 1/3 + 1/3).
    packagesNeeded: Math.max(1, Math.ceil(e.rawTotal - 1e-9)),
    individualPackages: e.individualPackages,
    unitPriceCents: e.ownerUnitPriceCents,
    ownerRecipeId: e.ownerRecipeId,
    usedInRecipeIds: e.usedInRecipeIds
  }));
}
function computeScore(groups) {
  let packagesSaved = 0;
  let totalPriceCents = 0;
  for (const g of groups) {
    packagesSaved += Math.max(0, g.individualPackages - g.packagesNeeded);
    totalPriceCents += g.packagesNeeded * g.unitPriceCents;
  }
  return { packagesSaved, totalPriceCents };
}
function scoreCombination(recipes) {
  const groups = buildIngredientGroups(recipes);
  return computeScore(groups);
}
function consolidateForDisplay(recipes) {
  const groups = buildIngredientGroups(recipes);
  const items = groups.map((g) => ({
    ingredientId: g.ingredientId,
    ownerSellingUnitId: g.ownerSellingUnitId,
    name: g.name,
    imageId: g.imageId,
    packagesNeeded: g.packagesNeeded,
    unitPriceCents: g.unitPriceCents,
    ownerRecipeId: g.ownerRecipeId,
    usedInRecipeIds: g.usedInRecipeIds
  }));
  const { packagesSaved, totalPriceCents } = computeScore(groups);
  return { items, packagesSaved, totalPriceCents };
}

// vendor/picnic-web/src/lib/meal-plan/find-combinations.ts
var EXHAUSTIVE_LIMIT = 3e4;
function nChooseK(n, k) {
  if (k > n || k < 0) return 0;
  if (k === 0 || k === n) return 1;
  let result = 1;
  for (let i = 0; i < k; i++) result = result * (n - i) / (i + 1);
  return Math.round(result);
}
function refineBySwapping(selected, pool, fixed) {
  let current = selected;
  let currentScore = scoreCombination([...fixed, ...current]).packagesSaved;
  for (; ; ) {
    const selectedIds = new Set(current.map((r) => r.id));
    const outside = pool.filter((r) => !selectedIds.has(r.id));
    let bestScore = currentScore;
    let bestCombo = null;
    for (let i = 0; i < current.length; i++) {
      for (const replacement of outside) {
        const trial = current.map((r, j) => j === i ? replacement : r);
        const { packagesSaved } = scoreCombination([...fixed, ...trial]);
        if (packagesSaved > bestScore) {
          bestScore = packagesSaved;
          bestCombo = trial;
        }
      }
    }
    if (!bestCombo) return current;
    current = bestCombo;
    currentScore = bestScore;
  }
}
function findBestCombinations(candidates, slots2, fixed, topK) {
  if (slots2 <= 0 || candidates.length === 0) return [];
  const fixedIds = new Set(fixed.map((r) => r.id));
  const selectable = candidates.filter((r) => !fixedIds.has(r.id));
  if (selectable.length === 0) return [];
  const seen = /* @__PURE__ */ new Map();
  function addResult(combo) {
    const key = combo.map((r) => r.id).sort().join(",");
    if (seen.has(key)) return;
    const { packagesSaved, totalPriceCents } = scoreCombination([...fixed, ...combo]);
    seen.set(key, { recipeIds: combo.map((r) => r.id), packagesSaved, totalPriceCents });
  }
  const useExhaustive = nChooseK(selectable.length, slots2) <= EXHAUSTIVE_LIMIT;
  const pool = selectable;
  if (useExhaustive) {
    let combine2 = function(start, current) {
      if (current.length === slots2) {
        addResult(current);
        return;
      }
      for (let i = start; i <= pool.length - (slots2 - current.length); i++) {
        combine2(i + 1, [...current, pool[i]]);
      }
    };
    var combine = combine2;
    combine2(0, []);
  } else {
    for (const start of pool) {
      const selected = [start];
      const selectedIds = /* @__PURE__ */ new Set([start.id]);
      while (selected.length < slots2) {
        let bestScore = -1;
        let bestRecipe = null;
        for (const candidate of pool) {
          if (selectedIds.has(candidate.id)) continue;
          const { packagesSaved } = scoreCombination([...fixed, ...selected, candidate]);
          if (packagesSaved > bestScore) {
            bestScore = packagesSaved;
            bestRecipe = candidate;
          }
        }
        if (!bestRecipe) break;
        selected.push(bestRecipe);
        selectedIds.add(bestRecipe.id);
      }
      if (selected.length === slots2) addResult(refineBySwapping(selected, pool, fixed));
    }
  }
  return Array.from(seen.values()).sort((a, b) => b.packagesSaved - a.packagesSaved || a.totalPriceCents - b.totalPriceCents).slice(0, topK);
}

// vendor/picnic-web/src/app/api/meal-plan/search/route.ts
var RECIPE_ID_RE2 = /^[0-9a-f]{24}$/;
var TOP_K = 5;
async function fetchLightweight(client, id, portions) {
  try {
    const rawPage = await fetchRecipePage(client, id, portions);
    return parseRecipeDetail(rawPage, id);
  } catch (error2) {
    if (isApiAuthError(error2) || isUpstreamBlockError(error2)) throw error2;
    return null;
  }
}
async function POST14(request) {
  const token = readAuthToken(request);
  if (!token) {
    return NextResponse.json(
      { error: "Authentication required", code: "TOKEN_EXPIRED" },
      { status: 401 }
    );
  }
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  if (typeof body !== "object" || body === null) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  const typedBody = body;
  const candidateIds = Array.isArray(typedBody.candidateIds) ? typedBody.candidateIds.filter((id) => RECIPE_ID_RE2.test(id)).slice(0, MEAL_PLAN_MAX_CANDIDATES) : [];
  const fixedIds = Array.isArray(typedBody.fixedIds) ? typedBody.fixedIds.filter((id) => RECIPE_ID_RE2.test(id)) : [];
  const slots2 = Number.isInteger(typedBody.slots) ? typedBody.slots : 0;
  const people = Number.isInteger(typedBody.people) ? typedBody.people : 0;
  if (slots2 < 1) {
    return NextResponse.json({ error: "slots must be at least 1" }, { status: 400 });
  }
  if (people < 1 || people > 12) {
    return NextResponse.json({ error: "people must be between 1 and 12" }, { status: 400 });
  }
  try {
    const countryCode = readCountryCode(request);
    const client = buildPicnicClient(token, countryCode);
    const candidateResults = await mapWithConcurrency(
      candidateIds,
      (id) => fetchLightweight(client, id, people),
      RECIPE_PAGE_CONCURRENCY
    );
    const fixedResults = await mapWithConcurrency(
      fixedIds,
      (id) => fetchLightweight(client, id, people),
      RECIPE_PAGE_CONCURRENCY
    );
    const candidates = candidateResults.filter((r) => r !== null);
    const fixed = fixedResults.filter((r) => r !== null);
    const effectiveSlots = Math.min(slots2, candidates.length);
    if (effectiveSlots < 1) {
      return NextResponse.json({ combinations: [] });
    }
    const combinations = findBestCombinations(candidates, effectiveSlots, fixed, TOP_K);
    return NextResponse.json({ combinations });
  } catch (error2) {
    if (isUpstreamBlockError(error2)) {
      return NextResponse.json(
        { error: "Too many requests. Please wait a moment.", code: "RATE_LIMITED" },
        { status: 503 }
      );
    }
    if (isApiAuthError(error2)) {
      return NextResponse.json(
        { error: "Your token has expired", code: "TOKEN_EXPIRED" },
        { status: 401 }
      );
    }
    const message = error2 instanceof Error ? error2.message : "Unknown error occurred";
    console.error("[/api/meal-plan/search] Failed:", message);
    return NextResponse.json({ error: "Failed to generate meal plan" }, { status: 502 });
  }
}

// vendor/picnic-web/src/app/api/meal-plan/shopping-list/route.ts
var route_exports29 = {};
__export(route_exports29, {
  POST: () => POST15
});
var RECIPE_ID_RE3 = /^[0-9a-f]{24}$/;
var MAX_RECIPES = 30;
async function POST15(request) {
  const token = readAuthToken(request);
  if (!token) {
    return NextResponse.json(
      { error: "Authentication required", code: "TOKEN_EXPIRED" },
      { status: 401 }
    );
  }
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  if (typeof body !== "object" || body === null) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  const typedBody = body;
  const recipeIds = Array.isArray(typedBody.recipeIds) ? typedBody.recipeIds.filter((id) => RECIPE_ID_RE3.test(id)).slice(0, MAX_RECIPES) : [];
  const people = Number.isInteger(typedBody.people) ? typedBody.people : 0;
  if (recipeIds.length === 0) {
    return NextResponse.json({ error: "recipeIds must not be empty" }, { status: 400 });
  }
  if (people < 1 || people > 12) {
    return NextResponse.json({ error: "people must be between 1 and 12" }, { status: 400 });
  }
  try {
    const countryCode = readCountryCode(request);
    const client = buildPicnicClient(token, countryCode);
    const results = await mapWithConcurrency(
      recipeIds,
      async (id) => {
        try {
          return { ok: true, recipe: await fetchRecipeDetail(client, id, people) };
        } catch (error2) {
          return { ok: false, error: error2 };
        }
      },
      MEAL_PLAN_RECIPE_CONCURRENCY
    );
    const recipes = [];
    for (const result of results) {
      if (result.ok) recipes.push(result.recipe);
    }
    if (recipes.length === 0) {
      const blocked = results.some((result) => !result.ok && isUpstreamBlockError(result.error));
      if (blocked) {
        return NextResponse.json(
          { error: "Too many requests. Please wait a moment.", code: "RATE_LIMITED" },
          { status: 503 }
        );
      }
      const authFailed = results.some((result) => !result.ok && isApiAuthError(result.error));
      if (authFailed) {
        return NextResponse.json(
          { error: "Your token has expired", code: "TOKEN_EXPIRED" },
          { status: 401 }
        );
      }
      return NextResponse.json({ error: "Failed to load any recipe in the plan" }, { status: 502 });
    }
    const { items, packagesSaved, totalPriceCents } = consolidateForDisplay(recipes);
    return NextResponse.json({
      recipes: recipes.map((r) => ({ id: r.id, name: r.name, imageId: r.imageId })),
      items,
      totalPriceCents,
      packagesSaved
    });
  } catch (error2) {
    if (isApiAuthError(error2)) {
      return NextResponse.json(
        { error: "Your token has expired", code: "TOKEN_EXPIRED" },
        { status: 401 }
      );
    }
    const message = error2 instanceof Error ? error2.message : "Unknown error occurred";
    console.error("[/api/meal-plan/shopping-list] Failed:", message);
    return NextResponse.json({ error: "Failed to build shopping list" }, { status: 502 });
  }
}

// vendor/picnic-web/src/app/api/pages/products/route.ts
var route_exports30 = {};
__export(route_exports30, {
  GET: () => GET17
});

// vendor/picnic-web/src/lib/rsc/parse-rsc-page.ts
var ROOT_ROW_ID = "0";
var REFERENCE_PATTERN = /^\$L?([0-9a-f]+)$/;
var PATH_REFERENCE_PATTERN = /^\$([0-9a-f]+):(.+)$/;
var MODULE_NAME_PATTERN = /([^/]+)\.[jt]sx?$/;
var WRAPPER_COMPONENTS = /* @__PURE__ */ new Set([
  "pages-provider-hydrator",
  "page-hydrator",
  "IconRegistry",
  "icon-registry"
]);
var MAX_REFERENCE_DEPTH = 20;
function parseRscPage(pageId, page) {
  let tokens = {};
  let nextId = 0;
  const resolveModuleName = (type) => {
    const moduleId = REFERENCE_PATTERN.exec(type)?.[1];
    const moduleRef = moduleId ? page.modules[moduleId] : null;
    const path = Array.isArray(moduleRef) ? moduleRef[0] : null;
    return typeof path === "string" ? MODULE_NAME_PATTERN.exec(path)?.[1] ?? null : null;
  };
  const convert = (value, nodes2, depth) => {
    if (typeof value === "string") {
      if (value === "$undefined") return void 0;
      if (depth > MAX_REFERENCE_DEPTH) return void 0;
      const rowId = REFERENCE_PATTERN.exec(value)?.[1];
      if (rowId && rowId in page.rows) return convert(page.rows[rowId], nodes2, depth + 1);
      const pathRef = PATH_REFERENCE_PATTERN.exec(value);
      if (pathRef && pathRef[1] in page.rows) {
        return convert(resolvePath(page.rows, pathRef[1], pathRef[2]), nodes2, depth + 1);
      }
      return value;
    }
    if (typeof value !== "object" || value === null) return value;
    if (Array.isArray(value)) {
      if (value[0] === "$" && typeof value[1] === "string") {
        nodes2.push(...convertElement(value, depth));
        return void 0;
      }
      const items = value.map((item) => convert(item, nodes2, depth)).filter((item) => item !== void 0);
      return items.length === 0 && value.length > 0 ? void 0 : items;
    }
    const record = value;
    if (typeof record.tokenRegistry === "object" && record.tokenRegistry !== null) {
      tokens = {
        ...readStrings(record.tokenRegistry),
        ...readStrings(record.legacyColors ?? {})
      };
    }
    const result = {};
    for (const [key, item] of Object.entries(record)) {
      const converted = convert(item, nodes2, depth);
      if (converted !== void 0) result[key] = converted;
    }
    return result;
  };
  const convertElement = (element, depth) => {
    const component = resolveModuleName(element[1]);
    const children = [];
    const props = convert(element[3] ?? {}, children, depth) ?? {};
    if (!component || WRAPPER_COMPONENTS.has(component)) return children;
    return [{ id: `${component}-${nextId++}`, component, props, children }];
  };
  const nodes = [];
  convert(page.rows[ROOT_ROW_ID], nodes, 0);
  return { pageId, tokens, nodes };
}
function resolvePath(rows, rowId, path) {
  let current = rows[rowId];
  for (const segment of path.split(":")) {
    const rowRef = typeof current === "string" ? REFERENCE_PATTERN.exec(current)?.[1] : null;
    if (rowRef && rowRef in rows) current = rows[rowRef];
    if (Array.isArray(current)) {
      current = current[0] === "$" && segment === "props" ? current[3] : current[Number(segment)];
    } else if (typeof current === "object" && current !== null) {
      current = current[segment];
    } else {
      return void 0;
    }
  }
  return current;
}
function readStrings(record) {
  const result = {};
  for (const [key, value] of Object.entries(record)) {
    if (typeof value === "string") result[key] = value;
  }
  return result;
}

// vendor/picnic-web/src/app/api/pages/products/route.ts
async function GET17(request) {
  const pageId = request.nextUrl.searchParams.get("pageId");
  if (!pageId) {
    return NextResponse.json({ error: "Missing pageId parameter" }, { status: 400 });
  }
  const token = readAuthToken(request);
  if (!token) {
    return NextResponse.json(
      { error: "Authentication required", code: "TOKEN_EXPIRED" },
      { status: 401 }
    );
  }
  const countryCode = readCountryCode(request);
  try {
    const client = buildPicnicClient(token, countryCode);
    let rawPage;
    try {
      rawPage = await client.app.getPage(pageId);
    } catch (error2) {
      if (!isUnexpectedPageFormatError(error2)) throw error2;
      const rscPage = parseRscPage(pageId, await client.app.getRscPage(pageId));
      return NextResponse.json({ title: null, products: [], sections: [], rscPage });
    }
    const title = extractPageTitle(rawPage);
    const { sections, products } = parseCategoryPageSections(rawPage);
    return NextResponse.json({ title, products, sections });
  } catch (error2) {
    if (isApiAuthError(error2)) {
      return NextResponse.json(
        { error: "Your token has expired", code: "TOKEN_EXPIRED" },
        { status: 401 }
      );
    }
    const message = error2 instanceof Error ? error2.message : "Unknown error occurred";
    console.error(`[/api/pages/products] Failed for pageId="${pageId}":`, message);
    return NextResponse.json(
      { error: "Failed to load products. Please try again later." },
      { status: 502 }
    );
  }
}

// vendor/picnic-web/src/app/api/parcels/route.ts
var route_exports31 = {};
__export(route_exports31, {
  GET: () => GET18
});

// vendor/picnic-web/src/lib/delivery/parse-parcels-page.ts
var LIST_HEADER_ID = "parcels-history-header";
var SECTION_HEADER_PATTERN = /^parcel-item-header-\d+$/;
var PARCEL_ROW_PATTERN = /^parcel-item-\d+-\d+$/;
var PARCEL_ID_PATTERN = /[;,]parcel_id=([^,;&]+)/;
var ROW_TITLE_SIZE = 16;
var DETAIL_HEADER_ID = "parcels-tracker-header";
var DETAIL_TRACKER_ID = "parcel-tracker-view";
var DETAIL_FOOTER_ID = "parcels-tracker-footer";
var DETAIL_TITLE_SIZE = 28;
var STEP_TITLE_SIZE = 16;
var STEP_DATE_SIZE = 14;
var DEFAULT_MARKER_SIZE = 20;
function parseParcelsPage(rawPage) {
  const [title = "", subtitle = ""] = collectMarkdowns(findNodeById(rawPage, LIST_HEADER_ID)).map(
    cleanMarkdown
  );
  const sections = [];
  for (const node of collectPmlItems(rawPage)) {
    const id = String(node.id);
    if (SECTION_HEADER_PATTERN.test(id)) {
      sections.push({ title: cleanMarkdown(collectMarkdowns(node)[0] ?? ""), parcels: [] });
    } else if (PARCEL_ROW_PATTERN.test(id)) {
      const row = extractParcelRow(node, id);
      if (!row) continue;
      if (sections.length === 0) sections.push({ title: "", parcels: [] });
      sections[sections.length - 1].parcels.push(row);
    }
  }
  return { title, subtitle, sections };
}
function parseParcelDetailPage(rawPage) {
  const header = findNodeById(rawPage, DETAIL_HEADER_ID);
  const headerTexts = collectRichTexts(header);
  const title = headerTexts.find((t) => t.size === DETAIL_TITLE_SIZE)?.markdown ?? "";
  const copy = findCopyAction(header);
  const shipmentTexts = headerTexts.filter((t) => t.size !== DETAIL_TITLE_SIZE);
  const shipmentLabel = shipmentTexts[0]?.markdown ?? "";
  const shipmentNumber = copy?.text ?? shipmentTexts[1]?.markdown ?? "";
  const tracker = findNodeById(rawPage, DETAIL_TRACKER_ID);
  const steps = findStepStacks(tracker).flatMap((stack) => {
    const step = extractTrackingStep(stack);
    return step ? [step] : [];
  });
  const footerText = collectMarkdowns(findNodeById(rawPage, DETAIL_FOOTER_ID))[0] ?? "";
  return {
    title: cleanMarkdown(title),
    shipmentLabel: cleanMarkdown(shipmentLabel),
    shipmentNumber: cleanMarkdown(shipmentNumber),
    copiedMessage: copy?.message ?? null,
    steps,
    footerText: cleanMarkdown(footerText)
  };
}
function collectPmlItems(node, out = []) {
  if (typeof node !== "object" || node === null) return out;
  if (Array.isArray(node)) {
    for (const item of node) collectPmlItems(item, out);
    return out;
  }
  const record = node;
  if (record.type === "PML" && typeof record.id === "string") {
    out.push(record);
    return out;
  }
  for (const value of Object.values(record)) collectPmlItems(value, out);
  return out;
}
function extractParcelRow(node, id) {
  const texts = collectRichTexts(node);
  const name = texts.find((t) => t.size === ROW_TITLE_SIZE)?.markdown;
  if (!name) return null;
  const statusLine = texts.filter((t) => t.size !== ROW_TITLE_SIZE).map((t) => t.markdown);
  const [status = "", , date = ""] = statusLine;
  const deepLink = findTarget(node);
  return {
    id,
    name: cleanMarkdown(name),
    statusText: cleanMarkdown(status),
    statusColor: extractInnerColor(status),
    dateText: cleanMarkdown(date),
    parcelId: deepLink ? PARCEL_ID_PATTERN.exec(deepLink)?.[1] ?? null : null
  };
}
function findStepStacks(node, out = []) {
  if (typeof node !== "object" || node === null) return out;
  if (Array.isArray(node)) {
    for (const item of node) findStepStacks(item, out);
    return out;
  }
  const record = node;
  const children = Array.isArray(record.children) ? record.children : [];
  if (record.type === "STACK" && record.axis === "HORIZONTAL" && children.length === 2) {
    const texts = collectRichTexts(children[1]);
    if (texts.some((t) => t.size === STEP_TITLE_SIZE)) {
      out.push(record);
      return out;
    }
  }
  for (const value of Object.values(record)) findStepStacks(value, out);
  return out;
}
function extractTrackingStep(stack) {
  const [markerColumn, textColumn] = stack.children;
  const texts = collectRichTexts(textColumn);
  const title = texts.find((t) => t.size === STEP_TITLE_SIZE)?.markdown;
  if (!title) return null;
  const parts = Array.isArray(markerColumn?.children) ? markerColumn.children : [];
  const marker = parts[0];
  const line = parts[1];
  const markerSize = typeof marker?.height === "number" ? marker.height : DEFAULT_MARKER_SIZE;
  return {
    title: cleanMarkdown(title),
    dateText: cleanMarkdown(texts.find((t) => t.size === STEP_DATE_SIZE)?.markdown ?? ""),
    done: marker?.child?.iconKey === "checkmark",
    markerColor: readString(marker?.backgroundColor),
    markerSize,
    lineColor: readString(line?.backgroundColor)
  };
}
function findCopyAction(node) {
  if (typeof node !== "object" || node === null) return null;
  const record = node;
  const onPress = record.onPress;
  if (onPress?.actionType === "COPY" && typeof onPress.text === "string") {
    const next = onPress.onNext?.action;
    return { text: onPress.text, message: readString(next?.message) };
  }
  for (const value of Object.values(record)) {
    const found = findCopyAction(value);
    if (found) return found;
  }
  return null;
}
function collectRichTexts(node, out = []) {
  if (typeof node !== "object" || node === null) return out;
  if (Array.isArray(node)) {
    for (const item of node) collectRichTexts(item, out);
    return out;
  }
  const record = node;
  if (record.type === "RICH_TEXT" && typeof record.markdown === "string") {
    const size = record.textAttributes?.size;
    out.push({ markdown: record.markdown, size: typeof size === "number" ? size : null });
  }
  for (const value of Object.values(record)) collectRichTexts(value, out);
  return out;
}
function findTarget(node) {
  if (typeof node !== "object" || node === null) return null;
  const record = node;
  const onPress = record.onPress;
  if (typeof onPress?.target === "string") return onPress.target;
  for (const value of Object.values(record)) {
    const target = findTarget(value);
    if (target) return target;
  }
  return null;
}
function readString(value) {
  return typeof value === "string" && value !== "" ? value : null;
}

// vendor/picnic-web/src/app/api/parcels/route.ts
var PARCELS_PAGE_ID = "parcels-overview-page-root";
async function GET18(request) {
  const token = readAuthToken(request);
  if (!token) {
    return NextResponse.json(
      { error: "Your token has expired", code: "TOKEN_EXPIRED" },
      { status: 401 }
    );
  }
  try {
    const client = buildPicnicClient(token, readCountryCode(request));
    const rawPage = await client.app.getPage(PARCELS_PAGE_ID);
    return NextResponse.json(parseParcelsPage(rawPage));
  } catch (error2) {
    if (isApiAuthError(error2)) {
      return NextResponse.json(
        { error: "Your token has expired", code: "TOKEN_EXPIRED" },
        { status: 401 }
      );
    }
    const message = error2 instanceof Error ? error2.message : "Unknown error occurred";
    console.error("[/api/parcels] Failed:", message);
    return NextResponse.json(
      { error: "Failed to load parcels. Please try again later." },
      { status: 502 }
    );
  }
}

// vendor/picnic-web/src/app/api/parcels/[parcelId]/route.ts
var route_exports32 = {};
__export(route_exports32, {
  GET: () => GET19
});
var PARCEL_TRACKING_PAGE_ID = "parcel-tracking-page-root";
async function GET19(request, { params }) {
  const token = readAuthToken(request);
  if (!token) {
    return NextResponse.json(
      { error: "Your token has expired", code: "TOKEN_EXPIRED" },
      { status: 401 }
    );
  }
  const { parcelId } = await params;
  try {
    const client = buildPicnicClient(token, readCountryCode(request));
    const rawPage = await client.app.getPage(
      `${PARCEL_TRACKING_PAGE_ID}?parcel_id=${encodeURIComponent(parcelId)}`
    );
    return NextResponse.json(parseParcelDetailPage(rawPage));
  } catch (error2) {
    if (isApiAuthError(error2)) {
      return NextResponse.json(
        { error: "Your token has expired", code: "TOKEN_EXPIRED" },
        { status: 401 }
      );
    }
    const message = error2 instanceof Error ? error2.message : "Unknown error occurred";
    console.error(`[/api/parcels/${parcelId}] Failed:`, message);
    return NextResponse.json(
      { error: "Failed to load the parcel. Please try again later." },
      { status: 502 }
    );
  }
}

// vendor/picnic-web/src/app/api/product/[id]/route.ts
var route_exports33 = {};
__export(route_exports33, {
  GET: () => GET20
});
async function GET20(request, { params }) {
  const token = readAuthToken(request);
  if (!token) {
    return NextResponse.json(
      { error: "Your token has expired", code: "TOKEN_EXPIRED" },
      { status: 401 }
    );
  }
  const countryCode = readCountryCode(request);
  const { id: productId } = await params;
  if (!productId) {
    return NextResponse.json({ error: "Product not found" }, { status: 404 });
  }
  try {
    const client = buildPicnicClient(token, countryCode);
    const rawPage = await client.sendRequest(
      "GET",
      `/pages/product-details-page-root?id=${encodeURIComponent(productId)}`,
      null,
      true
    );
    const productDetail2 = parseProductDetailPage(rawPage, productId);
    if (!productDetail2.name) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }
    return NextResponse.json(productDetail2);
  } catch (error2) {
    if (isApiAuthError(error2)) {
      return NextResponse.json(
        { error: "Your token has expired", code: "TOKEN_EXPIRED" },
        { status: 401 }
      );
    }
    const message = error2 instanceof Error ? error2.message : "Unknown error occurred";
    console.error(`[/api/product/${productId}] Failed to fetch:`, message);
    return NextResponse.json(
      { error: "Failed to fetch product details. Please try again later." },
      { status: 502 }
    );
  }
}

// vendor/picnic-web/src/app/api/recipe/[id]/route.ts
var route_exports34 = {};
__export(route_exports34, {
  GET: () => GET21
});
var RECIPE_ID_RE4 = /^[0-9a-f]{24}$/;
async function GET21(request, { params }) {
  const token = readAuthToken(request);
  if (!token) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }
  const { id } = await params;
  if (!RECIPE_ID_RE4.test(id)) {
    return NextResponse.json({ error: "Invalid recipe ID" }, { status: 400 });
  }
  try {
    const countryCode = readCountryCode(request);
    const client = buildPicnicClient(token, countryCode);
    const portionsParam = request.nextUrl.searchParams.get("portions");
    const portions = portionsParam ? parseInt(portionsParam, 10) : void 0;
    const detail = await fetchRecipeDetail(
      client,
      id,
      portions && portions > 0 ? portions : void 0
    );
    return NextResponse.json(detail);
  } catch (error2) {
    if (isApiAuthError(error2)) {
      return NextResponse.json({ error: "Your token has expired" }, { status: 401 });
    }
    return NextResponse.json({ error: "Failed to load recipe" }, { status: 502 });
  }
}

// vendor/picnic-web/src/app/api/recipe/[id]/add-to-cart/route.ts
var route_exports35 = {};
__export(route_exports35, {
  POST: () => POST16
});
var RECIPE_ID_RE5 = /^[0-9a-f]{24}$/;
async function POST16(request, { params }) {
  const token = readAuthToken(request);
  if (!token) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }
  const { id } = await params;
  if (!RECIPE_ID_RE5.test(id)) {
    return NextResponse.json({ error: "Invalid recipe ID" }, { status: 400 });
  }
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  const portions = typeof body.portions === "number" && body.portions > 0 ? body.portions : 2;
  try {
    const countryCode = readCountryCode(request);
    const client = buildPicnicClient(token, countryCode);
    if (Array.isArray(body.selectedIngredients)) {
      const rawClient = client;
      for (const item of body.selectedIngredients) {
        if (item.count <= 0) continue;
        await rawClient.sendRequest(
          "POST",
          "/cart/add_product",
          {
            product_id: item.id,
            count: item.count,
            selling_unit_contexts: [
              { type: "MEAL_PLAN", day_relative_to_slot: 999, number_of_servings: portions },
              {
                type: "SELLING_GROUP",
                selling_group_id: id,
                selling_group_creator_type: "PIM",
                selling_group_component_id: item.ingredientId ?? null,
                selling_group_component_type: "CORE",
                selling_group_component_swap_type: null
              }
            ]
          },
          true
        );
      }
    } else {
      await client.recipe.assignSellingGroupToBasket(id, 0, portions);
    }
    return NextResponse.json({ success: true });
  } catch (error2) {
    if (isApiAuthError(error2)) {
      return NextResponse.json({ error: "Your token has expired" }, { status: 401 });
    }
    return NextResponse.json({ error: "Failed to add recipe to cart" }, { status: 502 });
  }
}

// vendor/picnic-web/src/app/api/recipe/[id]/ingredient/[ingredientId]/route.ts
var route_exports36 = {};
__export(route_exports36, {
  GET: () => GET22,
  POST: () => POST17
});

// vendor/picnic-web/src/lib/recipe/parse-ingredient-edit.ts
var GROUP_ID_PREFIX = "editable-selling-unit-list-";
var SUBHEADER_ID_PREFIX = "editable-selling-unit-list-subheader-";
var TILE_ID_RE = /^core_selling_unit_(s\d+)_stepper_state$/;
var PRICE_RE = /^\d+[.,]\d{2}$/;
var QUANTITY_RE = /^\d+(?:[.,]\d+)?\s*(?:x\s*\d+(?:[.,]\d+)?\s*)?(?:g|gram|kg|kilo|ml|milliliter|cl|l|liter|litre|st|stk|stuks?|st[üu]ck|pi[eè]ces?|pcs?|pack|pak)\.?$/i;
var BACKGROUND_IMAGE_PREFIX = "picnic-page/";
var HAS_WORD_RE = new RegExp("\\p{L}{2}", "u");
function collectNodes(obj, match) {
  const found = [];
  const walk = (value) => {
    if (Array.isArray(value)) {
      for (const item of value) walk(item);
      return;
    }
    if (typeof value !== "object" || value === null) return;
    const record = value;
    if (match(record)) {
      found.push(record);
      return;
    }
    for (const child of Object.values(record)) walk(child);
  };
  walk(obj);
  return found;
}
function extractProductImageId(node) {
  const images = collectNodes(node, (n) => n.type === "IMAGE");
  for (const image of images) {
    const source = image.source ?? image.fallbackSource;
    const id = source?.id;
    if (typeof id === "string" && !id.startsWith(BACKGROUND_IMAGE_PREFIX)) return id;
  }
  return null;
}
function extractPromotion2(node) {
  const carriers = collectNodes(
    node,
    (n) => typeof n.analytics === "object" && n.analytics !== null
  );
  for (const carrier of carriers) {
    const contexts = carrier.analytics.contexts ?? [];
    for (const context of contexts) {
      if (typeof context !== "object" || context === null) continue;
      const entry = context;
      if (typeof entry.schema === "string" && entry.schema.includes("/promotion/")) {
        return entry.data ?? null;
      }
    }
  }
  return null;
}
function toCents(text3) {
  return Math.round(parseFloat(text3.replace(",", ".")) * 100);
}
function parseTile(node, sellingUnitId) {
  const lines = collectMarkdowns(node).map((md) => cleanMarkdown(md).trim()).filter(Boolean);
  const promotion = extractPromotion2(node);
  const promotionLabel = promotion?.promotion_label ?? null;
  const chevronIndex = lines.indexOf(">");
  const brand = chevronIndex >= 0 ? lines[chevronIndex + 1] ?? null : null;
  const prices = lines.filter((line) => PRICE_RE.test(line));
  const displayPrice = promotion?.price ?? (prices[0] ? toCents(prices[0]) : 0);
  const strikethrough = promotion?.strikethrough_price ?? (prices[1] ? toCents(prices[1]) : null);
  const originalPrice = strikethrough !== null && strikethrough !== void 0 && strikethrough > displayPrice ? strikethrough : null;
  const lastPriceIndex = lines.reduce(
    (last, line, index) => PRICE_RE.test(line) ? index : last,
    -1
  );
  const afterPriceIndex = lastPriceIndex >= 0 ? lastPriceIndex + 1 : -1;
  const matchedIndex = lines.findIndex((line) => QUANTITY_RE.test(line));
  const quantityIndex = matchedIndex >= 0 ? matchedIndex : afterPriceIndex < lines.length ? afterPriceIndex : -1;
  const unitQuantity = quantityIndex >= 0 ? lines[quantityIndex] : "";
  const name = lines.find(
    (line) => line !== ">" && line !== brand && line !== promotionLabel && !PRICE_RE.test(line) && !QUANTITY_RE.test(line) && HAS_WORD_RE.test(line)
  ) ?? "";
  const isUnavailable = prices.length === 0 && promotion?.price === void 0;
  const trailing = quantityIndex >= 0 ? lines.slice(quantityIndex + 1).filter((line) => HAS_WORD_RE.test(line) && line !== name) : [];
  return {
    id: sellingUnitId,
    name,
    brand,
    imageId: extractProductImageId(node),
    displayPrice,
    originalPrice,
    promotionLabel,
    unitQuantity,
    tags: isUnavailable ? [] : trailing,
    isUnavailable,
    unavailableReason: isUnavailable ? trailing[0] ?? null : null
  };
}
function extractSelected(rawPage) {
  const boundaries = collectNodes(rawPage, (n) => n.id === "SellingGroupComponentEditingRootState");
  const state = boundaries[0]?.state;
  return state?.originallySelectedSellingUnits ?? {};
}
function parseIngredientEdit(rawPage, ingredientId) {
  const header = findNodeById(rawPage, "ingredient-editing-header");
  const headerLines = header ? collectMarkdowns(header).map((md) => cleanMarkdown(md).trim()).filter(Boolean) : [];
  const subtitle = headerLines[1] ?? "";
  const groupNodes = collectNodes(
    rawPage,
    (n) => typeof n.id === "string" && n.id.startsWith(GROUP_ID_PREFIX) && !n.id.startsWith(SUBHEADER_ID_PREFIX)
  );
  const groups = [];
  for (const groupNode of groupNodes) {
    const title = groupNode.id.slice(GROUP_ID_PREFIX.length);
    const tiles = collectNodes(groupNode, (n) => typeof n.id === "string" && TILE_ID_RE.test(n.id));
    const alternatives = tiles.map((tile) => {
      const match = TILE_ID_RE.exec(tile.id);
      return parseTile(tile, match ? match[1] : "");
    });
    if (alternatives.length > 0) groups.push({ title, alternatives });
  }
  return { ingredientId, subtitle, groups, selected: extractSelected(rawPage) };
}

// vendor/picnic-web/src/app/api/recipe/[id]/ingredient/[ingredientId]/route.ts
var RECIPE_ID_RE6 = /^[0-9a-f]{24}$/;
var INGREDIENT_ID_RE = /^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/;
function clampPortions(value) {
  return value !== null && Number.isFinite(value) && value > 0 ? Math.floor(value) : 1;
}
async function fetchEditPage(client, recipeId, ingredientId, portions) {
  return client.sendRequest(
    "GET",
    `/pages/selling-group-component-edit-page?ingredient_id=${encodeURIComponent(
      ingredientId
    )}&selling_group_id=${encodeURIComponent(recipeId)}&portions=${portions}`,
    null,
    true
  );
}
function validate(request, id, ingredientId) {
  const token = readAuthToken(request);
  if (!token) {
    return { error: NextResponse.json({ error: "Authentication required" }, { status: 401 }) };
  }
  if (!RECIPE_ID_RE6.test(id) || !INGREDIENT_ID_RE.test(ingredientId)) {
    return {
      error: NextResponse.json({ error: "Invalid recipe or ingredient ID" }, { status: 400 })
    };
  }
  return { token };
}
async function GET22(request, { params }) {
  const { id, ingredientId } = await params;
  const checked = validate(request, id, ingredientId);
  if ("error" in checked) return checked.error;
  try {
    const client = buildPicnicClient(checked.token, readCountryCode(request));
    const portionsParam = request.nextUrl.searchParams.get("portions");
    const portions = clampPortions(portionsParam ? parseInt(portionsParam, 10) : null);
    const rawPage = await fetchEditPage(
      client,
      id,
      ingredientId,
      portions
    );
    return NextResponse.json(parseIngredientEdit(rawPage, ingredientId));
  } catch (error2) {
    if (isApiAuthError(error2)) {
      return NextResponse.json({ error: "Your token has expired" }, { status: 401 });
    }
    return NextResponse.json({ error: "Failed to load ingredient alternatives" }, { status: 502 });
  }
}
function resolveSwapType(parsed, selectedIds) {
  const ownIds = parsed.groups[0]?.alternatives.map((a) => a.id) ?? [];
  const suggestedIds = parsed.groups.slice(1).flatMap((g) => g.alternatives.map((a) => a.id));
  const originalIds = Object.keys(parsed.selected);
  const areSameSellingUnits = selectedIds.every((selectedId) => originalIds.includes(selectedId));
  const isWithinSameComponent = areSameSellingUnits || selectedIds.some((selectedId) => ownIds.includes(selectedId));
  if (isWithinSameComponent) return "WITHIN_SELLING_GROUP_COMPONENT";
  return selectedIds.some((selectedId) => suggestedIds.includes(selectedId)) ? "POPULAR_SELECTION" : "SEARCH_SELECTION";
}
async function POST17(request, { params }) {
  const { id, ingredientId } = await params;
  const checked = validate(request, id, ingredientId);
  if ("error" in checked) return checked.error;
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  if (typeof body.quantities !== "object" || body.quantities === null) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  const portions = clampPortions(body.portions);
  const selected = {};
  for (const [sellingUnitId, count] of Object.entries(body.quantities)) {
    if (typeof count === "number" && count > 0) selected[sellingUnitId] = Math.floor(count);
  }
  const selectedIds = Object.keys(selected);
  try {
    const client = buildPicnicClient(
      checked.token,
      readCountryCode(request)
    );
    if (selectedIds.length === 0) {
      await client.sendRequest(
        "POST",
        "/pages/task/delete-selling-group-component",
        { payload: { selling_group_component_id: ingredientId, selling_group_id: id } },
        true
      );
      return NextResponse.json({ success: true });
    }
    const parsed = parseIngredientEdit(
      await fetchEditPage(client, id, ingredientId, portions),
      ingredientId
    );
    const swapType = resolveSwapType(parsed, selectedIds);
    const originalIds = Object.keys(parsed.selected);
    const quantityById = {};
    if (selectedIds.every((sid) => originalIds.includes(sid)) && originalIds.length > 1) {
      for (const originalId of originalIds) quantityById[originalId] = 0;
    }
    for (const [sellingUnitId, count] of Object.entries(selected)) {
      quantityById[sellingUnitId] = count;
    }
    const saveResult = await client.sendRequest(
      "POST",
      "/pages/task/save-selling-group-edit-task",
      {
        payload: {
          requested_sellable_portions: String(portions),
          selling_group_component_id: ingredientId,
          selling_group_id: id,
          selling_unit_quantity_by_id: quantityById,
          swapType
        }
      },
      true
    );
    if (saveResult?.shouldUpdateCart) {
      await client.sendRequest(
        "POST",
        "/pages/task/assign-sellable-component-to-day",
        {
          payload: {
            component_swap_type: swapType,
            portions: String(portions),
            required_amount_by_selling_unit_id: selected,
            selected_component_id: ingredientId,
            selling_group_id: id
          }
        },
        true
      );
    }
    return NextResponse.json({ success: true });
  } catch (error2) {
    if (isApiAuthError(error2)) {
      return NextResponse.json({ error: "Your token has expired" }, { status: 401 });
    }
    return NextResponse.json({ error: "Failed to save ingredient selection" }, { status: 502 });
  }
}

// vendor/picnic-web/src/app/api/recipe/[id]/save/route.ts
var route_exports37 = {};
__export(route_exports37, {
  POST: () => POST18
});
var RECIPE_ID_RE7 = /^[0-9a-f]{24}$/;
async function POST18(request, { params }) {
  const token = readAuthToken(request);
  if (!token) {
    return NextResponse.json(
      { error: "Authentication required", code: "TOKEN_EXPIRED" },
      { status: 401 }
    );
  }
  const { id } = await params;
  if (!RECIPE_ID_RE7.test(id)) {
    return NextResponse.json({ error: "Invalid recipe ID" }, { status: 400 });
  }
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  if (typeof body.saved !== "boolean") {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  try {
    const client = buildPicnicClient(token, readCountryCode(request));
    if (body.saved) {
      await client.recipe.saveRecipe(id);
    } else {
      await client.recipe.unsaveRecipe(id);
    }
    return NextResponse.json({ saved: body.saved });
  } catch (error2) {
    if (isApiAuthError(error2)) {
      return NextResponse.json(
        { error: "Your token has expired", code: "TOKEN_EXPIRED" },
        { status: 401 }
      );
    }
    const message = error2 instanceof Error ? error2.message : "Unknown error occurred";
    console.error("[/api/recipe/[id]/save] Failed:", message);
    return NextResponse.json({ error: "Failed to update saved recipe" }, { status: 502 });
  }
}

// vendor/picnic-web/src/app/api/recipe/saved/route.ts
var route_exports38 = {};
__export(route_exports38, {
  GET: () => GET23
});
async function GET23(request) {
  const token = readAuthToken(request);
  if (!token) {
    return NextResponse.json(
      { error: "Authentication required", code: "TOKEN_EXPIRED" },
      { status: 401 }
    );
  }
  try {
    const client = buildPicnicClient(token, readCountryCode(request));
    const recipes = await fetchSavedRecipes(client);
    return NextResponse.json({ recipeIds: recipes.map((recipe) => recipe.id) });
  } catch (error2) {
    if (isApiAuthError(error2)) {
      return NextResponse.json(
        { error: "Your token has expired", code: "TOKEN_EXPIRED" },
        { status: 401 }
      );
    }
    const message = error2 instanceof Error ? error2.message : "Unknown error occurred";
    console.error("[/api/recipe/saved] Failed:", message);
    return NextResponse.json({ error: "Failed to load saved recipes." }, { status: 502 });
  }
}

// vendor/picnic-web/src/app/api/rsc-pages/route.ts
var route_exports39 = {};
__export(route_exports39, {
  GET: () => GET24
});
async function GET24(request) {
  const token = readAuthToken(request);
  if (!token) {
    return NextResponse.json(
      { error: "Authentication required", code: "TOKEN_EXPIRED" },
      { status: 401 }
    );
  }
  const pageId = request.nextUrl.searchParams.get("pageId");
  if (!pageId) {
    return NextResponse.json({ error: "Missing pageId" }, { status: 400 });
  }
  const countryCode = readCountryCode(request);
  try {
    const client = buildPicnicClient(token, countryCode);
    const page = await client.app.getRscPage(pageId);
    return NextResponse.json(parseRscPage(pageId, page));
  } catch (error2) {
    if (isApiAuthError(error2)) {
      return NextResponse.json(
        { error: "Your token has expired", code: "TOKEN_EXPIRED" },
        { status: 401 }
      );
    }
    const message = error2 instanceof Error ? error2.message : "Unknown error occurred";
    console.error("[/api/rsc-pages] Failed to fetch page:", message);
    return NextResponse.json(
      { error: "Failed to load the page. Please try again later." },
      { status: 502 }
    );
  }
}

// vendor/picnic-web/src/app/api/search/route.ts
var route_exports40 = {};
__export(route_exports40, {
  GET: () => GET25
});
async function GET25(request) {
  const token = readAuthToken(request);
  if (!token) {
    return NextResponse.json(
      { error: "Authentication required", code: "TOKEN_EXPIRED" },
      { status: 401 }
    );
  }
  const countryCode = readCountryCode(request);
  const query = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (query === "") {
    return NextResponse.json({ products: [], sections: [], query: "" });
  }
  try {
    const client = buildPicnicClient(token, countryCode);
    const rawPage = await client.sendRequest(
      "GET",
      `/pages/search-page-results?search_term=${encodeURIComponent(query)}`,
      null,
      true
    );
    const { products, sections } = parseFusionSearchSections(rawPage);
    return NextResponse.json({ products, sections, query });
  } catch (error2) {
    if (isApiAuthError(error2)) {
      return NextResponse.json(
        { error: "Your token has expired", code: "TOKEN_EXPIRED" },
        { status: 401 }
      );
    }
    const message = error2 instanceof Error ? error2.message : "Unknown error occurred";
    console.error("[/api/search] Failed to search:", message);
    return NextResponse.json(
      { error: "Failed to search for products. Please try again later." },
      { status: 502 }
    );
  }
}

// vendor/picnic-web/src/app/api/suggestions/route.ts
var route_exports41 = {};
__export(route_exports41, {
  GET: () => GET26
});
async function GET26(request) {
  const token = readAuthToken(request);
  if (!token) {
    return NextResponse.json(
      { error: "Authentication required", code: "TOKEN_EXPIRED" },
      { status: 401 }
    );
  }
  const countryCode = readCountryCode(request);
  const query = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (query === "") {
    return NextResponse.json({ suggestions: [], query: "" });
  }
  try {
    const client = buildPicnicClient(token, countryCode);
    const rawSuggestions = await client.catalog.getSuggestions(query);
    const suggestions = rawSuggestions.map((s) => ({
      id: s.id,
      suggestion: s.suggestion
    }));
    return NextResponse.json({ suggestions, query });
  } catch (error2) {
    if (isApiAuthError(error2)) {
      return NextResponse.json(
        { error: "Your token has expired", code: "TOKEN_EXPIRED" },
        { status: 401 }
      );
    }
    const message = error2 instanceof Error ? error2.message : "Unknown error occurred";
    console.error("[/api/suggestions] Failed to fetch suggestions:", message);
    return NextResponse.json(
      { error: "Failed to fetch suggestions. Please try again later." },
      { status: 502 }
    );
  }
}

// vendor/picnic-web/src/app/api/user/profile/route.ts
var route_exports42 = {};
__export(route_exports42, {
  GET: () => GET27
});

// vendor/picnic-web/src/lib/user/parse-profile.ts
var USER_INFO_COMPONENT = "user-info";
var MENU_LIST_COMPONENT = "menu-list";
function parseProfilePage(page) {
  const user = findNode(page.nodes, USER_INFO_COMPONENT)?.props["user"];
  const items = findNode(page.nodes, MENU_LIST_COMPONENT)?.props["items"];
  const userData = isObject2(user) ? user : null;
  const address = userData && isObject2(userData["preferredAddress"]) ? userData["preferredAddress"] : null;
  const street = asString(address?.["street"]);
  const houseNumber = asNumber(address?.["houseNumber"]);
  const houseNumberExt = asString(address?.["houseNumberExtension"]);
  const addressLine = street ? [street, houseNumber > 0 ? `${houseNumber}${houseNumberExt}` : ""].filter(Boolean).join(" ") : "";
  const menu = (Array.isArray(items) ? items : []).flatMap((item) => {
    if (!isObject2(item) || !asString(item["id"])) return [];
    return [{ id: asString(item["id"]), deepLink: asString(item["deeplink"]) || null }];
  });
  return {
    // The app shows first and last name as-is, e.g. "Jan & Anna ."
    name: [asString(userData?.["firstName"]), asString(userData?.["lastName"])].filter(Boolean).join(" ").trim(),
    addressLine,
    avatarUrl: asString(userData?.["avatarUrl"]) || null,
    hasMembership: userData?.["hasMembership"] === true,
    menu
  };
}
function findNode(nodes, component) {
  for (const node of nodes) {
    if (node.component === component) return node;
    const found = findNode(node.children, component);
    if (found) return found;
  }
  return null;
}

// vendor/picnic-web/src/app/api/user/profile/route.ts
var PROFILE_PAGE_ID = "profile-root";
async function GET27(request) {
  const token = readAuthToken(request);
  if (!token) {
    return NextResponse.json(
      { error: "Your token has expired", code: "TOKEN_EXPIRED" },
      { status: 401 }
    );
  }
  try {
    const client = buildPicnicClient(token, readCountryCode(request));
    const page = await client.app.getRscPage(PROFILE_PAGE_ID);
    return NextResponse.json(parseProfilePage(parseRscPage(PROFILE_PAGE_ID, page)));
  } catch (error2) {
    if (isApiAuthError(error2)) {
      return NextResponse.json(
        { error: "Your token has expired", code: "TOKEN_EXPIRED" },
        { status: 401 }
      );
    }
    const message = error2 instanceof Error ? error2.message : "Unknown error occurred";
    console.error("[/api/user/profile] Failed:", message);
    return NextResponse.json(
      { error: "Failed to load profile. Please try again later." },
      { status: 502 }
    );
  }
}

// src/server/routes.generated.ts
var VENDORED_ROUTES = [
  { path: "auth/login", methods: ["POST"], module: route_exports },
  { path: "auth/login-credentials", methods: ["POST"], module: route_exports2 },
  { path: "auth/logout", methods: ["POST"], module: route_exports3 },
  { path: "auth/verify-2fa", methods: ["POST"], module: route_exports4 },
  { path: "cart", methods: ["GET", "DELETE", "POST"], module: route_exports5 },
  { path: "cart/checkout/cancel", methods: ["POST"], module: route_exports6 },
  { path: "cart/checkout/confirm", methods: ["POST"], module: route_exports7 },
  { path: "cart/checkout/initiate", methods: ["POST"], module: route_exports8 },
  { path: "cart/checkout/payment-profile", methods: ["GET"], module: route_exports9 },
  { path: "cart/checkout/start", methods: ["POST"], module: route_exports10 },
  { path: "cart/checkout/status", methods: ["GET"], module: route_exports11 },
  { path: "cart/delivery-slots", methods: ["GET", "POST"], module: route_exports12 },
  { path: "cart/footer", methods: ["GET"], module: route_exports13 },
  { path: "categories/[categoryId]/products", methods: ["GET"], module: route_exports14 },
  { path: "categories/[categoryId]/subcategories", methods: ["GET"], module: route_exports15 },
  { path: "cookbook", methods: ["GET"], module: route_exports16 },
  { path: "cookbook/counts", methods: ["GET"], module: route_exports17 },
  { path: "cookbook/search", methods: ["GET"], module: route_exports18 },
  { path: "debug-category-page/[categoryId]", methods: ["GET"], module: route_exports19 },
  { path: "debug-cookbook", methods: ["GET"], module: route_exports20 },
  { path: "deliveries", methods: ["GET"], module: route_exports21 },
  { path: "deliveries/[deliveryId]", methods: ["GET"], module: route_exports22 },
  { path: "deliveries/[deliveryId]/cancel", methods: ["POST"], module: route_exports23 },
  { path: "deliveries/[deliveryId]/invoice", methods: ["POST"], module: route_exports24 },
  { path: "deliveries/[deliveryId]/position", methods: ["GET"], module: route_exports25 },
  { path: "deliveries/[deliveryId]/rating", methods: ["POST"], module: route_exports26 },
  { path: "deliveries/[deliveryId]/scenario", methods: ["GET"], module: route_exports27 },
  { path: "meal-plan/search", methods: ["POST"], module: route_exports28 },
  { path: "meal-plan/shopping-list", methods: ["POST"], module: route_exports29 },
  { path: "pages/products", methods: ["GET"], module: route_exports30 },
  { path: "parcels", methods: ["GET"], module: route_exports31 },
  { path: "parcels/[parcelId]", methods: ["GET"], module: route_exports32 },
  { path: "product/[id]", methods: ["GET"], module: route_exports33 },
  { path: "recipe/[id]", methods: ["GET"], module: route_exports34 },
  { path: "recipe/[id]/add-to-cart", methods: ["POST"], module: route_exports35 },
  { path: "recipe/[id]/ingredient/[ingredientId]", methods: ["GET", "POST"], module: route_exports36 },
  { path: "recipe/[id]/save", methods: ["POST"], module: route_exports37 },
  { path: "recipe/saved", methods: ["GET"], module: route_exports38 },
  { path: "rsc-pages", methods: ["GET"], module: route_exports39 },
  { path: "search", methods: ["GET"], module: route_exports40 },
  { path: "suggestions", methods: ["GET"], module: route_exports41 },
  { path: "user/profile", methods: ["GET"], module: route_exports42 }
];

// src/server/main.ts
var SHUTDOWN_GRACE_MS = 5e3;
function appOptions(dataDir) {
  try {
    return JSON.parse(readFileSync2(join5(dataDir, "options.json"), "utf8"));
  } catch {
    return {};
  }
}
function startDesk(env = process.env) {
  const here = dirname(fileURLToPath(import.meta.url));
  const dataDir = env.DATA_DIR || "./data";
  const options = appOptions(dataDir);
  const optionCountry = options.country_code;
  const wanted = (env.COUNTRY_CODE || (typeof optionCountry === "string" ? optionCountry : "") || "NL").toUpperCase();
  const country = isCountry(wanted) ? wanted : "NL";
  const demo = env.PICNIC_DEMO === "1";
  const wantedLanguage = String(env.DESK_LANGUAGE || options.language || "en").toLowerCase();
  const language = LANGUAGES.includes(wantedLanguage) ? wantedLanguage : "en";
  const allowedUsers = Array.isArray(options.allowed_users) ? options.allowed_users.filter((name) => typeof name === "string" && name.trim() !== "") : [];
  const wantedCache = Number(env.PICTURE_CACHE_MB || options.picture_cache_mb || DEFAULT_CACHE_MB);
  const pictureCacheMb = Number.isFinite(wantedCache) && wantedCache >= 0 ? wantedCache : DEFAULT_CACHE_MB;
  installOnlyPicnic();
  installFetchTimeout();
  process.on("unhandledRejection", (reason) => {
    console.error("[desk] unhandled:", reason instanceof Error ? reason.stack : reason);
  });
  const desk = new Desk({
    dataDir,
    publicDir: env.PUBLIC_DIR || join5(here, "public"),
    country,
    language,
    pictureCacheMb,
    allowedUsers,
    ingressOnly: env.INGRESS_ONLY === "1",
    version: true ? "1.0.2" : "dev",
    routes: VENDORED_ROUTES,
    demo: demo ? demoShop() : void 0
  });
  const server = createServer(desk.handle);
  server.requestTimeout = 12e4;
  server.headersTimeout = 3e4;
  const port = Number(env.PORT || 8099);
  server.listen(port, () => {
    console.log(
      `Picnic Desk ${desk.options.version} on port ${port} (${country}${demo ? ", demo shop" : ""}${desk.options.ingressOnly ? ", ingress only" : ""})`
    );
  });
  const stop = () => {
    desk.store.flush();
    server.close(() => process.exit(0));
    server.closeIdleConnections();
    setTimeout(() => {
      server.closeAllConnections();
      process.exit(0);
    }, SHUTDOWN_GRACE_MS).unref();
  };
  process.once("SIGTERM", stop);
  process.once("SIGINT", stop);
  return { server, desk };
}
startDesk();
export {
  startDesk
};

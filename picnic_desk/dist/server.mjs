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

// node_modules/picnic-api/lib/errors/api-error.js
var require_api_error = __commonJS({
  "node_modules/picnic-api/lib/errors/api-error.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.PicnicApiError = void 0;
    exports.parseErrorBody = parseErrorBody;
    exports.isPicnicApiError = isPicnicApiError2;
    var PicnicApiError = class extends Error {
      constructor(status, statusText, body) {
        const json2 = parseErrorBody(body);
        const code = json2?.error?.code ?? json2?.code ?? null;
        const message = json2?.error?.message ?? json2?.message;
        const statusLine = `${status} ${statusText}`.trim();
        super(json2 ? message || statusLine : `${statusLine}${body ? ` - ${body}` : ""}`);
        this.name = "PicnicApiError";
        this.status = status;
        this.code = code;
        this.body = body;
      }
    };
    exports.PicnicApiError = PicnicApiError;
    function parseErrorBody(body) {
      try {
        const value = JSON.parse(body);
        return value !== null && typeof value === "object" ? value : null;
      } catch {
        return null;
      }
    }
    function isPicnicApiError2(error2) {
      return error2 instanceof PicnicApiError;
    }
  }
});

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
    var api_error_1 = require_api_error();
    var checkout_error_1 = require_checkout_error();
    var HttpClient = class {
      constructor(options) {
        this.countryCode = options?.countryCode || "NL";
        this.apiVersion = options?.apiVersion || "15";
        this.authKey = options?.authKey || null;
        this.url = options?.url || `https://storefront-prod.${this.countryCode.toLowerCase()}.picnicinternational.com/api/${this.apiVersion}`;
        this.deviceId = options?.deviceId || "3C417201548B2E3B";
        this.agent = options?.agent || "30100;1.251.0-15611;";
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
       * Sends a request to the Picnic API; the domain services use it, and it can be used for
       * requests they don't cover.
       *
       * Objects passed as `data` are sent as JSON. A `Blob`, `ArrayBuffer` or typed array
       * (e.g. `Uint8Array`) is sent as-is, with `Content-Type` set to `options.contentType`.
       * Responses served as a React Server Components payload (`text/x-component`) are returned as
       * the raw text instead of being parsed as JSON. An error status throws a `PicnicApiError` with
       * the status and Picnic's error code, or a `CheckoutIssueError` when the cart can't be checked out.
       * @param {string} method The HTTP method to use: GET, POST, PUT or DELETE.
       * @param {string} path The path, optionally including query params, e.g. `/cart/set_delivery_slot`, or an absolute URL.
       * @param {TRequestData|null} [data=null] The request body, typically for POST or PUT requests.
       * @param {RequestOptions} [options] Picnic headers, extra headers, authentication, the body's content type and the response type.
       */
      async sendRequest(method, path, data = null, options = {}) {
        return (await this.sendRequestWithHeaders(method, path, data, options)).data;
      }
      /**
       * Like {@link sendRequest}, but also returns the response headers. Used for routes where the
       * app reads headers, such as `x-picnic-auth` after a login and `X-Page-Version` for RSC pages.
       * @param {string} method The HTTP method to use: GET, POST, PUT or DELETE.
       * @param {string} path The path, optionally including query params, or an absolute URL.
       * @param {TRequestData|null} [data=null] The request body.
       * @param {RequestOptions} [options] Picnic headers, extra headers, authentication, the body's content type and the response type.
       */
      async sendRequestWithHeaders(method, path, data = null, options = {}) {
        if (typeof options === "boolean") {
          throw new TypeError("The fourth argument of sendRequest is an options object, e.g. { includePicnicHeaders: true }.");
        }
        const response = await this.fetchResponse(method, path, data, options);
        return { data: await this.readResponseBody(response, options.binary ?? false), headers: response.headers };
      }
      /** Sends the request and throws for non-2xx responses; the body is left unread. */
      async fetchResponse(method, path, data, options) {
        const isRawBody = data instanceof Blob || data instanceof ArrayBuffer || ArrayBuffer.isView(data);
        const requestUrl = /^https?:\/\//.test(path) ? path : `${this.url}${path}`;
        const sendAuthKey = options.authenticated ?? new URL(requestUrl).origin === new URL(this.url).origin;
        const { "x-picnic-auth": authKey, ...baseHeaders } = this.baseHeaders;
        const headers = new Headers({
          ...baseHeaders,
          ...sendAuthKey && authKey && { "x-picnic-auth": authKey },
          ...options.includePicnicHeaders && this.picnicHeaders,
          ...isRawBody && { "Content-Type": options.contentType ?? "application/octet-stream" },
          ...options.headers
        });
        const body = data === null ? null : isRawBody ? data : JSON.stringify(data);
        const response = await fetch(requestUrl, {
          method,
          headers,
          body
        });
        if (!response.ok) {
          const responseBody = await response.text();
          const checkoutIssue = (0, checkout_error_1.parseCheckoutIssueError)((0, api_error_1.parseErrorBody)(responseBody));
          if (checkoutIssue)
            throw checkoutIssue;
          throw new api_error_1.PicnicApiError(response.status, response.statusText, responseBody);
        }
        return response;
      }
      /** Reads the body as an ArrayBuffer (image and other binary requests), RSC text or JSON. */
      async readResponseBody(response, binary) {
        if (binary) {
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

// node_modules/picnic-api/lib/domains/app/service.js
var require_service = __commonJS({
  "node_modules/picnic-api/lib/domains/app/service.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.AppService = void 0;
    var AppService = class {
      constructor(http, pages) {
        this.http = http;
        this.pages = pages;
      }
      /**
       * Returns the bootstrap data; tab bar configuration, third-party SDK configs, and feature flags.
       */
      getBootstrapData() {
        return this.http.sendRequest("GET", `/bootstrap`);
      }
      /**
       * Returns a page by its page id, in the format Picnic serves it: a Fusion page, or for pages on
       * Picnic's newer page platform an RSC page parsed into its components (see `RscPageContent`).
       * The format depends on the page and the `x-picnic-agent` version, and Picnic is moving more
       * pages to RSC, so check `format`. One request either way.
       *
       * Pages known to be RSC: `category-tree-root`, `subcategory-page?category_id=<id>`,
       * `category-product-overview?category_id=<id>`, `promotion-category-page?category_id=<id>`,
       * `profile-root`, `promo-group-deep-dive?promo_group_id=<id>`,
       * `search-page-results?search_term=<term>`, `search-page-index`, `meals-category-page`,
       * `meals-category-group-page` and `unavailability-replacements-page-root`.
       *
       * Pages known to be Fusion: `home_page_root`, `purchases-page-root`, `meals-page-root`,
       * `slot-selector-root`, `parcels-overview-page-root`, `promo-page-root`,
       * `product-details-page-root?id=<selling_unit_id>`,
       * `selling-group-details-page?selling_group_id=<id>` and
       * `parcel-tracking-page-root?parcel_id=<id>`.
       * @param {string} pageId The page id, optionally with query params, e.g. `home_page_root`.
       */
      getPage(pageId) {
        return this.pages.getPage(pageId);
      }
      /**
       * Resolves a Picnic deeplink URL to its target resource.
       * The app uses this to handle universal links and custom scheme URIs
       * (e.g. URLs like `https://picnic.app/nl/deeplink/...`).
       * @param {string} url The deeplink URL to resolve.
       */
      resolveDeeplink(url) {
        return this.http.sendRequest("POST", `/deeplink/resolve`, { url }, { includePicnicHeaders: true });
      }
      /**
       * Returns popup messages in the app (e.g. post-delivery satisfaction prompts,
       * message bar notifications, order-confirmation cards).
       * @param {MessageDisplayPosition[]} [displayPositions] Optional filter by display position(s).
       */
      getMessages(displayPositions) {
        const query = displayPositions?.length ? `?${displayPositions.map((p) => `display_position=${encodeURIComponent(p)}`).join("&")}` : "";
        return this.http.sendRequest("GET", `/messages${query}`, null, { includePicnicHeaders: true });
      }
    };
    exports.AppService = AppService;
  }
});

// node_modules/picnic-api/lib/errors/page-format-error.js
var require_page_format_error = __commonJS({
  "node_modules/picnic-api/lib/errors/page-format-error.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.UnexpectedPageFormatError = void 0;
    exports.isUnexpectedPageFormatError = isUnexpectedPageFormatError;
    var UnexpectedPageFormatError = class extends Error {
      constructor(pageId, receivedFormat) {
        super(`Page "${pageId}" was served as ${receivedFormat === "rsc" ? "an RSC payload instead of a Fusion page" : "a Fusion page instead of an RSC payload"}.`);
        this.name = "UnexpectedPageFormatError";
        this.pageId = pageId;
        this.receivedFormat = receivedFormat;
      }
    };
    exports.UnexpectedPageFormatError = UnexpectedPageFormatError;
    function isUnexpectedPageFormatError(error2) {
      return error2 instanceof UnexpectedPageFormatError;
    }
  }
});

// node_modules/picnic-api/lib/domains/catalog/search.js
var require_search = __commonJS({
  "node_modules/picnic-api/lib/domains/catalog/search.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.extractSearchResults = extractSearchResults;
    exports.extractProductTile = extractProductTile;
    exports.readSellableTile = readSellableTile;
    exports.extractFilters = extractFilters;
    var LABEL_POSITIONS = ["topLeft", "topRight", "middleLeft", "bottomLeft"];
    var asRecord2 = (value) => typeof value === "object" && value !== null && !Array.isArray(value) ? value : {};
    var asArray = (value) => Array.isArray(value) ? value : [];
    var asString = (value) => typeof value === "string" && value !== "" ? value : null;
    var asNumber = (value) => typeof value === "number" ? value : null;
    var toCents2 = (value) => typeof value === "number" ? Math.round(value * 100) : null;
    function extractSearchResults(props) {
      const stores = asRecord2(props.storeResults);
      const supermarket = stores.SUPERMARKET ? asRecord2(stores.SUPERMARKET) : null;
      const meals = asRecord2(stores.MEALS);
      return {
        query: asString(props.searchQuery) ?? "",
        correctedQuery: asString(supermarket?.correctedSearchTerm) ?? asString(meals.correctedSearchTerm),
        products: supermarket ? extractProductResults(supermarket) : null,
        recipes: asArray(meals.sections).flatMap((section) => asArray(asRecord2(section).items)).flatMap((item) => {
          const recipe = extractSearchRecipe(asRecord2(item));
          return recipe ? [recipe] : [];
        })
      };
    }
    function extractProductResults(store) {
      const productIdsByFacetId = {};
      for (const [facetId, ids] of Object.entries(asRecord2(store.entityIdsByFacetId))) {
        productIdsByFacetId[facetId] = asArray(ids).filter((id) => typeof id === "string");
      }
      return {
        sections: asArray(store.sections).map((value) => {
          const section = asRecord2(value);
          return {
            id: asString(section.id) ?? "",
            type: asString(section.type) ?? "",
            title: section.shouldShowHeader ? asString(section.headerName) : null,
            products: asArray(section.items).flatMap((item) => {
              const product = extractProductTile(asRecord2(item));
              return product ? [product] : [];
            })
          };
        }),
        visualFilters: extractFilters(store.visualFilters),
        powerFilters: extractFilters(store.powerFilters),
        textualFilters: extractFilters(store.textualFilters),
        productIdsByFacetId,
        sortingOptions: asArray(store.sortingOptions).flatMap((value) => {
          const option = asRecord2(value);
          const name = asString(option.name);
          return name ? [{ name, title: asString(option.localizedTitle) ?? name }] : [];
        }),
        selectedSorting: asString(store.selectedSorting) ?? "RELEVANCE"
      };
    }
    function extractProductTile(tile) {
      return tile.type === "sellable" ? readSellableTile(tile) : null;
    }
    function readSellableTile(tile) {
      const id = asString(tile.id);
      const title = asRecord2(tile.title);
      const name = asString(title.title);
      if (!id || !name)
        return null;
      const images = asRecord2(tile.images);
      const price = asRecord2(tile.price);
      const priceRanges = asArray(price.priceRanges).flatMap((value) => {
        const range = asRecord2(value);
        const rangePrice = asNumber(range.price);
        const fromQuantity = asNumber(range.fromQuantity);
        return rangePrice !== null && fromQuantity !== null ? [{ price: rangePrice, from_quantity: fromQuantity }] : [];
      });
      const labels = asRecord2(tile.labels);
      return {
        id,
        name,
        namePrefix: asString(title.prefix)?.trim() || null,
        brand: asString(asRecord2(tile.subtitle).text),
        qualityCue: asString(asRecord2(tile.qualityCue).text),
        imageId: asString(asRecord2(images.primaryImage).imageId) ?? asString(asRecord2(images.sellingUnitImage).imageId),
        // The tile's own price; the lowest-quantity price tier when it has none.
        displayPrice: toCents2(price.priceValue) ?? [...priceRanges].sort((x, y) => x.from_quantity - y.from_quantity)[0]?.price ?? 0,
        originalPrice: toCents2(price.referencePriceValue),
        unitPrice: asString(price.unitPrice),
        priceRanges: priceRanges.length > 0 ? priceRanges : null,
        unitQuantity: asArray(tile.suffixes).map(asRecord2).filter((suffix) => suffix.type === "TEXT").flatMap((suffix) => asString(suffix.text) ?? []).join(", "),
        labels: LABEL_POSITIONS.flatMap((position) => asArray(labels[position]).map((value) => {
          const label = asRecord2(value);
          return { position, type: asString(label.type), text: asString(label.labelText) };
        })),
        isUnavailable: tile.unavailability !== null && tile.unavailability !== void 0,
        numberOfOrders: asNumber(tile.numberOfOrders)
      };
    }
    function extractSearchRecipe(tile) {
      const id = asString(tile.id);
      const text3 = asRecord2(tile.text);
      const name = asString(asRecord2(text3.title).text);
      if (!id || !name)
        return null;
      return {
        id,
        name,
        subtitle: asString(asRecord2(text3.subtitle).text),
        imageId: asString(asRecord2(tile.image).imageId),
        tags: asArray(text3.tags).flatMap((tag) => asString(asRecord2(tag).text) ?? [])
      };
    }
    function extractFilters(value) {
      return asArray(value).flatMap((item) => {
        const filter = asRecord2(item);
        const facetId = asString(filter.facetId);
        const name = asString(filter.name) ?? asString(filter.header);
        return facetId && name ? [{ facetId, name, imageId: asString(filter.image) }] : [];
      });
    }
  }
});

// node_modules/picnic-api/lib/pages/rsc.js
var require_rsc = __commonJS({
  "node_modules/picnic-api/lib/pages/rsc.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.decodeRscValue = decodeRscValue;
    exports.findRscElementProps = findRscElementProps;
    exports.findRscModuleChunks = findRscModuleChunks;
    exports.parseRscPayload = parseRscPayload;
    exports.parseRscPageContent = parseRscPageContent;
    var search_1 = require_search();
    var ROW_PATTERN = /^([0-9a-f]+):(I?)(.*)$/;
    var ROW_REFERENCE_PATTERN = /^\$L?([0-9a-f]+)$/;
    var PATH_REFERENCE_PATTERN = /^\$([0-9a-f]+):(.+)$/;
    var isElement = (value) => Array.isArray(value) && value[0] === "$" && typeof value[1] === "string";
    function decodeRscValue(page, value) {
      const resolved = /* @__PURE__ */ new Map();
      const resolving = /* @__PURE__ */ new Set();
      const resolveReference = (key, raw) => {
        if (resolved.has(key))
          return resolved.get(key);
        if (resolving.has(key))
          throw new Error(`RSC reference cycle at ${key}`);
        resolving.add(key);
        const decoded = decode(raw());
        resolving.delete(key);
        resolved.set(key, decoded);
        return decoded;
      };
      const decode = (item) => {
        if (typeof item === "string") {
          if (item === "$undefined")
            return void 0;
          if (item.startsWith("$$"))
            return item.slice(1);
          const rowId = ROW_REFERENCE_PATTERN.exec(item)?.[1];
          if (rowId !== void 0 && rowId in page.rows)
            return resolveReference(`$${rowId}`, () => page.rows[rowId]);
          const pathReference = PATH_REFERENCE_PATTERN.exec(item);
          if (pathReference && pathReference[1] in page.rows) {
            return resolveReference(item, () => resolvePath(page, pathReference[1], pathReference[2]));
          }
          return item;
        }
        if (Array.isArray(item)) {
          if (isElement(item))
            return ["$", item[1], item[2], decode(item[3] ?? {})];
          return item.map(decode).filter((entry) => entry !== void 0);
        }
        if (typeof item === "object" && item !== null) {
          const result = {};
          for (const [key, entry] of Object.entries(item)) {
            const decoded = decode(entry);
            if (decoded !== void 0)
              result[key] = decoded;
          }
          return result;
        }
        return item;
      };
      return decode(value);
    }
    function resolvePath(page, rowId, path) {
      let current = page.rows[rowId];
      for (const segment of path.split(":")) {
        const rowReference = typeof current === "string" ? /^\$L?([0-9a-f]+)$/.exec(current)?.[1] : void 0;
        if (rowReference !== void 0 && rowReference in page.rows)
          current = page.rows[rowReference];
        if (isElement(current) && segment === "props")
          current = current[3];
        else if (Array.isArray(current))
          current = current[Number(segment)];
        else if (typeof current === "object" && current !== null)
          current = current[segment];
        else
          return void 0;
      }
      return current;
    }
    function findRscElementProps(page, modulePath) {
      const moduleIds = new Set(Object.entries(page.modules).filter(([, reference]) => Array.isArray(reference) && typeof reference[0] === "string" && reference[0].endsWith(modulePath)).map(([id]) => `$L${id}`));
      const found = [];
      const visit = (value) => {
        if (Array.isArray(value)) {
          if (isElement(value) && moduleIds.has(value[1]))
            found.push(decodeRscValue(page, value[3] ?? {}) ?? {});
          value.forEach(visit);
        } else if (typeof value === "object" && value !== null) {
          Object.values(value).forEach(visit);
        }
      };
      Object.values(page.rows).forEach(visit);
      return found;
    }
    function findRscModuleChunks(page, modulePath) {
      for (const reference of Object.values(page.modules)) {
        if (!Array.isArray(reference) || typeof reference[0] !== "string" || !reference[0].endsWith(modulePath))
          continue;
        const chunks = Array.isArray(reference[1]) ? reference[1].filter((chunk) => typeof chunk === "string") : [];
        return [...new Set(chunks)];
      }
      return [];
    }
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
    var MODULE_REFERENCE_PATTERN = /^\$L?([0-9a-f]+)$/;
    var MODULE_NAME_PATTERN = /([^/]+)\.[jt]sx?$/;
    var WRAPPER_COMPONENTS = /* @__PURE__ */ new Set(["pages-provider-hydrator", "page-hydrator", "IconRegistry", "icon-registry"]);
    function parseRscPageContent(pageId, page) {
      let tokens = {};
      let nextId = 0;
      const modulePathOf = (type) => {
        const moduleId = MODULE_REFERENCE_PATTERN.exec(type)?.[1];
        const reference = moduleId !== void 0 ? page.modules[moduleId] : void 0;
        const path = Array.isArray(reference) ? reference[0] : void 0;
        return typeof path === "string" ? path : null;
      };
      const convert = (value, nodes2) => {
        if (Array.isArray(value)) {
          if (isElement(value)) {
            nodes2.push(...convertElement(value));
            return void 0;
          }
          const items = value.map((item) => convert(item, nodes2)).filter((item) => item !== void 0);
          return items.length === 0 && value.length > 0 ? void 0 : items;
        }
        if (typeof value !== "object" || value === null)
          return value;
        const record = value;
        if (typeof record.tokenRegistry === "object" && record.tokenRegistry !== null) {
          tokens = { ...readStrings(record.tokenRegistry), ...readStrings(record.legacyColors) };
        }
        const result = {};
        for (const [key, item] of Object.entries(record)) {
          const converted = convert(item, nodes2);
          if (converted !== void 0)
            result[key] = converted;
        }
        return result.type === "sellable" ? (0, search_1.extractProductTile)(result) ?? result : result;
      };
      const convertElement = (element) => {
        const modulePath = modulePathOf(element[1]);
        const component = modulePath ? MODULE_NAME_PATTERN.exec(modulePath)?.[1] ?? null : null;
        const children = [];
        const props = convert(element[3] ?? {}, children) ?? {};
        if (!modulePath || !component || WRAPPER_COMPONENTS.has(component))
          return children;
        return [{ id: `${component}-${nextId++}`, component, modulePath, props, children }];
      };
      const nodes = [];
      convert(decodeRscValue(page, page.rows["0"]), nodes);
      return { pageId, tokens, nodes };
    }
    function readStrings(value) {
      if (typeof value !== "object" || value === null)
        return {};
      return Object.fromEntries(Object.entries(value).filter((entry) => typeof entry[1] === "string"));
    }
  }
});

// node_modules/picnic-api/lib/pages/page-client.js
var require_page_client = __commonJS({
  "node_modules/picnic-api/lib/pages/page-client.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.PageClient = void 0;
    var page_format_error_1 = require_page_format_error();
    var rsc_1 = require_rsc();
    var PageClient = class {
      constructor(http) {
        this.http = http;
        this.serverActionIds = /* @__PURE__ */ new Map();
      }
      /**
       * Fetches a page in whichever format Picnic serves it. An RSC page comes with the page's
       * `X-Page-Version` header as `version`.
       * @param {string} pageId The page id, optionally with query params, e.g. `category-tree-root`.
       */
      async load(pageId) {
        const { data, headers } = await this.http.sendRequestWithHeaders("GET", `/pages/${pageId}`, null, { includePicnicHeaders: true });
        if (typeof data !== "string")
          return { format: "fusion", pageId, page: data };
        const version = headers.get("x-page-version");
        return { format: "rsc", pageId, payload: { ...(0, rsc_1.parseRscPayload)(data), ...version && { version } } };
      }
      /** Fetches a page and parses an RSC page into its component tree. */
      async getPage(pageId) {
        const loaded = await this.load(pageId);
        return loaded.format === "fusion" ? { format: "fusion", pageId, page: loaded.page } : { format: "rsc", pageId, content: (0, rsc_1.parseRscPageContent)(pageId, loaded.payload) };
      }
      /**
       * Fetches a page that is expected to be a Fusion page. Most pages come as a {@link FusionPage};
       * a few return the bare layout, so the caller names the type.
       * @throws {UnexpectedPageFormatError} When Picnic serves the page as RSC.
       */
      async getFusionPage(pageId) {
        const loaded = await this.load(pageId);
        if (loaded.format !== "fusion")
          throw new page_format_error_1.UnexpectedPageFormatError(pageId, "rsc");
        return loaded.page;
      }
      /**
       * Fetches a page that is expected to be RSC, split into its rows and module references.
       * @throws {UnexpectedPageFormatError} When Picnic serves the page as a Fusion page.
       */
      async getRscPayload(pageId) {
        const loaded = await this.load(pageId);
        if (loaded.format !== "rsc")
          throw new page_format_error_1.UnexpectedPageFormatError(pageId, "fusion");
        return loaded.payload;
      }
      /**
       * Fetches a page that is expected to be RSC and parses it into its component tree.
       * @throws {UnexpectedPageFormatError} When Picnic serves the page as a Fusion page.
       */
      async getRscContent(pageId) {
        return (0, rsc_1.parseRscPageContent)(pageId, await this.getRscPayload(pageId));
      }
      /**
       * Runs a server action of an RSC page and returns the RSC payload it responds with. Client
       * components call these to load data after the page is shown; product search results, for
       * example, come from the `fetchSearchResults` action of the search page.
       *
       * Find the action id with {@link findServerActionId}; it contains a build hash and changes
       * when Picnic deploys a new version of the page.
       * @param {string} actionId The action id, e.g. `act_fetchSearchResults_169995c7443462f7`.
       * @param {unknown[]} args The arguments the client component passes to the action.
       * @param {string} [pageVersion] The `version` of the page the action belongs to, sent as `X-Page-Version`.
       */
      async runServerAction(actionId, args, pageVersion) {
        const payload = await this.http.sendRequestWithHeaders("POST", `/pages/action/${encodeURIComponent(actionId)}`, { params: JSON.stringify(args) }, { includePicnicHeaders: true, headers: pageVersion ? { "X-Page-Version": pageVersion } : {} });
        return (0, rsc_1.parseRscPayload)(payload.data);
      }
      /**
       * Returns the source of a client component chunk of an RSC page. The app downloads these from
       * the `client_component_cdn_base_url` in the bootstrap data; chunk ids come from the module
       * references of a page (see `findRscModuleChunks`).
       * @param {string} chunkId The chunk id, e.g. `shared-pages_search_search-page-content_results_index_tsx.b717044a`.
       */
      async getClientChunk(chunkId) {
        this.clientChunkBaseUrl ?? (this.clientChunkBaseUrl = this.http.sendRequest("GET", `/bootstrap`).then((bootstrap) => {
          const baseUrl2 = bootstrap.in_app_feature_config?.client_component_cdn_base_url?.trim();
          if (!baseUrl2)
            throw new Error("The bootstrap data has no client_component_cdn_base_url");
          return baseUrl2.replace(/\/+$/, "");
        }));
        let baseUrl;
        try {
          baseUrl = await this.clientChunkBaseUrl;
        } catch (error2) {
          this.clientChunkBaseUrl = void 0;
          throw error2;
        }
        const { data } = await this.http.sendRequestWithHeaders("GET", `${baseUrl}/${chunkId}.script.bundle`, null, {
          authenticated: false,
          binary: true
        });
        return new TextDecoder().decode(data);
      }
      /**
       * Finds the id of a server action, e.g. `fetchSearchResults`, the way the app does: in the
       * client chunks of the component that calls it. The chunks are downloaded in parallel; the first
       * one (in module order) that contains the action wins. Chunks are immutable (their ids contain a
       * hash), so the result per chunk is cached for the lifetime of the client.
       * @param {RscPage} page The page that renders the component.
       * @param {string} modulePath The end of the component's path, e.g. `search-page-content/results/index.tsx`.
       * @param {string} actionName The action's function name, e.g. `fetchSearchResults`.
       * @returns The action id, or `null` when the component's chunks don't contain the action.
       */
      async findServerActionId(page, modulePath, actionName) {
        const pattern = new RegExp(`act_${actionName}_[0-9a-f]+`);
        const chunks = (0, rsc_1.findRscModuleChunks)(page, modulePath).filter((chunk) => !chunk.startsWith("client-components.") && !chunk.startsWith("shared-node_modules_"));
        const actionIds = await Promise.all(chunks.map(async (chunk) => {
          const cacheKey = `${chunk}#${actionName}`;
          if (!this.serverActionIds.has(cacheKey)) {
            this.serverActionIds.set(cacheKey, pattern.exec(await this.getClientChunk(chunk))?.[0] ?? null);
          }
          return this.serverActionIds.get(cacheKey) ?? null;
        }));
        return actionIds.find((actionId) => actionId !== null) ?? null;
      }
    };
    exports.PageClient = PageClient;
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
        const { data, headers } = await this.http.sendRequestWithHeaders("POST", `/user/login`, { key: username, secret, client_id: 30100 }, { authenticated: false });
        const authKey = headers.get("x-picnic-auth");
        if (!authKey) {
          throw new Error("Login failed: No auth key received.");
        }
        this.http.authKey = authKey;
        return {
          authKey,
          userId: data.user_id,
          secondFactorAuthenticationRequired: data.second_factor_authentication_required,
          showSecondFactorAuthenticationIntro: data.show_second_factor_authentication_intro
        };
      }
      /**
       * Generates a 2FA code for the user to verify.
       * @param {string} channel The channel to send the code to. 'SMS' is the only known format at the moment.
       */
      generate2FACode(channel) {
        return this.http.sendRequest("POST", `/user/2fa/generate`, { channel }, { includePicnicHeaders: true });
      }
      /**
       * Verifies the 2FA code and captures the updated auth key from the response.
       * The Picnic API returns a new auth key in the `x-picnic-auth` header after
       * successful 2FA verification (HTTP 204, empty body).
       * @param {string} code The 2FA code to verify.
       */
      async verify2FACode(code) {
        const { headers } = await this.http.sendRequestWithHeaders("POST", `/user/2fa/verify`, { otp: code }, { includePicnicHeaders: true });
        const authKey = headers.get("x-picnic-auth");
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

// node_modules/picnic-api/lib/domains/user/profile.js
var require_profile = __commonJS({
  "node_modules/picnic-api/lib/domains/user/profile.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.extractProfile = extractProfile;
    var asRecord2 = (value) => typeof value === "object" && value !== null && !Array.isArray(value) ? value : null;
    var asString = (value) => typeof value === "string" && value !== "" ? value : null;
    function extractProfile(content) {
      const user = asRecord2(findNode(content.nodes, "user-info")?.props.user) ?? {};
      const items = findNode(content.nodes, "menu-list")?.props.items;
      const address = asRecord2(user.preferredAddress);
      return {
        firstName: asString(user.firstName) ?? "",
        lastName: asString(user.lastName) ?? "",
        avatarUrl: asString(user.avatarUrl),
        hasMembership: user.hasMembership === true,
        address: address ? extractAddress(address) : null,
        menu: (Array.isArray(items) ? items : []).flatMap((item) => {
          const entry = asRecord2(item);
          const id = asString(entry?.id);
          return id ? [{ id, deeplink: asString(entry?.deeplink) }] : [];
        })
      };
    }
    function extractAddress(address) {
      return {
        street: asString(address.street) ?? "",
        houseNumber: typeof address.houseNumber === "number" ? address.houseNumber : null,
        houseNumberExtension: asString(address.houseNumberExtension),
        postcode: asString(address.postcode) ?? "",
        city: asString(address.city) ?? ""
      };
    }
    function findNode(nodes, component) {
      for (const node of nodes) {
        if (node.component === component)
          return node;
        const found = findNode(node.children, component);
        if (found)
          return found;
      }
      return null;
    }
  }
});

// node_modules/picnic-api/lib/domains/user/service.js
var require_service3 = __commonJS({
  "node_modules/picnic-api/lib/domains/user/service.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.UserService = void 0;
    var profile_1 = require_profile();
    var UserService = class {
      constructor(http, pages) {
        this.http = http;
        this.pages = pages;
      }
      /**
       * Gets the details of the current logged in user.
       */
      getUser() {
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
        return this.http.sendRequest("GET", `/profile-menu?fetch_mgm=true`, null, { includePicnicHeaders: true });
      }
      /**
       * Returns the profile tab the way the app shows it: the user, the preferred address and the
       * account menu, from the `profile-root` RSC page.
       */
      async getProfile() {
        return (0, profile_1.extractProfile)(await this.pages.getRscContent("profile-root"));
      }
      /**
       * Sends a product suggestion to Picnic, like the app's "suggest a product" form.
       * @param {string} suggestion The suggestion text.
       */
      submitSuggestion(suggestion) {
        return this.http.sendRequest("POST", `/user/suggestion`, { suggestion });
      }
      /**
       * Registers a device's push notification token (a Firebase Cloud Messaging token), the way the
       * app does after it gets one, so Picnic can send notifications to that device.
       * @param {string} pushToken The Firebase Cloud Messaging token of the device.
       */
      registerPushToken(pushToken) {
        return this.http.sendRequest("POST", `/user/device/register_push`, {
          push_destination: pushToken,
          push_version: 1
        });
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
        return this.http.sendRequest("POST", `/update_check`, body, { includePicnicHeaders: true });
      }
    };
    exports.UserService = UserService;
  }
});

// node_modules/picnic-api/lib/pages/pml.js
var require_pml = __commonJS({
  "node_modules/picnic-api/lib/pages/pml.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.findNodeByIdPrefix = exports.findNodeById = exports.isDefaultTextColor = void 0;
    exports.stripColorTags = stripColorTags2;
    exports.cleanMarkdown = cleanMarkdown2;
    exports.extractHighlightColor = extractHighlightColor;
    exports.walkNodes = walkNodes;
    exports.findNode = findNode;
    exports.ancestorsOf = ancestorsOf;
    exports.collectPropertyValues = collectPropertyValues2;
    exports.collectMarkdowns = collectMarkdowns2;
    exports.childrenOf = childrenOf;
    exports.collectPriceNodes = collectPriceNodes;
    exports.collectBadges = collectBadges;
    exports.collectNutritionRows = collectNutritionRows;
    exports.accordionItems = accordionItems;
    exports.findPmlComponent = findPmlComponent;
    exports.analyticsContexts = analyticsContexts;
    var DEFAULT_TEXT_COLORS = /* @__PURE__ */ new Set(["#333333", "#5b534e", "#787570"]);
    var isNode = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
    function stripColorTags2(markdown) {
      return markdown.replace(/#\([^)]+\)/g, "").trim();
    }
    function cleanMarkdown2(markdown) {
      return stripColorTags2(markdown).replace(/\*\*/g, "").replace(/__/g, "").replace(/ /g, " ").trim();
    }
    function extractHighlightColor(markdown) {
      for (const match of markdown.matchAll(/#\(([^)]+)\)/g)) {
        if (!DEFAULT_TEXT_COLORS.has(match[1].toLowerCase()))
          return match[1];
      }
      return null;
    }
    var isDefaultTextColor = (color) => DEFAULT_TEXT_COLORS.has(color.toLowerCase());
    exports.isDefaultTextColor = isDefaultTextColor;
    function walkNodes(node, visit) {
      if (Array.isArray(node)) {
        node.forEach((child) => walkNodes(child, visit));
      } else if (isNode(node)) {
        visit(node);
        Object.values(node).forEach((child) => walkNodes(child, visit));
      }
    }
    function findNode(node, predicate) {
      if (Array.isArray(node)) {
        for (const child of node) {
          const found = findNode(child, predicate);
          if (found)
            return found;
        }
        return null;
      }
      if (!isNode(node))
        return null;
      if (predicate(node))
        return node;
      for (const child of Object.values(node)) {
        const found = findNode(child, predicate);
        if (found)
          return found;
      }
      return null;
    }
    function ancestorsOf(root, target) {
      const path = [];
      const visit = (node) => {
        if (node === target)
          return true;
        if (Array.isArray(node))
          return node.some(visit);
        if (!isNode(node))
          return false;
        path.push(node);
        if (Object.values(node).some(visit))
          return true;
        path.pop();
        return false;
      };
      return visit(root) ? path.reverse() : [];
    }
    var findNodeById2 = (node, id) => findNode(node, (n) => n.id === id);
    exports.findNodeById = findNodeById2;
    var findNodeByIdPrefix2 = (node, prefix) => findNode(node, (n) => typeof n.id === "string" && n.id.startsWith(prefix));
    exports.findNodeByIdPrefix = findNodeByIdPrefix2;
    function collectPropertyValues2(node, key) {
      const values = [];
      walkNodes(node, (n) => {
        if (key in n)
          values.push(n[key]);
      });
      return values;
    }
    function collectMarkdowns2(node) {
      return collectPropertyValues2(node, "markdown").filter((m) => typeof m === "string");
    }
    function childrenOf(node) {
      const children = node.children ?? node.child;
      if (Array.isArray(children))
        return children.filter(isNode);
      return isNode(children) ? [children] : [];
    }
    function collectPriceNodes(node) {
      const prices = [];
      walkNodes(node, (n) => {
        if (n.type === "PRICE" && typeof n.price === "number") {
          prices.push({ price: n.price, isCrossed: n.isCrossed === true, color: typeof n.color === "string" ? n.color : null });
        }
      });
      return prices;
    }
    function collectBadges(node) {
      const badges = [];
      const visit = (n) => {
        if (Array.isArray(n))
          return n.forEach(visit);
        if (!isNode(n))
          return;
        if (n.type === "CONTAINER" && typeof n.backgroundColor === "string" && typeof n.borderRadius === "number") {
          const markdown = collectMarkdowns2(n)[0];
          if (markdown) {
            const textColor = extractHighlightColor(markdown) ?? collectPropertyValues2(n, "textAttributes").map((attributes) => isNode(attributes) ? attributes.color : void 0).find((color) => typeof color === "string");
            badges.push({ text: cleanMarkdown2(markdown), textColor: textColor ?? "#333333", backgroundColor: n.backgroundColor });
            return;
          }
        }
        Object.values(n).forEach(visit);
      };
      visit(node);
      return badges;
    }
    function collectNutritionRows(node) {
      const rows = [];
      const visit = (n) => {
        if (Array.isArray(n))
          return n.forEach(visit);
        if (!isNode(n))
          return;
        if (n.type === "STACK" && n.axis === "HORIZONTAL" && (n.distribution === "SPACE_BETWEEN" || n.distribution === "END")) {
          const texts = childrenOf(n).filter((c) => c.type === "RICH_TEXT" && typeof c.markdown === "string");
          if (texts.length > 0) {
            rows.push({
              label: stripColorTags2(texts[0].markdown),
              value: texts[1] ? stripColorTags2(texts[1].markdown) : null,
              isCategory: texts[0].textType === "HEADLINE2",
              backgroundColor: typeof n.backgroundColor === "string" ? n.backgroundColor : null
            });
            return;
          }
        }
        Object.values(n).forEach(visit);
      };
      visit(node);
      return rows;
    }
    function accordionItems(accordion) {
      const items = collectPropertyValues2(accordion, "items")[0];
      return Array.isArray(items) ? items.filter(isNode) : [];
    }
    function findPmlComponent(node) {
      const found = findNode(node, (n) => isNode(n.pml) && isNode(n.pml.component));
      return found ? found.pml.component : null;
    }
    function analyticsContexts(node) {
      const analytics = node.analytics;
      const contexts = isNode(analytics) ? analytics.contexts : void 0;
      return Array.isArray(contexts) ? contexts.filter(isNode) : [];
    }
  }
});

// node_modules/picnic-api/lib/domains/catalog/tiles.js
var require_tiles = __commonJS({
  "node_modules/picnic-api/lib/domains/catalog/tiles.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.isFusionProductTile = void 0;
    exports.readFusionProductTile = readFusionProductTile;
    exports.collectFusionProductTiles = collectFusionProductTiles;
    var pml_1 = require_pml();
    var asRecord2 = (value) => typeof value === "object" && value !== null && !Array.isArray(value) ? value : {};
    var asArray = (value) => Array.isArray(value) ? value : [];
    var asString = (value) => typeof value === "string" && value !== "" ? value : null;
    var asNumber = (value) => typeof value === "number" ? value : null;
    var PROMOTION_SCHEMA = "iglu:tech.picnic.snowplow.analytics/promotion/";
    var LABEL_CONTAINER_ID = "selling-unit-label-container";
    var isFusionProductTile = (node) => node.type === "PML" && asRecord2(node.content).type === "SELLING_UNIT_TILE";
    exports.isFusionProductTile = isFusionProductTile;
    function readFusionProductTile(tile) {
      const unit = asRecord2(asRecord2(tile.content).sellingUnit);
      const id = asString(unit.id);
      const catalogName = asString(unit.name);
      if (!id || !catalogName)
        return null;
      const promotion = asRecord2((0, pml_1.analyticsContexts)(tile).find((context) => context.schema?.startsWith(PROMOTION_SCHEMA))?.data);
      const unitQuantity = asString(unit.unit_quantity) ?? "";
      const info = readInfoColumn(tile.pml, unitQuantity);
      const priceRanges = asArray(unit.price_ranges).flatMap((value) => {
        const range = asRecord2(value);
        const price = asNumber(range.price);
        const fromQuantity = asNumber(range.from_quantity);
        return price !== null && fromQuantity !== null ? [{ price, from_quantity: fromQuantity }] : [];
      });
      const promotionLabel = asString(promotion.promotion_label);
      return {
        id,
        name: info.name ?? catalogName,
        namePrefix: info.namePrefix,
        brand: info.brand,
        qualityCue: info.qualityCue,
        imageId: asString(unit.image_id),
        displayPrice: asNumber(unit.display_price) ?? 0,
        originalPrice: promotion.show_strikethrough_price === true ? asNumber(promotion.strikethrough_price) : null,
        unitPrice: null,
        // One tier means the price doesn't depend on the quantity.
        priceRanges: priceRanges.length > 1 ? priceRanges : null,
        unitQuantity,
        labels: promotionLabel ? [{ position: labelPosition(tile.pml, promotionLabel), type: "PROMO", text: promotionLabel }] : [],
        isUnavailable: asArray(unit.decorators).some((decorator) => asRecord2(decorator).type === "UNAVAILABLE"),
        numberOfOrders: null
      };
    }
    function collectFusionProductTiles(node, skip = () => false) {
      const tiles = /* @__PURE__ */ new Map();
      const visit = (value) => {
        if (Array.isArray(value))
          return value.forEach(visit);
        if (typeof value !== "object" || value === null)
          return;
        const candidate = value;
        if (skip(candidate))
          return;
        if ((0, exports.isFusionProductTile)(candidate)) {
          const tile = readFusionProductTile(candidate);
          if (tile && !tiles.has(tile.id))
            tiles.set(tile.id, tile);
          return;
        }
        Object.values(candidate).forEach(visit);
      };
      visit(node);
      return [...tiles.values()];
    }
    function readInfoColumn(pml, unitQuantity) {
      const opensProduct = (0, pml_1.findNode)(pml, (n) => n.type === "TOUCHABLE" && asRecord2(n.onPress).actionType === "OPEN");
      const column = opensProduct ? (0, pml_1.findNode)(opensProduct.child, (n) => n.type === "STACK") : null;
      const rows = column ? (0, pml_1.childrenOf)(column) : [];
      const nameIndex = rows.findIndex((row) => row.type === "RICH_TEXT");
      if (nameIndex < 0)
        return { name: null, namePrefix: null, brand: null, qualityCue: null };
      const shownName = (0, pml_1.stripColorTags)((0, pml_1.collectMarkdowns)(rows[nameIndex])[0] ?? "");
      const prefix = /^\*\*(.+?)\*\*\s*/.exec(shownName);
      const name = (0, pml_1.cleanMarkdown)(prefix ? shownName.slice(prefix[0].length) : shownName) || null;
      const firstText = (row) => row ? (0, pml_1.cleanMarkdown)((0, pml_1.collectMarkdowns)(row)[0] ?? "") || null : null;
      const rowAfterPrices = rows.slice(nameIndex + 1).find((row) => row.type === "STACK");
      const isQuantityRow = rowAfterPrices ? (0, pml_1.collectMarkdowns)(rowAfterPrices).some((text3) => (0, pml_1.cleanMarkdown)(text3) === unitQuantity) : false;
      return {
        name,
        namePrefix: prefix ? (0, pml_1.cleanMarkdown)(prefix[1]) || null : null,
        brand: isQuantityRow ? null : firstText(rowAfterPrices),
        qualityCue: nameIndex > 0 ? firstText(rows[0]) : null
      };
    }
    function labelPosition(pml, label) {
      const placed = (0, pml_1.findNode)((0, pml_1.findNodeById)(pml, LABEL_CONTAINER_ID), (n) => typeof n.absolutePosition === "object" && (0, pml_1.collectMarkdowns)(n).some((text3) => (0, pml_1.cleanMarkdown)(text3) === label));
      if (!placed)
        return "bottomLeft";
      const position = asRecord2(placed.absolutePosition);
      return `${"top" in position ? "top" : "bottom"}${"right" in position && !("left" in position) ? "Right" : "Left"}`;
    }
  }
});

// node_modules/picnic-api/lib/domains/catalog/promotions.js
var require_promotions = __commonJS({
  "node_modules/picnic-api/lib/domains/catalog/promotions.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.extractPromotions = extractPromotions;
    exports.extractPromotionGroup = extractPromotionGroup;
    var pml_1 = require_pml();
    var tiles_1 = require_tiles();
    var LAYOUT_CONTENT_ID_PREFIX = "campaign-page-layout-content";
    var PROMOTION_GROUP_ID = /[;,]promo_group_id=([^,&;]+)/;
    function extractPromotions(page) {
      const layout = (0, pml_1.findNodeByIdPrefix)(page, LAYOUT_CONTENT_ID_PREFIX);
      const sections = (layout ? (0, pml_1.childrenOf)(layout) : []).filter((child) => child.type !== "PML").map(readSection).filter((section) => section.products.length > 0 || section.groups.length > 0);
      return { sections };
    }
    function readSection(section) {
      const header = (0, pml_1.findNode)(section, (n) => n.type === "RICH_TEXT" && typeof n.textType === "string" && n.textType.startsWith("HEADER") && typeof n.markdown === "string");
      return {
        id: typeof section.id === "string" ? section.id : "",
        title: header ? (0, pml_1.cleanMarkdown)(header.markdown) : "",
        products: (0, tiles_1.collectFusionProductTiles)(section),
        groups: collectGroups(section)
      };
    }
    function collectGroups(section) {
      const groups = /* @__PURE__ */ new Map();
      (0, pml_1.walkNodes)(section, (node) => {
        const deeplink = (0, pml_1.analyticsContexts)(node).map((context) => context.data?.deeplink).find((link) => typeof link === "string" && link.includes("id=promo-group-deep-dive"));
        const id = deeplink ? PROMOTION_GROUP_ID.exec(deeplink)?.[1] : void 0;
        if (!id)
          return;
        const isCard = typeof node.id === "string" && node.id.endsWith(id);
        if (groups.get(id)?.isCard || groups.has(id) && !isCard)
          return;
        const label = badgeText(node);
        const [name, example] = (0, pml_1.collectMarkdowns)(node).map(pml_1.cleanMarkdown).filter((text3) => text3 !== "" && text3 !== label);
        if (name)
          groups.set(id, { group: { id, name, example: example ?? null, label }, isCard });
      });
      return [...groups.values()].map(({ group }) => group);
    }
    function badgeText(card) {
      let text3 = null;
      (0, pml_1.walkNodes)(card, (node) => {
        if (node.type !== "CONTAINER" || typeof node.backgroundColor !== "string")
          return;
        const texts = (0, pml_1.collectMarkdowns)(node);
        if (texts.length === 1)
          text3 = (0, pml_1.cleanMarkdown)(texts[0]) || null;
      });
      return text3;
    }
    function extractPromotionGroup(groupId, content) {
      const props = findRscNode(content.nodes, "promo-deep-dive-content")?.props ?? {};
      const tiles = Array.isArray(props.sellableTiles) ? props.sellableTiles : [];
      return {
        id: groupId,
        name: typeof props.name === "string" ? props.name : "",
        products: tiles.filter(isProductTile2)
      };
    }
    var isProductTile2 = (item) => typeof item === "object" && item !== null && typeof item.id === "string" && typeof item.displayPrice === "number";
    function findRscNode(nodes, component) {
      for (const node of nodes) {
        if (node.component === component)
          return node;
        const found = findRscNode(node.children, component);
        if (found)
          return found;
      }
      return null;
    }
  }
});

// node_modules/picnic-api/lib/domains/catalog/favorites.js
var require_favorites = __commonJS({
  "node_modules/picnic-api/lib/domains/catalog/favorites.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.extractFavorites = extractFavorites;
    exports.extractFavoritesInAisle = extractFavoritesInAisle;
    var pml_1 = require_pml();
    var tiles_1 = require_tiles();
    var AISLE_TAB_ID_PREFIX = "aisles-segment-control-";
    var AISLE_ID_PREFIX = "aisle-";
    var MORE_BUTTON_ID_PREFIX = "core-vertical-tiles-more-button-pml";
    function extractFavorites(page) {
      const aisles = [];
      (0, pml_1.walkNodes)(page, (node) => {
        if (typeof node.id !== "string" || !node.id.startsWith(AISLE_TAB_ID_PREFIX))
          return;
        const id = node.id.slice(AISLE_TAB_ID_PREFIX.length);
        if (aisles.some((aisle) => aisle.id === id))
          return;
        const block = (0, pml_1.findNodeById)(page, `${AISLE_ID_PREFIX}${id}`);
        aisles.push({
          id,
          title: (0, pml_1.cleanMarkdown)((0, pml_1.collectMarkdowns)(node)[0] ?? "") || id,
          products: block ? (0, tiles_1.collectFusionProductTiles)(block, (n) => n.type === "SUSPENSE") : [],
          complete: block !== null && (0, pml_1.findNodeByIdPrefix)(block, MORE_BUTTON_ID_PREFIX) === null
        });
      });
      return { aisles };
    }
    function extractFavoritesInAisle(page) {
      return (0, tiles_1.collectFusionProductTiles)(page);
    }
  }
});

// node_modules/picnic-api/lib/errors/product-not-found-error.js
var require_product_not_found_error = __commonJS({
  "node_modules/picnic-api/lib/errors/product-not-found-error.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.ProductNotFoundError = void 0;
    exports.isProductNotFoundError = isProductNotFoundError2;
    var ProductNotFoundError = class extends Error {
      constructor(productId) {
        super(`Product "${productId}" was not found or is not available at this location.`);
        this.name = "ProductNotFoundError";
        this.productId = productId;
      }
    };
    exports.ProductNotFoundError = ProductNotFoundError;
    function isProductNotFoundError2(error2) {
      return error2 instanceof ProductNotFoundError;
    }
  }
});

// node_modules/picnic-api/lib/domains/catalog/product.js
var require_product = __commonJS({
  "node_modules/picnic-api/lib/domains/catalog/product.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.extractProductDetails = extractProductDetails;
    exports.productDetailsPageId = productDetailsPageId;
    var product_not_found_error_1 = require_product_not_found_error();
    var pml_1 = require_pml();
    var MAIN_CONTAINER_ID = "product-details-page-root-main-container";
    var GALLERY_ID = "product-page-image-gallery-main-image-container";
    var LABELS_PREFIX = "product-page-labels-";
    var DESCRIPTION_ID = "description";
    var HIGHLIGHTS_ID = "product-page-highlights";
    var ALLERGIES_ID = "product-page-allergies";
    var ACCORDION_ID = "accordion-list";
    var ALTERNATIVES_ID = "alternatives-container";
    var CONTAINS_HEADING = /^(bevat|enthält|contient)$/i;
    var MAY_CONTAIN_HEADING = /^(bevat\s+mogelijk|kann\s+enthalten|peut\s+contenir)$/i;
    var NUTRITION_TITLE = /voedingswaarde|nährwert|valeurs nutritionnelles/i;
    function extractProductDetails(productId, page) {
      const mainContainer = (0, pml_1.findNodeById)(page, MAIN_CONTAINER_ID);
      if (!mainContainer)
        throw new product_not_found_error_1.ProductNotFoundError(productId);
      const header = extractHeader(mainContainer);
      const mainUnit = findMainSellingUnit(page, productId);
      const prices = extractPrices(mainContainer, mainUnit);
      const labels = (0, pml_1.collectBadges)((0, pml_1.findNodeByIdPrefix)(page, LABELS_PREFIX));
      const highlightItems = collectHighlights((0, pml_1.findNodeById)(page, HIGHLIGHTS_ID));
      const allergenGroups = extractAllergens(page);
      return {
        id: productId,
        ...header,
        ...prices,
        maxCount: typeof mainUnit?.max_count === "number" ? mainUnit.max_count : 99,
        imageIds: extractImageIds(page, mainUnit),
        labels,
        description: extractDescription(page),
        highlightItems,
        allergenGroups,
        infoSections: extractInfoSections(page),
        nutritionRows: extractNutritionRows(page),
        promotion: extractPromotion2(labels, page),
        similarProducts: extractSimilarProducts(page)
      };
    }
    function findMainSellingUnit(page, productId) {
      const units = (0, pml_1.collectPropertyValues)(page, "sellingUnit").filter((u) => typeof u === "object" && u !== null);
      return units.find((u) => u.id === productId && u.max_count !== void 0) ?? units.find((u) => u.id === productId) ?? null;
    }
    function extractHeader(mainContainer) {
      const nameNode = (0, pml_1.findNode)(mainContainer, (n) => n.type === "RICH_TEXT" && n.textType === "HEADER1");
      const stack = (0, pml_1.findPmlComponent)(mainContainer);
      const parts = stack ? (0, pml_1.childrenOf)(stack) : [];
      const brandNode = parts.find((n) => n.type === "RICH_TEXT" && typeof n.markdown === "string");
      const row = parts.find((n) => n.type === "STACK" && (0, pml_1.childrenOf)(n).some((c) => c.type === "RICH_TEXT"));
      const rowItems = row ? (0, pml_1.childrenOf)(row) : [];
      const quantityBadges = (0, pml_1.collectBadges)(rowItems.filter((n) => n.type === "CONTAINER"));
      const texts = rowItems.filter((n) => n.type === "RICH_TEXT");
      const markdownOf = (n) => typeof n?.markdown === "string" ? n.markdown : null;
      const tags = texts.slice(2).flatMap((n) => {
        const markdown = markdownOf(n);
        const text3 = markdown ? (0, pml_1.cleanMarkdown)(markdown) : "";
        return text3 ? [{ text: text3, color: (0, pml_1.extractHighlightColor)(markdown) ?? innerColor(markdown) }] : [];
      });
      const unitPrice = markdownOf(texts[1]) ?? computeUnitPrice(texts[1]?.markdown);
      return {
        name: nameNode && typeof nameNode.markdown === "string" ? (0, pml_1.cleanMarkdown)(nameNode.markdown) : "",
        brand: brandNode ? (0, pml_1.cleanMarkdown)(brandNode.markdown) || null : null,
        unitQuantity: (0, pml_1.cleanMarkdown)(markdownOf(texts[0]) ?? ""),
        unitPrice: unitPrice ? (0, pml_1.cleanMarkdown)(unitPrice) || null : null,
        quantityBadges,
        tags
      };
    }
    function computeUnitPrice(expression) {
      const props = typeof expression === "object" && expression !== null ? expression.props : void 0;
      const tiers = findPriceTiers(props);
      if (!props || !tiers || typeof props.v1 !== "number" || typeof props.v2 !== "string" || typeof props.v3 !== "string")
        return null;
      const firstTier = [...tiers].sort((a, b) => a.from_quantity - b.from_quantity)[0];
      return props.v2 + (props.v1 * firstTier.price / 100).toFixed(2) + props.v3;
    }
    function innerColor(markdown) {
      const colors = [...markdown.matchAll(/#\(([^)]+)\)/g)].map((m) => m[1]);
      return colors.length > 0 ? colors[Math.floor((colors.length - 1) / 2)] : null;
    }
    function extractPrices(mainContainer, mainUnit) {
      const priceNodes = (0, pml_1.collectPriceNodes)(mainContainer);
      const active = priceNodes.find((p) => !p.isCrossed);
      const crossed = priceNodes.find((p) => p.isCrossed);
      const priceRanges = findPriceTiers(mainContainer) ?? collectTierTiles(mainContainer) ?? (Array.isArray(mainUnit?.price_ranges) && mainUnit.price_ranges.length > 0 ? mainUnit.price_ranges : null);
      const lowestTier = priceRanges ? [...priceRanges].sort((a, b) => a.from_quantity - b.from_quantity)[0] : void 0;
      const unitPrice = typeof mainUnit?.display_price === "number" ? mainUnit.display_price : void 0;
      return {
        displayPrice: active?.price ?? lowestTier?.price ?? unitPrice ?? 0,
        originalPrice: crossed?.price ?? null,
        displayPriceColor: active?.color && !(0, pml_1.isDefaultTextColor)(active.color) ? active.color : null,
        priceRanges
      };
    }
    function findPriceTiers(node) {
      let tiers = null;
      (0, pml_1.walkNodes)(node, (n) => {
        if (tiers)
          return;
        for (const value of Object.values(n)) {
          if (Array.isArray(value) && value.length > 0 && value.every((tier) => typeof tier?.price === "number" && typeof tier?.from_quantity === "number")) {
            tiers = value.map((tier) => ({ price: tier.price, from_quantity: tier.from_quantity }));
            return;
          }
        }
      });
      return tiers;
    }
    function collectTierTiles(node) {
      const byQuantity = /* @__PURE__ */ new Map();
      (0, pml_1.walkNodes)(node, (n) => {
        if (typeof n.price === "number" && typeof n.from_quantity === "number" && !byQuantity.has(n.from_quantity)) {
          byQuantity.set(n.from_quantity, { price: n.price, from_quantity: n.from_quantity });
        }
      });
      return byQuantity.size > 0 ? [...byQuantity.values()].sort((a, b) => a.from_quantity - b.from_quantity) : null;
    }
    function extractImageIds(page, mainUnit) {
      const ids = (0, pml_1.collectPropertyValues)((0, pml_1.findNodeById)(page, GALLERY_ID), "source").map((source) => typeof source === "object" && source !== null ? source.id : void 0).filter((id) => typeof id === "string");
      if (ids.length > 0)
        return [...new Set(ids)];
      return typeof mainUnit?.image_id === "string" && mainUnit.image_id ? [mainUnit.image_id] : [];
    }
    function extractDescription(page) {
      const markdowns = (0, pml_1.collectMarkdowns)((0, pml_1.findNodeById)(page, DESCRIPTION_ID));
      return markdowns.length > 0 ? markdowns.join("\n") : null;
    }
    function collectHighlights(node, linkTarget = null) {
      if (Array.isArray(node))
        return node.flatMap((child) => collectHighlights(child, linkTarget));
      if (typeof node !== "object" || node === null)
        return [];
      const record = node;
      if (record.type === "STACK" && record.axis === "HORIZONTAL") {
        const children = (0, pml_1.childrenOf)(record);
        const text3 = children.find((c) => c.type === "RICH_TEXT" && typeof c.markdown === "string");
        if (text3) {
          const icon = children.find((c) => c.type === "ICON");
          return [{ text: text3.markdown, iconKey: typeof icon?.iconKey === "string" ? icon.iconKey : null, linkTarget }];
        }
      }
      if (record.type === "TOUCHABLE") {
        const onPress = record.onPress;
        const target = onPress?.actionType === "OPEN" && typeof onPress.target === "string" ? onPress.target : null;
        return collectHighlights(record.child, target);
      }
      const pml = record.pml;
      return [...(0, pml_1.childrenOf)(record).flatMap((child) => collectHighlights(child, linkTarget)), ...pml?.component ? collectHighlights(pml.component, linkTarget) : []];
    }
    function extractAllergens(page) {
      const allergens = { contains: [], mayContain: [] };
      const component = (0, pml_1.findPmlComponent)((0, pml_1.findNodeById)(page, ALLERGIES_ID));
      let group = allergens.contains;
      for (const child of component ? (0, pml_1.childrenOf)(component) : []) {
        if (child.type === "RICH_TEXT" && typeof child.markdown === "string") {
          const heading = (0, pml_1.stripColorTags)(child.markdown);
          if (MAY_CONTAIN_HEADING.test(heading))
            group = allergens.mayContain;
          else if (CONTAINS_HEADING.test(heading))
            group = allergens.contains;
        } else if (child.type === "STACK" && child.axis === "HORIZONTAL") {
          group.push(...(0, pml_1.collectBadges)(child));
        }
      }
      return allergens;
    }
    function extractInfoSections(page) {
      return (0, pml_1.accordionItems)((0, pml_1.findNodeById)(page, ACCORDION_ID)).flatMap((item) => {
        const title = (0, pml_1.collectMarkdowns)(item.header).map(pml_1.cleanMarkdown)[0] ?? "";
        const content = (0, pml_1.collectMarkdowns)(item.body).map(pml_1.stripColorTags).join("\n");
        return title ? [{ title, content }] : [];
      });
    }
    function extractNutritionRows(page) {
      const item = (0, pml_1.accordionItems)((0, pml_1.findNodeById)(page, ACCORDION_ID)).find((i) => NUTRITION_TITLE.test((0, pml_1.collectMarkdowns)(i.header).map(pml_1.cleanMarkdown)[0] ?? ""));
      return item ? (0, pml_1.collectNutritionRows)(item.body) : [];
    }
    function extractPromotion2(labels, page) {
      const labelTexts = new Set(labels.map((label) => label.text));
      const tile = (0, pml_1.findNode)(page, (n) => typeof n.promotion_id === "string" && typeof n.promotion_label === "string" && labelTexts.has(n.promotion_label));
      return tile ? { id: tile.promotion_id, label: tile.promotion_label } : null;
    }
    function extractSimilarProducts(page) {
      return (0, pml_1.collectPropertyValues)((0, pml_1.findNodeById)(page, ALTERNATIVES_ID), "sellingUnit").filter((u) => typeof u === "object" && u !== null).filter((u) => u.display_price !== void 0).map((u) => ({
        id: String(u.id ?? ""),
        name: String(u.name ?? ""),
        imageId: String(u.image_id ?? ""),
        displayPrice: Number(u.display_price ?? 0),
        unitQuantity: String(u.unit_quantity ?? ""),
        maxCount: Number(u.max_count ?? 0),
        ...u.deposit !== void 0 ? { deposit: Number(u.deposit) } : {},
        ...Array.isArray(u.price_ranges) ? { priceRanges: u.price_ranges } : {}
      }));
    }
    function productDetailsPageId(productId) {
      return `product-details-page-root?id=${encodeURIComponent(productId)}&show_category_action=true&show_remove_from_purchases_page_action=true`;
    }
  }
});

// node_modules/picnic-api/lib/domains/catalog/categories.js
var require_categories = __commonJS({
  "node_modules/picnic-api/lib/domains/catalog/categories.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.extractCategoryTree = extractCategoryTree;
    exports.extractSubcategories = extractSubcategories;
    exports.extractCategoryProducts = extractCategoryProducts;
    var search_1 = require_search();
    var asRecord2 = (value) => typeof value === "object" && value !== null && !Array.isArray(value) ? value : null;
    var asArray = (value) => Array.isArray(value) ? value : [];
    var asString = (value) => typeof value === "string" && value !== "" ? value : null;
    var TARGET_TYPES = {
      "subcategory-page": "subcategories",
      "category-product-overview": "products",
      "promotion-category-page": "promotions"
    };
    function findNode(nodes, component) {
      for (const node of nodes) {
        if (node.component === component)
          return node;
        const found = findNode(node.children, component);
        if (found)
          return found;
      }
      return null;
    }
    function readTarget(deeplink) {
      const [pageId, ...params] = (deeplink.split(";id=")[1] ?? "").split(",");
      const type = TARGET_TYPES[pageId];
      const categoryId = params.find((param) => param.startsWith("category_id="))?.slice("category_id=".length);
      return type && categoryId ? { type, categoryId: decodeURIComponent(categoryId) } : { type: "page" };
    }
    function readLink(item) {
      const entry = asRecord2(item);
      const name = asString(entry?.title);
      const deeplink = asString(entry?.deeplink);
      if (!entry || !name || !deeplink)
        return null;
      return {
        name,
        imageId: asString(entry.image),
        label: asString(asRecord2(entry.label)?.title),
        deeplink,
        target: readTarget(deeplink)
      };
    }
    function extractCategoryTree(content) {
      const sections = [{ title: null, links: [] }];
      for (const item of asArray(findNode(content.nodes, "vertical-list")?.props.items)) {
        const entry = asRecord2(item);
        if (entry?.type === "section-title") {
          sections.push({ title: asString(entry.title), links: [] });
          continue;
        }
        const link = readLink(item);
        if (link)
          sections[sections.length - 1].links.push(link);
      }
      return sections.filter((section) => section.links.length > 0);
    }
    function extractSubcategories(categoryId, content) {
      const list = findNode(content.nodes, "category-list");
      return {
        categoryId,
        title: asString(list?.props.title) ?? "",
        links: asArray(list?.props.items).flatMap((item) => readLink(item) ?? [])
      };
    }
    var isProductTile2 = (item) => typeof asRecord2(item)?.id === "string" && typeof asRecord2(item)?.name === "string" && typeof asRecord2(item)?.displayPrice === "number";
    function extractCategoryProducts(categoryId, content) {
      const items = findNode(content.nodes, "items")?.props;
      const filterBar = findNode(content.nodes, "filter-bar")?.props;
      const productIdsByFacetId = {};
      for (const [facetId, ids] of Object.entries(asRecord2(findNode(content.nodes, "context")?.props.entityIdsByFacetId) ?? {})) {
        productIdsByFacetId[facetId] = asArray(ids).filter((id) => typeof id === "string");
      }
      const sections = asArray(items?.sections).map((value) => {
        const section = asRecord2(value) ?? {};
        return {
          id: asString(section.id) ?? "",
          type: asString(section.type) ?? "",
          title: section.shouldShowHeader ? asString(section.headerName) : null,
          products: asArray(section.items).filter(isProductTile2)
        };
      });
      return {
        categoryId,
        title: asString(findNode(content.nodes, "page-header")?.props.title) ?? "",
        results: {
          sections,
          visualFilters: (0, search_1.extractFilters)(filterBar?.visualFilters),
          powerFilters: (0, search_1.extractFilters)(filterBar?.powerFilters ?? items?.powerFilters),
          textualFilters: (0, search_1.extractFilters)(filterBar?.textualFilters),
          productIdsByFacetId,
          sortingOptions: [],
          selectedSorting: "RELEVANCE"
        }
      };
    }
  }
});

// node_modules/picnic-api/lib/domains/catalog/service.js
var require_service4 = __commonJS({
  "node_modules/picnic-api/lib/domains/catalog/service.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.CatalogService = void 0;
    var promotions_1 = require_promotions();
    var favorites_1 = require_favorites();
    var search_1 = require_search();
    var product_1 = require_product();
    var rsc_1 = require_rsc();
    var categories_1 = require_categories();
    var SEARCH_PARAMS_MODULE = "search-page-params/search-page-params-provider.tsx";
    var SEARCH_RESULTS_MODULE = "search-page-content/results/index.tsx";
    var CatalogService = class {
      constructor(http, pages) {
        this.http = http;
        this.pages = pages;
      }
      /**
       * Returns the category tree as the app shows it (`category-tree-root`): links to promotions and
       * recipes, then the categories under "Alle categorieën". A link's `target` says which method
       * opens it.
       */
      async getCategories() {
        return (0, categories_1.extractCategoryTree)(await this.pages.getRscContent("category-tree-root"));
      }
      /**
       * Returns a category's promotions link and subcategories (`subcategory-page`).
       * @param {string} categoryId The category id of a link with target `subcategories`, e.g. "21724".
       */
      async getSubcategories(categoryId) {
        const content = await this.pages.getRscContent(`subcategory-page?category_id=${encodeURIComponent(categoryId)}`);
        return (0, categories_1.extractSubcategories)(categoryId, content);
      }
      /**
       * Returns the products of a subcategory in sections, with the filters (`category-product-overview`).
       * @param {string} categoryId The category id of a link with target `products`, e.g. "21746".
       */
      async getCategoryProducts(categoryId) {
        const content = await this.pages.getRscContent(`category-product-overview?category_id=${encodeURIComponent(categoryId)}`);
        return (0, categories_1.extractCategoryProducts)(categoryId, content);
      }
      /**
       * Returns the products on promotion in a category, in sections per promotion (`promotion-category-page`).
       * @param {string} categoryId The category id of a link with target `promotions`, e.g. "21724".
       */
      async getCategoryPromotions(categoryId) {
        const content = await this.pages.getRscContent(`promotion-category-page?category_id=${encodeURIComponent(categoryId)}`);
        return (0, categories_1.extractCategoryProducts)(categoryId, content);
      }
      /**
       * Returns the promotions page as the app shows it (`promo-page-root`): sections with products
       * and promotion groups, e.g. the personal promotions, "Uitgelicht" and one section per category.
       */
      async getPromotions() {
        return (0, promotions_1.extractPromotions)(await this.pages.getFusionPage("promo-page-root"));
      }
      /**
       * Returns the products of a promotion on several products (`promo-group-deep-dive`).
       * @param {string} groupId The id of a {@link PromotionGroup}, from {@link getPromotions}.
       */
      async getPromotionGroup(groupId) {
        const content = await this.pages.getRscContent(`promo-group-deep-dive?promo_group_id=${encodeURIComponent(groupId)}`);
        return (0, promotions_1.extractPromotionGroup)(groupId, content);
      }
      /**
       * Returns the products the customer buys, per aisle, as the app's "Favorieten" tab shows them
       * (`purchases-page-root`). Long aisles and the last aisles are incomplete (`complete: false`);
       * {@link getFavoritesInAisle} returns an aisle's full list.
       */
      async getFavorites() {
        return (0, favorites_1.extractFavorites)(await this.pages.getFusionPage("purchases-page-root"));
      }
      /**
       * Returns all products the customer buys in one aisle (`aisle-deep-dive`).
       * @param {string} aisleId The id of a {@link FavoritesAisle}, e.g. "DAIRY".
       */
      async getFavoritesInAisle(aisleId) {
        return (0, favorites_1.extractFavoritesInAisle)(await this.pages.getFusionPage(`aisle-deep-dive?aisle_id=${encodeURIComponent(aisleId)}`));
      }
      /**
       * Searches for products and recipes the way the app does: it fetches the search page (an RSC
       * page with the search parameters), then runs the page's `fetchSearchResults` server action,
       * which returns the results.
       * @param {string} query The keywords to search for.
       * @param {SearchOptions} [options] The sort order and the context the search is opened from.
       */
      async getSearchResults(query, options = {}) {
        const contextParams = options.context === "MEALS" ? "&page_context=MEALS&is_recipe=true" : "";
        const page = await this.pages.getRscPayload(`search-page-results?search_term=${encodeURIComponent(query)}${contextParams}`);
        const params = (0, rsc_1.findRscElementProps)(page, SEARCH_PARAMS_MODULE)[0]?.params;
        if (!params)
          throw new Error("The search page has no search parameters");
        const actionId = await this.pages.findServerActionId(page, SEARCH_RESULTS_MODULE, "fetchSearchResults");
        if (!actionId)
          throw new Error("The search page has no fetchSearchResults action");
        const results = await this.pages.runServerAction(actionId, [
          {
            dayOffset: params.dayOffset,
            entityType: params.requestedEntityType,
            pageNavigationContext: params.pageNavigationContext,
            requestedSorting: options.sorting ?? "RELEVANCE",
            searchId: params.searchId,
            searchQuery: query,
            searchSessionId: params.searchSessionId
          }
        ], page.version);
        const root = (0, rsc_1.decodeRscValue)(results, results.rows["0"]);
        if (!Array.isArray(root) || root[0] !== "$")
          throw new Error("Unexpected fetchSearchResults response");
        return (0, search_1.extractSearchResults)(root[3] ?? {});
      }
      /**
       * Returns suggestions for Picnic products matching the query.
       * @param {string} query The keywords for suggestions.
       */
      getSuggestions(query) {
        return this.http.sendRequest("GET", `/suggest?search_term=${encodeURIComponent(query)}`);
      }
      /** Fetches the product details page (Fusion). */
      getProductDetailsPage(productId) {
        return this.pages.getFusionPage((0, product_1.productDetailsPageId)(productId));
      }
      /**
       * Returns a product as the app's product page shows it (`product-details-page-root`): name,
       * prices, price tiers, promotions, images, the information sections, nutrition and allergens.
       *
       * @param {string} productId The product ID to fetch details for.
       * @throws {ProductNotFoundError} When the product doesn't exist or isn't available at the user's location.
       */
      async getProduct(productId) {
        const page = await this.getProductDetailsPage(productId);
        return (0, product_1.extractProductDetails)(productId, page);
      }
      /**
       * Returns the URL of a product image, e.g. for an `<img>` or a chat message. The images don't
       * need the auth key, so the URL works outside this client.
       * @param {string} imageId The image id, e.g. `ProductTile.imageId`.
       * @param {ImageSize} [size="medium"] The size of the image.
       */
      getImageUrl(imageId, size = "medium") {
        const staticUrl = this.http.url.split("/api/")[0];
        return `${staticUrl}/static/images/${encodeURIComponent(imageId)}/${size}.png`;
      }
      /**
       * Returns a product image as PNG bytes.
       * @param {string} imageId The image id to retrieve.
       * @param {ImageSize} size The size of the image to return.
       */
      getImage(imageId, size) {
        return this.http.sendRequest("GET", this.getImageUrl(imageId, size), null, { binary: true });
      }
      /**
       * Returns a product image as a data URI.
       * @param {string} imageId The image id to retrieve.
       * @param {ImageSize} size The size of the image to return.
       */
      async getImageAsDataUri(imageId, size) {
        const bytes = new Uint8Array(await this.getImage(imageId, size));
        let binary = "";
        for (const byte of bytes)
          binary += String.fromCharCode(byte);
        return `data:image/png;base64,${btoa(binary)}`;
      }
    };
    exports.CatalogService = CatalogService;
  }
});

// node_modules/picnic-api/lib/domains/cart/delivery-slots.js
var require_delivery_slots = __commonJS({
  "node_modules/picnic-api/lib/domains/cart/delivery-slots.js"(exports) {
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

// node_modules/picnic-api/lib/domains/cart/footer.js
var require_footer = __commonJS({
  "node_modules/picnic-api/lib/domains/cart/footer.js"(exports) {
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
      for (const child of asArray(tilesNode.children)) {
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
    function asArray(value) {
      return Array.isArray(value) ? value : [];
    }
  }
});

// node_modules/picnic-api/lib/domains/cart/cart.js
var require_cart = __commonJS({
  "node_modules/picnic-api/lib/domains/cart/cart.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.readCartLine = readCartLine;
    exports.readDeposits = readDeposits;
    exports.readFees = readFees;
    exports.extractCart = extractCart;
    var delivery_slots_1 = require_delivery_slots();
    var asRecord2 = (value) => typeof value === "object" && value !== null && !Array.isArray(value) ? value : null;
    var asRecords = (value) => Array.isArray(value) ? value.flatMap((v) => asRecord2(v) ? [asRecord2(v)] : []) : [];
    var asString = (value) => typeof value === "string" && value !== "" ? value : null;
    var asNumber = (value, fallback = 0) => typeof value === "number" ? value : fallback;
    function mergeDecorators(decorators, overrides) {
      const result = [...decorators];
      for (const override of overrides) {
        const index = result.findIndex((d) => d.type === override.type);
        if (index >= 0)
          result[index] = override;
        else
          result.push(override);
      }
      return result;
    }
    function readReplacement(raw) {
      const id = asString(raw.id);
      if (!id)
        return null;
      const imageIds = Array.isArray(raw.image_ids) ? raw.image_ids : [];
      return {
        id,
        name: asString(raw.name) ?? "",
        imageId: asString(raw.image_id) ?? asString(imageIds[0]),
        displayPrice: asNumber(raw.display_price),
        unitQuantity: asString(raw.unit_quantity) ?? "",
        maxCount: asNumber(raw.max_count, 99)
      };
    }
    function readLabels(decorators) {
      return decorators.flatMap((d) => {
        const text3 = asString(d.text);
        if (d.type !== "PROMO" && d.type !== "LABEL" || !text3)
          return [];
        return [{ text: text3, textColor: asString(d.text_color), backgroundColor: asString(d.background_color) }];
      });
    }
    function readCartLine(line, overrides = {}) {
      const raw = line;
      const id = asString(raw.id);
      if (!id)
        return null;
      const article = asRecords(raw.items)[0];
      const articleId = asString(article?.id);
      const lineDecorators = mergeDecorators(asRecords(raw.decorators), asRecords(overrides[id]));
      const articleDecorators = article ? mergeDecorators(asRecords(article.decorators), asRecords(articleId ? overrides[articleId] : [])) : [];
      const decorators = mergeDecorators(articleDecorators, lineDecorators);
      const find = (type) => decorators.find((d) => d.type === type);
      const price = asNumber(raw.price);
      const displayPrice = asNumber(find("PRICE")?.display_price, asNumber(raw.display_price));
      const unavailable = find("UNAVAILABLE");
      const imageIds = Array.isArray(article?.image_ids) ? article.image_ids : [];
      const priceRanges = Array.isArray(article?.price_ranges) && article.price_ranges.length > 1 ? article.price_ranges : null;
      return {
        id,
        productId: articleId ?? "",
        name: asString(article?.name) ?? asString(raw.name) ?? "",
        unitQuantity: asString(find("UNIT_QUANTITY")?.unit_quantity_text) ?? asString(article?.unit_quantity) ?? "",
        imageId: asString(imageIds[0]),
        quantity: asNumber(find("QUANTITY")?.quantity, 1),
        maxCount: asNumber(article?.max_count, 99),
        displayPrice,
        originalPrice: price > displayPrice ? price : null,
        priceColor: asString(find("PRICE_STYLE")?.price_color),
        priceRanges,
        labels: readLabels(decorators),
        basePrice: asString(find("BASE_PRICE")?.base_price_text),
        freshness: asString(find("FRESH_LABEL")?.period),
        characteristics: asRecords(find("PRODUCT_CHARACTERISTICS")?.characteristics).flatMap((c) => asString(c.type) ?? []),
        isUnavailable: unavailable !== void 0,
        unavailableReason: asString(asRecord2(unavailable?.explanation)?.short_explanation),
        replacements: asRecords(unavailable?.replacements).flatMap((r) => readReplacement(r) ?? []),
        bundlesLink: asString(find("BUNDLES_BUTTON")?.deeplink),
        recipeId: asString(lineDecorators.find((d) => d.type === "BASKET_GROUP")?.id)
      };
    }
    function readRecipes(sections) {
      return asRecords(sections).flatMap((section) => asRecords(section.groups).flatMap((group) => {
        const id = asString(group.id);
        if (!id)
          return [];
        return [{ id, title: asString(group.title) ?? "", preTitle: asString(group.pre_title), subtitle: asString(group.subtitle), imageId: asString(group.image_id) }];
      }));
    }
    function readDeposits(raw) {
      return asRecords(raw).map((entry) => {
        const value = asNumber(entry.value);
        const count2 = asNumber(entry.count);
        return { type: asString(entry.type) ?? "", value, count: count2, total: value * count2 };
      });
    }
    function readFees(raw) {
      return asRecords(raw).map((fee) => ({ type: asString(fee.type) ?? "", name: asString(fee.name) ?? "", amount: asNumber(fee.amount) })).filter((fee) => fee.amount !== 0);
    }
    function extractCart(cart2) {
      const overrides = cart2.decorator_overrides ?? {};
      const items = (cart2.items ?? []).flatMap((line) => readCartLine(line, overrides) ?? []);
      const deposits = readDeposits(cart2.deposit_breakdown);
      const fees = readFees(cart2.fees);
      const slots2 = (0, delivery_slots_1.extractDeliverySlots)({ delivery_slots: cart2.delivery_slots ?? [], selected_slot: cart2.selected_slot ?? null });
      const selectedSlot2 = slots2.selectedSlot;
      return {
        id: cart2.id ?? "",
        mts: asNumber(cart2.mts),
        items,
        totalCount: asNumber(cart2.total_count),
        totalPrice: asNumber(cart2.checkout_total_price),
        discount: items.reduce((sum, item) => sum + (item.originalPrice !== null ? item.originalPrice - item.displayPrice : 0), 0),
        promotionSavings: asNumber(cart2.total_savings),
        membershipSavings: asNumber(cart2.membership_savings),
        deposits,
        depositTotal: deposits.reduce((sum, deposit) => sum + deposit.total, 0),
        fees,
        minimumOrderValue: slots2.slots.find((slot2) => slot2.slotId === selectedSlot2?.slotId)?.minimumOrderValue ?? null,
        selectedSlot: selectedSlot2,
        recipes: readRecipes(cart2.basket_sections)
      };
    }
  }
});

// node_modules/picnic-api/lib/domains/cart/replacements.js
var require_replacements = __commonJS({
  "node_modules/picnic-api/lib/domains/cart/replacements.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.extractCartReplacements = extractCartReplacements;
    var search_1 = require_search();
    var CONTENT_COMPONENT = "unavailability-replacements-content";
    function extractCartReplacements(content, productId) {
      const props = findNode(content.nodes, CONTENT_COMPONENT)?.props ?? {};
      const alternatives = Array.isArray(props.alternativeViewModels) ? props.alternativeViewModels : [];
      return {
        productId,
        reason: typeof props.reason === "string" && props.reason !== "" ? props.reason : null,
        replacements: alternatives.flatMap((tile) => {
          const product = typeof tile === "object" && tile !== null ? (0, search_1.readSellableTile)(tile) : null;
          return product ? [product] : [];
        })
      };
    }
    function findNode(nodes, component) {
      for (const node of nodes) {
        if (node.component === component)
          return node;
        const found = findNode(node.children, component);
        if (found)
          return found;
      }
      return null;
    }
  }
});

// node_modules/picnic-api/lib/domains/cart/service.js
var require_service5 = __commonJS({
  "node_modules/picnic-api/lib/domains/cart/service.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.CartService = void 0;
    var delivery_slots_1 = require_delivery_slots();
    var footer_1 = require_footer();
    var cart_1 = require_cart();
    var replacements_1 = require_replacements();
    var BASKET_FOOTER_PAGE_ID = "basket-footer-section-root";
    var CartService = class {
      constructor(http, pages) {
        this.http = http;
        this.pages = pages;
      }
      /**
       * Returns the cart footer as the app's basket shows it: the loyalty points line and the
       * recommendation tiles ("Niets vergeten?"). The rest of the basket comes from {@link getCart}.
       * @throws {UnexpectedPageFormatError} When Picnic serves the page as RSC.
       */
      async getCartFooter() {
        return (0, footer_1.extractCartFooter)(await this.pages.getFusionPage(BASKET_FOOTER_PAGE_ID));
      }
      /**
       * Returns the cart as the app's basket shows it: the lines with decorator overrides applied
       * (quantities, member prices, labels, unavailability), the totals, deposits, fees, the
       * selected slot and the recipes. The cart mutations return the cart in the same form.
       */
      async getCart() {
        return (0, cart_1.extractCart)(await this.http.sendRequest("GET", `/cart`, null, { includePicnicHeaders: true }));
      }
      /**
       * Returns the products Picnic offers instead of a cart product that can't be delivered, with their
       * names and prices, as the app's replacements page shows them. The cart lists the same products
       * in `CartLineItem.replacements`, but without their names and prices.
       * @param {string} productId The id of the cart product that can't be delivered.
       * @throws {UnexpectedPageFormatError} When Picnic serves the page as Fusion.
       */
      async getReplacements(productId) {
        const content = await this.pages.getRscContent(`unavailability-replacements-page-root?selling_unit_id=${encodeURIComponent(productId)}`);
        return (0, replacements_1.extractCartReplacements)(content, productId);
      }
      /** Sends a cart mutation and returns the cart it responds with. */
      async mutate(path, data) {
        return (0, cart_1.extractCart)(await this.http.sendRequest("POST", path, data, { includePicnicHeaders: true }));
      }
      /**
       * Adds a product to the cart and returns the cart.
       * @param {string} productId The id of the product to add.
       * @param {number} [count=1] The amount of this product to add.
       * @param {SellingUnitContext[]} [sellingUnitContexts] Contexts that say where the product was added from (e.g. a recipe).
       */
      addProductToCart(productId, count2 = 1, sellingUnitContexts) {
        return this.mutate(`/cart/add_product`, {
          product_id: productId,
          count: count2,
          ...sellingUnitContexts && { selling_unit_contexts: sellingUnitContexts }
        });
      }
      /**
       * Removes a product from the cart and returns the cart.
       * @param {string} productId The id of the product to remove.
       * @param {number} [count=1] The amount of this product to remove.
       * @param {SellingUnitContext[]} [sellingUnitContexts] Contexts that say where the product was removed from (e.g. a recipe).
       */
      removeProductFromCart(productId, count2 = 1, sellingUnitContexts) {
        return this.mutate(`/cart/remove_product`, {
          product_id: productId,
          count: count2,
          ...sellingUnitContexts && { selling_unit_contexts: sellingUnitContexts }
        });
      }
      /**
       * Removes all products from the cart and returns the cart.
       */
      clearCart() {
        return this.mutate(`/cart/clear`, null);
      }
      /**
       * Returns the delivery slots with a green-choice flag and minimum order value, and the selected
       * slot with its window. Read from the cart, which carries the slots the app's slot selector shows.
       */
      async getDeliverySlots() {
        const cart2 = await this.http.sendRequest("GET", `/cart`, null, { includePicnicHeaders: true });
        return (0, delivery_slots_1.extractDeliverySlots)({ delivery_slots: cart2.delivery_slots ?? [], selected_slot: cart2.selected_slot ?? null });
      }
      /**
       * Selects a delivery slot and returns the cart.
       * @param {string} slotId The id of the delivery slot to select.
       */
      setDeliverySlot(slotId) {
        return this.mutate(`/cart/set_delivery_slot`, { slot_id: slotId });
      }
      /**
       * Removes a group of products from the cart at once and returns the cart.
       * @param {string} groupId The id of the group to remove.
       */
      removeGroupFromCart(groupId) {
        return this.mutate(`/cart/remove_group`, { group_id: groupId });
      }
      /**
       * Returns the minimum order value for the currently selected delivery slot.
       * Requires a delivery slot to be selected; otherwise the API returns a 500 error.
       */
      getMinimumOrderValue() {
        return this.http.sendRequest("GET", `/user-slot-minimum-order-value/minimum`, null, { includePicnicHeaders: true });
      }
    };
    exports.CartService = CartService;
  }
});

// node_modules/picnic-api/lib/domains/checkout/service.js
var require_service6 = __commonJS({
  "node_modules/picnic-api/lib/domains/checkout/service.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.CheckoutService = void 0;
    var CheckoutService = class {
      constructor(http) {
        this.http = http;
      }
      /**
       * Starts the checkout of the current cart and returns the order to pay for.
       * @param {StartCheckoutOptions} options The cart's `mts`, and what the user resolved or accepted.
       * @throws {CheckoutIssueError} When the cart has issues to resolve first, e.g. an age check for alcohol.
       */
      startCheckout(options) {
        return this.http.sendRequest("POST", `/cart/checkout/start`, {
          mts: options.mts,
          oos_article_ids: options.outOfStockArticleIds ?? null,
          ...options.resolveKey ? { resolve_key: options.resolveKey } : {}
        }, { includePicnicHeaders: true });
      }
      /**
       * Initiates payment for a checkout order and returns a bank redirect URL.
       */
      initiatePayment(orderId, appReturnUrl) {
        const body = {
          order_id: orderId,
          app_return_url: appReturnUrl
        };
        return this.http.sendRequest("POST", `/cart/checkout/initiate_payment`, body, { includePicnicHeaders: true });
      }
      /**
       * Polls checkout payment status while a transaction is in progress.
       */
      getCheckoutStatus(transactionId) {
        return this.http.sendRequest("GET", `/cart/checkout/${encodeURIComponent(transactionId)}/status`);
      }
      /**
       * Cancels an in-progress checkout transaction.
       */
      cancelCheckout(transactionId) {
        const body = { transaction_id: transactionId };
        return this.http.sendRequest("POST", `/cart/checkout/cancel`, body, { includePicnicHeaders: true });
      }
      /**
       * Confirms and places an order identified by its order id.
       * @param {string} orderId The id of the order to confirm.
       */
      confirmOrder(orderId) {
        return this.http.sendRequest("POST", `/cart/checkout/order/${encodeURIComponent(orderId)}/confirm`);
      }
      /**
       * Returns the status of an order (not delivery) by its id.
       * @param {string} orderId
       */
      getOrderStatus(orderId) {
        return this.http.sendRequest("GET", `/cart/checkout/order/${encodeURIComponent(orderId)}/status`);
      }
    };
    exports.CheckoutService = CheckoutService;
  }
});

// node_modules/picnic-api/lib/domains/delivery/summaries.js
var require_summaries = __commonJS({
  "node_modules/picnic-api/lib/domains/delivery/summaries.js"(exports) {
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

// node_modules/picnic-api/lib/domains/delivery/delivery.js
var require_delivery = __commonJS({
  "node_modules/picnic-api/lib/domains/delivery/delivery.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.readReturnedContainers = readReturnedContainers;
    exports.extractDelivery = extractDelivery;
    exports.extractDeliveryPosition = extractDeliveryPosition;
    exports.extractDeliveryRoute = extractDeliveryRoute;
    exports.combineDeliveryTracking = combineDeliveryTracking;
    var cart_1 = require_cart();
    var asRecord2 = (value) => typeof value === "object" && value !== null && !Array.isArray(value) ? value : null;
    var asRecords = (value) => Array.isArray(value) ? value.flatMap((v) => asRecord2(v) ? [asRecord2(v)] : []) : [];
    var asString = (value) => typeof value === "string" && value !== "" ? value : null;
    var asNumber = (value, fallback = 0) => typeof value === "number" && Number.isFinite(value) ? value : fallback;
    function readReturnedContainers(raw) {
      return asRecords(raw).map((entry) => ({
        type: asString(entry.type) ?? "",
        name: asString(entry.localized_name) ?? asString(entry.type) ?? "",
        quantity: asNumber(entry.quantity),
        price: asNumber(entry.price)
      }));
    }
    function readPayment(raw) {
      const info = asRecord2(raw);
      const paymentType = asString(info?.payment_type);
      const redactedIban = asString(info?.redacted_iban);
      if (!paymentType && !redactedIban)
        return null;
      return { paymentType, redactedIban, bankId: asString(info?.bank_id) };
    }
    function readOrder(order) {
      const raw = order;
      const id = asString(raw.id);
      if (!id)
        return null;
      const deposits = (0, cart_1.readDeposits)(raw.deposit_breakdown);
      const depositTotal = deposits.reduce((sum, deposit) => sum + deposit.total, 0);
      return {
        id,
        status: asString(raw.status) ?? "COMPLETED",
        creationTime: asString(raw.creation_time) ?? "",
        items: (order.items ?? []).flatMap((line) => (0, cart_1.readCartLine)(line, order.decorator_overrides ?? {}) ?? []),
        totalPrice: asNumber(raw.total_price),
        checkoutTotalPrice: asNumber(raw.checkout_total_price),
        promotionSavings: asNumber(raw.total_savings),
        membershipSavings: asNumber(raw.membership_savings),
        deposits,
        depositTotal: asNumber(raw.total_deposit) || depositTotal,
        fees: (0, cart_1.readFees)(raw.fees),
        cancellable: raw.cancellable === true,
        payment: readPayment(raw.transaction_info)
      };
    }
    function extractDelivery(delivery) {
      const raw = delivery;
      const slot2 = asRecord2(raw.slot);
      const deliveryTime = asRecord2(raw.delivery_time);
      const eta2 = asRecord2(raw.eta2);
      const orders = (delivery.orders ?? []).flatMap((order) => readOrder(order) ?? []);
      const items = orders.flatMap((order) => order.items);
      const deposits = orders.flatMap((order) => order.deposits);
      return {
        id: asString(raw.delivery_id) ?? asString(raw.id) ?? "",
        status: asString(raw.status) ?? "COMPLETED",
        creationTime: asString(raw.creation_time) ?? "",
        windowStart: asString(slot2?.window_start) ?? asString(deliveryTime?.start) ?? asString(eta2?.start),
        windowEnd: asString(slot2?.window_end) ?? asString(deliveryTime?.end) ?? asString(eta2?.end),
        orders,
        returnedContainers: readReturnedContainers(raw.returned_containers),
        totalPrice: orders.reduce((sum, order) => sum + order.checkoutTotalPrice, 0),
        totalCount: items.reduce((sum, item) => sum + item.quantity, 0),
        // Line prices are totals for the line's quantity.
        discount: items.reduce((sum, item) => sum + (item.originalPrice !== null ? item.originalPrice - item.displayPrice : 0), 0),
        promotionSavings: orders.reduce((sum, order) => sum + order.promotionSavings, 0),
        membershipSavings: orders.reduce((sum, order) => sum + order.membershipSavings, 0),
        deposits,
        depositTotal: deposits.reduce((sum, deposit) => sum + deposit.total, 0),
        fees: orders.flatMap((order) => order.fees),
        cancellable: orders.some((order) => order.cancellable)
      };
    }
    function readRoutePoint(raw) {
      const lat = asNumber(raw.lat);
      const lng = asNumber(raw.lng);
      return lat === 0 && lng === 0 ? null : { lat, lng, ts: asNumber(raw.ts) };
    }
    function closestPoint(route, ts) {
      let best = null;
      for (const point of route) {
        if (!best || Math.abs(point.ts - ts) < Math.abs(best.ts - ts))
          best = point;
      }
      return best;
    }
    function extractDeliveryPosition(raw) {
      const pos = asRecord2(raw) ?? {};
      const etaWindow = asRecord2(pos.eta_window);
      return {
        routeVersion: asNumber(pos.version),
        inProgress: pos.scenario_in_progress === true,
        queryInterval: asNumber(pos.query_interval, 15e3),
        eta: asNumber(pos.eta) || null,
        etaWindowStart: asString(etaWindow?.start),
        etaWindowEnd: asString(etaWindow?.end),
        routeTime: asNumber(pos.scenario_ts)
      };
    }
    function extractDeliveryRoute(raw) {
      const scenario = asRecord2(raw) ?? {};
      const points = asRecords(scenario.scenario).flatMap((point) => readRoutePoint(point) ?? []);
      const driver = asRecord2(scenario.driver);
      const vehicle = asRecord2(scenario.vehicle);
      const destination = asRecord2(scenario.destination);
      const end = points[points.length - 1];
      const lat = asNumber(destination?.lat) || (end?.lat ?? 0);
      const lng = asNumber(destination?.lng) || (end?.lng ?? 0);
      const image = asString(vehicle?.image);
      return {
        version: asNumber(scenario.version),
        points,
        driverName: asString(driver?.name),
        driverPhotoUrl: asString(driver?.photo_url),
        vehicleName: asString(vehicle?.name),
        vehicleImageDataUrl: image ? image.startsWith("data:") ? image : `data:image/png;base64,${image}` : null,
        destination: lat !== 0 || lng !== 0 ? { lat, lng, street: asString(destination?.street), city: asString(destination?.city), postcode: asString(destination?.postcode) } : null
      };
    }
    function combineDeliveryTracking(position, route) {
      return { ...position, currentPosition: closestPoint(route.points, position.routeTime), route };
    }
  }
});

// node_modules/picnic-api/lib/domains/delivery/service.js
var require_service7 = __commonJS({
  "node_modules/picnic-api/lib/domains/delivery/service.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.DeliveryService = void 0;
    var summaries_1 = require_summaries();
    var delivery_1 = require_delivery();
    var DeliveryService = class {
      constructor(http) {
        this.http = http;
      }
      /**
       * Returns all past and current deliveries as summaries, newest first.
       * Totals are summed over each delivery's orders.
       * @param {DeliveryStatus[]} [filter=[]] An array of delivery statuses to filter on.
       */
      async getDeliverySummaries(filter = []) {
        const raw = await this.http.sendRequest("POST", `/deliveries/summary`, filter);
        return (0, summaries_1.extractDeliverySummaries)(raw);
      }
      /**
       * Returns a delivery as the app's order history shows it: its orders with their lines (read
       * like the cart's), the returned containers and the totals over all orders.
       * @param {string} deliveryId The id of the delivery to look up.
       */
      async getDelivery(deliveryId) {
        return (0, delivery_1.extractDelivery)(await this.http.sendRequest("GET", `/deliveries/${encodeURIComponent(deliveryId)}`));
      }
      /**
       * Returns a delivery's position, which the app polls while the driver is on the way: the
       * arrival estimate, whether the delivery is in progress and the version of its route.
       * @param {string} deliveryId The id of the delivery to look up.
       */
      async getDeliveryPosition(deliveryId) {
        return (0, delivery_1.extractDeliveryPosition)(await this.http.sendRequest("GET", `/deliveries/${encodeURIComponent(deliveryId)}/position`, null, { includePicnicHeaders: true }));
      }
      /**
       * Returns a delivery's route, driver, vehicle and destination.
       * @param {string} deliveryId The id of the delivery to look up.
       */
      async getDeliveryRoute(deliveryId) {
        return (0, delivery_1.extractDeliveryRoute)(await this.http.sendRequest("GET", `/deliveries/${encodeURIComponent(deliveryId)}/scenario`, null, { includePicnicHeaders: true }));
      }
      /**
       * Returns where a delivery is: the position combined with the route. Poll again after
       * `queryInterval` while `inProgress`, passing the `route` of the previous result: the route is
       * only fetched again when the position reports another route version.
       * @param {string} deliveryId The id of the delivery to look up.
       * @param {DeliveryRoute} [knownRoute] The route from a previous call for this delivery.
       */
      async getDeliveryTracking(deliveryId, knownRoute) {
        if (!knownRoute) {
          const [position2, route2] = await Promise.all([this.getDeliveryPosition(deliveryId), this.getDeliveryRoute(deliveryId)]);
          return (0, delivery_1.combineDeliveryTracking)(position2, route2);
        }
        const position = await this.getDeliveryPosition(deliveryId);
        const route = knownRoute.version === position.routeVersion ? knownRoute : await this.getDeliveryRoute(deliveryId);
        return (0, delivery_1.combineDeliveryTracking)(position, route);
      }
      /**
       * Cancels an order by delivery id.
       * @param {string} deliveryId
       */
      cancelDelivery(deliveryId) {
        return this.http.sendRequest("POST", `/order/delivery/${encodeURIComponent(deliveryId)}/cancel`);
      }
      /**
       * Sets a rating for a delivery from 0 to 10. Returns 400 if the delivery already has a rating.
       * @param {string} deliveryId
       * @param {number} rating
       */
      setDeliveryRating(deliveryId, rating) {
        return this.http.sendRequest("POST", `/deliveries/${encodeURIComponent(deliveryId)}/rating`, { rating });
      }
      /**
       * (Re)sends the invoice email for a delivery.
       * @param {string} deliveryId
       */
      sendDeliveryInvoiceEmail(deliveryId) {
        return this.http.sendRequest("POST", `/deliveries/${encodeURIComponent(deliveryId)}/resend_invoice_email`);
      }
      /**
       * Returns parcels (externally shipped packages tracked via a carrier).
       */
      getParcels() {
        return this.http.sendRequest("GET", `/parcels`, null, { includePicnicHeaders: true });
      }
    };
    exports.DeliveryService = DeliveryService;
  }
});

// node_modules/picnic-api/lib/domains/payment/wallet-transaction.js
var require_wallet_transaction = __commonJS({
  "node_modules/picnic-api/lib/domains/payment/wallet-transaction.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.extractWalletTransaction = extractWalletTransaction;
    var cart_1 = require_cart();
    var delivery_1 = require_delivery();
    var asRecord2 = (value) => typeof value === "object" && value !== null && !Array.isArray(value) ? value : null;
    var asRecords = (value) => Array.isArray(value) ? value.flatMap((v) => asRecord2(v) ? [asRecord2(v)] : []) : [];
    var asString = (value) => typeof value === "string" && value !== "" ? value : null;
    var asNumber = (value, fallback = 0) => typeof value === "number" && Number.isFinite(value) ? value : fallback;
    var firstImage = (raw) => asString(Array.isArray(raw?.image_ids) ? raw.image_ids[0] : null);
    function articlesById(lines) {
      const articles = /* @__PURE__ */ new Map();
      for (const line of lines) {
        for (const article of asRecords(line.items)) {
          const id = asString(article.id);
          if (id)
            articles.set(id, article);
        }
      }
      return articles;
    }
    function readSubstitution(refund, articles) {
      const replacements = asRecords(refund.substitutions).map((sub) => ({
        name: asString(sub.name) ?? "",
        imageId: firstImage(sub),
        quantity: asNumber(sub.quantity, 1)
      }));
      if (replacements.length === 0)
        return null;
      const article = articles.get(asString(refund.article_id) ?? "") ?? null;
      return {
        original: { name: asString(article?.name) ?? "", imageId: firstImage(article), quantity: asNumber(refund.quantity, 1) },
        refundAmount: asNumber(refund.amount),
        replacements
      };
    }
    function extractWalletTransaction(transactionId, transaction) {
      const raw = asRecord2(transaction) ?? {};
      const lines = asRecords(raw.shop_items);
      const articles = articlesById(lines);
      const refunds = asRecords(raw.article_issue_refunds);
      const substitutedIds = new Set(refunds.filter((refund) => asRecords(refund.substitutions).length > 0).map((refund) => asString(refund.article_id)));
      const items = lines.filter((line) => !asRecords(line.items).some((article) => substitutedIds.has(asString(article.id)))).flatMap((line) => (0, cart_1.readCartLine)(line) ?? []);
      const returnedContainers = (0, delivery_1.readReturnedContainers)(raw.returned_containers);
      const displayName = asString(raw.payment_option_display_name);
      const paidAt = asNumber(raw.payment_execution_timestamp);
      return {
        id: transactionId,
        deliveryId: asString(raw.delivery_id),
        paidAt: paidAt > 0 ? paidAt : null,
        amount: asNumber(raw.amount_in_cents),
        type: asString(raw.transaction_type) ?? "",
        status: asString(raw.transaction_status) ?? "",
        items,
        substitutions: refunds.flatMap((refund) => readSubstitution(refund, articles) ?? []),
        depositTotal: asRecords(raw.deposits).reduce((sum, deposit) => sum + asNumber(deposit.value) * asNumber(deposit.count), 0),
        returnedContainers,
        returnedDepositTotal: returnedContainers.reduce((sum, container) => sum + container.price, 0),
        paymentMethod: displayName ? { displayName, account: asString(raw.payment_option_account), iconUrl: asString(raw.payment_method_icon_url) } : null
      };
    }
  }
});

// node_modules/picnic-api/lib/domains/payment/service.js
var require_service8 = __commonJS({
  "node_modules/picnic-api/lib/domains/payment/service.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.PaymentService = void 0;
    var wallet_transaction_1 = require_wallet_transaction();
    var PaymentService = class {
      constructor(http) {
        this.http = http;
      }
      /**
       * Returns payment profile information.
       */
      getPaymentProfile() {
        return this.http.sendRequest("GET", `/payment-profile`, null, { includePicnicHeaders: true });
      }
      /**
       * Returns a page of wallet transactions.
       * @param {number} pageNumber The page number to retrieve (1-based; minimum 1).
       */
      getWalletTransactions(pageNumber) {
        return this.http.sendRequest("POST", `/wallet/transactions`, { page_number: pageNumber });
      }
      /**
       * Returns a payment (or refund) as the app's wallet shows it: the amount, the order lines it
       * covers (read like the cart's), the substituted products, deposits and the payment method.
       * @param {string} walletTransactionId The id of the transaction.
       */
      async getWalletTransaction(walletTransactionId) {
        const raw = await this.http.sendRequest("GET", `/wallet/transactions/${encodeURIComponent(walletTransactionId)}`);
        return (0, wallet_transaction_1.extractWalletTransaction)(walletTransactionId, raw);
      }
    };
    exports.PaymentService = PaymentService;
  }
});

// node_modules/picnic-api/lib/domains/consent/service.js
var require_service9 = __commonJS({
  "node_modules/picnic-api/lib/domains/consent/service.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.ConsentService = void 0;
    var ConsentService = class {
      constructor(http) {
        this.http = http;
      }
      /**
       * Returns the consent settings.
       */
      getConsentSettings() {
        return this.http.sendRequest("GET", `/consents/settings-page`);
      }
      /**
       * Returns the general consent settings.
       */
      getGeneralConsentSettings() {
        return this.http.sendRequest("GET", `/consents/general/settings-page`);
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
var require_service10 = __commonJS({
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
        return this.http.sendRequest("GET", `/cs-contact-info`, null, { includePicnicHeaders: true });
      }
      /**
       * Returns CS contact info without requiring authentication.
       * Uses the public API endpoint (/public-api/...) with a picnic-country header.
       * @param {string} countryCode The country code to pass as the picnic-country header (e.g. 'NL').
       */
      getUnauthenticatedContactInfo(countryCode) {
        const publicUrl = this.http.url.replace("/api/", "/public-api/");
        return this.http.sendRequest("GET", `${publicUrl}/cs-contact-info`, null, {
          authenticated: false,
          headers: { "picnic-country": countryCode }
        });
      }
    };
    exports.CustomerServiceService = CustomerServiceService;
  }
});

// node_modules/picnic-api/lib/domains/content/service.js
var require_service11 = __commonJS({
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
        return this.http.sendRequest("GET", `/content/faq`, null, { includePicnicHeaders: true });
      }
      /**
       * Returns the content shown on the search empty-state screen (no results).
       * Returned in PML (Picnic Markup Language) format.
       */
      getSearchEmptyState() {
        return this.http.sendRequest("GET", `/content/search_empty_state`, null, { includePicnicHeaders: true });
      }
    };
    exports.ContentService = ContentService;
  }
});

// node_modules/picnic-api/lib/domains/recipe/lists.js
var require_lists = __commonJS({
  "node_modules/picnic-api/lib/domains/recipe/lists.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.parseMinutes = parseMinutes;
    exports.readRecipeTile = readRecipeTile;
    exports.extractRecipeTiles = extractRecipeTiles;
    exports.extractRecipeOverview = extractRecipeOverview;
    exports.extractRecipeCategory = extractRecipeCategory;
    exports.extractRecipeCategoryGroup = extractRecipeCategoryGroup;
    var pml_1 = require_pml();
    var RECIPE_SCHEMA = "iglu:tech.picnic.snowplow.analytics/recipe/jsonschema/";
    var AISLE_SCHEMA = "iglu:tech.picnic.snowplow.analytics/aisle/jsonschema/";
    var PAGE_SECTION_SCHEMA = "iglu:tech.picnic.snowplow.analytics/page_section/jsonschema/";
    var PML_COMPONENT_SCHEMA = "iglu:tech.picnic.snowplow.analytics/pml_component/jsonschema/";
    var CATEGORY_LINK = /id=meals-category(-group)?-page,(?:category_id|group_name)=([^,&]+)/;
    function parseMinutes(text3) {
      const sum = text3.match(/^(\d+(?:\s*\+\s*\d+)*)\s*min/i)?.[1];
      if (sum)
        return sum.split("+").reduce((total, part) => total + Number(part.trim()), 0);
      const hours = text3.match(/(\d+)\s*(?:uur|u|std|h)\b/i)?.[1];
      const minutes = text3.match(/(\d+)\s*min/i)?.[1];
      if (hours === void 0 && minutes === void 0)
        return null;
      return Number(hours ?? 0) * 60 + Number(minutes ?? 0);
    }
    function recipeContext(tile) {
      return (0, pml_1.analyticsContexts)(tile).find((c) => c.schema?.startsWith(RECIPE_SCHEMA) && typeof c.data?.recipe_id === "string")?.data;
    }
    function visibleTexts(node, texts = []) {
      if (Array.isArray(node))
        node.forEach((child) => visibleTexts(child, texts));
      else if (typeof node === "object" && node !== null) {
        const record = node;
        if (record.isHidden !== void 0 && record.isHidden !== false)
          return texts;
        if (record.type === "RICH_TEXT" && typeof record.markdown === "string")
          texts.push({ markdown: record.markdown, textType: record.textType });
        for (const [key, value] of Object.entries(record))
          if (key !== "analytics")
            visibleTexts(value, texts);
      }
      return texts;
    }
    function readRecipeTile(tile) {
      const recipe = recipeContext(tile);
      if (!recipe)
        return null;
      const texts = visibleTexts(tile.pml).map((t) => ({ text: (0, pml_1.cleanMarkdown)(t.markdown), textType: t.textType })).filter((t) => t.text);
      const analyticsName = typeof recipe.recipe_name === "string" ? recipe.recipe_name.trim() : "";
      const shownName = analyticsName ? texts.findIndex((t) => t.text === analyticsName) : -1;
      const nameIndex = shownName >= 0 ? shownName : texts.findIndex((t) => t.textType === "SUBTITLE1");
      const name = analyticsName || (nameIndex >= 0 ? texts[nameIndex].text : "");
      const after = nameIndex >= 0 ? texts.slice(nameIndex + 1).filter((t) => t.text !== ">") : [];
      const subtitle = after.find((t) => t.textType === "SUBTITLE2")?.text ?? null;
      const tags = after.filter((t) => t.textType !== "SUBTITLE2").map((t) => t.text);
      const image = (0, pml_1.findNode)(tile.pml, (n) => n.type === "IMAGE" && typeof n.source?.id === "string");
      const imageType = recipe.recipe_image_type ?? recipe.image_type;
      return {
        id: recipe.recipe_id,
        name,
        imageType: typeof imageType === "string" ? imageType : null,
        imageId: image ? image.source.id : null,
        subtitle,
        tags,
        cookingTimeMinutes: firstMinutes(tags)
      };
    }
    var firstMinutes = (tags) => tags.map(parseMinutes).find((minutes) => minutes !== null) ?? null;
    function extractRecipeTiles(page) {
      const recipes = /* @__PURE__ */ new Map();
      walkTiles(page, (tile) => {
        const recipe = readRecipeTile(tile);
        if (recipe && !recipes.has(recipe.id))
          recipes.set(recipe.id, recipe);
      });
      return [...recipes.values()];
    }
    function walkTiles(node, visit) {
      if (Array.isArray(node))
        return node.forEach((child) => walkTiles(child, visit));
      if (typeof node !== "object" || node === null)
        return;
      const record = node;
      if (record.type === "PML" && recipeContext(record))
        return visit(record);
      Object.values(record).forEach((child) => walkTiles(child, visit));
    }
    function categoryLink(deeplink, name, imageId) {
      const match = deeplink.match(CATEGORY_LINK);
      if (!match)
        return null;
      return { type: match[1] ? "group" : "category", id: decodeURIComponent(match[2]), name, imageId };
    }
    function extractRecipeOverview(page) {
      const sections = /* @__PURE__ */ new Map();
      walkTiles(page, (tile) => {
        const aisle = (0, pml_1.analyticsContexts)(tile).find((c) => c.schema?.startsWith(AISLE_SCHEMA))?.data;
        const recipe = readRecipeTile(tile);
        if (!aisle || !recipe || typeof aisle.assortment_aisle !== "string")
          return;
        const key = `${aisle.aisle_ranking}:${aisle.assortment_aisle}`;
        let section = sections.get(key);
        if (!section) {
          const pill = typeof aisle.pill_display_name === "string" ? aisle.pill_display_name : null;
          section = { title: aisle.assortment_aisle, pill, recipes: [], rank: Number(aisle.aisle_ranking ?? sections.size), ids: /* @__PURE__ */ new Set() };
          sections.set(key, section);
        }
        if (!section.ids.has(recipe.id)) {
          section.ids.add(recipe.id);
          section.recipes.push(recipe);
        }
      });
      const categorySections = /* @__PURE__ */ new Map();
      (0, pml_1.walkNodes)(page, (node) => {
        if (node.type !== "PML")
          return;
        const contexts = (0, pml_1.analyticsContexts)(node);
        const deeplink = contexts.find((c) => c.schema?.startsWith(PML_COMPONENT_SCHEMA))?.data?.deeplink;
        const heading = contexts.find((c) => c.schema?.startsWith(PAGE_SECTION_SCHEMA))?.data?.name;
        if (typeof deeplink !== "string" || typeof heading !== "string")
          return;
        const component = node.pml?.component;
        const name = typeof component?.accessibilityLabel === "string" ? component.accessibilityLabel : "";
        const image = (0, pml_1.findNode)(component, (n) => n.type === "IMAGE");
        const link = categoryLink(deeplink, name, typeof image?.source?.id === "string" ? image.source.id : null);
        if (!link || !name)
          return;
        const section = categorySections.get(heading) ?? { title: heading, categories: [] };
        if (!section.categories.some((c) => c.type === link.type && c.id === link.id))
          section.categories.push(link);
        categorySections.set(heading, section);
      });
      return {
        sections: [...sections.values()].sort((a, b) => a.rank - b.rank).map(({ title, pill, recipes }) => ({ title, pill, recipes })),
        categorySections: [...categorySections.values()]
      };
    }
    var asRecord2 = (value) => typeof value === "object" && value !== null && !Array.isArray(value) ? value : null;
    var asString = (value) => typeof value === "string" && value !== "" ? value : null;
    function findRscNode(nodes, component) {
      for (const node of nodes) {
        if (node.component === component)
          return node;
        const found = findRscNode(node.children, component);
        if (found)
          return found;
      }
      return null;
    }
    function readRscRecipeTile(item) {
      const tile = asRecord2(item);
      const id = asString(tile?.id);
      if (!tile || !id || tile.sellableType !== "SELLING_GROUP")
        return null;
      const text3 = asRecord2(tile.text);
      const tags = (Array.isArray(text3?.tags) ? text3.tags : []).flatMap((tag) => asString(asRecord2(tag)?.text) ?? []);
      return {
        id,
        name: asString(asRecord2(text3?.title)?.text) ?? "",
        imageType: null,
        imageId: asString(asRecord2(tile.image)?.imageId),
        subtitle: asString(asRecord2(text3?.subtitle)?.text),
        tags,
        cookingTimeMinutes: firstMinutes(tags)
      };
    }
    function extractRecipeCategory(categoryId, content) {
      const items = findRscNode(content.nodes, "vertical-list")?.props.items;
      return {
        id: categoryId,
        title: asString(findRscNode(content.nodes, "page-header")?.props.title) ?? "",
        recipes: (Array.isArray(items) ? items : []).flatMap((item) => readRscRecipeTile(item) ?? [])
      };
    }
    function extractRecipeCategoryGroup(name, content) {
      const list = findRscNode(content.nodes, "category-list");
      const items = list?.props.items;
      return {
        name,
        title: asString(list?.props.title) ?? name,
        categories: (Array.isArray(items) ? items : []).flatMap((item) => {
          const entry = asRecord2(item);
          const deeplink = asString(entry?.deeplink);
          const link = deeplink ? categoryLink(deeplink, asString(entry?.title) ?? "", asString(entry?.image)) : null;
          return link ? [link] : [];
        })
      };
    }
  }
});

// node_modules/picnic-api/lib/domains/recipe/recipe.js
var require_recipe = __commonJS({
  "node_modules/picnic-api/lib/domains/recipe/recipe.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.extractUserDefinedRecipeDetails = void 0;
    exports.extractRecipes = extractRecipes;
    exports.extractUserDefinedRecipes = extractUserDefinedRecipes;
    exports.extractIngredientProductName = extractIngredientProductName;
    exports.extractRecipeDetails = extractRecipeDetails;
    exports.extractIngredientQuantities = extractIngredientQuantities;
    exports.extractSuggestedImages = extractSuggestedImages;
    var pml_1 = require_pml();
    var lists_1 = require_lists();
    var RECIPE_SCHEMA = "iglu:tech.picnic.snowplow.analytics/recipe/jsonschema/";
    var SEGMENT_SCHEMA = "iglu:tech.picnic.snowplow.analytics/segment/jsonschema/";
    var PROMOTION_SCHEMA = "iglu:tech.picnic.snowplow.analytics/promotion/jsonschema/";
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
        const tile = (0, lists_1.readRecipeTile)(obj);
        byId.set(recipe.recipe_id, {
          id: recipe.recipe_id,
          name: previous?.name || recipe.recipe_name || tile?.name || "",
          imageType: previous?.imageType ?? recipe.recipe_image_type ?? recipe.image_type ?? null,
          imageId: previous?.imageId ?? tile?.imageId ?? null,
          subtitle: previous?.subtitle ?? tile?.subtitle ?? null,
          tags: previous?.tags.length ? previous.tags : tile?.tags ?? [],
          cookingTimeMinutes: previous?.cookingTimeMinutes ?? tile?.cookingTimeMinutes ?? null
        });
      });
      return [...byId.values()];
    }
    function extractUserDefinedRecipes(page) {
      return extractRecipes(page, "USER_DEFINED_RECIPES");
    }
    var markdownText = (node) => typeof node?.markdown === "string" ? (0, pml_1.cleanMarkdown)(node.markdown) || null : null;
    function readIngredientTile(tile, contexts, unit) {
      const nameNode = (0, pml_1.findNode)(tile.pml, (n) => n.type === "RICH_TEXT" && n.textType === "SUBTITLE1" && typeof n.markdown === "string");
      const [nameStack, infoColumn] = nameNode ? (0, pml_1.ancestorsOf)(tile.pml, nameNode).filter((n) => n.type === "STACK") : [];
      const textRow = (infoColumn ? (0, pml_1.childrenOf)(infoColumn) : []).filter((n) => n.type === "STACK" && (0, pml_1.childrenOf)(n).length > 0 && (0, pml_1.childrenOf)(n).every((c) => c.type === "RICH_TEXT" && typeof c.markdown === "string")).pop();
      const rowTexts = textRow ? (0, pml_1.childrenOf)(textRow) : [];
      const image = (0, pml_1.findNode)((0, pml_1.findNodeById)(tile.pml, "selling-unit-image"), (n) => n.type === "IMAGE");
      const imageSource = image?.source;
      const promotion = contexts.find((c) => c.schema?.startsWith(PROMOTION_SCHEMA))?.data;
      return {
        name: markdownText(nameNode ?? void 0),
        brand: nameStack ? findBrand((0, pml_1.childrenOf)(nameStack).slice(1)) : null,
        sellingUnitId: typeof unit?.selling_unit_id === "string" ? unit.selling_unit_id : null,
        imageId: typeof imageSource?.id === "string" ? imageSource.id : null,
        unitQuantity: markdownText(rowTexts[0]),
        neededText: markdownText(rowTexts[1]),
        promotionLabel: typeof promotion?.promotion_label === "string" ? promotion.promotion_label : null,
        notice: markdownText((infoColumn ? (0, pml_1.childrenOf)(infoColumn) : []).find((n) => n.type === "RICH_TEXT"))
      };
    }
    var findBrand = (nodes) => markdownText((0, pml_1.findNode)(nodes, (n) => n.type === "RICH_TEXT" && typeof n.markdown === "string") ?? void 0);
    function extractIngredientTiles(page) {
      const tiles = /* @__PURE__ */ new Map();
      walkObjects(page, (obj) => {
        if (obj.type !== "PML" || typeof obj.id !== "string" || !obj.id.includes("selling-unit-tile"))
          return;
        const contexts = obj.analytics?.contexts ?? [];
        const recipe = contexts.find((c) => c.schema?.startsWith(RECIPE_SCHEMA))?.data;
        const units = recipe?.selling_units;
        const unit = Array.isArray(units) && units.length === 1 ? units[0] : void 0;
        const ingredientId = unit ? unit.ingredient_id : JSON.stringify(obj.pml ?? {}).match(/ingredient_id=([a-f0-9-]+)&/)?.[1];
        if (typeof ingredientId === "string" && !tiles.has(ingredientId))
          tiles.set(ingredientId, readIngredientTile(obj, contexts, unit));
      });
      return tiles;
    }
    function extractIngredientStates(page) {
      const states = /* @__PURE__ */ new Map();
      walkObjects(page, (obj) => {
        if (obj.type !== "STATE_BOUNDARY" || obj.id !== "sellableContentState")
          return;
        for (const ingredient of obj.state?.ingredientsState ?? []) {
          if (typeof ingredient?.ingredientId === "string")
            states.set(ingredient.ingredientId, ingredient);
        }
      });
      return states;
    }
    function extractDefaultSelectedIngredientIds(page) {
      const state = (0, pml_1.findNode)(page, (n) => n.type === "STATE_BOUNDARY" && n.id === "sellablePageState")?.state;
      const ids = state?.defaultSelectedIngredientIds;
      return Array.isArray(ids) ? new Set(ids.filter((id) => typeof id === "string")) : null;
    }
    function extractAllergensByIngredient(page) {
      let components = [];
      let names = {};
      walkObjects(page, (obj) => {
        if (obj.type !== "EXPRESSION" || typeof obj.expression !== "string")
          return;
        if (components.length === 0) {
          const list = obj.expression.match(/const components = (\[.*?\]);\n/s)?.[1];
          components = parseJson(list) ?? [];
        }
        if (Object.keys(names).length === 0) {
          const map = obj.expression.match(/const translationsMap = (\{[^}]*\});/)?.[1];
          names = parseJson(map?.replace(/([A-Z_]+):/g, '"$1":')) ?? {};
        }
      });
      const name = (code) => names[code] ?? code;
      return new Map(components.filter((component) => typeof component.id === "string" && !component.excluded).map((component) => {
        const info = component.transformations?.allergy_info;
        return [component.id, { contains: (info?.allergy_info_contains ?? []).map(name), mayContain: (info?.allergy_info_may_contain ?? []).map(name) }];
      }));
    }
    function parseJson(text3) {
      if (!text3)
        return null;
      try {
        return JSON.parse(text3);
      } catch {
        return null;
      }
    }
    function combineAllergens(allergens) {
      return {
        contains: [...new Set(allergens.flatMap((a) => a.contains))],
        mayContain: [...new Set(allergens.flatMap((a) => a.mayContain))]
      };
    }
    function extractTimes(page) {
      const component = (0, pml_1.findPmlComponent)((0, pml_1.findNodeById)(page, "selling-group-time-and-price-section"));
      return (component ? (0, pml_1.childrenOf)(component) : []).flatMap((column) => {
        const texts = (0, pml_1.childrenOf)(column).filter((c) => c.type === "RICH_TEXT" && typeof c.markdown === "string");
        return texts.length === 2 ? [{ value: (0, pml_1.cleanMarkdown)(texts[0].markdown), label: (0, pml_1.cleanMarkdown)(texts[1].markdown) }] : [];
      });
    }
    function extractHeading(page) {
      const component = (0, pml_1.findPmlComponent)((0, pml_1.findNodeById)(page, "selling-group-details-heading"));
      const parts = component ? (0, pml_1.childrenOf)(component) : [];
      const titleIndex = parts.findIndex((n) => n.type === "CONTAINER");
      if (titleIndex < 0)
        return { tag: null, description: null };
      return { tag: markdownText(parts.slice(0, titleIndex).pop()), description: markdownText(parts[titleIndex + 1]) };
    }
    function extractSteps(page) {
      const component = (0, pml_1.findPmlComponent)((0, pml_1.findNodeById)(page, "instructions-section"));
      return (component ? (0, pml_1.childrenOf)(component) : []).flatMap((step) => {
        const text3 = (0, pml_1.childrenOf)(step).filter((c) => c.type === "RICH_TEXT" && typeof c.markdown === "string")[1];
        return text3 ? [(0, pml_1.stripColorTags)(text3.markdown)] : [];
      });
    }
    function extractStepsPortions(page) {
      const text3 = (0, pml_1.collectMarkdowns)((0, pml_1.findNodeById)(page, "instructions-portions-section"))[0];
      const portions = text3?.match(/\d+/)?.[0];
      return portions ? Number(portions) : null;
    }
    function extractRecipeNutritionRows(page) {
      const item = (0, pml_1.accordionItems)((0, pml_1.findNodeById)(page, "accordion-list")).find((i) => /voedingswaarde|nährwert|valeurs nutritionnelles/i.test((0, pml_1.collectMarkdowns)(i.header)[0] ?? ""));
      return item ? (0, pml_1.collectNutritionRows)(item.body) : [];
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
      const tiles = extractIngredientTiles(page);
      const states = extractIngredientStates(page);
      const allergens = extractAllergensByIngredient(page);
      const ingredients = recipeContext.selling_units.map((unit) => {
        const sellingUnitId = unit.selling_unit_id ?? "";
        const tile = tiles.get(unit.ingredient_id);
        const showsThisUnit = tile?.sellingUnitId === null || tile?.sellingUnitId === sellingUnitId;
        const state = states.get(unit.ingredient_id);
        const prices = state?.sellingUnits?.[sellingUnitId];
        const price = typeof prices?.price === "number" ? prices.price : null;
        const referencePrice = typeof prices?.referencePrice === "number" ? prices.referencePrice : null;
        const isAvailable = state?.isAvailable ?? unit.status === "ACTIVE";
        return {
          ingredientId: unit.ingredient_id,
          name: tile?.name ?? null,
          sellingUnitId,
          quantity: unit.quantity ?? 1,
          status: unit.status ?? "ACTIVE",
          swapType: unit.swap_type ?? null,
          checked: unit.checked ?? true,
          type: state?.ingredientType ?? "CORE",
          isAvailable,
          unavailableReason: isAvailable ? null : tile?.notice ?? null,
          brand: tile?.brand ?? null,
          imageId: showsThisUnit ? tile?.imageId ?? null : null,
          unitQuantity: showsThisUnit ? tile?.unitQuantity ?? null : null,
          neededText: tile?.neededText ?? null,
          price,
          originalPrice: price !== null && referencePrice !== null && referencePrice > price ? referencePrice : null,
          priceRanges: Array.isArray(prices?.priceRanges) && prices.priceRanges.length > 1 ? prices.priceRanges : null,
          promotionLabel: tile?.promotionLabel ?? null,
          allergens: allergens.get(unit.ingredient_id) ?? { contains: [], mayContain: [] }
        };
      });
      const selectedIngredientIds = extractDefaultSelectedIngredientIds(page) ?? new Set(ingredients.filter((i) => i.checked).map((i) => i.ingredientId));
      const times = extractTimes(page);
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
        note,
        ...extractHeading(page),
        times,
        cookingTimeMinutes: times.length > 0 ? (0, lists_1.parseMinutes)(times[0].value) : null,
        steps: extractSteps(page),
        stepsPortions: extractStepsPortions(page),
        stepsWarning: markdownText((0, pml_1.findNode)((0, pml_1.findNodeById)(page, "warning-banner"), (n) => n.type === "RICH_TEXT" && typeof n.markdown === "string") ?? void 0),
        nutritionRows: extractRecipeNutritionRows(page),
        allergens: combineAllergens([...allergens].filter(([id]) => selectedIngredientIds.has(id)).map(([, a]) => a))
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
    var product_1 = require_product();
    var recipe_1 = require_recipe();
    var lists_1 = require_lists();
    var RecipeService = class {
      constructor(http, pages) {
        this.http = http;
        this.pages = pages;
      }
      /** Fetches the cookbook home (`meals-page-root`, Fusion). */
      getRecipesPage() {
        return this.pages.getFusionPage("meals-page-root");
      }
      /**
       * Fetches the cookbook page (`cookbook-page-content`, Fusion), which lists the user's recipes
       * grouped by segment. Each recipe tile carries a `segment_type` analytics context, e.g.
       * `SAVED_RECIPES`, `USER_DEFINED_RECIPES` (the user's own recipes), `NEW_RECIPES`.
       */
      getCookbookPage() {
        return this.pages.getFusionPage("cookbook-page-content");
      }
      /**
       * Fetches the detail page of a recipe (Fusion). Recipes are "selling groups", so the page is
       * `selling-group-details-page` with the recipe id as `selling_group_id`.
       * @param {string} recipeId The recipe id (24 hex characters for catalog recipes, 32 for the user's own).
       * @param {number} [portions] Render this many portions; omit to use the app's selection.
       */
      getRecipeDetailsPage(recipeId, portions) {
        if (portions !== void 0 && (!Number.isSafeInteger(portions) || portions <= 0)) {
          throw new RangeError("Recipe portions must be a positive integer");
        }
        const query = portions === void 0 ? "" : `&portions=${portions}`;
        return this.pages.getFusionPage(`selling-group-details-page?selling_group_id=${encodeURIComponent(recipeId)}${query}`);
      }
      /**
       * Lists the user's saved recipes, as the app's saved recipes page (`saved-deep-dive-page`)
       * shows them. Use {@link getRecipe} for structured ingredients and other details.
       * Parses dynamic Fusion/PML tiles and may need updates if Picnic changes them.
       */
      async getSavedRecipes() {
        return (0, lists_1.extractRecipeTiles)(await this.pages.getFusionPage("saved-deep-dive-page-content"));
      }
      /**
       * Returns the cookbook home as the app shows it: the rows of recipes (each with its selected
       * filter pill) and the category tree, whose links open {@link getRecipeCategory} and
       * {@link getRecipeCategoryGroup}.
       */
      async getRecipeOverview() {
        return (0, lists_1.extractRecipeOverview)(await this.getRecipesPage());
      }
      /**
       * Returns the recipes of a category, from the `meals-category-page` RSC page.
       * @param {string} categoryId The `category_id` of a category link from {@link getRecipeOverview}.
       */
      async getRecipeCategory(categoryId) {
        const content = await this.pages.getRscContent(`meals-category-page?category_id=${encodeURIComponent(categoryId)}`);
        return (0, lists_1.extractRecipeCategory)(categoryId, content);
      }
      /**
       * Returns the categories of a group, from the `meals-category-group-page` RSC page.
       * @param {string} groupName The `group_name` of a group link from {@link getRecipeOverview}, e.g. "Kids".
       */
      async getRecipeCategoryGroup(groupName) {
        const content = await this.pages.getRscContent(`meals-category-group-page?group_name=${encodeURIComponent(groupName)}`);
        return (0, lists_1.extractRecipeCategoryGroup)(groupName, content);
      }
      /**
       * Returns structured catalog or user-defined recipe details at the requested
       * portions, or, when omitted, at the count Picnic renders the page with (as the
       * app shows it). If the page renders a different count than requested, refetches
       * it once so names, product ids and quantities come from the same response.
       * Products may change with the portion count. `defaultPortions` is the recipe's
       * stored count (for catalog recipes, the portions of the original recipe);
       * `portions` describes the result.
       *
       * Includes the steps, times, nutrition and allergens, and per ingredient the
       * product, prices and allergens shown on the page. Ingredient names come from
       * recipe tiles. Set `resolveIngredientNames` to true to fetch missing names from
       * product pages concurrently; otherwise they remain null. These extra requests can
       * fail the call. Quantities are selling-unit counts, not weights or volumes. The
       * image id includes its namespace.
       *
       * Parses dynamic Fusion/PML and may need updates when Picnic changes its pages.
       * The backend can briefly fail after mutations; deleted recipes fail persistently.
       * Some recipes reject particular portion counts with a page-rendering error.
       * @param {string} recipeId The selling group id of either kind of recipe.
       * @param {RecipeOptions} [options] The portions, and whether to look up missing ingredient names.
       */
      async getRecipe(recipeId, options = {}) {
        const { portions } = options;
        let details = (0, recipe_1.extractRecipeDetails)(recipeId, await this.getRecipeDetailsPage(recipeId, portions));
        if (portions !== void 0 && details.portions !== portions) {
          details = (0, recipe_1.extractRecipeDetails)(recipeId, await this.getRecipeDetailsPage(recipeId, portions));
          if (details.portions !== portions) {
            throw new Error(`Recipe ${recipeId} rendered ${details.portions} portions instead of ${portions}`);
          }
        }
        if (options.resolveIngredientNames) {
          const names = /* @__PURE__ */ new Map();
          await Promise.all(details.ingredients.map(async (ingredient) => {
            if (ingredient.name !== null || !ingredient.sellingUnitId)
              return;
            let name = names.get(ingredient.sellingUnitId);
            if (!name) {
              name = this.pages.getFusionPage((0, product_1.productDetailsPageId)(ingredient.sellingUnitId)).then(recipe_1.extractIngredientProductName);
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
        }, { includePicnicHeaders: true });
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
        }, { includePicnicHeaders: true });
      }
      /**
       * Adds a recipe's ingredients to the cart, planned for a delivery day.
       * @param {string} recipeId The recipe id.
       * @param {AddRecipeToCartOptions} [options] The delivery day and the number of portions.
       */
      addRecipeToCart(recipeId, options = {}) {
        const { dayOffset, portions } = options;
        return this.http.sendRequest("POST", `/pages/task/assign-selling-group-to-basket`, {
          payload: {
            selling_group_id: recipeId,
            ...dayOffset !== void 0 && { day_offset: dayOffset },
            ...portions !== void 0 && { portions }
          }
        }, { includePicnicHeaders: true });
      }
      /**
       * Changes the number of portions of a recipe that is in the cart.
       * @param {string} recipeId The recipe id.
       * @param {RecipePortionsInCart} planned The delivery day the recipe is planned for and the new number of portions.
       */
      updateRecipePortionsInCart(recipeId, planned) {
        const { dayOffset, portions } = planned;
        return this.http.sendRequest("POST", `/pages/task/update-selling-group-number-of-portions-task`, {
          payload: {
            selling_group_id: recipeId,
            day_offset: dayOffset,
            portions
          }
        }, { includePicnicHeaders: true });
      }
      /**
       * Removes a recipe and its ingredients from the cart.
       * @param {string} recipeId The recipe id.
       */
      removeRecipeFromCart(recipeId) {
        return this.http.sendRequest("POST", `/pages/task/remove-selling-group-from-basket`, {
          payload: {
            selling_group_id: recipeId
          }
        }, { includePicnicHeaders: true });
      }
      /**
       * Updates an ingredient of a recipe, a catalog recipe or a user defined one: change its
       * quantity, or swap the product by passing a different selling unit id. Mirrors the save button
       * of the app's ingredient editor (`selling-group-component-edit-page`). When swapping an
       * ingredient that has more than one selling unit, include each of its current selling unit ids
       * with quantity `0` next to the new selection.
       *
       * A response with `shouldUpdateCart: true` means the recipe is in the cart with a selection
       * that differs from this one; call {@link updateRecipeIngredientInCart} with the same
       * selection to update the cart.
       * @param {string} recipeId The recipe id.
       * @param {string} ingredientId The ingredient (selling group component) id.
       * @param {RecipeIngredientSelection} selection The quantities, the portions they're for and the swap type.
       */
      updateRecipeIngredient(recipeId, ingredientId, selection) {
        const { quantities, portions = 4, swapType } = selection;
        return this.http.sendRequest("POST", `/pages/task/save-selling-group-edit-task`, {
          payload: {
            requested_sellable_portions: String(portions),
            selling_group_component_id: ingredientId,
            selling_group_id: recipeId,
            selling_unit_quantity_by_id: quantities,
            swapType: swapType ?? void 0
          }
        }, { includePicnicHeaders: true });
      }
      /**
       * Puts an updated ingredient selection of a recipe that is in the cart into the cart. The app
       * calls this after {@link updateRecipeIngredient} returned `shouldUpdateCart: true`. The edit
       * task removes the replaced product from the cart; this call adds the new selection, so without
       * it the cart lacks that ingredient.
       * @param {string} recipeId The recipe id.
       * @param {string} ingredientId The ingredient (selling group component) id.
       * @param {RecipeIngredientCartSelection} selection The selected quantities, the portions they're for and the swap type.
       */
      updateRecipeIngredientInCart(recipeId, ingredientId, selection) {
        const { quantities, portions, swapType } = selection;
        return this.http.sendRequest("POST", `/pages/task/assign-sellable-component-to-day`, {
          payload: {
            component_swap_type: swapType,
            portions: String(portions),
            required_amount_by_selling_unit_id: quantities,
            selected_component_id: ingredientId,
            selling_group_id: recipeId
          }
        }, { includePicnicHeaders: true });
      }
      /**
       * Removes an ingredient from a recipe, a catalog recipe or a user defined one.
       * @param {string} recipeId The recipe id.
       * @param {string} ingredientId The ingredient (selling group component) id.
       */
      removeRecipeIngredient(recipeId, ingredientId) {
        return this.http.sendRequest("POST", `/pages/task/delete-selling-group-component`, { payload: { selling_group_component_id: ingredientId, selling_group_id: recipeId } }, { includePicnicHeaders: true });
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
        return (0, recipe_1.extractRecipes)(await this.getCookbookPage(), "USER_DEFINED_RECIPES");
      }
      /**
       * Fetches the image selection page of a user defined recipe (Fusion). Unlike most pages it
       * returns the bare page layout without the `{ script, layout }` envelope.
       */
      getUserDefinedRecipeImageSelectionPage(recipeId) {
        return this.pages.getFusionPage(`sellable-image-selection-page-root?origin=RECIPE_DETAILS&sellable_id=${encodeURIComponent(recipeId)}`);
      }
      /**
       * Returns the suggested images for a user defined recipe, from the app's image selection page
       * (`sellable-image-selection-page-root`). Pass an entry's `id` and
       * `referenceImage` to {@link selectUserDefinedRecipeImage}.
       * @param {string} recipeId The recipe id.
       */
      async getUserDefinedRecipeSuggestedImages(recipeId) {
        const page = await this.getUserDefinedRecipeImageSelectionPage(recipeId);
        return (0, recipe_1.extractSuggestedImages)(page);
      }
      /**
       * Creates a new user defined recipe.
       * Mirrors the "Lijstje opslaan" button of `user-defined-recipe-root`, which posts
       * to `create-user-defined-recipe` and receives the new `recipeId`.
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
        }, { includePicnicHeaders: true });
      }
      /**
       * Renames a user defined recipe.
       * @param {string} recipeId The recipe id.
       * @param {string} name The new name (the app limits it to 43 characters).
       */
      renameUserDefinedRecipe(recipeId, name) {
        return this.http.sendRequest("POST", `/pages/task/update-name-user-defined-recipe`, { payload: { name, selling_group_id: recipeId } }, { includePicnicHeaders: true });
      }
      /**
       * Changes the default number of portions of a user defined recipe.
       * @param {string} recipeId The recipe id.
       * @param {number} portions The new default number of portions.
       */
      updateUserDefinedRecipePortions(recipeId, portions) {
        return this.http.sendRequest("POST", `/pages/task/update-portions-user-defined-recipe`, { payload: { portions, sellable_id: recipeId } }, { includePicnicHeaders: true });
      }
      /**
       * Deletes a user defined recipe and all its ingredients.
       * The app follows this with `remove-sellable-context-from-basket` for the same
       * `sellable_id` when the recipe is in the basket; call
       * {@link removeRecipeFromCart} first if you need that behaviour.
       * @param {string} recipeId The recipe id.
       */
      deleteUserDefinedRecipe(recipeId) {
        return this.http.sendRequest("POST", `/pages/task/delete-user-defined-sellable`, { payload: { sellable_id: recipeId } }, { includePicnicHeaders: true });
      }
      /**
       * Adds a product as a new ingredient to a user defined recipe.
       * Mirrors the product tiles on the ingredient search page (`page_context=RECIPE_EDITING`).
       * @param {string} recipeId The recipe id.
       * @param {string} sellingUnitId The product (selling unit) id, e.g. `s1143210`.
       * @param {NewIngredientOptions} [options] The quantity, the portions it's for and the position in the list.
       */
      addUserDefinedRecipeIngredient(recipeId, sellingUnitId, options = {}) {
        const { quantity = 1, portions = 4, order = 0 } = options;
        return this.http.sendRequest("POST", `/pages/task/add-ingredient-task`, {
          payload: {
            order: String(order),
            quantity,
            requested_portions: String(portions),
            selling_group_id: recipeId,
            selling_unit_id: sellingUnitId
          }
        }, { includePicnicHeaders: true });
      }
      /**
       * Sets (creates or replaces) the free-text note of a user defined recipe.
       * The note is HTML as produced by the app's editor, e.g. `<p>400g pasta</p><p>Kook de pasta.</p>`.
       * The app rejects notes whose text content exceeds 5000 characters.
       * @param {string} recipeId The recipe id.
       * @param {string} note The note as HTML.
       */
      setUserDefinedRecipeNote(recipeId, note) {
        return this.http.sendRequest("POST", `/pages/task/update-selling-group-note`, { payload: { note, selling_group_id: recipeId } }, { includePicnicHeaders: true });
      }
      /**
       * Deletes the note of a user defined recipe.
       * @param {string} recipeId The recipe id.
       */
      deleteUserDefinedRecipeNote(recipeId) {
        return this.http.sendRequest("POST", `/pages/task/delete-selling-group-note-task`, { payload: { selling_group_id: recipeId } }, { includePicnicHeaders: true });
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
        return this.http.sendRequest("POST", `/user-defined-sellable/${encodeURIComponent(recipeId)}`, body, { includePicnicHeaders: true, contentType: type });
      }
      /**
       * Sets the image of a user defined recipe, either a suggested image from
       * {@link getUserDefinedRecipeSuggestedImages} or a photo uploaded with
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
        }, { includePicnicHeaders: true });
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
    var page_client_1 = require_page_client();
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
    var api_error_1 = require_api_error();
    var checkout_error_1 = require_checkout_error();
    var page_format_error_1 = require_page_format_error();
    var product_not_found_error_1 = require_product_not_found_error();
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
        const pages = new page_client_1.PageClient(this);
        this.app = new service_1.AppService(this, pages);
        this.auth = new service_2.AuthService(this);
        this.user = new service_3.UserService(this, pages);
        this.catalog = new service_4.CatalogService(this, pages);
        this.cart = new service_5.CartService(this, pages);
        this.checkout = new service_6.CheckoutService(this);
        this.delivery = new service_7.DeliveryService(this);
        this.payment = new service_8.PaymentService(this);
        this.consent = new service_9.ConsentService(this);
        this.customerService = new service_10.CustomerServiceService(this);
        this.content = new service_11.ContentService(this);
        this.recipe = new service_12.RecipeService(this, pages);
      }
    };
    PicnicClient2.PicnicApiError = api_error_1.PicnicApiError;
    PicnicClient2.isPicnicApiError = api_error_1.isPicnicApiError;
    PicnicClient2.CheckoutIssueError = checkout_error_1.CheckoutIssueError;
    PicnicClient2.isCheckoutIssueError = checkout_error_1.isCheckoutIssueError;
    PicnicClient2.UnexpectedPageFormatError = page_format_error_1.UnexpectedPageFormatError;
    PicnicClient2.isUnexpectedPageFormatError = page_format_error_1.isUnexpectedPageFormatError;
    PicnicClient2.ProductNotFoundError = product_not_found_error_1.ProductNotFoundError;
    PicnicClient2.isProductNotFoundError = product_not_found_error_1.isProductNotFoundError;
    module.exports = PicnicClient2;
  }
});

// src/server/main.ts
import { readFileSync as readFileSync2 } from "node:fs";
import { createServer } from "node:http";
import { dirname, join as join5 } from "node:path";
import { fileURLToPath } from "node:url";

// src/server/app.ts
import { createHash } from "node:crypto";
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
  // Promise<any>, as in Request.json() and Next.js: the copied picnic-web routes are written against that.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

// vendor/picnic-web/src/lib/core/types.ts
var SUPPORTED_COUNTRY_CODES = ["NL", "DE", "FR"];
var DEFAULT_COUNTRY_CODE = "NL";
var COUNTRY_COOKIE_NAME = "picnic_country";
function getImageCdnBase(countryCode) {
  return `https://storefront-prod.${countryCode.toLowerCase()}.picnicinternational.com/static/images`;
}

// vendor/picnic-web/src/lib/core/picnic-client.ts
var PicnicClient = require_lib();
var isPicnicApiError = PicnicClient.isPicnicApiError;
async function getFusionPage(client, pageId) {
  const page = await client.app.getPage(pageId);
  if (page.format !== "fusion") throw new PicnicClient.UnexpectedPageFormatError(pageId, "rsc");
  return page.page;
}
async function getRscPageContent(client, pageId) {
  const page = await client.app.getPage(pageId);
  if (page.format !== "rsc") throw new PicnicClient.UnexpectedPageFormatError(pageId, "fusion");
  return page.content;
}
var isProductNotFoundError = PicnicClient.isProductNotFoundError;
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

// vendor/picnic-web/src/lib/core/api-error.ts
var OTP_NOT_VALID = "OTP_NOT_VALID";
function isUpstreamBlockError(error2) {
  return isPicnicApiError(error2) && /<html[\s>]/i.test(error2.body);
}
function isApiAuthError(error2) {
  return isPicnicApiError(error2) && (error2.status === 401 || error2.status === 403) && !isUpstreamBlockError(error2);
}
function is2FAError(error2) {
  return isPicnicApiError(error2) && error2.code === OTP_NOT_VALID || isApiAuthError(error2);
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

// vendor/picnic-web/src/lib/recipe/map-recipe-details.ts
var DEFAULT_MAX_COUNT = 99;
var ALLERGEN_CONFIRMED_BG = "#fef3c7";
var ALLERGEN_CONFIRMED_TEXT = "#92400e";
var ALLERGEN_MAY_CONTAIN_BG = "#f3f4f6";
var ALLERGEN_MAY_CONTAIN_TEXT = "#4b5563";
function mapAllergens(allergens) {
  return {
    confirmed: allergens.contains.map((text3) => ({
      text: text3,
      backgroundColor: ALLERGEN_CONFIRMED_BG,
      textColor: ALLERGEN_CONFIRMED_TEXT
    })),
    mayContain: allergens.mayContain.map((text3) => ({
      text: text3,
      backgroundColor: ALLERGEN_MAY_CONTAIN_BG,
      textColor: ALLERGEN_MAY_CONTAIN_TEXT
    }))
  };
}
function mapIngredients(recipe) {
  const seen = /* @__PURE__ */ new Set();
  return recipe.ingredients.flatMap((ingredient) => {
    if (ingredient.status !== "ACTIVE" || !ingredient.sellingUnitId) return [];
    if (seen.has(ingredient.ingredientId)) return [];
    seen.add(ingredient.ingredientId);
    return [
      {
        id: ingredient.sellingUnitId,
        ingredientId: ingredient.ingredientId,
        name: ingredient.name ?? "",
        imageId: ingredient.imageId,
        displayPrice: ingredient.price ?? 0,
        unitQuantity: ingredient.unitQuantity ?? "",
        maxCount: DEFAULT_MAX_COUNT,
        quantity: ingredient.quantity,
        isCondiment: !ingredient.checked,
        recipeQuantityText: ingredient.neededText,
        originalPrice: ingredient.originalPrice,
        priceRanges: ingredient.priceRanges?.map((tier) => ({
          quantity: tier.from_quantity,
          pricePerUnit: tier.price
        })) ?? null
      }
    ];
  });
}
function mapRecipeDetails(recipe) {
  return {
    id: recipe.id,
    name: recipe.name || recipe.id,
    imageId: recipe.imageId,
    cookingTimeMinutes: recipe.cookingTimeMinutes,
    portions: recipe.portions,
    ingredients: mapIngredients(recipe),
    steps: recipe.steps,
    stepsPortionWarning: recipe.stepsWarning,
    recipeNutritionRows: recipe.nutritionRows,
    allergens: mapAllergens(recipe.allergens)
  };
}

// src/shared/recipe-price.ts
function packs(ingredient, portions, basePortions) {
  if (basePortions <= 0) return Math.max(1, ingredient.quantity);
  return Math.max(1, Math.ceil(ingredient.quantity * portions / basePortions));
}
function packsPrice(ingredient, count2) {
  const tier = ingredient.priceRanges?.filter((t) => t.quantity <= count2).at(-1);
  const unit = tier ? tier.pricePerUnit : ingredient.displayPrice;
  const total = unit * count2;
  const regular = tier ? ingredient.displayPrice * count2 : ingredient.originalPrice !== null ? ingredient.originalPrice * count2 : null;
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
    quantityBadges: product.unitQuantity === "1 kg" ? [{ text: "XL", textColor: "#ffffff", backgroundColor: "#295813" }] : [],
    unitQuantity: product.unitQuantity,
    unitPrice: `€${(product.displayPrice / 100 * 1.5).toFixed(2).replace(".", ",")}/kg`,
    tags: [{ text: product.category[0].toUpperCase() + product.category.slice(1), color: "#295813" }],
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
      { id: "22001", name: "Brood", imageId: img("cat-brood") },
      { id: "22002", name: "Croissants & koffiebroodjes", imageId: img("cat-croissant") }
    ]
  },
  {
    id: "21002",
    name: "Vegetarisch & vegan",
    children: [
      { id: "22003", name: "Tofu & tempeh", imageId: img("cat-tofu") },
      { id: "22004", name: "Plantaardige zuivel", imageId: img("cat-plantmelk") }
    ]
  },
  {
    id: "21003",
    name: "Groente & fruit",
    children: [
      { id: "22005", name: "Groente", imageId: img("cat-groente") },
      { id: "22006", name: "Fruit", imageId: img("cat-fruit") }
    ]
  },
  {
    id: "21004",
    name: "Zuivel & kaas",
    children: [{ id: "22007", name: "Melk & yoghurt", imageId: img("cat-zuivel") }]
  },
  {
    id: "21005",
    name: "Voorraadkast",
    children: [
      { id: "22008", name: "Pasta, rijst & wereldkeuken", imageId: img("cat-pasta") },
      { id: "22009", name: "Koffie", imageId: img("cat-koffie") }
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
        refusedBy: this.desk.listDecides ? "list" : "owner",
        you: user?.name || null,
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
      refusedBy: null,
      you: null,
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
          recipe = mapRecipeDetails(await client.recipe.getRecipe(id, { resolveIngredientNames: false }));
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
      if (!this.desk.options.ingressOnly) return "anyone who can reach the app (not running under Home Assistant)";
      if (this.desk.listDecides) return `only ${this.desk.allowedUsers.join(", ")} (allowed_users)`;
      if (!owner) {
        throw new Error(
          "anyone in Home Assistant: this sign-in is not tied to a Home Assistant user. Sign out and in again to tie it to you, or name who may use it under allowed_users."
        );
      }
      return `${owner.displayName || owner.name} only (who signed in; allowed_users is empty)`;
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
      const count2 = days.reduce((n, d) => n + d.greenSlots.length + d.regularSlots.length, 0);
      return `${count2} slots over ${days.length} days`;
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
        content = await client.sendRequest("GET", `/pages/${page}`, null, { includePicnicHeaders: true });
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
    const etag = `"${createHash("sha256").update(data).digest("base64url").slice(0, 22)}"`;
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
  /** The user names in `allowed_users`, in lower case. */
  get allowedUsers() {
    return (this.options.allowedUsers ?? []).map((name) => name.trim().toLowerCase()).filter(Boolean);
  }
  /**
   * Whether `allowed_users` alone decides who may use the app. Under Home
   * Assistant, a list that names anyone does: the app shows in every user's
   * sidebar (non-admin accounts can only open it that way), so only the
   * listed users may use it, signing in included, and nobody else, an
   * administrator or the person who signed in neither.
   */
  get listDecides() {
    return Boolean(this.options.ingressOnly) && this.allowedUsers.length > 0;
  }
  /**
   * With `allowed_users` set, only the users it names (see `listDecides`).
   * Without it, the Picnic account belongs to the Home Assistant user who
   * signed in to it here; signing in is open to everyone, and a session from
   * before this rule, or a request Home Assistant did not name a user for, is
   * not restricted.
   */
  mayUse(user) {
    if (this.listDecides) return user !== null && user.name !== "" && this.allowedUsers.includes(user.name.toLowerCase());
    const owner = this.session.owner;
    if (!this.session.signedIn || !owner || !user) return true;
    return user.id === owner.id;
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
    let value;
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
var PICNIC_HOST = /^(storefront|pages)-prod\.(nl|de|fr)\.picnicinternational\.com$/;
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
function formatEtaText(etaMs, countryCode) {
  if (etaMs === null || etaMs <= 0) return null;
  const eta = new Date(etaMs);
  const time = formatTime(eta);
  if (countryCode === "DE") return `Ankunft ca. ${time}`;
  if (countryCode === "FR") return `Arrivée vers ${time}`;
  return `Aankomst rond ${time}`;
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
        return deliveriesGet(state, segments, q);
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
      case "GET promotions":
        return segments[1] ? promotionGroup(segments[1]) : ok(promotions());
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
        modulePath: "./logical-components/sections/vertical-list/vertical-list.tsx",
        children: [],
        props: {
          items: [
            row("Acties", img("cat-acties"), "app.picnic://store/page;id=promo-page-root", "12 producten"),
            { type: "section-title", title: "Alle categorieën" },
            ...L1_CATEGORIES.map(
              (c) => row(c.name, img(`l1-${c.id}`), `app.picnic://store/page;id=subcategory-page,category_id=${c.id}`)
            )
          ]
        }
      }
    ]
  };
}
function promotions() {
  const offers = PRODUCTS.filter((p) => p.promoBadge).map(plainProduct);
  const tiers = PRODUCTS.filter((p) => p.priceRanges).map(plainProduct);
  return {
    sections: [
      {
        title: "Acties",
        products: offers,
        groups: [{ id: "demo-koffie", name: "Koffie van Lavazza", example: "Koffiebonen espresso", label: "18% korting" }]
      },
      { title: "Meer voor minder", products: tiers, groups: [] }
    ]
  };
}
function promotionGroup(id) {
  if (id !== "demo-koffie") return fail("Failed to load the promotion. Please try again later.", 502);
  return ok({
    name: "Koffie van Lavazza",
    products: PRODUCTS.filter((p) => p.category === "koffie").map(plainProduct)
  });
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
function addLine(state, productId, count2, group = null) {
  const line = state.lines.find((l) => l.productId === productId);
  if (line) {
    line.quantity += count2;
    if (group && !line.group) line.group = group;
  } else {
    state.lines.push({ productId, quantity: count2, group });
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
  const make = (id, status, offset, total, count2) => ({
    id,
    status: state.cancelled.has(id) ? "CANCELLED" : status,
    creationTime: at(offset - 2, 12),
    windowStart: at(offset, 17),
    windowEnd: at(offset, 18),
    deliveryWindowText: formatDeliveryWindowText(at(offset, 17), at(offset, 18), "NL"),
    orderCount: 1,
    totalPrice: total,
    itemCount: count2
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
function deliveriesGet(state, segments, q) {
  const status = q.get("status");
  if (segments.length === 1) {
    const all = deliveryList(state);
    return ok({ deliveries: status ? all.filter((d) => d.status === status) : all });
  }
  const id = segments[1];
  const detail = deliveryDetail(state, id);
  if (!detail) return fail("Failed to load delivery. Please try again later.", 502);
  const base = state.now();
  const position = {
    routeVersion: 1,
    inProgress: detail.status === "CURRENT",
    queryInterval: 15e3,
    eta: base + 20 * 6e4,
    etaWindowStart: new Date(base + 15 * 6e4).toISOString(),
    etaWindowEnd: new Date(base + 25 * 6e4).toISOString(),
    routeTime: base - 6e4
  };
  if (segments[2] === "position") return ok(position);
  if (segments[2] === "tracking") {
    const route = Array.from({ length: 12 }, (_, i) => ({ lat: 52.37 + i * 2e-3, lng: 4.88 + i * 3e-3, ts: base - (11 - i) * 6e4 }));
    const known = q.get("routeVersion") === String(position.routeVersion);
    return ok({
      routeVersion: position.routeVersion,
      scenarioInProgress: position.inProgress,
      queryInterval: position.queryInterval,
      eta: position.eta,
      etaWindowStart: position.etaWindowStart,
      etaWindowEnd: position.etaWindowEnd,
      etaText: formatEtaText(position.eta, "NL"),
      currentPosition: route[10],
      // Left out when the caller has this version already, as picnic-web does.
      route: known ? [] : route,
      driverName: "Sam",
      driverPhotoUrl: null,
      vehicleName: "Elektrisch busje",
      vehicleImageDataUrl: null,
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
    if (result.secondFactorAuthenticationRequired) {
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
  // Discover placeholder
  discoverTitle: "Entdecken",
  // Favorites
  favoritesTitle: "Favoriten",
  favoritesLoadError: "Favoriten konnten nicht geladen werden.",
  favoritesEmpty: "Noch keine Favoriten. Produkte, die du bestellst, erscheinen hier.",
  favoritesShowAll: "Alle anzeigen",
  // Promotions
  promotionsTitle: "Angebote",
  promotionsLoadError: "Angebote konnten nicht geladen werden.",
  promotionsEmpty: "Zurzeit gibt es keine Angebote.",
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
  // Discover placeholder
  discoverTitle: "Découvrir",
  // Favorites
  favoritesTitle: "Favoris",
  favoritesLoadError: "Impossible de charger les favoris.",
  favoritesEmpty: "Pas encore de favoris. Les produits que vous commandez apparaîtront ici.",
  favoritesShowAll: "Tout afficher",
  // Promotions
  promotionsTitle: "Promotions",
  promotionsLoadError: "Impossible de charger les promotions.",
  promotionsEmpty: "Aucune promotion pour le moment.",
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
  // Discover placeholder
  discoverTitle: "Ontdek",
  // Favorites
  favoritesTitle: "Favorieten",
  favoritesLoadError: "Favorieten konden niet worden geladen.",
  favoritesEmpty: "Nog geen favorieten. Producten die je bestelt verschijnen hier.",
  favoritesShowAll: "Toon alles",
  // Promotions
  promotionsTitle: "Aanbiedingen",
  promotionsLoadError: "Aanbiedingen konden niet worden geladen.",
  promotionsEmpty: "Er zijn nu geen aanbiedingen.",
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

// vendor/picnic-web/src/lib/cart/map-cart.ts
function mapBadges(line) {
  return [
    ...line.labels.map(
      (label) => ({
        text: label.text,
        variant: label.text.toLowerCase().includes("bundel") ? "bundle" : "promo",
        backgroundColor: label.backgroundColor ?? void 0,
        textColor: label.textColor ?? void 0
      })
    ),
    ...line.freshness ? [{ text: line.freshness, variant: "freshness" }] : [],
    ...line.basePrice ? [{ text: line.basePrice, variant: "unit-price" }] : [],
    ...line.bundlesLink ? [{ text: "BundelBonus", variant: "bundle" }] : []
  ];
}
function mapCartLine(line) {
  return {
    id: line.id,
    productId: line.productId,
    name: line.name,
    unitQuantity: line.unitQuantity,
    imageId: line.imageId ?? "",
    displayPrice: line.displayPrice,
    originalPrice: line.originalPrice,
    quantity: line.quantity,
    maxCount: line.maxCount,
    badges: mapBadges(line),
    isUnavailable: line.isUnavailable,
    unavailableExplanation: line.unavailableReason,
    basketGroupId: line.recipeId
  };
}
function mapCart(cart2, countryCode) {
  const items = cart2.items.map(mapCartLine).sort((a, b) => Number(a.isUnavailable) - Number(b.isUnavailable));
  const slot2 = cart2.selectedSlot;
  const deliveryBannerText = (slot2?.isExplicitSelection ? formatBannerText(slot2.windowStart, slot2.windowEnd, countryCode) : null) ?? getTranslations(countryCode).pickerTitle;
  return {
    items,
    totalPrice: cart2.totalPrice,
    totalCount: cart2.totalCount,
    totalDiscount: cart2.discount,
    depositTotal: cart2.depositTotal,
    depositBreakdown: cart2.deposits,
    membershipSavings: cart2.membershipSavings,
    promoSavings: cart2.promotionSavings,
    fees: cart2.fees,
    minimumOrderValue: cart2.minimumOrderValue,
    selectedSlot: slot2,
    deliveryBannerText,
    recipeGroups: cart2.recipes.map((recipe) => ({
      id: recipe.id,
      title: recipe.title,
      imageId: recipe.imageId
    }))
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
    const cartData = mapCart(await client.cart.getCart(), countryCode);
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
    const cartData = mapCart(await client.cart.clearCart(), countryCode);
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
  try {
    const client = buildPicnicClient(token, countryCode);
    const cart2 = body.action === "add" ? await client.cart.addProductToCart(body.productId, body.count) : await client.cart.removeProductFromCart(body.productId, body.count);
    const cartData = mapCart(cart2, countryCode);
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
    await client.checkout.cancelCheckout(transactionId);
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
      const status = await client.checkout.getCheckoutStatus(transactionId);
      if (status.checkout_status !== "FINISHED") {
        return NextResponse.json(
          { error: "Payment not completed yet. Cannot confirm order." },
          { status: 409 }
        );
      }
    }
    const confirmation = await client.checkout.confirmOrder(orderId);
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
    const raw = await client.checkout.initiatePayment(orderId, returnUrl);
    const redirectUrl = raw.action?.redirect_url ?? raw.issuer_authentication_url ?? "";
    if (!redirectUrl) {
      return NextResponse.json(
        { error: "Payment redirect URL missing from Picnic response" },
        { status: 502 }
      );
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

// vendor/picnic-web/src/lib/checkout/map-checkout.ts
function mapCheckoutStart(result) {
  return {
    orderId: result.order_id,
    totalPrice: result.total_price,
    totalCount: result.total_count,
    totalDeposit: result.total_deposit,
    totalSavings: result.total_savings,
    transactionExpiry: result.transaction_expiry
  };
}
function mapPaymentProfile(profile) {
  return {
    preferredPaymentOptionId: profile.preferred_payment_option_id,
    storedOptions: (profile.stored_payment_options ?? []).map((option) => ({
      id: option.id,
      displayName: option.display_name,
      account: option.account || null,
      paymentMethod: option.payment_method,
      iconUrl: option.icon_url
    }))
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
    return NextResponse.json(mapPaymentProfile(await client.payment.getPaymentProfile()));
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
    const result = await client.checkout.startCheckout({ mts, resolveKey });
    return NextResponse.json(mapCheckoutStart(result));
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
    return NextResponse.json(
      { error: "Failed to start checkout. Please try again later." },
      { status: 502 }
    );
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
    const raw = await client.checkout.getCheckoutStatus(transactionId);
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
function buildSlotPicker(slots2, countryCode) {
  return {
    dayGroups: groupSlotsByDay(slots2.slots, countryCode),
    selectedSlot: slots2.selectedSlot
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
    const slots2 = await client.cart.getDeliverySlots();
    const pickerData = buildSlotPicker(slots2, countryCode);
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
    const cartData = mapCart(await client.cart.setDeliverySlot(body.slotId), countryCode);
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
    return NextResponse.json(await client.cart.getCartFooter());
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

// vendor/picnic-web/src/lib/category/map-categories.ts
var PROMOTIONS_PREFIX = "promotions-";
function mapSubcategories(subcategories) {
  return subcategories.links.flatMap((link) => {
    const imageId = link.imageId ?? "";
    if (link.target.type === "products")
      return [{ id: link.target.categoryId, name: link.name, imageId }];
    if (link.target.type === "promotions") {
      return [{ id: `${PROMOTIONS_PREFIX}${link.target.categoryId}`, name: link.name, imageId }];
    }
    return [];
  });
}

// vendor/picnic-web/src/lib/product/map-product-tile.ts
var DEFAULT_MAX_COUNT2 = 99;
var PROMO_LABEL_TYPES = /* @__PURE__ */ new Set(["PROMO", "PROMOBOX_PROMO"]);
var PROMO_BACKGROUND_TOKEN = "YELLOW2";
var PROMO_TEXT_TOKEN = "GREY5";
var PROMO_BACKGROUND_FALLBACK = "#fbd92b";
var PROMO_TEXT_FALLBACK = "#333333";
function mapProductTile(tile, tokens = {}) {
  if (!tile.imageId) return null;
  const promoText = tile.labels.find(
    (label) => label.type && PROMO_LABEL_TYPES.has(label.type)
  )?.text;
  return {
    id: tile.id,
    name: tile.name,
    namePrefix: tile.namePrefix,
    // The quality cue ("Op basis van doperwten") is the line above the name,
    // the brand ("Johma") the line below it.
    subtitle: tile.qualityCue,
    subtitleColor: null,
    subtitleLeadingIcon: null,
    subtitleTrailingIcon: null,
    brand: tile.brand,
    highlight: null,
    flagIconKey: null,
    flagFallbackImageId: null,
    imageId: tile.imageId,
    displayPrice: tile.displayPrice,
    originalPrice: tile.originalPrice,
    displayPriceColor: null,
    unitQuantity: tile.unitQuantity,
    maxCount: DEFAULT_MAX_COUNT2,
    priceRanges: mapPriceRanges(tile.priceRanges),
    badges: [],
    promoBadge: promoText ? buildPromoBadge(promoText, tokens) : null,
    promoPlacement: promoText ? "image" : null,
    isUnavailable: tile.isUnavailable,
    unavailableReason: null
  };
}
function mapProductTiles(value, tokens = {}) {
  return (Array.isArray(value) ? value : []).flatMap((tile) => {
    const product = isProductTile(tile) ? mapProductTile(tile, tokens) : null;
    return product ? [product] : [];
  });
}
function mapProductSections(sections, tokens = {}) {
  const products = /* @__PURE__ */ new Map();
  const mapped = [];
  for (const section of sections) {
    const sectionProducts = mapProductTiles(section.products, tokens);
    for (const product of sectionProducts) {
      if (!products.has(product.id)) products.set(product.id, product);
    }
    if (sectionProducts.length > 0) {
      mapped.push({ title: section.title ?? "", products: sectionProducts });
    }
  }
  return { products: [...products.values()], sections: mapped };
}
function mapSearchSections(results) {
  return mapProductSections(results?.sections ?? []);
}
function mapPromotionsSections(promotions2) {
  return promotions2.sections.map((section) => ({
    title: section.title,
    products: mapProductTiles(section.products),
    groups: section.groups
  })).filter((section) => section.products.length > 0 || section.groups.length > 0);
}
function mapFavoritesAisles(favorites) {
  return favorites.aisles.map((aisle) => ({
    id: aisle.id,
    title: aisle.title,
    products: mapProductTiles(aisle.products),
    complete: aisle.complete
  }));
}
function isProductTile(value) {
  return typeof value === "object" && value !== null && typeof value.id === "string" && Array.isArray(value.labels);
}
function mapPriceRanges(ranges) {
  if (!ranges || ranges.length === 0) return null;
  return ranges.map((range) => ({ quantity: range.from_quantity, pricePerUnit: range.price }));
}
function buildPromoBadge(text3, tokens) {
  return {
    text: text3,
    variant: "promo",
    backgroundColor: tokens[PROMO_BACKGROUND_TOKEN] ?? PROMO_BACKGROUND_FALLBACK,
    textColor: tokens[PROMO_TEXT_TOKEN] ?? PROMO_TEXT_FALLBACK
  };
}

// vendor/picnic-web/src/app/api/categories/[categoryId]/products/route.ts
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
    const page = categoryId.startsWith(PROMOTIONS_PREFIX) ? await client.catalog.getCategoryPromotions(categoryId.slice(PROMOTIONS_PREFIX.length)) : await client.catalog.getCategoryProducts(categoryId);
    const { sections, products } = mapSearchSections(page.results);
    return NextResponse.json({ title: page.title || null, products, sections });
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
    const page = await client.catalog.getSubcategories(categoryId);
    return NextResponse.json({
      title: page.title || categoryId,
      subcategories: mapSubcategories(page)
    });
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

// vendor/picnic-web/src/lib/core/constants.ts
var MEAL_PLAN_MAX_CANDIDATES = 40;
var RECIPE_PAGE_CONCURRENCY = 5;
var MEAL_PLAN_RECIPE_CONCURRENCY = 3;

// vendor/picnic-web/src/lib/core/page-cache.ts
import { createHash as createHash2 } from "node:crypto";
var cache = /* @__PURE__ */ new Map();
var PAGE_CACHE_TTL_MS = 10 * 60 * 1e3;
var MAX_ENTRIES = 500;
function scopedCacheKey(client, path) {
  const scoped = client;
  const token = scoped.authKey ?? "";
  const scope = createHash2("sha256").update(token).digest("hex").slice(0, 16);
  return `${scoped.countryCode ?? ""}:${scope}:${path}`;
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
function cachedCall(client, name, call, ttlMs = PAGE_CACHE_TTL_MS) {
  const key = scopedCacheKey(client, name);
  const hit = cache.get(key);
  if (hit && hit.expiresAt > Date.now()) return hit.promise;
  const promise = call();
  evictIfFull();
  cache.set(key, { promise, expiresAt: Date.now() + ttlMs });
  promise.catch(() => {
    if (cache.get(key)?.promise === promise) cache.delete(key);
  });
  return promise;
}

// vendor/picnic-web/src/lib/recipe/fetch-recipe-lists.ts
var SAVED_CATEGORY_ID = "__saved__";
var CATEGORY_KEY_RE = /^category:[\w-]{1,80}$|^group:[^/?#]{1,80}$/;
var categoryKey = (link) => `${link.type}:${link.id}`;
function mapRecipe(recipe) {
  return {
    id: recipe.id,
    name: recipe.name,
    imageId: recipe.imageId,
    cookingTimeMinutes: recipe.cookingTimeMinutes
  };
}
function uniqueRecipes(recipes) {
  const seen = /* @__PURE__ */ new Set();
  return recipes.flatMap((recipe) => {
    if (seen.has(recipe.id)) return [];
    seen.add(recipe.id);
    return [mapRecipe(recipe)];
  });
}
async function fetchRecipeOverview(client) {
  const overview = await cachedCall(
    client,
    "recipes:overview",
    () => client.recipe.getRecipeOverview()
  );
  const links = overview.categorySections.flatMap((section) => section.categories);
  const seen = /* @__PURE__ */ new Set();
  return {
    recipes: uniqueRecipes(overview.sections.flatMap((section) => section.recipes)),
    categories: links.flatMap((link) => {
      const id = categoryKey(link);
      if (seen.has(id)) return [];
      seen.add(id);
      return [{ id, name: link.name }];
    })
  };
}
async function fetchSavedRecipes(client) {
  return (await client.recipe.getSavedRecipes()).map(mapRecipe);
}
function fetchCategory(client, categoryId) {
  return cachedCall(
    client,
    `recipes:category:${categoryId}`,
    () => client.recipe.getRecipeCategory(categoryId).then((category) => category.recipes)
  );
}
async function fetchCategoryRecipes(client, key, concurrency = RECIPE_PAGE_CONCURRENCY) {
  const separator = key.indexOf(":");
  const type = key.slice(0, separator);
  const id = key.slice(separator + 1);
  if (type === "category") return uniqueRecipes(await fetchCategory(client, id));
  const group = await cachedCall(
    client,
    `recipes:group:${id}`,
    () => client.recipe.getRecipeCategoryGroup(id)
  );
  const categories = group.categories.filter((link) => link.type === "category");
  const lists = await mapWithConcurrency(
    categories,
    (link) => fetchCategory(client, link.id),
    concurrency
  );
  return uniqueRecipes(lists.flat());
}

// vendor/picnic-web/src/app/api/cookbook/route.ts
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
    if (categoryId === SAVED_CATEGORY_ID) {
      const recipes = await fetchSavedRecipes(client);
      return NextResponse.json({ categories: [], recipes });
    }
    if (categoryId) {
      if (!CATEGORY_KEY_RE.test(categoryId)) {
        return NextResponse.json({ error: "Invalid category ID" }, { status: 400 });
      }
      const recipes = await fetchCategoryRecipes(client, categoryId);
      return NextResponse.json({ categories: [], recipes });
    }
    return NextResponse.json(await fetchRecipeOverview(client));
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
async function count(name, recipes) {
  try {
    return (await recipes()).length;
  } catch (err) {
    console.error(`[cookbook/counts] Failed to fetch count for "${name}":`, err);
    return 0;
  }
}
async function fetchCounts(client) {
  const overview = await fetchRecipeOverview(client);
  const [savedCount, ...categoryCounts] = await mapWithConcurrency(
    [SAVED_CATEGORY_ID, ...overview.categories.map((category) => category.id)],
    (id) => count(
      id,
      () => id === SAVED_CATEGORY_ID ? fetchSavedRecipes(client) : fetchCategoryRecipes(client, id, 1)
    ),
    RECIPE_PAGE_CONCURRENCY
  );
  return {
    __featured__: overview.recipes.length,
    [SAVED_CATEGORY_ID]: savedCount,
    ...Object.fromEntries(
      overview.categories.map((category, i) => [category.id, categoryCounts[i]])
    )
  };
}
async function GET9(request) {
  const token = readAuthToken(request);
  if (!token) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }
  const countryCode = readCountryCode(request);
  const cacheKey = `${countryCode}:${crypto.createHash("sha256").update(token).digest("hex").slice(0, 16)}`;
  const cached = cache2.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return NextResponse.json(cached.counts);
  }
  try {
    const counts = await fetchCounts(buildPicnicClient(token, countryCode));
    const total = Object.values(counts).reduce((sum, n) => sum + n, 0);
    if (total > 0) {
      cache2.set(cacheKey, { counts, expiresAt: Date.now() + CACHE_TTL_MS });
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
var COOKING_TIME_PATTERN = /^(\d+)\s*min/;
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
    const results = await client.catalog.getSearchResults(q, { context: "MEALS" });
    const recipes = results.recipes.map((recipe) => {
      const minutes = recipe.tags.map((tag) => COOKING_TIME_PATTERN.exec(tag)?.[1]).find(Boolean);
      return {
        id: recipe.id,
        name: recipe.name,
        imageId: recipe.imageId,
        cookingTimeMinutes: minutes ? Number(minutes) : null
      };
    });
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

// vendor/picnic-web/src/app/api/deliveries/route.ts
var route_exports19 = {};
__export(route_exports19, {
  GET: () => GET11
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
async function GET11(request) {
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
var route_exports20 = {};
__export(route_exports20, {
  GET: () => GET12
});

// vendor/picnic-web/src/lib/delivery/map-delivery.ts
function mapDelivery(delivery, countryCode) {
  return {
    id: delivery.id,
    status: delivery.status,
    creationTime: delivery.creationTime,
    windowStart: delivery.windowStart,
    windowEnd: delivery.windowEnd,
    deliveryWindowText: formatDeliveryWindowText(
      delivery.windowStart,
      delivery.windowEnd,
      countryCode
    ),
    orders: delivery.orders.map((order) => ({
      id: order.id,
      items: order.items.map(mapCartLine),
      totalPrice: order.totalPrice,
      checkoutTotalPrice: order.checkoutTotalPrice,
      totalSavings: order.promotionSavings,
      totalDeposit: order.depositTotal,
      membershipSavings: order.membershipSavings,
      cancellable: order.cancellable,
      status: order.status,
      creationTime: order.creationTime,
      fees: order.fees,
      depositBreakdown: order.deposits,
      payment: order.payment && {
        paymentType: order.payment.paymentType ?? "",
        redactedIban: order.payment.redactedIban ?? "",
        bankId: order.payment.bankId ?? ""
      }
    })),
    returnedContainers: delivery.returnedContainers,
    totalPrice: delivery.totalPrice,
    totalCount: delivery.totalCount,
    totalDiscount: delivery.discount,
    depositTotal: delivery.depositTotal,
    depositBreakdown: delivery.deposits,
    membershipSavings: delivery.membershipSavings,
    promoSavings: delivery.promotionSavings,
    fees: delivery.fees,
    cancellable: delivery.cancellable
  };
}
function mapDeliveryTracking(tracking, countryCode) {
  return {
    routeVersion: tracking.routeVersion,
    scenarioInProgress: tracking.inProgress,
    queryInterval: tracking.queryInterval,
    eta: tracking.eta,
    etaWindowStart: tracking.etaWindowStart,
    etaWindowEnd: tracking.etaWindowEnd,
    etaText: formatEtaText(tracking.eta, countryCode),
    currentPosition: tracking.currentPosition,
    route: tracking.route.points,
    driverName: tracking.route.driverName,
    driverPhotoUrl: tracking.route.driverPhotoUrl,
    vehicleName: tracking.route.vehicleName,
    vehicleImageDataUrl: tracking.route.vehicleImageDataUrl,
    destination: tracking.route.destination
  };
}

// vendor/picnic-web/src/app/api/deliveries/[deliveryId]/route.ts
async function GET12(request, { params }) {
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
    const delivery = mapDelivery(await client.delivery.getDelivery(deliveryId), countryCode);
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
var route_exports21 = {};
__export(route_exports21, {
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
var route_exports22 = {};
__export(route_exports22, {
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
var route_exports23 = {};
__export(route_exports23, {
  GET: () => GET13
});
async function GET13(request, { params }) {
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
var route_exports24 = {};
__export(route_exports24, {
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

// vendor/picnic-web/src/app/api/deliveries/[deliveryId]/tracking/route.ts
var route_exports25 = {};
__export(route_exports25, {
  GET: () => GET14
});
var MAX_KNOWN_ROUTES = 200;
var knownRoutes = /* @__PURE__ */ new Map();
async function GET14(request, { params }) {
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
    const countryCode = readCountryCode(request);
    const client = buildPicnicClient(token, countryCode);
    const routeKey = scopedCacheKey(client, `delivery-route:${deliveryId}`);
    const result = await client.delivery.getDeliveryTracking(deliveryId, knownRoutes.get(routeKey));
    if (knownRoutes.size >= MAX_KNOWN_ROUTES) knownRoutes.clear();
    knownRoutes.set(routeKey, result.route);
    const tracking = mapDeliveryTracking(result, countryCode);
    const knownVersion = request.nextUrl.searchParams.get("routeVersion");
    return NextResponse.json(
      knownVersion === String(tracking.routeVersion) ? { ...tracking, route: [], vehicleImageDataUrl: null } : tracking
    );
  } catch (error2) {
    if (isApiAuthError(error2)) {
      return NextResponse.json(
        { error: "Your token has expired", code: "TOKEN_EXPIRED" },
        { status: 401 }
      );
    }
    const message = error2 instanceof Error ? error2.message : "Unknown error occurred";
    console.error(`[/api/deliveries/${deliveryId}/tracking] Failed:`, message);
    return NextResponse.json(
      { error: "Failed to load delivery tracking. Please try again later." },
      { status: 502 }
    );
  }
}

// vendor/picnic-web/src/app/api/favorites/route.ts
var route_exports26 = {};
__export(route_exports26, {
  GET: () => GET15
});
async function GET15(request) {
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
    const favorites = await client.catalog.getFavorites();
    return NextResponse.json({ aisles: mapFavoritesAisles(favorites) });
  } catch (error2) {
    if (isApiAuthError(error2)) {
      return NextResponse.json(
        { error: "Your token has expired", code: "TOKEN_EXPIRED" },
        { status: 401 }
      );
    }
    const message = error2 instanceof Error ? error2.message : "Unknown error occurred";
    console.error("[/api/favorites] Failed to load favorites:", message);
    return NextResponse.json(
      { error: "Failed to load favorites. Please try again later." },
      { status: 502 }
    );
  }
}

// vendor/picnic-web/src/app/api/favorites/[aisleId]/route.ts
var route_exports27 = {};
__export(route_exports27, {
  GET: () => GET16
});
async function GET16(request, { params }) {
  const token = readAuthToken(request);
  if (!token) {
    return NextResponse.json(
      { error: "Authentication required", code: "TOKEN_EXPIRED" },
      { status: 401 }
    );
  }
  const countryCode = readCountryCode(request);
  const { aisleId } = await params;
  try {
    const client = buildPicnicClient(token, countryCode);
    const tiles = await client.catalog.getFavoritesInAisle(aisleId);
    return NextResponse.json({ products: mapProductTiles(tiles) });
  } catch (error2) {
    if (isApiAuthError(error2)) {
      return NextResponse.json(
        { error: "Your token has expired", code: "TOKEN_EXPIRED" },
        { status: 401 }
      );
    }
    const message = error2 instanceof Error ? error2.message : "Unknown error occurred";
    console.error(`[/api/favorites/${aisleId}] Failed to load the aisle:`, message);
    return NextResponse.json(
      { error: "Failed to load favorites. Please try again later." },
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
  const count2 = parseInt(match[1], 10);
  return count2 > 0 ? count2 : null;
}
function packageFraction(recipeQuantityText, unitQuantity) {
  const needed = parseNeeded(recipeQuantityText);
  if (!needed || !(needed.value > 0)) return null;
  if (CONTAINER_UNITS.test(needed.unit)) return needed.value;
  if (PIECE_UNITS.test(needed.unit)) {
    const perPack = findPieceCount(unitQuantity);
    return perPack ? needed.value / perPack : null;
  }
  const spoonKey = needed.unit.toLowerCase().replace(/\.$/, "");
  if (SPOON_ML[spoonKey] !== void 0) {
    const packSize = normalize2(findMeasure(unitQuantity));
    if (!packSize || !(packSize.value > 0)) return null;
    return packSize.base === "ml" ? needed.value * SPOON_ML[spoonKey] / packSize.value : needed.value * SPOON_MAX_G[spoonKey] / packSize.value;
  }
  const neededBase = normalize2(needed);
  if (!neededBase) return null;
  const packBase = normalize2(findMeasure(unitQuantity));
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
      const need = packageFraction(ing.recipeQuantityText, ing.unitQuantity) ?? ing.quantity;
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

// vendor/picnic-web/src/lib/recipe/fetch-recipe-detail.ts
function fetchRecipeDetail(client, id, portions) {
  return cachedCall(
    client,
    `recipe:${id}:${portions ?? ""}`,
    () => client.recipe.getRecipe(id, { portions, resolveIngredientNames: true }).then(mapRecipeDetails)
  );
}

// vendor/picnic-web/src/app/api/meal-plan/search/route.ts
var RECIPE_ID_RE = /^[0-9a-f]{24}$/;
var TOP_K = 5;
async function fetchLightweight(client, id, portions) {
  try {
    return await fetchRecipeDetail(client, id, portions);
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
  const candidateIds = Array.isArray(typedBody.candidateIds) ? typedBody.candidateIds.filter((id) => RECIPE_ID_RE.test(id)).slice(0, MEAL_PLAN_MAX_CANDIDATES) : [];
  const fixedIds = Array.isArray(typedBody.fixedIds) ? typedBody.fixedIds.filter((id) => RECIPE_ID_RE.test(id)) : [];
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
var RECIPE_ID_RE2 = /^[0-9a-f]{24}$/;
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
  const recipeIds = Array.isArray(typedBody.recipeIds) ? typedBody.recipeIds.filter((id) => RECIPE_ID_RE2.test(id)).slice(0, MAX_RECIPES) : [];
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
function extractPageTitle(rawPage) {
  const page = asRecord(rawPage);
  if (!page) return null;
  const header = asRecord(asRecord(page.layout)?.header) ?? asRecord(page.header);
  if (!header) return null;
  const title = header.title;
  return typeof title === "string" ? title : null;
}
function asRecord(value) {
  return typeof value === "object" && value !== null ? value : null;
}

// vendor/picnic-web/src/lib/pml/pml-product-helpers.ts
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
var DEFAULT_PRICE_COLORS = /* @__PURE__ */ new Set(["#333333", "#5b534e", "#787570"]);
function extractDisplayPriceColor(stackChildren, displayPrice) {
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
          if (color && !DEFAULT_PRICE_COLORS.has(color.toLowerCase())) {
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

// vendor/picnic-web/src/lib/product/parse-product-page.ts
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
    displayPriceColor: extractDisplayPriceColor(stackChildren, su.display_price),
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
function parseProductPage(rawPage) {
  return parseHorizontalSellingSections(rawPage);
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
    const page = await client.app.getPage(pageId);
    if (page.format === "rsc") {
      return NextResponse.json({ title: null, products: [], sections: [], rscPage: page.content });
    }
    const title = extractPageTitle(page.page);
    const { sections, products } = parseProductPage(page.page);
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
    const rawPage = await getFusionPage(client, PARCELS_PAGE_ID);
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
    const rawPage = await getFusionPage(
      client,
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

// vendor/picnic-web/src/lib/product/map-product-details.ts
function mapProductDetails(product) {
  return {
    id: product.id,
    name: product.name,
    brand: product.brand ?? "",
    quantityBadges: product.quantityBadges,
    unitQuantity: product.unitQuantity,
    unitPrice: product.unitPrice,
    tags: product.tags,
    displayPrice: product.displayPrice,
    originalPrice: product.originalPrice,
    displayPriceColor: product.displayPriceColor,
    maxCount: product.maxCount,
    imageIds: product.imageIds,
    // The price section shows the promotion, so the labels leave it out.
    labels: product.labels.filter((label) => label.text !== product.promotion?.label),
    description: product.description,
    highlights: product.highlightItems,
    allergens: {
      confirmed: product.allergenGroups.contains,
      mayContain: product.allergenGroups.mayContain
    },
    infoSections: product.infoSections,
    promotion: product.promotion,
    bundles: (product.priceRanges ?? []).map((tier) => ({
      id: product.id,
      quantity: tier.from_quantity,
      pricePerUnit: tier.price,
      imageId: product.imageIds[0] ?? "",
      maxCount: product.maxCount
    })),
    similarProducts: product.similarProducts.map((similar) => ({
      id: similar.id,
      name: similar.name,
      imageId: similar.imageId,
      displayPrice: similar.displayPrice,
      unitQuantity: similar.unitQuantity,
      maxCount: similar.maxCount,
      ...similar.deposit !== void 0 ? { deposit: similar.deposit } : {}
    })),
    nutritionRows: product.nutritionRows
  };
}

// vendor/picnic-web/src/app/api/product/[id]/route.ts
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
    const product = await client.catalog.getProduct(productId);
    return NextResponse.json(mapProductDetails(product));
  } catch (error2) {
    if (isProductNotFoundError(error2)) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }
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

// vendor/picnic-web/src/app/api/promotions/route.ts
var route_exports34 = {};
__export(route_exports34, {
  GET: () => GET21
});
async function GET21(request) {
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
    const promotions2 = await client.catalog.getPromotions();
    return NextResponse.json({ sections: mapPromotionsSections(promotions2) });
  } catch (error2) {
    if (isApiAuthError(error2)) {
      return NextResponse.json(
        { error: "Your token has expired", code: "TOKEN_EXPIRED" },
        { status: 401 }
      );
    }
    const message = error2 instanceof Error ? error2.message : "Unknown error occurred";
    console.error("[/api/promotions] Failed to load promotions:", message);
    return NextResponse.json(
      { error: "Failed to load promotions. Please try again later." },
      { status: 502 }
    );
  }
}

// vendor/picnic-web/src/app/api/promotions/[groupId]/route.ts
var route_exports35 = {};
__export(route_exports35, {
  GET: () => GET22
});
async function GET22(request, { params }) {
  const token = readAuthToken(request);
  if (!token) {
    return NextResponse.json(
      { error: "Authentication required", code: "TOKEN_EXPIRED" },
      { status: 401 }
    );
  }
  const countryCode = readCountryCode(request);
  const { groupId } = await params;
  try {
    const client = buildPicnicClient(token, countryCode);
    const group = await client.catalog.getPromotionGroup(groupId);
    return NextResponse.json({ name: group.name, products: mapProductTiles(group.products) });
  } catch (error2) {
    if (isApiAuthError(error2)) {
      return NextResponse.json(
        { error: "Your token has expired", code: "TOKEN_EXPIRED" },
        { status: 401 }
      );
    }
    const message = error2 instanceof Error ? error2.message : "Unknown error occurred";
    console.error(`[/api/promotions/${groupId}] Failed to load the promotion group:`, message);
    return NextResponse.json(
      { error: "Failed to load the promotion. Please try again later." },
      { status: 502 }
    );
  }
}

// vendor/picnic-web/src/app/api/recipe/[id]/route.ts
var route_exports36 = {};
__export(route_exports36, {
  GET: () => GET23
});
var RECIPE_ID_RE3 = /^[0-9a-f]{24}$/;
async function GET23(request, { params }) {
  const token = readAuthToken(request);
  if (!token) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }
  const { id } = await params;
  if (!RECIPE_ID_RE3.test(id)) {
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
var route_exports37 = {};
__export(route_exports37, {
  POST: () => POST16
});
var RECIPE_ID_RE4 = /^[0-9a-f]{24}$/;
async function POST16(request, { params }) {
  const token = readAuthToken(request);
  if (!token) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }
  const { id } = await params;
  if (!RECIPE_ID_RE4.test(id)) {
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
      for (const item of body.selectedIngredients) {
        if (item.count <= 0) continue;
        await client.cart.addProductToCart(item.id, item.count, [
          { type: "MEAL_PLAN", day_relative_to_slot: 999, number_of_servings: portions },
          {
            type: "SELLING_GROUP",
            selling_group_id: id,
            selling_group_creator_type: "PIM",
            selling_group_component_id: item.ingredientId ?? null,
            selling_group_component_type: "CORE",
            selling_group_component_swap_type: null
          }
        ]);
      }
    } else {
      await client.recipe.addRecipeToCart(id, { dayOffset: 0, portions });
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
var route_exports38 = {};
__export(route_exports38, {
  GET: () => GET24,
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
function extractPromotion(node) {
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
  const promotion = extractPromotion(node);
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
var RECIPE_ID_RE5 = /^[0-9a-f]{24}$/;
var INGREDIENT_ID_RE = /^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/;
function clampPortions(value) {
  return value !== null && Number.isFinite(value) && value > 0 ? Math.floor(value) : 1;
}
function fetchEditPage(client, recipeId, ingredientId, portions) {
  return getFusionPage(
    client,
    `selling-group-component-edit-page?ingredient_id=${encodeURIComponent(
      ingredientId
    )}&selling_group_id=${encodeURIComponent(recipeId)}&portions=${portions}`
  );
}
function validate(request, id, ingredientId) {
  const token = readAuthToken(request);
  if (!token) {
    return { error: NextResponse.json({ error: "Authentication required" }, { status: 401 }) };
  }
  if (!RECIPE_ID_RE5.test(id) || !INGREDIENT_ID_RE.test(ingredientId)) {
    return {
      error: NextResponse.json({ error: "Invalid recipe or ingredient ID" }, { status: 400 })
    };
  }
  return { token };
}
async function GET24(request, { params }) {
  const { id, ingredientId } = await params;
  const checked = validate(request, id, ingredientId);
  if ("error" in checked) return checked.error;
  try {
    const client = buildPicnicClient(checked.token, readCountryCode(request));
    const portionsParam = request.nextUrl.searchParams.get("portions");
    const portions = clampPortions(portionsParam ? parseInt(portionsParam, 10) : null);
    const rawPage = await fetchEditPage(client, id, ingredientId, portions);
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
  for (const [sellingUnitId, count2] of Object.entries(body.quantities)) {
    if (typeof count2 === "number" && count2 > 0) selected[sellingUnitId] = Math.floor(count2);
  }
  const selectedIds = Object.keys(selected);
  try {
    const client = buildPicnicClient(checked.token, readCountryCode(request));
    if (selectedIds.length === 0) {
      await client.recipe.removeRecipeIngredient(id, ingredientId);
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
    for (const [sellingUnitId, count2] of Object.entries(selected)) {
      quantityById[sellingUnitId] = count2;
    }
    const saveResult = await client.recipe.updateRecipeIngredient(id, ingredientId, {
      quantities: quantityById,
      portions,
      swapType
    });
    if (saveResult?.shouldUpdateCart) {
      await client.recipe.updateRecipeIngredientInCart(id, ingredientId, {
        quantities: selected,
        portions,
        swapType
      });
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
var route_exports39 = {};
__export(route_exports39, {
  POST: () => POST18
});
var RECIPE_ID_RE6 = /^[0-9a-f]{24}$/;
async function POST18(request, { params }) {
  const token = readAuthToken(request);
  if (!token) {
    return NextResponse.json(
      { error: "Authentication required", code: "TOKEN_EXPIRED" },
      { status: 401 }
    );
  }
  const { id } = await params;
  if (!RECIPE_ID_RE6.test(id)) {
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
  const pageId = request.nextUrl.searchParams.get("pageId");
  if (!pageId) {
    return NextResponse.json({ error: "Missing pageId" }, { status: 400 });
  }
  const countryCode = readCountryCode(request);
  try {
    const client = buildPicnicClient(token, countryCode);
    return NextResponse.json(await getRscPageContent(client, pageId));
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
var route_exports42 = {};
__export(route_exports42, {
  GET: () => GET27
});
async function GET27(request) {
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
    const results = await client.catalog.getSearchResults(query);
    const { products, sections } = mapSearchSections(results.products);
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
var route_exports43 = {};
__export(route_exports43, {
  GET: () => GET28
});
async function GET28(request) {
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
var route_exports44 = {};
__export(route_exports44, {
  GET: () => GET29
});

// vendor/picnic-web/src/lib/user/map-profile.ts
function mapProfile(profile) {
  const address = profile.address;
  const houseNumber = address?.houseNumber && address.houseNumber > 0 ? `${address.houseNumber}${address.houseNumberExtension ?? ""}` : "";
  const addressLine = address?.street ? [address.street, houseNumber].filter(Boolean).join(" ") : "";
  return {
    // The app shows first and last name as-is, e.g. "Jan & Anna ."
    name: [profile.firstName, profile.lastName].filter(Boolean).join(" ").trim(),
    addressLine,
    avatarUrl: profile.avatarUrl,
    hasMembership: profile.hasMembership,
    menu: profile.menu.map((entry) => ({ id: entry.id, deepLink: entry.deeplink }))
  };
}

// vendor/picnic-web/src/app/api/user/profile/route.ts
async function GET29(request) {
  const token = readAuthToken(request);
  if (!token) {
    return NextResponse.json(
      { error: "Your token has expired", code: "TOKEN_EXPIRED" },
      { status: 401 }
    );
  }
  try {
    const client = buildPicnicClient(token, readCountryCode(request));
    return NextResponse.json(mapProfile(await client.user.getProfile()));
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
  { path: "deliveries", methods: ["GET"], module: route_exports19 },
  { path: "deliveries/[deliveryId]", methods: ["GET"], module: route_exports20 },
  { path: "deliveries/[deliveryId]/cancel", methods: ["POST"], module: route_exports21 },
  { path: "deliveries/[deliveryId]/invoice", methods: ["POST"], module: route_exports22 },
  { path: "deliveries/[deliveryId]/position", methods: ["GET"], module: route_exports23 },
  { path: "deliveries/[deliveryId]/rating", methods: ["POST"], module: route_exports24 },
  { path: "deliveries/[deliveryId]/tracking", methods: ["GET"], module: route_exports25 },
  { path: "favorites", methods: ["GET"], module: route_exports26 },
  { path: "favorites/[aisleId]", methods: ["GET"], module: route_exports27 },
  { path: "meal-plan/search", methods: ["POST"], module: route_exports28 },
  { path: "meal-plan/shopping-list", methods: ["POST"], module: route_exports29 },
  { path: "pages/products", methods: ["GET"], module: route_exports30 },
  { path: "parcels", methods: ["GET"], module: route_exports31 },
  { path: "parcels/[parcelId]", methods: ["GET"], module: route_exports32 },
  { path: "product/[id]", methods: ["GET"], module: route_exports33 },
  { path: "promotions", methods: ["GET"], module: route_exports34 },
  { path: "promotions/[groupId]", methods: ["GET"], module: route_exports35 },
  { path: "recipe/[id]", methods: ["GET"], module: route_exports36 },
  { path: "recipe/[id]/add-to-cart", methods: ["POST"], module: route_exports37 },
  { path: "recipe/[id]/ingredient/[ingredientId]", methods: ["GET", "POST"], module: route_exports38 },
  { path: "recipe/[id]/save", methods: ["POST"], module: route_exports39 },
  { path: "recipe/saved", methods: ["GET"], module: route_exports40 },
  { path: "rsc-pages", methods: ["GET"], module: route_exports41 },
  { path: "search", methods: ["GET"], module: route_exports42 },
  { path: "suggestions", methods: ["GET"], module: route_exports43 },
  { path: "user/profile", methods: ["GET"], module: route_exports44 }
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
    version: true ? "1.0.5" : "dev",
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

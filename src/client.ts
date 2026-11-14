/**
 * The live-reload client injected into default.hbs during `gtb dev`.
 *
 * It is written into a Handlebars template, so the source must never contain
 * a double opening brace: Ghost would try to parse it as a helper. The
 * generated script is plain ES5-style JS for the same reason (no template
 * literals that might be mistaken for anything by theme tooling).
 *
 * Messages from the dev server are JSON:
 *   { type: "css", files: ["built/css/index.css"], source: "src/css/card.css",
 *     inline?: [{ file: "built/css/critical/index.css", css: "..." }] }
 *   { type: "reload", reason: "template changed: partials/card.hbs" }
 *   { type: "error", file?: "src/css/index.css", message: "..." }
 *   { type: "notice", message: "..." }
 */

export const CLIENT_MARKER = "<!-- gtb dev client: removed by gtb build -->";

const CLIENT_SOURCE = `(function () {
  var PORT = __GTB_PORT__;
  var URL_ = "ws://" + (location.hostname || "localhost") + ":" + PORT;
  var TAG = "%c[gtb]%c ";
  var TAG_STYLE = "color:#15171a;background:#ff1a75;border-radius:3px;padding:1px 4px;font-weight:bold";
  var attempts = 0;
  var everConnected = false;
  var hadError = false;
  var reloading = false;
  var timer = null;

  function log(level, msg) {
    console[level](TAG + msg, TAG_STYLE, "");
  }

  function reload() {
    if (reloading) return;
    reloading = true;
    location.reload();
  }

  function schedule() {
    attempts += 1;
    var delay = Math.min(10000, 250 * Math.pow(2, attempts));
    if (attempts === 1) {
      log("warn", (everConnected ? "connection to dev server lost" : "could not reach dev server on :" + PORT) + ", retrying...");
    } else if (attempts === 6) {
      log("warn", "still no dev server on :" + PORT + ". Is gtb dev running? If it restarted on a different port, refresh this page.");
    }
    clearTimeout(timer);
    timer = setTimeout(connect, delay);
  }

  function matchLinks(files, links) {
    var matched = [];
    for (var i = 0; i < links.length; i++) {
      var path;
      try { path = new URL(links[i].href).pathname; } catch (e) { continue; }
      for (var j = 0; j < files.length; j++) {
        var suffix = "/" + files[j];
        if (path.slice(-suffix.length) === suffix) { matched.push(links[i]); break; }
      }
    }
    return matched;
  }

  function swapInline(blocks) {
    var styles = document.querySelectorAll("style[data-gtb-critical]");
    var swapped = 0;
    for (var i = 0; i < blocks.length; i++) {
      for (var j = 0; j < styles.length; j++) {
        if (styles[j].getAttribute("data-gtb-critical") === blocks[i].file) {
          styles[j].textContent = blocks[i].css;
          swapped += 1;
        }
      }
    }
    return swapped;
  }

  function swapCss(msg) {
    var files = msg.files || [];
    var started = performance.now();
    var inlined = swapInline(msg.inline || []);
    var links = document.querySelectorAll('link[rel="stylesheet"]');
    var matched = matchLinks(files, links);
    var label = files.join(", ");
    if (!matched.length && !inlined) {
      log("info", "CSS changed (" + label + ") but it isn't on this page, full reload");
      reload();
      return;
    }
    function done() {
      var parts = [];
      if (inlined) parts.push(inlined + " critical <style>");
      if (matched.length) parts.push(matched.length + " of " + links.length + " stylesheets");
      log("info", "CSS updated: " + label + " (swapped " + parts.join(" + ") + ", " + Math.round(performance.now() - started) + "ms)");
    }
    if (!matched.length) { done(); return; }
    var pending = matched.length;
    matched.forEach(function (link) {
      var next = link.cloneNode();
      var url = new URL(link.href);
      url.searchParams.set("v", String(Date.now()));
      next.href = url.href;
      next.addEventListener("load", function () {
        if (link.parentNode) link.parentNode.removeChild(link);
        pending -= 1;
        if (pending === 0) done();
      });
      next.addEventListener("error", function () {
        log("warn", "failed to load " + url.pathname + ", full reload");
        reload();
      });
      link.parentNode.insertBefore(next, link.nextSibling);
    });
  }

  function handle(msg) {
    if (msg.type === "error") {
      hadError = true;
      log("error", "\\u2718 build failed" + (msg.file ? " in " + msg.file : "") + ", keeping the previous version\\n" + msg.message);
      return;
    }
    if (msg.type === "notice") {
      log("warn", msg.message);
      return;
    }
    if (hadError && (msg.type === "css" || msg.type === "reload")) {
      hadError = false;
      log("info", "\\u2714 build recovered");
    }
    if (msg.type === "css") {
      swapCss(msg);
    } else if (msg.type === "reload") {
      log("info", msg.reason + ", full reload");
      reload();
    }
  }

  function connect() {
    var ws;
    try { ws = new WebSocket(URL_); } catch (e) { schedule(); return; }
    ws.addEventListener("open", function () {
      if (everConnected) {
        log("info", "reconnected to dev server, reloading to pick up missed changes");
        reload();
        return;
      }
      everConnected = true;
      attempts = 0;
      log("info", "connected to dev server on :" + PORT);
      var generator = document.querySelector('meta[name="generator"]');
      ws.send(JSON.stringify({
        url: location.href,
        title: document.title,
        version: generator ? generator.getAttribute("content") : null
      }));
    });
    ws.addEventListener("message", function (event) {
      var msg;
      try { msg = JSON.parse(event.data); } catch (e) { log("log", String(event.data)); return; }
      handle(msg);
    });
    ws.addEventListener("close", schedule);
  }

  connect();
})();`;

/** The `<script>` block written into default.hbs during `gtb dev`. */
export function clientScript(port: number): string {
  const source = CLIENT_SOURCE.replace("__GTB_PORT__", String(Math.trunc(port)));
  return `${CLIENT_MARKER}\n<script>\n${source}\n</script>`;
}

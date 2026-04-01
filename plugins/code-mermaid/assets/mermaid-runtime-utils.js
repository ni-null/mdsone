;(function () {
  function decodeBase64Utf8(base64) {
    var b64 = String(base64 || "").trim();
    if (!b64) return "";
    try {
      var binary = atob(b64);
      var bytes = new Uint8Array(binary.length);
      for (var i = 0; i < binary.length; i += 1) {
        bytes[i] = binary.charCodeAt(i);
      }
      if (typeof TextDecoder !== "undefined") {
        return new TextDecoder("utf-8").decode(bytes);
      }

      var escaped = "";
      for (var j = 0; j < bytes.length; j += 1) {
        escaped += "%" + bytes[j].toString(16).padStart(2, "0");
      }
      return decodeURIComponent(escaped);
    } catch (_e) {
      return "";
    }
  }

  window.__mdsoneMermaidDecodeBase64Utf8 = decodeBase64Utf8;
})();

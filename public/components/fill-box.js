{
  const style = /* css */ `
    fill-box:not([disabled]) {
      cursor: pointer;
    }

    fill-box > svg {
      vertical-align: middle;
      pointer-events: none;
    }

    fill-box > svg > rect {
      stroke: #666666;
      stroke-width: 2;
    }
  `;

  const styleElement = document.createElement("style");
  styleElement.setAttribute("type", "text/css");
  styleElement.innerHTML = style;
  document.head.appendChild(styleElement);
}

{
  const template = document.createElement("template");
  template.innerHTML = /* html */ `
    <svg>
      <rect x="0" y="0" width="100%" height="100%">
    </svg>
  `;

  class FillBox extends HTMLElement {
    constructor() {
      super();
      // Do NOT append children here: the DOM throws NotSupportedError when an
      // element created via document.createElement() gains children in its
      // constructor. Legacy call sites build fill-box via innerHTML (the parser
      // path, which is exempt), but React renders it via createElement, so the
      // svg is built lazily in connectedCallback instead.
    }

    static showTip() {
      tip(this.tip);
    }

    // Build the swatch once, on first connect, from the current attributes
    // (fill/size are always set by the time the element is inserted). Guarded so
    // a disconnect/reconnect does not append a second svg.
    #buildSvg() {
      if (this.querySelector("svg")) return;
      this.appendChild(template.content.cloneNode(true));
      this.querySelector("rect")?.setAttribute("fill", this.fill);
      this.querySelector("svg")?.setAttribute("width", this.size);
      this.querySelector("svg")?.setAttribute("height", this.size);
    }

    connectedCallback() {
      this.#buildSvg();
      this.addEventListener("mousemove", this.constructor.showTip);
    }

    disconnectedCallback() {
      this.removeEventListener("mousemove", this.constructor.showTip);
    }

    get fill() {
      return this.getAttribute("fill") || "#333";
    }

    set fill(newFill) {
      this.setAttribute("fill", newFill);
      this.querySelector("rect")?.setAttribute("fill", newFill);
    }

    get size() {
      return this.getAttribute("size") || "1em";
    }

    get tip() {
      return this.dataset.tip || "Fill style. Click to change";
    }
  }

  // cannot use Shadow DOM here as need an access to svg hatches
  customElements.define("fill-box", FillBox);
}

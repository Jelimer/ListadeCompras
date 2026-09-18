/**
 * tests/mock_dom.js
 * Entorno simulado de DOM y navegador en Node.js puro para pruebas E2E de "Lista de Compra | PRO".
 * Cero dependencias externas. Soporta parseo de index.html, eventos, localStorage, ECharts y SweetAlert2.
 */

const fs = require('node:fs');
const path = require('node:path');

class DOMNode {
  constructor(nodeType, nodeName) {
    this.nodeType = nodeType; // 1: Element, 3: Text, 9: Document
    this.nodeName = nodeName;
    this.parentNode = null;
    this.childNodes = [];
    this.ownerDocument = null;
  }

  get firstChild() {
    return this.childNodes[0] || null;
  }

  get lastChild() {
    return this.childNodes[this.childNodes.length - 1] || null;
  }

  get nextSibling() {
    if (!this.parentNode) return null;
    const idx = this.parentNode.childNodes.indexOf(this);
    return idx >= 0 && idx < this.parentNode.childNodes.length - 1 ? this.parentNode.childNodes[idx + 1] : null;
  }

  get previousSibling() {
    if (!this.parentNode) return null;
    const idx = this.parentNode.childNodes.indexOf(this);
    return idx > 0 ? this.parentNode.childNodes[idx - 1] : null;
  }

  appendChild(child) {
    if (!child) return null;
    if (child.parentNode) {
      child.parentNode.removeChild(child);
    }
    child.parentNode = this;
    child.ownerDocument = this.ownerDocument || (this.nodeType === 9 ? this : null);
    this.childNodes.push(child);
    return child;
  }

  removeChild(child) {
    const idx = this.childNodes.indexOf(child);
    if (idx !== -1) {
      this.childNodes.splice(idx, 1);
      child.parentNode = null;
      return child;
    }
    throw new Error('Node to be removed is not a child of this node.');
  }

  insertBefore(newNode, referenceNode) {
    if (!referenceNode) return this.appendChild(newNode);
    const idx = this.childNodes.indexOf(referenceNode);
    if (idx === -1) throw new Error('Reference node not found.');
    if (newNode.parentNode) newNode.parentNode.removeChild(newNode);
    newNode.parentNode = this;
    newNode.ownerDocument = this.ownerDocument;
    this.childNodes.splice(idx, 0, newNode);
    return newNode;
  }

  replaceChild(newChild, oldChild) {
    const idx = this.childNodes.indexOf(oldChild);
    if (idx === -1) throw new Error('Old child not found.');
    if (newChild.parentNode) newChild.parentNode.removeChild(newChild);
    newChild.parentNode = this;
    newChild.ownerDocument = this.ownerDocument;
    this.childNodes[idx] = newChild;
    oldChild.parentNode = null;
    return oldChild;
  }

  get children() {
    return this.childNodes.filter(n => n.nodeType === 1);
  }
}

class DOMText extends DOMNode {
  constructor(text) {
    super(3, '#text');
    this._text = String(text);
  }

  get textContent() {
    return this._text;
  }

  set textContent(val) {
    this._text = String(val);
  }

  get nodeValue() {
    return this._text;
  }

  set nodeValue(val) {
    this._text = String(val);
  }
}

class DOMClassList {
  constructor(element) {
    this._el = element;
  }

  _getClasses() {
    const cls = this._el.getAttribute('class') || '';
    return cls.trim().split(/\s+/).filter(Boolean);
  }

  _setClasses(arr) {
    this._el.setAttribute('class', arr.join(' '));
  }

  contains(token) {
    return this._getClasses().includes(token);
  }

  add(...tokens) {
    const classes = this._getClasses();
    for (const t of tokens) {
      if (t && !classes.includes(t)) classes.push(t);
    }
    this._setClasses(classes);
  }

  remove(...tokens) {
    let classes = this._getClasses();
    classes = classes.filter(c => !tokens.includes(c));
    this._setClasses(classes);
  }

  toggle(token, force) {
    const classes = this._getClasses();
    const has = classes.includes(token);
    const shouldAdd = force !== undefined ? force : !has;
    if (shouldAdd && !has) {
      classes.push(token);
      this._setClasses(classes);
      return true;
    } else if (!shouldAdd && has) {
      this.remove(token);
      return false;
    }
    return shouldAdd;
  }

  toString() {
    return this._el.getAttribute('class') || '';
  }
}

class DOMElement extends DOMNode {
  constructor(tagName) {
    super(1, tagName.toUpperCase());
    this.tagName = tagName.toUpperCase();
    this.attributes = new Map();
    this.eventListeners = new Map();
    this.style = {};
    this.classList = new DOMClassList(this);
    this._value = '';
    this._checked = false;
    this._disabled = false;
  }

  getAttribute(name) {
    return this.attributes.get(name.toLowerCase()) ?? null;
  }

  setAttribute(name, value) {
    const key = name.toLowerCase();
    const strVal = String(value);
    this.attributes.set(key, strVal);
    if (key === 'value') this._value = strVal;
    if (key === 'checked') this._checked = true;
    if (key === 'disabled') this._disabled = true;
    if (key === 'id') this.id = strVal;
    if (key === 'class') this.className = strVal;
  }

  removeAttribute(name) {
    const key = name.toLowerCase();
    this.attributes.delete(key);
    if (key === 'checked') this._checked = false;
    if (key === 'disabled') this._disabled = false;
    if (key === 'id') this.id = '';
    if (key === 'class') this.className = '';
  }

  hasAttribute(name) {
    return this.attributes.has(name.toLowerCase());
  }

  get id() {
    return this.getAttribute('id') || '';
  }

  set id(val) {
    if (val) this.attributes.set('id', val);
    else this.attributes.delete('id');
  }

  get className() {
    return this.getAttribute('class') || '';
  }

  set className(val) {
    if (val) this.attributes.set('class', val);
    else this.attributes.delete('class');
  }

  get value() {
    return this._value;
  }

  set value(val) {
    this._value = String(val);
  }

  get checked() {
    return Boolean(this._checked);
  }

  set checked(val) {
    this._checked = Boolean(val);
  }

  get disabled() {
    return Boolean(this._disabled);
  }

  set disabled(val) {
    this._disabled = Boolean(val);
  }

  get textContent() {
    return this.childNodes.map(n => n.textContent).join('');
  }

  set textContent(text) {
    this.childNodes = [];
    if (text !== '' && text !== null && text !== undefined) {
      const textNode = new DOMText(text);
      this.appendChild(textNode);
    }
  }

  get innerHTML() {
    return this.childNodes.map(childToHTML).join('');
  }

  set innerHTML(html) {
    this.childNodes = [];
    if (!html) return;
    const parsedNodes = parseHTMLFragment(html, this.ownerDocument);
    for (const node of parsedNodes) {
      this.appendChild(node);
    }
  }

  get dataset() {
    const ds = {};
    for (const [key, val] of this.attributes.entries()) {
      if (key.startsWith('data-')) {
        const prop = key.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
        ds[prop] = val;
      }
    }
    return new Proxy(ds, {
      set: (target, prop, value) => {
        const attrName = 'data-' + prop.replace(/([A-Z])/g, '-$1').toLowerCase();
        this.setAttribute(attrName, value);
        target[prop] = value;
        return true;
      }
    });
  }

  addEventListener(type, listener) {
    if (!this.eventListeners.has(type)) {
      this.eventListeners.set(type, []);
    }
    this.eventListeners.get(type).push(listener);
  }

  removeEventListener(type, listener) {
    if (!this.eventListeners.has(type)) return;
    const list = this.eventListeners.get(type).filter(l => l !== listener);
    this.eventListeners.set(type, list);
  }

  dispatchEvent(event) {
    event.target = this;
    event.currentTarget = this;
    const listeners = this.eventListeners.get(event.type) || [];
    for (const l of listeners) {
      l.call(this, event);
    }
    // Bubbling simulation
    if (event.bubbles && this.parentNode && this.parentNode.dispatchEvent) {
      this.parentNode.dispatchEvent(event);
    }
    return !event.defaultPrevented;
  }

  click() {
    this.dispatchEvent(new DOMEvent('click', { bubbles: true, cancelable: true }));
  }

  focus() {
    if (this.ownerDocument) this.ownerDocument.activeElement = this;
    this.dispatchEvent(new DOMEvent('focus', { bubbles: false }));
  }

  blur() {
    if (this.ownerDocument && this.ownerDocument.activeElement === this) {
      this.ownerDocument.activeElement = null;
    }
    this.dispatchEvent(new DOMEvent('blur', { bubbles: false }));
  }

  querySelector(selector) {
    return querySelectorOne(this, selector);
  }

  querySelectorAll(selector) {
    return querySelectorAll(this, selector);
  }

  getElementsByTagName(tagName) {
    const tag = tagName.toUpperCase();
    return findAll(this, n => n !== this && n.nodeType === 1 && (tag === '*' || n.tagName === tag));
  }

  getElementsByClassName(className) {
    return findAll(this, n => n !== this && n.nodeType === 1 && n.classList.contains(className));
  }

  closest(selector) {
    let current = this;
    while (current && current.nodeType === 1) {
      if (matchesSelector(current, selector)) return current;
      current = current.parentNode;
    }
    return null;
  }
}

class DOMEvent {
  constructor(type, options = {}) {
    this.type = type;
    this.bubbles = options.bubbles !== undefined ? options.bubbles : true;
    this.cancelable = options.cancelable !== undefined ? options.cancelable : true;
    this.target = null;
    this.currentTarget = null;
    this.defaultPrevented = false;
    this.key = options.key || '';
    this.keyCode = options.keyCode || 0;
    this.ctrlKey = !!options.ctrlKey;
    this.shiftKey = !!options.shiftKey;
    this.altKey = !!options.altKey;
    this.metaKey = !!options.metaKey;
  }

  preventDefault() {
    this.defaultPrevented = true;
  }

  stopPropagation() {
    this.bubbles = false;
  }
}

class DOMDocument extends DOMNode {
  constructor() {
    super(9, '#document');
    this.ownerDocument = this;
    this.documentElement = new DOMElement('html');
    this.documentElement.ownerDocument = this;
    this.appendChild(this.documentElement);

    this.head = new DOMElement('head');
    this.body = new DOMElement('body');
    this.documentElement.appendChild(this.head);
    this.documentElement.appendChild(this.body);

    this.activeElement = null;
    this.eventListeners = new Map();
  }

  createElement(tag) {
    const el = new DOMElement(tag);
    el.ownerDocument = this;
    return el;
  }

  createTextNode(text) {
    const tn = new DOMText(text);
    tn.ownerDocument = this;
    return tn;
  }

  getElementById(id) {
    return findFirst(this.documentElement, n => n.nodeType === 1 && n.id === id);
  }

  getElementsByClassName(className) {
    return findAll(this.documentElement, n => n.nodeType === 1 && n.classList.contains(className));
  }

  getElementsByTagName(tagName) {
    const tag = tagName.toUpperCase();
    return findAll(this.documentElement, n => n.nodeType === 1 && (tag === '*' || n.tagName === tag));
  }

  querySelector(selector) {
    return querySelectorOne(this.documentElement, selector);
  }

  querySelectorAll(selector) {
    return querySelectorAll(this.documentElement, selector);
  }

  addEventListener(type, listener) {
    if (!this.eventListeners.has(type)) this.eventListeners.set(type, []);
    this.eventListeners.get(type).push(listener);
  }

  removeEventListener(type, listener) {
    if (!this.eventListeners.has(type)) return;
    this.eventListeners.set(type, this.eventListeners.get(type).filter(l => l !== listener));
  }

  dispatchEvent(event) {
    event.target = this;
    event.currentTarget = this;
    const listeners = this.eventListeners.get(event.type) || [];
    for (const l of listeners) l.call(this, event);
    return !event.defaultPrevented;
  }
}

class MockLocalStorage {
  constructor() {
    this._store = new Map();
  }

  getItem(key) {
    return this._store.has(String(key)) ? this._store.get(String(key)) : null;
  }

  setItem(key, value) {
    this._store.set(String(key), String(value));
  }

  removeItem(key) {
    this._store.delete(String(key));
  }

  clear() {
    this._store.clear();
  }

  key(index) {
    return Array.from(this._store.keys())[index] || null;
  }

  get length() {
    return this._store.size;
  }
}

// Selector Matching Engine
function matchesSelector(el, selector) {
  if (!el || el.nodeType !== 1) return false;
  selector = selector.trim();

  // ID selector: #foo
  if (selector.startsWith('#')) {
    return el.id === selector.slice(1);
  }
  // Class selector: .foo
  if (selector.startsWith('.')) {
    return el.classList.contains(selector.slice(1));
  }
  // Tag selector: div
  if (/^[a-zA-Z0-9_-]+$/.test(selector)) {
    return el.tagName === selector.toUpperCase();
  }
  // Tag.class: button.btn
  const tagClassMatch = selector.match(/^([a-zA-Z0-9_-]+)\.([a-zA-Z0-9_-]+)$/);
  if (tagClassMatch) {
    return el.tagName === tagClassMatch[1].toUpperCase() && el.classList.contains(tagClassMatch[2]);
  }
  // Tag#id: button#submit
  const tagIdMatch = selector.match(/^([a-zA-Z0-9_-]+)#([a-zA-Z0-9_-]+)$/);
  if (tagIdMatch) {
    return el.tagName === tagIdMatch[1].toUpperCase() && el.id === tagIdMatch[2];
  }
  // Attribute: [attr] or [attr=val]
  const attrMatch = selector.match(/^\[([a-zA-Z0-9_-]+)(?:=['"]?([^'"\]]*)['"]?)?\]$/);
  if (attrMatch) {
    const attrName = attrMatch[1];
    const attrVal = attrMatch[2];
    if (attrVal !== undefined) return el.getAttribute(attrName) === attrVal;
    return el.hasAttribute(attrName);
  }
  // Compound selector: button[data-action="delete"]
  const compoundMatch = selector.match(/^([a-zA-Z0-9_-]+)\[([a-zA-Z0-9_-]+)(?:=['"]?([^'"\]]*)['"]?)?\]$/);
  if (compoundMatch) {
    const tag = compoundMatch[1].toUpperCase();
    const attrName = compoundMatch[2];
    const attrVal = compoundMatch[3];
    if (el.tagName !== tag) return false;
    if (attrVal !== undefined) return el.getAttribute(attrName) === attrVal;
    return el.hasAttribute(attrName);
  }

  return false;
}

function findFirst(root, predicate) {
  if (predicate(root)) return root;
  for (const child of root.childNodes) {
    const res = findFirst(child, predicate);
    if (res) return res;
  }
  return null;
}

function findAll(root, predicate, acc = []) {
  if (predicate(root)) acc.push(root);
  for (const child of root.childNodes) {
    findAll(child, predicate, acc);
  }
  return acc;
}

function querySelectorOne(root, selector) {
  // Support simple multi-level selectors: "aside .stat-card" or "div > span"
  const parts = selector.trim().split(/\s+/);
  if (parts.length === 1) {
    return findFirst(root, n => matchesSelector(n, selector));
  }
  // For multiple parts, search hierarchically
  let candidates = [root];
  for (const part of parts) {
    if (part === '>') continue; // Simplified direct descendant handling
    const nextCandidates = [];
    for (const c of candidates) {
      const found = findAll(c, n => n !== c && matchesSelector(n, part));
      nextCandidates.push(...found);
    }
    candidates = nextCandidates;
  }
  return candidates[0] || null;
}

function querySelectorAll(root, selector) {
  const parts = selector.trim().split(/\s+/);
  if (parts.length === 1) {
    return findAll(root, n => n !== root && matchesSelector(n, selector));
  }
  let candidates = [root];
  for (const part of parts) {
    if (part === '>') continue;
    const nextCandidates = [];
    for (const c of candidates) {
      const found = findAll(c, n => n !== c && matchesSelector(n, part));
      nextCandidates.push(...found);
    }
    candidates = nextCandidates;
  }
  return candidates;
}

function childToHTML(node) {
  if (node.nodeType === 3) return escapeHtmlText(node._text);
  if (node.nodeType === 1) {
    const tag = node.tagName.toLowerCase();
    const attrs = [];
    for (const [k, v] of node.attributes.entries()) {
      attrs.push(`${k}="${escapeHtmlText(v)}"`);
    }
    const attrStr = attrs.length > 0 ? ' ' + attrs.join(' ') : '';
    const selfClosing = ['input', 'meta', 'link', 'br', 'hr', 'img'].includes(tag);
    if (selfClosing) return `<${tag}${attrStr}>`;
    return `<${tag}${attrStr}>${node.innerHTML}</${tag}>`;
  }
  return '';
}

function escapeHtmlText(str) {
  if (typeof str !== 'string') str = String(str);
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Minimal robust HTML tokenizer & fragment parser
function parseHTMLFragment(html, doc) {
  const result = [];
  const tagRegex = /<(\/)?([a-zA-Z0-9_-]+)((?:\s+[^>="']+(?:=(?:"[^"]*"|'[^']*'|[^'"\s>]+))?)*)\s*(\/?)>/g;
  let lastIndex = 0;
  const stack = [];
  let match;

  while ((match = tagRegex.exec(html)) !== null) {
    if (match.index > lastIndex) {
      const text = html.slice(lastIndex, match.index);
      if (text) {
        const textNode = new DOMText(decodeEntities(text));
        textNode.ownerDocument = doc;
        if (stack.length > 0) stack[stack.length - 1].appendChild(textNode);
        else result.push(textNode);
      }
    }
    lastIndex = tagRegex.lastIndex;

    const isClose = match[1] === '/';
    const tagName = match[2];
    const rawAttrs = match[3];
    const isSelfClosing = match[4] === '/' || ['input', 'meta', 'link', 'br', 'hr', 'img'].includes(tagName.toLowerCase());

    if (isClose) {
      while (stack.length > 0) {
        const top = stack.pop();
        if (top.tagName === tagName.toUpperCase()) break;
      }
    } else {
      const el = new DOMElement(tagName);
      el.ownerDocument = doc;
      if (rawAttrs) {
        const attrRegex = /([a-zA-Z0-9_-]+)(?:=(?:"([^"]*)"|'([^']*)'|([^'"\s>]+)))?/g;
        let attrMatch;
        while ((attrMatch = attrRegex.exec(rawAttrs)) !== null) {
          const attrName = attrMatch[1];
          const attrVal = attrMatch[2] ?? attrMatch[3] ?? attrMatch[4] ?? '';
          el.setAttribute(attrName, decodeEntities(attrVal));
        }
      }

      if (stack.length > 0) {
        stack[stack.length - 1].appendChild(el);
      } else {
        result.push(el);
      }

      if (!isSelfClosing) {
        stack.push(el);
      }
    }
  }

  if (lastIndex < html.length) {
    const tail = html.slice(lastIndex);
    if (tail) {
      const textNode = new DOMText(decodeEntities(tail));
      textNode.ownerDocument = doc;
      if (stack.length > 0) stack[stack.length - 1].appendChild(textNode);
      else result.push(textNode);
    }
  }

  return result;
}

function decodeEntities(str) {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

// Complete Document Loader from index.html
function loadDocumentFromHTML(htmlString) {
  const doc = new DOMDocument();
  // Extract data-theme from <html>
  const htmlTagMatch = htmlString.match(/<html\s+([^>]+)>/i);
  if (htmlTagMatch) {
    const attrMatch = htmlTagMatch[1].match(/data-theme=["']([^"']+)["']/i);
    if (attrMatch) doc.documentElement.setAttribute('data-theme', attrMatch[1]);
  }

  // Extract body content
  const bodyMatch = htmlString.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  const bodyContent = bodyMatch ? bodyMatch[1] : htmlString;
  const nodes = parseHTMLFragment(bodyContent, doc);
  for (const n of nodes) {
    doc.body.appendChild(n);
  }
  return doc;
}

// Mock ECharts instance builder
function createMockEcharts() {
  return {
    _instances: new Map(),
    init: function(dom) {
      const inst = {
        dom: dom,
        option: null,
        disposed: false,
        eventListeners: new Map(),
        setOption: function(opt, notMerge) {
          this.option = opt;
        },
        getOption: function() {
          return this.option;
        },
        resize: function() {
          this._resized = (this._resized || 0) + 1;
        },
        clear: function() {
          this.option = null;
          this._cleared = true;
        },
        dispose: function() {
          this.disposed = true;
        },
        on: function(evt, fn) {
          if (!this.eventListeners.has(evt)) this.eventListeners.set(evt, []);
          this.eventListeners.get(evt).push(fn);
        },
        off: function(evt, fn) {
          if (this.eventListeners.has(evt)) {
            this.eventListeners.set(evt, this.eventListeners.get(evt).filter(f => f !== fn));
          }
        }
      };
      return inst;
    }
  };
}

// Mock SweetAlert2 instance builder
function createMockSwal() {
  const calls = [];
  const swal = function(options) {
    return swal.fire(options);
  };
  swal.fire = function(options) {
    calls.push(options);
    return Promise.resolve({
      isConfirmed: true,
      isDenied: false,
      isDismissed: false,
      value: true
    });
  };
  swal.close = function() {};
  swal.getCalls = () => calls;
  swal.reset = () => { calls.length = 0; };
  return swal;
}

// Factory to create isolated test environment
function createTestEnvironment(customHtmlPath) {
  const htmlPath = customHtmlPath || path.resolve(__dirname, '../index.html');
  const htmlContent = fs.existsSync(htmlPath) ? fs.readFileSync(htmlPath, 'utf8') : '<html><body><div id="shoppingListContainer"></div></body></html>';
  const doc = loadDocumentFromHTML(htmlContent);
  const localStorage = new MockLocalStorage();
  const echarts = createMockEcharts();
  const Swal = createMockSwal();
  const lucideIcons = [];

  const win = {
    document: doc,
    localStorage: localStorage,
    sessionStorage: new MockLocalStorage(),
    echarts: echarts,
    Swal: Swal,
    lucide: {
      createIcons: () => {
        lucideIcons.push(Date.now());
      }
    },
    confetti: () => {},
    matchMedia: (query) => {
      let matches = false;
      if (query.includes('prefers-color-scheme: dark')) {
        matches = false; // default to light
      }
      return {
        matches,
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {}
      };
    },
    ResizeObserver: class {
      constructor(callback) {
        this.callback = callback;
      }
      observe() {}
      unobserve() {}
      disconnect() {}
    },
    Blob: class MockBlob {
      constructor(chunks, options) {
        this.chunks = chunks;
        this.type = options && options.type ? options.type : '';
      }
      text() {
        return Promise.resolve(this.chunks.join(''));
      }
    },
    URL: {
      _createdUrls: [],
      createObjectURL: (blob) => {
        const url = `blob:mock-url-${Date.now()}-${Math.random()}`;
        win.URL._createdUrls.push({ url, blob });
        return url;
      },
      revokeObjectURL: (url) => {
        win.URL._createdUrls = win.URL._createdUrls.filter(u => u.url !== url);
      }
    },
    FileReader: class MockFileReader {
      constructor() {
        this.result = null;
        this.onload = null;
        this.onerror = null;
      }
      readAsText(blob) {
        setTimeout(() => {
          this.result = blob.chunks ? blob.chunks.join('') : String(blob);
          if (this.onload) this.onload({ target: { result: this.result } });
        }, 1);
      }
    },
    addEventListener: (type, fn) => doc.addEventListener(type, fn),
    removeEventListener: (type, fn) => doc.removeEventListener(type, fn),
    dispatchEvent: (evt) => doc.dispatchEvent(evt)
  };

  return {
    window: win,
    document: doc,
    localStorage: localStorage,
    echarts: echarts,
    Swal: Swal,
    DOMEvent: DOMEvent
  };
}

module.exports = {
  DOMNode,
  DOMElement,
  DOMText,
  DOMEvent,
  DOMDocument,
  MockLocalStorage,
  createTestEnvironment,
  loadDocumentFromHTML,
  escapeHtmlText,
  matchesSelector
};

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

// --- MOCK LEAFLET (L) ---
function normalizeLatLng(latlng) {
  if (!latlng) return { lat: 0, lng: 0 };
  if (Array.isArray(latlng)) {
    return { lat: Number(latlng[0]), lng: Number(latlng[1]) };
  }
  if (typeof latlng === 'object') {
    const lat = latlng.lat !== undefined ? latlng.lat : (latlng.latitude !== undefined ? latlng.latitude : 0);
    const lng = latlng.lng !== undefined ? latlng.lng : (latlng.lon !== undefined ? latlng.lon : (latlng.longitude !== undefined ? latlng.longitude : 0));
    return { lat: Number(lat), lng: Number(lng) };
  }
  return { lat: 0, lng: 0 };
}

function haversineDistanceMeters(c1, c2) {
  const p1 = normalizeLatLng(c1);
  const p2 = normalizeLatLng(c2);
  const R = 6371000; // metros
  const toRad = Math.PI / 180;
  const dLat = (p2.lat - p1.lat) * toRad;
  const dLng = (p2.lng - p1.lng) * toRad;
  const lat1 = p1.lat * toRad;
  const lat2 = p2.lat * toRad;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

class MockLeafletPopup {
  constructor(options = {}) {
    this.options = options;
    this._content = '';
    this._latlng = null;
    this._isOpen = false;
  }
  setContent(content) {
    this._content = content;
    return this;
  }
  getContent() {
    return this._content;
  }
  setLatLng(latlng) {
    this._latlng = normalizeLatLng(latlng);
    return this;
  }
  getLatLng() {
    return this._latlng;
  }
  openOn(map) {
    this._isOpen = true;
    if (map && map.openPopup) map.openPopup(this);
    return this;
  }
  isOpen() {
    return this._isOpen;
  }
}

class MockLeafletLayer {
  constructor() {
    this._map = null;
    this._popup = null;
    this._eventListeners = new Map();
  }
  addTo(map) {
    this._map = map;
    if (map && typeof map.addLayer === 'function') {
      map.addLayer(this);
    }
    return this;
  }
  remove() {
    if (this._map && typeof this._map.removeLayer === 'function') {
      this._map.removeLayer(this);
    }
    this._map = null;
    return this;
  }
  bindPopup(content, options) {
    if (content instanceof MockLeafletPopup) {
      this._popup = content;
    } else {
      this._popup = new MockLeafletPopup(options);
      this._popup.setContent(content);
    }
    return this;
  }
  unbindPopup() {
    this._popup = null;
    return this;
  }
  openPopup() {
    if (this._popup) {
      this._popup._isOpen = true;
      this.fire('popupopen', { popup: this._popup });
    }
    return this;
  }
  closePopup() {
    if (this._popup) {
      this._popup._isOpen = false;
      this.fire('popupclose', { popup: this._popup });
    }
    return this;
  }
  getPopup() {
    return this._popup;
  }
  on(event, handler) {
    if (!this._eventListeners.has(event)) this._eventListeners.set(event, []);
    this._eventListeners.get(event).push(handler);
    return this;
  }
  off(event, handler) {
    if (!this._eventListeners.has(event)) return this;
    if (!handler) {
      this._eventListeners.delete(event);
    } else {
      this._eventListeners.set(event, this._eventListeners.get(event).filter(h => h !== handler));
    }
    return this;
  }
  fire(event, data = {}) {
    const handlers = this._eventListeners.get(event) || [];
    for (const h of handlers) {
      h({ type: event, target: this, ...data });
    }
    return this;
  }
}

class MockLeafletMarker extends MockLeafletLayer {
  constructor(latlng, options = {}) {
    super();
    this._latlng = normalizeLatLng(latlng);
    this.options = options;
    this._icon = options.icon || null;
  }
  getLatLng() {
    return this._latlng;
  }
  setLatLng(latlng) {
    this._latlng = normalizeLatLng(latlng);
    return this;
  }
  setIcon(icon) {
    this._icon = icon;
    return this;
  }
  getIcon() {
    return this._icon;
  }
}

class MockLeafletPolyline extends MockLeafletLayer {
  constructor(latlngs, options = {}) {
    super();
    this._latlngs = latlngs || [];
    this.options = options;
  }
  getLatLngs() {
    return this._latlngs;
  }
  setLatLngs(latlngs) {
    this._latlngs = latlngs || [];
    return this;
  }
  setStyle(style) {
    Object.assign(this.options, style);
    return this;
  }
}

class MockLeafletTileLayer extends MockLeafletLayer {
  constructor(urlTemplate, options = {}) {
    super();
    this.urlTemplate = urlTemplate;
    this.options = options;
  }
  setUrl(url) {
    this.urlTemplate = url;
    return this;
  }
}

class MockLeafletMap {
  constructor(container, options = {}) {
    this.container = container;
    this.options = options;
    this._center = options.center ? normalizeLatLng(options.center) : { lat: 40.4168, lng: -3.7038 };
    this._zoom = options.zoom || 13;
    this._layers = [];
    this._invalidatedCount = 0;
    this._destroyed = false;
    this._eventListeners = new Map();
    this._bounds = null;
    this.dragging = {
      _enabled: options.dragging !== false,
      enable: () => { this.dragging._enabled = true; },
      disable: () => { this.dragging._enabled = false; },
      enabled: () => this.dragging._enabled
    };
    this.touchZoom = { enable: () => {}, disable: () => {} };
    this.doubleClickZoom = { enable: () => {}, disable: () => {} };
    this.scrollWheelZoom = { enable: () => {}, disable: () => {} };
  }
  setView(latlng, zoom) {
    this._center = normalizeLatLng(latlng);
    if (zoom !== undefined) this._zoom = zoom;
    return this;
  }
  getCenter() {
    return this._center;
  }
  getZoom() {
    return this._zoom;
  }
  fitBounds(bounds, options) {
    this._bounds = bounds;
    return this;
  }
  getBounds() {
    return this._bounds;
  }
  addLayer(layer) {
    if (!this._layers.includes(layer)) {
      this._layers.push(layer);
      layer._map = this;
      this.fire('layeradd', { layer });
    }
    return this;
  }
  removeLayer(layer) {
    const idx = this._layers.indexOf(layer);
    if (idx !== -1) {
      this._layers.splice(idx, 1);
      layer._map = null;
      this.fire('layerremove', { layer });
    }
    return this;
  }
  hasLayer(layer) {
    return this._layers.includes(layer);
  }
  eachLayer(fn) {
    this._layers.slice().forEach(fn);
    return this;
  }
  invalidateSize() {
    this._invalidatedCount++;
    this.fire('resize');
    return this;
  }
  remove() {
    this._destroyed = true;
    this._layers.forEach(l => { l._map = null; });
    this._layers = [];
    return this;
  }
  on(event, handler) {
    if (!this._eventListeners.has(event)) this._eventListeners.set(event, []);
    this._eventListeners.get(event).push(handler);
    return this;
  }
  off(event, handler) {
    if (!this._eventListeners.has(event)) return this;
    if (!handler) {
      this._eventListeners.delete(event);
    } else {
      this._eventListeners.set(event, this._eventListeners.get(event).filter(h => h !== handler));
    }
    return this;
  }
  fire(event, data = {}) {
    const handlers = this._eventListeners.get(event) || [];
    for (const h of handlers) {
      h({ type: event, target: this, ...data });
    }
    return this;
  }
  openPopup(popup) {
    if (popup) popup._isOpen = true;
    return this;
  }
  closePopup(popup) {
    if (popup) popup._isOpen = false;
    return this;
  }
  getContainer() {
    return typeof this.container === 'string' ? null : this.container;
  }
  getPanes() {
    return {
      mapPane: {},
      tilePane: {},
      markerPane: {},
      popupPane: {}
    };
  }
}

function createMockLeaflet() {
  return {
    map: (container, options) => new MockLeafletMap(container, options),
    marker: (latlng, options) => new MockLeafletMarker(latlng, options),
    polyline: (latlngs, options) => new MockLeafletPolyline(latlngs, options),
    tileLayer: (url, options) => new MockLeafletTileLayer(url, options),
    popup: (options) => new MockLeafletPopup(options),
    divIcon: (options) => ({ type: 'divIcon', ...options }),
    icon: (options) => ({ type: 'icon', ...options }),
    latLng: (lat, lng) => {
      const pt = normalizeLatLng(lng !== undefined ? [lat, lng] : lat);
      pt.distanceTo = (other) => haversineDistanceMeters(pt, other);
      return pt;
    },
    latLngBounds: (coords) => ({
      _coords: coords || [],
      extend: function(c) {
        if (Array.isArray(this._coords)) this._coords.push(c);
        return this;
      },
      pad: function() { return this; },
      isValid: function() { return Array.isArray(this._coords) && this._coords.length > 0; },
      getCenter: function() { return { lat: 40.4168, lng: -3.7038 }; }
    })
  };
}

// --- MOCK GEOLOCATION API ---
class MockGeolocation {
  constructor() {
    this._position = {
      coords: {
        latitude: 40.416775,
        longitude: -3.703790,
        accuracy: 10,
        altitude: null,
        altitudeAccuracy: null,
        heading: null,
        speed: null
      },
      timestamp: Date.now()
    };
    this._mockError = null;
    this._watchIdCounter = 1;
    this._watches = new Map();
  }

  __setMockPosition(lat, lng, accuracy = 10) {
    this._position = {
      coords: {
        latitude: Number(lat),
        longitude: Number(lng),
        accuracy: Number(accuracy),
        altitude: null,
        altitudeAccuracy: null,
        heading: null,
        speed: null
      },
      timestamp: Date.now()
    };
    this._mockError = null;
    for (const [_, watch] of this._watches.entries()) {
      if (typeof watch.success === 'function') {
        watch.success(this._position);
      }
    }
  }

  setMockPosition(lat, lng, accuracy) {
    return this.__setMockPosition(lat, lng, accuracy);
  }

  __setMockError(code = 1, message = 'User denied Geolocation') {
    this._mockError = {
      code,
      message,
      PERMISSION_DENIED: 1,
      POSITION_UNAVAILABLE: 2,
      TIMEOUT: 3
    };
  }

  setMockError(code, message) {
    return this.__setMockError(code, message);
  }

  getCurrentPosition(success, error, options) {
    setTimeout(() => {
      if (this._mockError) {
        if (typeof error === 'function') error(this._mockError);
      } else {
        if (typeof success === 'function') success(this._position);
      }
    }, 1);
  }

  watchPosition(success, error, options) {
    const id = this._watchIdCounter++;
    this._watches.set(id, { success, error, options });
    setTimeout(() => {
      if (this._mockError) {
        if (typeof error === 'function') error(this._mockError);
      } else {
        if (typeof success === 'function') success(this._position);
      }
    }, 1);
    return id;
  }

  clearWatch(id) {
    this._watches.delete(id);
  }
}

// --- MOCK FETCH (NOMINATIM & PHOTON) ---
const MOCK_STORE_DATABASE = {
  mercadona: {
    lat: 40.416775,
    lon: -3.703790,
    displayName: 'Mercadona, Calle Mayor 12, 28013 Madrid, España',
    city: 'Madrid',
    street: 'Calle Mayor'
  },
  carrefour: {
    lat: 40.420100,
    lon: -3.708900,
    displayName: 'Carrefour Express, Gran Vía 45, 28013 Madrid, España',
    city: 'Madrid',
    street: 'Gran Vía'
  },
  lidl: {
    lat: 40.425500,
    lon: -3.705000,
    displayName: 'Lidl, Calle Fuencarral 100, 28004 Madrid, España',
    city: 'Madrid',
    street: 'Calle Fuencarral'
  },
  dia: {
    lat: 40.412000,
    lon: -3.700000,
    displayName: 'Supermercados Día, Calle Lavapiés 15, 28012 Madrid, España',
    city: 'Madrid',
    street: 'Calle Lavapiés'
  },
  alcampo: {
    lat: 40.430000,
    lon: -3.690000,
    displayName: 'Alcampo, Paseo de la Castellana 20, 28046 Madrid, España',
    city: 'Madrid',
    street: 'Paseo de la Castellana'
  },
  eroski: {
    lat: 40.415000,
    lon: -3.715000,
    displayName: 'Eroski City, Cuesta de San Vicente 10, 28008 Madrid, España',
    city: 'Madrid',
    street: 'Cuesta de San Vicente'
  },
  verduleria: {
    lat: 40.418900,
    lon: -3.701200,
    displayName: 'Verdulería El Pinar, Calle del Arenal 8, 28013 Madrid, España',
    city: 'Madrid',
    street: 'Calle del Arenal'
  },
  panaderia: {
    lat: 40.414000,
    lon: -3.704000,
    displayName: 'Panadería Artesana, Calle Mayor 20, 28013 Madrid, España',
    city: 'Madrid',
    street: 'Calle Mayor'
  },
  farmacia: {
    lat: 40.417000,
    lon: -3.706000,
    displayName: 'Farmacia Central, Calle Arenal 5, 28013 Madrid, España',
    city: 'Madrid',
    street: 'Calle Arenal'
  },
  casa: {
    lat: 40.415032,
    lon: -3.707391,
    displayName: 'Mi Casa, Plaza Mayor, Madrid, España',
    city: 'Madrid',
    street: 'Plaza Mayor'
  },
  origen: {
    lat: 40.415032,
    lon: -3.707391,
    displayName: 'Punto de Partida, Madrid, España',
    city: 'Madrid',
    street: 'Centro'
  }
};

class MockResponse {
  constructor(data, status = 200, statusText = 'OK') {
    this._data = data;
    this.status = status;
    this.statusText = statusText;
    this.ok = status >= 200 && status < 300;
  }
  json() {
    return Promise.resolve(this._data);
  }
  text() {
    return Promise.resolve(typeof this._data === 'string' ? this._data : JSON.stringify(this._data));
  }
}

function createMockFetch() {
  const calls = [];
  let failureMode = null;

  const mockFetch = function (url, options = {}) {
    const urlStr = String(url);
    calls.push({ url: urlStr, options, timestamp: Date.now() });

    // Verificar si se forzó fallo
    if (failureMode) {
      if (typeof failureMode === 'number') {
        const text = failureMode === 429 ? 'Too Many Requests' : 'Internal Server Error';
        return Promise.resolve(new MockResponse(text, failureMode, text));
      }
      if (failureMode instanceof Error) {
        return Promise.reject(failureMode);
      }
      return Promise.reject(new Error('Network request failed'));
    }

    // Extraer query param 'q'
    let query = '';
    const qMatch = urlStr.match(/[?&]q=([^&]+)/);
    if (qMatch) {
      query = decodeURIComponent(qMatch[1].replace(/\+/g, ' ')).toLowerCase().trim();
    }

    // Comprobar casos de búsqueda vacía o sin resultados
    const isNoResults = !query ||
      query === 'vacio' ||
      query === 'sin_resultados' ||
      query === 'not_found' ||
      query === 'empty' ||
      query === 'error_404';

    // Resolver base de datos de comercios conocidos o cálculo determinista
    let storeMatch = null;
    if (!isNoResults) {
      for (const [key, data] of Object.entries(MOCK_STORE_DATABASE)) {
        if (query.includes(key)) {
          storeMatch = data;
          break;
        }
      }
      if (!storeMatch) {
        // Generar coordenadas deterministas basadas en el hash de la cadena
        let hash = 0;
        for (let i = 0; i < query.length; i++) {
          hash = (hash << 5) - hash + query.charCodeAt(i);
          hash |= 0;
        }
        const absHash = Math.abs(hash);
        const latOffset = (absHash % 500) / 10000;
        const lonOffset = ((absHash >> 3) % 500) / 10000;
        storeMatch = {
          lat: 40.4000 + latOffset,
          lon: -3.7000 - lonOffset,
          displayName: `${query}, Madrid, España`,
          city: 'Madrid',
          street: query
        };
      }
    }

    // Formato Nominatim vs Photon
    const isPhoton = urlStr.includes('photon.komoot.io');

    if (isNoResults || !storeMatch) {
      if (isPhoton) {
        return Promise.resolve(new MockResponse({ type: 'FeatureCollection', features: [] }));
      }
      return Promise.resolve(new MockResponse([]));
    }

    if (isPhoton) {
      const geoJson = {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            geometry: {
              type: 'Point',
              coordinates: [storeMatch.lon, storeMatch.lat]
            },
            properties: {
              osm_id: 100001,
              osm_type: 'N',
              osm_key: 'shop',
              name: storeMatch.displayName.split(',')[0],
              country: 'España',
              city: storeMatch.city,
              street: storeMatch.street
            }
          }
        ]
      };
      return Promise.resolve(new MockResponse(geoJson));
    }

    // Nominatim OSM por defecto
    const nominatimData = [
      {
        place_id: 200001,
        licence: 'Data © OpenStreetMap contributors',
        osm_type: 'node',
        osm_id: 100001,
        lat: String(storeMatch.lat),
        lon: String(storeMatch.lon),
        display_name: storeMatch.displayName,
        class: 'shop',
        type: 'supermarket',
        importance: 0.7
      }
    ];
    return Promise.resolve(new MockResponse(nominatimData));
  };

  mockFetch.__setFailure = (failure) => { failureMode = failure; };
  mockFetch.setFailure = (failure) => { failureMode = failure; };
  mockFetch.__clearFailure = () => { failureMode = null; };
  mockFetch.clearFailure = () => { failureMode = null; };
  mockFetch.__getCalls = () => calls;
  mockFetch.getCalls = () => calls;
  mockFetch.__resetCalls = () => { calls.length = 0; };
  mockFetch.resetCalls = () => { calls.length = 0; };

  return mockFetch;
}

// Factory to create isolated test environment
function createTestEnvironment(customHtmlPath) {
  const htmlPath = customHtmlPath || path.resolve(__dirname, '../index.html');
  const htmlContent = fs.existsSync(htmlPath) ? fs.readFileSync(htmlPath, 'utf8') : '<html><body><div id="shoppingListContainer"></div></body></html>';
  const doc = loadDocumentFromHTML(htmlContent);
  const localStorage = new MockLocalStorage();
  const echarts = createMockEcharts();
  const Swal = createMockSwal();
  const leaflet = createMockLeaflet();
  const geolocation = new MockGeolocation();
  const fetchMock = createMockFetch();
  const lucideIcons = [];

  const win = {
    document: doc,
    localStorage: localStorage,
    sessionStorage: new MockLocalStorage(),
    echarts: echarts,
    Swal: Swal,
    L: leaflet,
    navigator: {
      onLine: true,
      geolocation: geolocation
    },
    fetch: fetchMock,
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
    DOMEvent: DOMEvent,
    L: leaflet,
    geolocation: geolocation,
    navigator: win.navigator,
    fetch: fetchMock
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
  matchesSelector,
  normalizeLatLng,
  createMockLeaflet,
  MockGeolocation,
  createMockFetch,
  MOCK_STORE_DATABASE
};

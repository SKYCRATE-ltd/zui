import {
	is, o, Accessor, Getter
} from "crux";

import {
	Procedure, MetaType, Class, Property, Typify, Model,
} from "zed";

import {
	Vector as V
} from "maths";

/* Element States */
const CONNECTED = Symbol("connected");
const RECTANGLE = Symbol("rectangle");

/* Element Events */
const CONNECT = 'connect';
const DISCONNECT = 'disconnect';
const RENDER = 'render';
const RESIZE = 'resize';

const DO_NOTHING = x => x;
const HexRegEx = /^#([a-f0-9][a-f0-9][a-f0-9]){1,2}$/i;

export const Observer = callback =>
	new ResizeObserver(events => events.forEach(event =>
									callback(event.target, event.contentRect)));
export const RESIZE_LISTENER = Observer((element, rect) => element.resizeCallback(rect));

export const event = (name, data = {}, bubbles = true, cancelable = true) =>
	Object.assign(new Event(name, {
		bubbles,
		cancelable
	}), data);

HTMLElement.prototype.extend({
	attr(key, value = undefined) {
		return !is.undefined(value) ?
			this.setAttribute(key, value) || value :
				this.getAttribute(key);
	},
	var(prop, value = undefined, key = `--${prop}`) {
		return !is.undefined(value) ?
			this.style.setProperty(key, value) || value :
				getComputedStyle(this, null).getPropertyValue(key);
	},

	add(...els) {
		this.append(...els);
		return this;
	},
	remove(el) {
		this.removeChild(el);
		return this;
	},

	listen(channel, listener, captures = false) {
		channel === RESIZE && RESIZE_LISTENER.observe(this);
		this.addEventListener(channel, listener, captures);
		return this;
	},
	unlisten(channel, listener, captures = false) {
		channel === RESIZE && RESIZE_LISTENER.unobserve(this);
		this.removeEventListener(channel, listener, captures);
		return this;
	},
	dispatch(channel, data = {}, bubbles = true, cancelable = true) {
		this.dispatchEvent(event(channel, data, bubbles, cancelable));
		return this;
	},
	resizeCallback(rect = this.getBoundingClientRect()) {
		this[RECTANGLE] = rect;
		this.dispatch(RESIZE, {rect}, false);
	},

	delete() {
		this.parent.remove(this);
		return this;
	},
	copy() {
		return create(this.tagName, Array.from(this.attributes)
				.reduce((obj, {name, value}) =>
							(obj[name] = value && false) || obj, {}))
	},
}).define({
	parent: Getter(el => el.parentNode, false),
	rect: Getter(el => el[RECTANGLE], false),
	children: Accessor(
		el => Array.from(el.childNodes)
				.filter(el => el.nodeType === Node.ELEMENT_NODE),
		(el, children) => {
			// Is this the way to do it?
			el.innerHTML = '';
			el.append(...children);
			return children;
		}, false
	),
});

export const Attr = Procedure(
	'Attr',
	Property,
	{
		init(type, onchange = DO_NOTHING) {
			this.type = type;
			return name => {
				return this.super(
					Property,
					name,
					(el, key) => {
						const value = el.attr(key);
						return is.defined(value) ?
								type.parse(value) : this._value;
					},
					(el, key, to, from) => {
						el.attr(key, type.stringify(to));

						requestAnimationFrame(() => {
							onchange(el, to, from);
							el.dispatch(`attr.${name}`, {to, from}, false);
						});
						return to;
					}
				);
			};
		},
	}
);

export const Var = Procedure(
	'Var',
	Property,
	{
		init(type, parse = type.parse, stringify = type.stringify) {
			this.type = type;
			this._required = true;
			return name => {
				return this.super(
					Property,
					name,
					(el, key) => {
						const value = el.var(key);
						console.log(el, value);
						return is.defined(value) && value !== '' ?
								parse.call(type, value) : this._value;
					},
					(el, key, to) => {
						el.var(key, stringify.call(type, to));
						return to;
					}
				);
			};
		},
	}
);

export const Scalar = (type, unit = 'px') => {
	return class Scalar extends type {
		static defines(value) {
			console.log('here');
			return value instanceof type;
		}
		static stringify(value) {
			console.log('there');
			return `${value}${unit}`;
		}
	}
};

Typify(V, {
	parse(string) {
		return new this(...string.trim().split(',')
											.map(num => num.trim())
											.map(num => parseFloat(num)));
	},
	stringify(instance) {
		return instance.toString();
	}
})

export const Vector = Model('CSSVector', V, {
	init(unit = '') {
		const id = `Vector<${unit}>`;
		return {
			[id]: class extends V {
				constructor(...args) {
					super(...args);
				}
				static defines(value) {
					return value instanceof Array;
				}
				static stringify(value) {
					return [...value].map(item => item + unit).join(',');
				}
			}
		}[id];
	}
});

// TODO: RGBColor and HSLColor?
export class Color extends V {
	constructor(...args) {
		super(...args);
	}
	static validate(string) {
		return HexRegEx.test(string);
	}
	static defines(value) {
		return value instanceof Array;
	}
	static parse(string) {
		if (string.startsWith('#')) {
			string = string.substr(1, 6);
			if (string.length === 3)
				string = string + string;
			const rgb = [];
			for (let i = 0; i < 6; i += 2)
				rgb.push(parseInt(string.substr(i, 2), 16));
			console.log(this);
			return new this(rgb);
		}
		return new this(.../rgba?\((.*)\)/.exec(string)[1].trim()
											.split(',')
											.map(num => num.trim())
											.map(num => parseFloat(num)));
	}
	static stringify(value) {
		if (value instanceof String)
			return value;
		
		let prefix = 'rgb';
		if (value.length > 3)
			prefix += 'a';
		return `${prefix}(${value.slice(0, 4)})`;
	}
}

export class Time extends V {
	constructor(...args) {
		super(...args);
	}
	static defines(value) {
		return value instanceof Array;
	}
	static parse(string) {
		return string.split(':');
	}
	static stringify(value) {
		return value.join(':');
	}
}

export const Element = MetaType('Element', (tag, properties, prototype, _defaults, LISTENERS) => {
	const ATTRIBUTES = properties.filter(([key, prop]) => prop instanceof Attr);
	const VARIABLES = properties.filter(([key, prop]) => prop instanceof Var);

	const Constructor = {
		[tag]: function(attributes = o()) {
			ATTRIBUTES
				.filter(([key, attr]) => attr._required && !is.defined(attributes[key]))
				.forEach(([key, attr]) => {
					throw `!ATTRIBUTE REQUIRED ERROR! @ <${tag} ${key}:${attr.type.name} />`;
				});
			return document.create(tag).assign(attributes);
		}
	}[tag];
	const Element = class extends Class(HTMLElement, {
		[CONNECTED]: false,
		[RECTANGLE]: new DOMRect(),
	}) {
		constructor() {
			super();
			this.define(properties);
			this.assign(_defaults);
			prototype.init && prototype.init.call(this);
		}
		
		connectedCallback() {
			this[CONNECTED] = true;
			this[RECTANGLE] = this.getBoundingClientRect();

			ATTRIBUTES
				.filter(([key, attr]) => attr._required && !is.defined(this[key]))
				.forEach(([key, attr]) => {
					throw `!ATTRIBUTE REQUIRED ERROR! @ <${tag} ${key}:${attr.type.name} />`;
				});
			
			VARIABLES
				.filter(([key, style]) => style._required && console.log(this[key]) || !is.defined(this[key]))
				.forEach(([key, style]) => {
					throw `!CSS VARIABLE REQUIRED ERROR! @ <${tag} --${key}:${style.type.name} />`;
				});
			LISTENERS.forEach(([key, listeners]) => listeners.forEach(listener => this.listen(key, listener)));
			
			this.dispatch(CONNECT, {}, false);
			this.renderCallback();
		}

		disconnectedCallback() {
			this[CONNECTED] = false;
			LISTENERS.forEach(([key, listeners]) => listeners.forEach(listener => this.unlisten(key, listener)));
			this.dispatch(DISCONNECT, {}, false);
		}

		renderCallback(ts = 0) {
			if (!this[CONNECTED])
				return;
			
			ATTRIBUTES.forEach(([key]) => {
				const value = this.attr(key);
				if (this[key] !== value)
					this[key] = value;
			});
			
			this.dispatch(RENDER, {ts}, false);
			requestAnimationFrame(ts => this.renderCallback.call(this, ts));
		}

		static defines(instance) {
			return Constructor.defines(instance);
		}
	};
	Element.prototype.static(prototype);
	customElements.define(tag, Element);
	return Constructor;
});

export default Element;
